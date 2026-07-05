import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';

const router = Router();
router.use(authRequired);

function allowShopReturns(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const direct = [`shopReturns:${action}`, 'shopReturns:*', `distribution:${action}`, 'distribution:*'];
    const fallbackRead = ['return:read', 'product:read', 'customer:read', 'shopSupply:read'];
    const fallbackWrite = ['return:create', 'return:update', 'product:update', 'shopSupply:update'];
    const allowed = can(role, '*')
      || direct.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));
    if (!allowed) return res.status(403).json({ message: `Permission denied: shopReturns:${action}` });
    next();
  };
}

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(220),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative().optional().default(0),
  discount: z.coerce.number().nonnegative().optional().default(0),
  condition: z.enum(['SALEABLE', 'DAMAGED', 'EXPIRED', 'UNSOLD', 'WRONG_DELIVERY']).optional().default('DAMAGED'),
  batchNo: z.string().trim().max(80).optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable()
});

const returnSchema = z.object({
  shopId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  vanId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  supplyInvoiceId: z.string().uuid().optional().nullable(),
  returnDate: z.coerce.date().optional(),
  status: z.enum(['DRAFT', 'POSTED']).optional().default('DRAFT'),
  returnType: z.enum(['SALEABLE', 'DAMAGED', 'EXPIRED', 'UNSOLD', 'WRONG_DELIVERY', 'MIXED']).optional().default('DAMAGED'),
  stockAction: z.enum(['RETURN_TO_WAREHOUSE', 'HOLD', 'SCRAP', 'NO_STOCK']).optional().default('HOLD'),
  discount: z.coerce.number().nonnegative().optional().default(0),
  creditAmount: z.coerce.number().nonnegative().optional(),
  reason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1)
});

function toMoney(value) { return money(Number(value || 0)); }
function toQty(value) { return Number(Number(value || 0).toFixed(3)); }

async function nextNo(tx, tenantId, prefix = 'SRN', start = 1001) {
  const count = await tx.shopReturn.count({ where: { tenantId } });
  return `${prefix}${String(count + start).padStart(4, '0')}`;
}

async function mapById(model, tenantId, ids, select) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || !prisma[model]) return new Map();
  const rows = await prisma[model].findMany({ where: { tenantId, id: { in: unique } }, select });
  return new Map(rows.map((row) => [row.id, row]));
}

function calculateTotals(data) {
  const subtotal = toMoney(data.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitPrice || 0)) - Number(item.discount || 0), 0));
  const discount = toMoney(data.discount || 0);
  const total = toMoney(Math.max(subtotal - discount, 0));
  const creditAmount = toMoney(data.creditAmount ?? total);
  return { subtotal, discount, total, creditAmount };
}

function normalizeReturn(row, maps = {}) {
  const shop = maps.shops?.get(row.shopId);
  const route = maps.routes?.get(row.routeId);
  const employee = maps.employees?.get(row.employeeId);
  const van = maps.vans?.get(row.vanId);
  const warehouse = maps.warehouses?.get(row.warehouseId);
  const supply = maps.supplies?.get(row.supplyInvoiceId);
  return {
    ...row,
    subtotal: toMoney(row.subtotal),
    discount: toMoney(row.discount),
    total: toMoney(row.total),
    creditAmount: toMoney(row.creditAmount),
    shopName: shop?.shopName || null,
    shopCode: shop?.shopCode || null,
    shopOutstanding: toMoney(shop?.currentOutstanding),
    routeName: route?.name || null,
    routeNo: route?.routeNo || null,
    employeeName: employee?.name || null,
    employeeNo: employee?.employeeNo || null,
    vanName: van?.name || null,
    vanNo: van?.vanNo || null,
    warehouseName: warehouse?.name || null,
    supplyNo: supply?.supplyNo || null,
    items: row.items?.map((item) => ({
      ...item,
      qty: toQty(item.qty),
      unitPrice: toMoney(item.unitPrice),
      discount: toMoney(item.discount),
      total: toMoney(item.total)
    })) || []
  };
}

async function normalizeReturns(rows, tenantId) {
  const maps = {
    shops: await mapById('shopProfile', tenantId, rows.map((r) => r.shopId), { id: true, shopCode: true, shopName: true, currentOutstanding: true }),
    routes: await mapById('distributionRoute', tenantId, rows.map((r) => r.routeId), { id: true, routeNo: true, name: true }),
    employees: await mapById('employee', tenantId, rows.map((r) => r.employeeId), { id: true, employeeNo: true, name: true }),
    vans: await mapById('distributionVan', tenantId, rows.map((r) => r.vanId), { id: true, vanNo: true, name: true }),
    warehouses: await mapById('warehouse', tenantId, rows.map((r) => r.warehouseId), { id: true, code: true, name: true }),
    supplies: await mapById('shopSupplyInvoice', tenantId, rows.map((r) => r.supplyInvoiceId), { id: true, supplyNo: true })
  };
  return rows.map((row) => normalizeReturn(row, maps));
}

async function postShopReturn(tx, { tenantId, row, createdById }) {
  if (row.status === 'POSTED') return row;

  const shop = await tx.shopProfile.findFirst({ where: { id: row.shopId, tenantId } });
  if (!shop) throw Object.assign(new Error('Shop profile not found'), { status: 404 });

  const warehouse = row.warehouseId
    ? await assertWarehouseBelongsToTenant(tx, { tenantId, warehouseId: row.warehouseId })
    : await getOrCreateDefaultWarehouse(tx, tenantId);

  const productIds = row.items.map((item) => item.productId).filter(Boolean);
  const products = productIds.length
    ? await tx.product.findMany({ where: { tenantId, id: { in: [...new Set(productIds)] } } })
    : [];
  const productMap = new Map(products.map((product) => [product.id, product]));

  const shouldIncreaseStock = row.stockAction === 'RETURN_TO_WAREHOUSE';
  for (const item of row.items) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    if (!product) throw Object.assign(new Error(`Product not found: ${item.description}`), { status: 404 });

    if (shouldIncreaseStock) {
      await tx.product.update({ where: { id: item.productId }, data: { stockQty: { increment: Number(item.qty || 0) } } });
      await addWarehouseStock(tx, { tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: Number(item.qty || 0) });
      await tx.stockMovement.create({
        data: {
          tenantId,
          productId: item.productId,
          warehouseId: warehouse.id,
          type: 'SALES_RETURN',
          quantity: Number(item.qty || 0),
          unitCost: product.costPrice || 0,
          refType: 'ShopReturn',
          refId: row.id,
          notes: `${row.returnType} return ${row.returnNo} from ${shop.shopName}`
        }
      });
    }
  }

  const credit = Number(row.creditAmount || 0);
  if (credit > 0) {
    const nextShopOutstanding = Math.max(0, Number(shop.currentOutstanding || 0) - credit);
    await tx.shopProfile.update({ where: { id: row.shopId }, data: { currentOutstanding: nextShopOutstanding } });
    if (row.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: row.customerId, tenantId } });
      if (customer) await tx.customer.update({ where: { id: row.customerId }, data: { balance: Math.max(0, Number(customer.balance || 0) - credit) } });
    }
  }

  if (row.supplyInvoiceId && prisma.shopSupplyInvoice) {
    const supply = await tx.shopSupplyInvoice.findFirst({ where: { id: row.supplyInvoiceId, tenantId } });
    if (supply) {
      const newBalance = Math.max(0, Number(supply.balance || 0) - credit);
      const updateData = { balance: newBalance };
      if (newBalance === 0 && supply.status === 'POSTED') updateData.status = 'PAID';
      await tx.shopSupplyInvoice.update({ where: { id: supply.id }, data: updateData });
    }
  }

  const posted = await tx.shopReturn.update({ where: { id: row.id }, data: { status: 'POSTED', postedAt: new Date() }, include: { items: true } });
  await audit({ user: { id: createdById, tenantId } }, 'POST', 'ShopReturn', posted.id, row, posted).catch(() => {});
  return posted;
}

router.get('/summary', allowShopReturns('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    const [totalReturns, postedReturns, draftReturns, damagedReturns, expiredReturns, saleableReturns] = await Promise.all([
      prisma.shopReturn.aggregate({ where: { tenantId }, _sum: { total: true, creditAmount: true }, _count: true }),
      prisma.shopReturn.aggregate({ where: { tenantId, status: 'POSTED' }, _sum: { total: true, creditAmount: true }, _count: true }),
      prisma.shopReturn.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.shopReturn.count({ where: { tenantId, returnType: 'DAMAGED' } }),
      prisma.shopReturn.count({ where: { tenantId, returnType: 'EXPIRED' } }),
      prisma.shopReturn.count({ where: { tenantId, returnType: { in: ['SALEABLE', 'UNSOLD', 'WRONG_DELIVERY'] } } })
    ]);
    res.json({
      totalCount: totalReturns._count,
      totalValue: toMoney(totalReturns._sum.total),
      totalCredit: toMoney(totalReturns._sum.creditAmount),
      postedCount: postedReturns._count,
      postedValue: toMoney(postedReturns._sum.total),
      draftCount: draftReturns,
      damagedCount: damagedReturns,
      expiredCount: expiredReturns,
      saleableCount: saleableReturns,
      monthStart: start
    });
  } catch (e) { next(e); }
});

router.get('/master-data', allowShopReturns('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [shops, routes, employees, vans, warehouses, products, supplies] = await Promise.all([
      prisma.shopProfile.findMany({ where: { tenantId, isActive: true }, orderBy: { shopName: 'asc' } }),
      prisma.distributionRoute.findMany({ where: { tenantId, isActive: true }, orderBy: { routeNo: 'asc' } }),
      prisma.employee?.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }) || [],
      prisma.distributionVan.findMany({ where: { tenantId, isActive: true }, orderBy: { vanNo: 'asc' } }),
      prisma.warehouse?.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }) || [],
      prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 500 }),
      prisma.shopSupplyInvoice?.findMany({ where: { tenantId, status: { in: ['POSTED', 'PARTIAL', 'DRAFT'] } }, orderBy: { supplyDate: 'desc' }, take: 120 }) || []
    ]);
    res.json({ shops, routes, employees, vans, warehouses, products, supplies, returnTypes: ['SALEABLE', 'DAMAGED', 'EXPIRED', 'UNSOLD', 'WRONG_DELIVERY', 'MIXED'], stockActions: ['RETURN_TO_WAREHOUSE', 'HOLD', 'SCRAP', 'NO_STOCK'] });
  } catch (e) { next(e); }
});

router.get('/returns', allowShopReturns('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, returnType, shopId } = req.query;
    const where = { tenantId };
    if (status) where.status = status;
    if (returnType) where.returnType = returnType;
    if (shopId) where.shopId = shopId;
    if (q) where.OR = [
      { returnNo: { contains: String(q), mode: 'insensitive' } },
      { reason: { contains: String(q), mode: 'insensitive' } },
      { notes: { contains: String(q), mode: 'insensitive' } }
    ];
    const rows = await prisma.shopReturn.findMany({ where, include: { items: true }, orderBy: { returnDate: 'desc' }, take: 150 });
    res.json(await normalizeReturns(rows, tenantId));
  } catch (e) { next(e); }
});

router.get('/returns/:id', allowShopReturns('read'), async (req, res, next) => {
  try {
    const row = await prisma.shopReturn.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
    if (!row) return res.status(404).json({ message: 'Shop return not found' });
    const [normalized] = await normalizeReturns([row], req.user.tenantId);
    res.json(normalized);
  } catch (e) { next(e); }
});

router.post('/returns', allowShopReturns('create'), async (req, res, next) => {
  try {
    const data = returnSchema.parse(req.body);
    const tenantId = req.user.tenantId;
    const totals = calculateTotals(data);
    const created = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId, isActive: true } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
      const row = await tx.shopReturn.create({
        data: {
          tenantId,
          returnNo: await nextNo(tx, tenantId),
          shopId: data.shopId,
          customerId: data.customerId || shop.customerId || null,
          routeId: data.routeId || shop.routeId || null,
          employeeId: data.employeeId || shop.assignedEmployeeId || null,
          vanId: data.vanId || null,
          warehouseId: data.warehouseId || null,
          supplyInvoiceId: data.supplyInvoiceId || null,
          returnDate: data.returnDate || new Date(),
          status: 'DRAFT',
          returnType: data.returnType,
          stockAction: data.stockAction,
          discount: totals.discount,
          subtotal: totals.subtotal,
          total: totals.total,
          creditAmount: totals.creditAmount,
          reason: data.reason || null,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => {
              const lineTotal = toMoney((Number(item.qty || 0) * Number(item.unitPrice || 0)) - Number(item.discount || 0));
              return {
                productId: item.productId || null,
                description: item.description,
                qty: item.qty,
                unitPrice: item.unitPrice || 0,
                discount: item.discount || 0,
                total: lineTotal,
                condition: item.condition,
                batchNo: item.batchNo || null,
                expiryDate: item.expiryDate || null,
                notes: item.notes || null
              };
            })
          }
        },
        include: { items: true }
      });
      if (data.status === 'POSTED') return postShopReturn(tx, { tenantId, row, createdById: req.user.id });
      return row;
    });
    const [normalized] = await normalizeReturns([created], tenantId);
    await audit(req, 'CREATE', 'ShopReturn', created.id, null, normalized);
    res.status(201).json(normalized);
  } catch (e) { next(e); }
});

router.post('/returns/:id/post', allowShopReturns('update'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const posted = await prisma.$transaction(async (tx) => {
      const row = await tx.shopReturn.findFirst({ where: { id: req.params.id, tenantId }, include: { items: true } });
      if (!row) throw Object.assign(new Error('Shop return not found'), { status: 404 });
      if (row.status === 'CANCELLED') throw Object.assign(new Error('Cancelled return cannot be posted'), { status: 400 });
      return postShopReturn(tx, { tenantId, row, createdById: req.user.id });
    });
    const [normalized] = await normalizeReturns([posted], tenantId);
    res.json(normalized);
  } catch (e) { next(e); }
});

router.post('/returns/:id/cancel', allowShopReturns('update'), async (req, res, next) => {
  try {
    const row = await prisma.shopReturn.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!row) return res.status(404).json({ message: 'Shop return not found' });
    if (row.status === 'POSTED') return res.status(400).json({ message: 'Posted shop returns cannot be cancelled here. Create a reverse adjustment if needed.' });
    const cancelled = await prisma.shopReturn.update({ where: { id: row.id }, data: { status: 'CANCELLED', cancelledAt: new Date() }, include: { items: true } });
    const [normalized] = await normalizeReturns([cancelled], req.user.tenantId);
    await audit(req, 'CANCEL', 'ShopReturn', row.id, row, normalized);
    res.json(normalized);
  } catch (e) { next(e); }
});

export default router;
