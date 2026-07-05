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

function allowShopSupply(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const direct = [`shopSupply:${action}`, 'shopSupply:*', `distribution:${action}`, 'distribution:*'];
    const fallbackRead = ['invoice:read', 'product:read', 'customer:read', 'delivery:read'];
    const fallbackWrite = ['invoice:create', 'invoice:update', 'product:update', 'delivery:create', 'payment:create'];
    const allowed = can(role, '*')
      || direct.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));
    if (!allowed) return res.status(403).json({ message: `Permission denied: shopSupply:${action}` });
    next();
  };
}

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(220),
  qty: z.coerce.number().positive(),
  freeQty: z.coerce.number().nonnegative().optional().default(0),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().optional().default(0)
});

const invoiceSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  vanId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  supplyDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional().nullable(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  tax: z.coerce.number().nonnegative().optional().default(0),
  paid: z.coerce.number().nonnegative().optional().default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CREDIT']).optional().default('CREDIT'),
  createDelivery: z.coerce.boolean().optional().default(false),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(itemSchema).min(1),
  status: z.enum(['DRAFT', 'POSTED']).optional().default('DRAFT')
});

function toMoney(value) { return money(Number(value || 0)); }
function toQty(value) { return Number(Number(value || 0).toFixed(3)); }

async function nextNo(tx, modelName, tenantId, field, prefix, start = 1001) {
  const count = await tx[modelName].count({ where: { tenantId } });
  return `${prefix}${String(count + start).padStart(4, '0')}`;
}

async function mapById(model, tenantId, ids, select) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma[model].findMany({ where: { tenantId, id: { in: unique } }, select });
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeInvoice(row, maps = {}) {
  const shop = maps.shops?.get(row.shopId);
  const route = maps.routes?.get(row.routeId);
  const employee = maps.employees?.get(row.employeeId);
  const van = maps.vans?.get(row.vanId);
  const warehouse = maps.warehouses?.get(row.warehouseId);
  return {
    ...row,
    subtotal: toMoney(row.subtotal),
    discount: toMoney(row.discount),
    tax: toMoney(row.tax),
    total: toMoney(row.total),
    paid: toMoney(row.paid),
    balance: toMoney(row.balance),
    shopName: shop?.shopName || null,
    shopCode: shop?.shopCode || null,
    shopArea: shop?.area || null,
    routeName: route?.name || null,
    routeNo: route?.routeNo || null,
    employeeName: employee?.name || null,
    employeeNo: employee?.employeeNo || null,
    vanName: van?.name || null,
    vanNo: van?.vanNo || null,
    warehouseName: warehouse?.name || null,
    items: row.items?.map((item) => ({
      ...item,
      qty: toQty(item.qty),
      freeQty: toQty(item.freeQty),
      unitPrice: toMoney(item.unitPrice),
      discount: toMoney(item.discount),
      total: toMoney(item.total)
    })) || []
  };
}

async function normalizeInvoiceList(rows, tenantId) {
  const maps = {
    shops: await mapById('shopProfile', tenantId, rows.map((r) => r.shopId), { id: true, shopName: true, shopCode: true, area: true }),
    routes: await mapById('distributionRoute', tenantId, rows.map((r) => r.routeId), { id: true, routeNo: true, name: true }),
    employees: await mapById('employee', tenantId, rows.map((r) => r.employeeId), { id: true, employeeNo: true, name: true }),
    vans: await mapById('distributionVan', tenantId, rows.map((r) => r.vanId), { id: true, vanNo: true, name: true }),
    warehouses: await mapById('warehouse', tenantId, rows.map((r) => r.warehouseId), { id: true, code: true, name: true })
  };
  return rows.map((row) => normalizeInvoice(row, maps));
}

function calculateTotals(data) {
  const subtotal = toMoney(data.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0), 0));
  const discount = toMoney(data.discount || 0);
  const tax = toMoney(data.tax || 0);
  const total = toMoney(Math.max(subtotal - discount, 0) + tax);
  const paid = toMoney(data.paid || 0);
  const balance = toMoney(Math.max(total - paid, 0));
  return { subtotal, discount, tax, total, paid, balance };
}

async function validateProductsAndStock(tx, { tenantId, warehouseId, items }) {
  const productMap = new Map();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await tx.product.findFirst({ where: { id: item.productId, tenantId, isActive: true } });
    if (!product) throw Object.assign(new Error(`Product not found: ${item.description}`), { status: 404 });
    const warehouseStock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId, productId: item.productId, warehouseId } } });
    const neededQty = Number(item.qty || 0) + Number(item.freeQty || 0);
    const available = Number(warehouseStock?.quantity ?? product.stockQty ?? 0);
    if (available < neededQty) throw Object.assign(new Error(`Not enough stock for ${product.name}. Need ${neededQty}, available ${available}`), { status: 400 });
    productMap.set(item.productId, product);
  }
  return productMap;
}

async function postSupplyInvoice(tx, { tenantId, invoice, createdById }) {
  if (invoice.status === 'POSTED') return invoice;

  const shop = await tx.shopProfile.findFirst({ where: { id: invoice.shopId, tenantId } });
  if (!shop) throw Object.assign(new Error('Shop profile not found'), { status: 404 });

  const warehouse = invoice.warehouseId
    ? await assertWarehouseBelongsToTenant(tx, { tenantId, warehouseId: invoice.warehouseId })
    : await getOrCreateDefaultWarehouse(tx, tenantId);

  const productMap = await validateProductsAndStock(tx, { tenantId, warehouseId: warehouse.id, items: invoice.items });

  for (const item of invoice.items) {
    if (!item.productId) continue;
    const product = productMap.get(item.productId);
    const outQty = Number(item.qty || 0) + Number(item.freeQty || 0);
    await tx.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: outQty } } });
    await addWarehouseStock(tx, { tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: -outQty });
    await tx.stockMovement.create({
      data: {
        tenantId,
        productId: item.productId,
        warehouseId: warehouse.id,
        type: 'SALE',
        quantity: -outQty,
        unitCost: product?.costPrice || 0,
        refType: 'ShopSupplyInvoice',
        refId: invoice.id,
        notes: `Shop supply ${invoice.supplyNo} to ${shop.shopName}`
      }
    });
  }

  if (invoice.balance > 0) {
    await tx.shopProfile.update({ where: { id: invoice.shopId }, data: { currentOutstanding: { increment: invoice.balance } } });
    if (invoice.customerId) await tx.customer.update({ where: { id: invoice.customerId }, data: { balance: { increment: invoice.balance } } });
  }

  if (invoice.paid > 0) {
    const collectionNo = await nextNo(tx, 'shopCollection', tenantId, 'collectionNo', 'COL');
    await tx.shopCollection.create({
      data: {
        tenantId,
        collectionNo,
        shopId: invoice.shopId,
        customerId: invoice.customerId || null,
        routeId: invoice.routeId || null,
        employeeId: invoice.employeeId || null,
        amount: invoice.paid,
        method: invoice.paymentMethod,
        reference: invoice.supplyNo,
        notes: `Payment received on shop supply ${invoice.supplyNo}`,
        createdById
      }
    });
  }

  let deliveryOrderId = null;
  if (invoice.createDelivery) {
    const deliveryNo = await nextNo(tx, 'deliveryOrder', tenantId, 'deliveryNo', 'DO');
    const delivery = await tx.deliveryOrder.create({
      data: {
        tenantId,
        customerId: invoice.customerId || null,
        assignedEmployeeId: invoice.employeeId || null,
        deliveryNo,
        status: 'PENDING',
        priority: 'NORMAL',
        scheduledDate: invoice.supplyDate,
        contactName: shop.ownerName || shop.shopName,
        phone: shop.phone || null,
        address: shop.address || null,
        codAmount: invoice.balance,
        notes: `Created from shop supply ${invoice.supplyNo}`,
        createdById,
        items: {
          create: invoice.items.map((item) => ({
            productId: item.productId || null,
            description: item.description,
            qty: Number(item.qty || 0) + Number(item.freeQty || 0),
            notes: Number(item.freeQty || 0) > 0 ? `Includes ${item.freeQty} free` : null
          }))
        }
      }
    });
    deliveryOrderId = delivery.id;
  }

  return tx.shopSupplyInvoice.update({
    where: { id: invoice.id },
    data: { status: 'POSTED', warehouseId: warehouse.id, deliveryOrderId },
    include: { items: true }
  });
}

router.get('/summary', allowShopSupply('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);

    const [draftCount, postedCount, todayRows, outstandingRows, recentInvoices, topShops] = await Promise.all([
      prisma.shopSupplyInvoice.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.shopSupplyInvoice.count({ where: { tenantId, status: 'POSTED' } }),
      prisma.shopSupplyInvoice.findMany({ where: { tenantId, status: 'POSTED', supplyDate: { gte: today, lt: tomorrow } }, select: { total: true, paid: true, balance: true } }),
      prisma.shopSupplyInvoice.findMany({ where: { tenantId, status: 'POSTED', balance: { gt: 0 } }, select: { balance: true } }),
      prisma.shopSupplyInvoice.findMany({ where: { tenantId }, include: { items: true }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.shopProfile.findMany({ where: { tenantId, currentOutstanding: { gt: 0 } }, orderBy: { currentOutstanding: 'desc' }, take: 6 })
    ]);

    const recent = await normalizeInvoiceList(recentInvoices, tenantId);
    const topOutstanding = await normalizeInvoiceList(topShops.map((shop) => ({
      id: shop.id,
      tenantId,
      supplyNo: shop.shopCode,
      shopId: shop.id,
      customerId: shop.customerId,
      routeId: shop.routeId,
      employeeId: shop.assignedEmployeeId,
      vanId: null,
      warehouseId: null,
      invoiceId: null,
      deliveryOrderId: null,
      status: shop.isBlocked ? 'BLOCKED' : 'ACTIVE',
      supplyDate: shop.updatedAt,
      dueDate: null,
      subtotal: 0,
      discount: 0,
      tax: 0,
      total: shop.currentOutstanding,
      paid: 0,
      balance: shop.currentOutstanding,
      paymentMethod: 'CREDIT',
      createDelivery: false,
      notes: shop.phone || shop.area || '',
      createdById: null,
      createdAt: shop.createdAt,
      updatedAt: shop.updatedAt,
      items: []
    })), tenantId);

    res.json({
      draftCount,
      postedCount,
      todaySales: toMoney(todayRows.reduce((sum, row) => sum + Number(row.total || 0), 0)),
      todayCollected: toMoney(todayRows.reduce((sum, row) => sum + Number(row.paid || 0), 0)),
      todayCredit: toMoney(todayRows.reduce((sum, row) => sum + Number(row.balance || 0), 0)),
      totalOutstanding: toMoney(outstandingRows.reduce((sum, row) => sum + Number(row.balance || 0), 0)),
      recent,
      topOutstanding
    });
  } catch (e) { next(e); }
});

router.get('/master-data', allowShopSupply('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [shops, routes, vans, warehouses, products, employees] = await Promise.all([
      prisma.shopProfile.findMany({ where: { tenantId, isActive: true }, orderBy: { shopName: 'asc' }, take: 300 }),
      prisma.distributionRoute.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 100 }),
      prisma.distributionVan.findMany({ where: { tenantId, isActive: true }, orderBy: { vanNo: 'asc' }, take: 100 }),
      prisma.warehouse.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 100 }),
      prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 300 }),
      prisma.employee.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' }, take: 100 }).catch(() => [])
    ]);
    res.json({ shops, routes, vans, warehouses, products, employees });
  } catch (e) { next(e); }
});

router.get('/invoices', allowShopSupply('read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.shopId) where.shopId = String(req.query.shopId);
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    const rows = await prisma.shopSupplyInvoice.findMany({ where, include: { items: true }, orderBy: { createdAt: 'desc' }, take: Number(req.query.take || 120) });
    res.json(await normalizeInvoiceList(rows, req.user.tenantId));
  } catch (e) { next(e); }
});

router.get('/invoices/:id', allowShopSupply('read'), async (req, res, next) => {
  try {
    const row = await prisma.shopSupplyInvoice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
    if (!row) return res.status(404).json({ message: 'Shop supply invoice not found' });
    const [normalized] = await normalizeInvoiceList([row], req.user.tenantId);
    res.json(normalized);
  } catch (e) { next(e); }
});

router.post('/invoices', allowShopSupply('create'), async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId, isActive: true } });
      if (!shop) throw Object.assign(new Error('Shop profile not found'), { status: 404 });
      if (shop.isBlocked) throw Object.assign(new Error('This shop is blocked. Unblock before supplying.'), { status: 400 });

      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      await validateProductsAndStock(tx, { tenantId: req.user.tenantId, warehouseId: warehouse.id, items: data.items });

      const totals = calculateTotals(data);
      const supplyNo = await nextNo(tx, 'shopSupplyInvoice', req.user.tenantId, 'supplyNo', 'SSI');
      const invoice = await tx.shopSupplyInvoice.create({
        data: {
          tenantId: req.user.tenantId,
          supplyNo,
          shopId: data.shopId,
          customerId: shop.customerId || null,
          routeId: data.routeId || shop.routeId || null,
          employeeId: data.employeeId || shop.assignedEmployeeId || null,
          vanId: data.vanId || null,
          warehouseId: warehouse.id,
          supplyDate: data.supplyDate || new Date(),
          dueDate: data.dueDate || null,
          subtotal: totals.subtotal,
          discount: totals.discount,
          tax: totals.tax,
          total: totals.total,
          paid: totals.paid,
          balance: totals.balance,
          paymentMethod: data.paymentMethod,
          createDelivery: data.createDelivery,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId || null,
              description: item.description,
              qty: item.qty,
              freeQty: item.freeQty || 0,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              total: toMoney(Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0))
            }))
          }
        },
        include: { items: true }
      });

      if (data.status === 'POSTED') return postSupplyInvoice(tx, { tenantId: req.user.tenantId, invoice, createdById: req.user.id });
      return invoice;
    });

    await audit(req, 'CREATE', 'ShopSupplyInvoice', result.id, null, result);
    const [normalized] = await normalizeInvoiceList([result], req.user.tenantId);
    res.status(201).json(normalized);
  } catch (e) { next(e); }
});

router.post('/invoices/:id/post', allowShopSupply('update'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.shopSupplyInvoice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
      if (!invoice) throw Object.assign(new Error('Shop supply invoice not found'), { status: 404 });
      if (invoice.status === 'CANCELLED') throw Object.assign(new Error('Cancelled invoice cannot be posted'), { status: 400 });
      return postSupplyInvoice(tx, { tenantId: req.user.tenantId, invoice, createdById: req.user.id });
    });
    await audit(req, 'POST', 'ShopSupplyInvoice', result.id, null, result);
    const [normalized] = await normalizeInvoiceList([result], req.user.tenantId);
    res.json(normalized);
  } catch (e) { next(e); }
});

router.post('/invoices/:id/cancel', allowShopSupply('update'), async (req, res, next) => {
  try {
    const updated = await prisma.shopSupplyInvoice.updateMany({
      where: { id: req.params.id, tenantId: req.user.tenantId, status: 'DRAFT' },
      data: { status: 'CANCELLED' }
    });
    if (!updated.count) return res.status(400).json({ message: 'Only draft shop supply invoices can be cancelled safely.' });
    await audit(req, 'CANCEL', 'ShopSupplyInvoice', req.params.id, null, { id: req.params.id });
    res.json({ message: 'Shop supply invoice cancelled' });
  } catch (e) { next(e); }
});

export default router;
