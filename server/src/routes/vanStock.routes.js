import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function allowVanStock(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const direct = [`vanStock:${action}`, 'vanStock:*', `distribution:${action}`, 'distribution:*'];
    const fallbackRead = ['product:read', 'inventory:read', 'delivery:read'];
    const fallbackWrite = ['product:update', 'inventory:update', 'delivery:create'];
    const allowed = can(role, '*')
      || direct.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));
    if (!allowed) return res.status(403).json({ message: `Permission denied: vanStock:${action}` });
    next();
  };
}

const loadItemSchema = z.object({
  productId: z.string().uuid(),
  description: z.string().trim().max(220).optional().nullable(),
  qtyLoaded: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(500).optional().nullable()
});

const loadSchema = z.object({
  vanId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  loadDate: z.coerce.date().optional(),
  status: z.enum(['DRAFT', 'POSTED']).optional().default('DRAFT'),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(loadItemSchema).min(1)
});

const closeItemSchema = z.object({
  productId: z.string().uuid(),
  qtyReturned: z.coerce.number().nonnegative().optional().default(0),
  qtyDamaged: z.coerce.number().nonnegative().optional().default(0),
  qtyMissing: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(500).optional().nullable()
});

const closeSchema = z.object({
  items: z.array(closeItemSchema).optional().default([]),
  cashCollected: z.coerce.number().nonnegative().optional().default(0),
  chequeCollected: z.coerce.number().nonnegative().optional().default(0),
  creditSales: z.coerce.number().nonnegative().optional().default(0),
  routeExpense: z.coerce.number().nonnegative().optional().default(0),
  soldValue: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable()
});

function toQty(value) { return Number(Number(value || 0).toFixed(3)); }
function toMoney(value) { return money(Number(value || 0)); }

async function nextNo(tx, modelName, tenantId, prefix, start = 1001) {
  const count = await tx[modelName].count({ where: { tenantId } });
  return `${prefix}${String(count + start).padStart(4, '0')}`;
}

async function rowsById(model, tenantId, ids, select) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma[model].findMany({ where: { tenantId, id: { in: unique } }, select });
  return new Map(rows.map((row) => [row.id, row]));
}

async function globalRowsById(model, ids, select) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma[model].findMany({ where: { id: { in: unique } }, select });
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeStock(row, maps = {}) {
  const product = maps.products?.get(row.productId);
  const van = maps.vans?.get(row.vanId);
  return {
    ...row,
    quantity: toQty(row.quantity),
    reservedQty: toQty(row.reservedQty),
    availableQty: toQty(Number(row.quantity || 0) - Number(row.reservedQty || 0)),
    stockValue: toMoney(Number(row.quantity || 0) * Number(product?.costPrice || 0)),
    productName: product?.name || null,
    sku: product?.sku || null,
    salePrice: toMoney(product?.salePrice),
    costPrice: toMoney(product?.costPrice),
    vanName: van?.name || null,
    vanNo: van?.vanNo || null
  };
}

async function normalizeStocks(rows, tenantId) {
  const maps = {
    products: await rowsById('product', tenantId, rows.map((r) => r.productId), { id: true, sku: true, name: true, salePrice: true, costPrice: true }),
    vans: await rowsById('distributionVan', tenantId, rows.map((r) => r.vanId), { id: true, vanNo: true, name: true })
  };
  return rows.map((row) => normalizeStock(row, maps));
}

function normalizeLoad(row, maps = {}) {
  const van = maps.vans?.get(row.vanId);
  const route = maps.routes?.get(row.routeId);
  const employee = maps.employees?.get(row.employeeId);
  const warehouse = maps.warehouses?.get(row.warehouseId);
  const products = maps.products || new Map();
  return {
    ...row,
    vanName: van?.name || null,
    vanNo: van?.vanNo || null,
    vehicleNo: van?.vehicleNo || null,
    routeName: route?.name || null,
    routeNo: route?.routeNo || null,
    employeeName: employee?.name || null,
    employeeNo: employee?.employeeNo || null,
    warehouseName: warehouse?.name || null,
    items: row.items?.map((item) => {
      const product = products.get(item.productId);
      return {
        ...item,
        qtyLoaded: toQty(item.qtyLoaded),
        qtyReturned: toQty(item.qtyReturned),
        qtyDamaged: toQty(item.qtyDamaged),
        qtyMissing: toQty(item.qtyMissing),
        unitCost: toMoney(item.unitCost),
        productName: product?.name || item.description || null,
        sku: product?.sku || null,
        lineValue: toMoney(Number(item.qtyLoaded || 0) * Number(item.unitCost || product?.costPrice || 0))
      };
    }) || []
  };
}

async function normalizeLoads(rows, tenantId) {
  const productIds = rows.flatMap((row) => row.items?.map((item) => item.productId) || []);
  const maps = {
    vans: await rowsById('distributionVan', tenantId, rows.map((r) => r.vanId), { id: true, vanNo: true, name: true, vehicleNo: true }),
    routes: await rowsById('distributionRoute', tenantId, rows.map((r) => r.routeId), { id: true, routeNo: true, name: true, area: true }),
    employees: await rowsById('employee', tenantId, rows.map((r) => r.employeeId), { id: true, employeeNo: true, name: true }),
    warehouses: await rowsById('warehouse', tenantId, rows.map((r) => r.warehouseId), { id: true, code: true, name: true }),
    products: await rowsById('product', tenantId, productIds, { id: true, sku: true, name: true, costPrice: true, salePrice: true })
  };
  return rows.map((row) => normalizeLoad(row, maps));
}

async function assertTenantRows(tx, tenantId, data) {
  const van = await tx.distributionVan.findFirst({ where: { id: data.vanId, tenantId, isActive: true } });
  if (!van) throw Object.assign(new Error('Van not found'), { status: 404 });

  if (data.routeId) {
    const route = await tx.distributionRoute.findFirst({ where: { id: data.routeId, tenantId } });
    if (!route) throw Object.assign(new Error('Route not found'), { status: 404 });
  }
  if (data.warehouseId) {
    const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, tenantId } });
    if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
  }

  const productIds = [...new Set(data.items.map((item) => item.productId))];
  const products = await tx.product.findMany({ where: { tenantId, id: { in: productIds }, isActive: true } });
  if (products.length !== productIds.length) throw Object.assign(new Error('One or more products were not found'), { status: 404 });
  return { van, products: new Map(products.map((product) => [product.id, product])) };
}

async function incrementVanStock(tx, tenantId, vanId, productId, qty) {
  return tx.vanStock.upsert({
    where: { tenantId_vanId_productId: { tenantId, vanId, productId } },
    update: { quantity: { increment: qty } },
    create: { tenantId, vanId, productId, quantity: qty }
  });
}

async function decrementVanStock(tx, tenantId, vanId, productId, qty) {
  if (qty <= 0) return null;
  const stock = await tx.vanStock.findUnique({ where: { tenantId_vanId_productId: { tenantId, vanId, productId } } });
  if (!stock || Number(stock.quantity || 0) < qty) {
    throw Object.assign(new Error('Van stock is not enough for return/damage/missing adjustment'), { status: 400 });
  }
  return tx.vanStock.update({
    where: { tenantId_vanId_productId: { tenantId, vanId, productId } },
    data: { quantity: { decrement: qty } }
  });
}

async function incrementProductStock(tx, tenantId, productId, warehouseId, qty, refType, refId, notes) {
  if (qty <= 0) return;
  await tx.product.update({ where: { id: productId }, data: { stockQty: { increment: qty } } }).catch(() => null);
  if (warehouseId) {
    await tx.productStock.upsert({
      where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } },
      update: { quantity: { increment: qty } },
      create: { tenantId, productId, warehouseId, quantity: qty }
    }).catch(() => null);
  }
  await tx.stockMovement.create({
    data: { tenantId, productId, warehouseId: warehouseId || null, type: 'TRANSFER', quantity: qty, unitCost: 0, refType, refId, notes }
  }).catch(() => null);
}

async function decrementProductStock(tx, tenantId, productId, warehouseId, qty, refType, refId, notes) {
  if (qty <= 0) return;
  const product = await tx.product.findFirst({ where: { tenantId, id: productId } });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  if (Number(product.stockQty || 0) < qty) {
    throw Object.assign(new Error(`${product.name} does not have enough main stock`), { status: 400 });
  }
  if (warehouseId) {
    const warehouseStock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } } }).catch(() => null);
    if (warehouseStock && Number(warehouseStock.quantity || 0) < qty) {
      throw Object.assign(new Error(`${product.name} does not have enough stock in selected warehouse`), { status: 400 });
    }
  }
  await tx.product.update({ where: { id: productId }, data: { stockQty: { decrement: qty } } });
  if (warehouseId) {
    await tx.productStock.update({
      where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } },
      data: { quantity: { decrement: qty } }
    }).catch(() => null);
  }
  await tx.stockMovement.create({
    data: { tenantId, productId, warehouseId: warehouseId || null, type: 'TRANSFER', quantity: -qty, unitCost: 0, refType, refId, notes }
  }).catch(() => null);
}

async function postLoad(tx, load) {
  if (load.status !== 'DRAFT') throw Object.assign(new Error('Only draft van loads can be posted'), { status: 400 });
  for (const item of load.items) {
    const loadQty = toQty(item.qtyLoaded);
    await decrementProductStock(tx, load.tenantId, item.productId, load.warehouseId, loadQty, 'VanLoad', load.id, `Loaded to van ${load.loadNo}`);
    await incrementVanStock(tx, load.tenantId, load.vanId, item.productId, loadQty);
    await tx.vanStockMovement.create({
      data: {
        tenantId: load.tenantId,
        vanId: load.vanId,
        productId: item.productId,
        loadId: load.id,
        routeId: load.routeId || null,
        warehouseId: load.warehouseId || null,
        type: 'LOAD_OUT',
        quantity: loadQty,
        unitCost: item.unitCost || 0,
        refType: 'VanLoad',
        refId: load.id,
        notes: `Loaded from warehouse to van ${load.loadNo}`
      }
    });
  }
  return tx.vanLoad.update({ where: { id: load.id }, data: { status: 'POSTED', postedAt: new Date() }, include: { items: true } });
}

router.get('/summary', allowVanStock('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const [stockRows, vans, draftLoads, postedLoads, todayMovements, closings] = await Promise.all([
      prisma.vanStock.findMany({ where: { tenantId } }),
      prisma.distributionVan.findMany({ where: { tenantId, isActive: true } }),
      prisma.vanLoad.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.vanLoad.count({ where: { tenantId, status: 'POSTED' } }),
      prisma.vanStockMovement.findMany({ where: { tenantId, createdAt: { gte: today } } }),
      prisma.vanDailyClosing.findMany({ where: { tenantId }, orderBy: { closingDate: 'desc' }, take: 10 })
    ]);
    const productMap = await rowsById('product', tenantId, stockRows.map((r) => r.productId), { id: true, name: true, costPrice: true, salePrice: true });
    const totalQty = stockRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const totalValue = stockRows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(productMap.get(row.productId)?.costPrice || 0), 0);
    const loadedToday = todayMovements.filter((m) => m.type === 'LOAD_OUT').reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    const returnedToday = todayMovements.filter((m) => m.type === 'RETURN_IN').reduce((sum, m) => sum + Number(m.quantity || 0), 0);
    res.json({
      activeVans: vans.length,
      vanStockLines: stockRows.length,
      totalVanQty: toQty(totalQty),
      totalVanValue: toMoney(totalValue),
      draftLoads,
      postedLoads,
      loadedToday: toQty(loadedToday),
      returnedToday: toQty(returnedToday),
      recentClosings: closings.map((closing) => ({
        ...closing,
        openingValue: toMoney(closing.openingValue),
        loadedValue: toMoney(closing.loadedValue),
        soldValue: toMoney(closing.soldValue),
        returnedValue: toMoney(closing.returnedValue),
        damagedValue: toMoney(closing.damagedValue),
        missingValue: toMoney(closing.missingValue),
        cashCollected: toMoney(closing.cashCollected),
        chequeCollected: toMoney(closing.chequeCollected),
        creditSales: toMoney(closing.creditSales),
        routeExpense: toMoney(closing.routeExpense)
      }))
    });
  } catch (e) { next(e); }
});

router.get('/master-data', allowVanStock('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [vans, routes, warehouses, products, employees] = await Promise.all([
      prisma.distributionVan.findMany({ where: { tenantId, isActive: true }, orderBy: { vanNo: 'asc' } }),
      prisma.distributionRoute.findMany({ where: { tenantId, isActive: true }, orderBy: { routeNo: 'asc' } }),
      prisma.warehouse.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }).catch(() => []),
      prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 300 }),
      prisma.employee.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: { name: 'asc' } }).catch(() => [])
    ]);
    res.json({
      vans,
      routes,
      warehouses,
      employees,
      products: products.map((product) => ({ ...product, stockQty: toQty(product.stockQty), costPrice: toMoney(product.costPrice), salePrice: toMoney(product.salePrice) }))
    });
  } catch (e) { next(e); }
});

router.get('/stocks', allowVanStock('read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.vanId) where.vanId = String(req.query.vanId);
    if (req.query.productId) where.productId = String(req.query.productId);
    const rows = await prisma.vanStock.findMany({ where, orderBy: { updatedAt: 'desc' }, take: 300 });
    res.json(await normalizeStocks(rows, req.user.tenantId));
  } catch (e) { next(e); }
});

router.get('/loads', allowVanStock('read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.vanId) where.vanId = String(req.query.vanId);
    const rows = await prisma.vanLoad.findMany({ where, include: { items: true }, orderBy: { loadDate: 'desc' }, take: 100 });
    res.json(await normalizeLoads(rows, req.user.tenantId));
  } catch (e) { next(e); }
});

router.post('/loads', allowVanStock('create'), async (req, res, next) => {
  try {
    const data = loadSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const { products } = await assertTenantRows(tx, req.user.tenantId, data);
      const load = await tx.vanLoad.create({
        data: {
          tenantId: req.user.tenantId,
          loadNo: await nextNo(tx, 'vanLoad', req.user.tenantId, 'VL'),
          vanId: data.vanId,
          routeId: data.routeId || null,
          warehouseId: data.warehouseId || null,
          employeeId: data.employeeId || null,
          status: 'DRAFT',
          loadDate: data.loadDate || new Date(),
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => {
              const product = products.get(item.productId);
              return {
                productId: item.productId,
                description: item.description || product?.name || null,
                qtyLoaded: toQty(item.qtyLoaded),
                unitCost: toMoney(item.unitCost || product?.costPrice || 0),
                notes: item.notes || null
              };
            })
          }
        },
        include: { items: true }
      });
      if (data.status === 'POSTED') return postLoad(tx, load);
      return load;
    });
    await audit(req, 'CREATE', 'VanLoad', result.id, null, result).catch(() => null);
    const normalized = await normalizeLoads([result], req.user.tenantId);
    res.status(201).json(normalized[0]);
  } catch (e) { next(e); }
});

router.post('/loads/:id/post', allowVanStock('update'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const load = await tx.vanLoad.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
      if (!load) throw Object.assign(new Error('Van load not found'), { status: 404 });
      return postLoad(tx, load);
    });
    await audit(req, 'POST', 'VanLoad', result.id, null, result).catch(() => null);
    const normalized = await normalizeLoads([result], req.user.tenantId);
    res.json(normalized[0]);
  } catch (e) { next(e); }
});

router.post('/loads/:id/close', allowVanStock('update'), async (req, res, next) => {
  try {
    const data = closeSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const load = await tx.vanLoad.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
      if (!load) throw Object.assign(new Error('Van load not found'), { status: 404 });
      if (load.status !== 'POSTED') throw Object.assign(new Error('Only posted loads can be closed'), { status: 400 });

      const closeMap = new Map(data.items.map((item) => [item.productId, item]));
      let returnedValue = 0;
      let damagedValue = 0;
      let missingValue = 0;
      let loadedValue = 0;

      for (const item of load.items) {
        const closeLine = closeMap.get(item.productId) || {};
        const returned = toQty(closeLine.qtyReturned || 0);
        const damaged = toQty(closeLine.qtyDamaged || 0);
        const missing = toQty(closeLine.qtyMissing || 0);
        const outQty = toQty(returned + damaged + missing);
        const unitCost = Number(item.unitCost || 0);
        loadedValue += Number(item.qtyLoaded || 0) * unitCost;
        returnedValue += returned * unitCost;
        damagedValue += damaged * unitCost;
        missingValue += missing * unitCost;

        if (returned + damaged + missing > Number(item.qtyLoaded || 0)) {
          throw Object.assign(new Error('Returned + damaged + missing cannot exceed loaded quantity'), { status: 400 });
        }
        if (outQty > 0) await decrementVanStock(tx, load.tenantId, load.vanId, item.productId, outQty);
        if (returned > 0) {
          await incrementProductStock(tx, load.tenantId, item.productId, load.warehouseId, returned, 'VanLoadReturn', load.id, `Returned from van ${load.loadNo}`);
          await tx.vanStockMovement.create({ data: { tenantId: load.tenantId, vanId: load.vanId, productId: item.productId, loadId: load.id, routeId: load.routeId || null, warehouseId: load.warehouseId || null, type: 'RETURN_IN', quantity: returned, unitCost, refType: 'VanLoad', refId: load.id, notes: 'Returned unsold van stock to warehouse' } });
        }
        if (damaged > 0) await tx.vanStockMovement.create({ data: { tenantId: load.tenantId, vanId: load.vanId, productId: item.productId, loadId: load.id, routeId: load.routeId || null, warehouseId: load.warehouseId || null, type: 'DAMAGE', quantity: -damaged, unitCost, refType: 'VanLoad', refId: load.id, notes: 'Damaged stock during route closing' } });
        if (missing > 0) await tx.vanStockMovement.create({ data: { tenantId: load.tenantId, vanId: load.vanId, productId: item.productId, loadId: load.id, routeId: load.routeId || null, warehouseId: load.warehouseId || null, type: 'MISSING', quantity: -missing, unitCost, refType: 'VanLoad', refId: load.id, notes: 'Missing stock during route closing' } });
        await tx.vanLoadItem.update({ where: { id: item.id }, data: { qtyReturned: returned, qtyDamaged: damaged, qtyMissing: missing, notes: closeLine.notes || item.notes || null } });
      }

      const closing = await tx.vanDailyClosing.create({
        data: {
          tenantId: load.tenantId,
          closingNo: await nextNo(tx, 'vanDailyClosing', load.tenantId, 'VCL'),
          vanId: load.vanId,
          routeId: load.routeId || null,
          employeeId: load.employeeId || null,
          closingDate: new Date(),
          openingValue: 0,
          loadedValue: toMoney(loadedValue),
          soldValue: toMoney(data.soldValue),
          returnedValue: toMoney(returnedValue),
          damagedValue: toMoney(damagedValue),
          missingValue: toMoney(missingValue),
          cashCollected: toMoney(data.cashCollected),
          chequeCollected: toMoney(data.chequeCollected),
          creditSales: toMoney(data.creditSales),
          routeExpense: toMoney(data.routeExpense),
          status: 'POSTED',
          notes: data.notes || null
        }
      });

      const updatedLoad = await tx.vanLoad.update({ where: { id: load.id }, data: { status: 'CLOSED', closedAt: new Date() }, include: { items: true } });
      return { load: updatedLoad, closing };
    });
    await audit(req, 'CLOSE', 'VanLoad', result.load.id, null, result).catch(() => null);
    const normalized = await normalizeLoads([result.load], req.user.tenantId);
    res.json({ load: normalized[0], closing: result.closing });
  } catch (e) { next(e); }
});

router.get('/movements', allowVanStock('read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.vanId) where.vanId = String(req.query.vanId);
    if (req.query.productId) where.productId = String(req.query.productId);
    const rows = await prisma.vanStockMovement.findMany({ where, orderBy: { createdAt: 'desc' }, take: 120 });
    const productMap = await rowsById('product', req.user.tenantId, rows.map((r) => r.productId), { id: true, sku: true, name: true });
    const vanMap = await rowsById('distributionVan', req.user.tenantId, rows.map((r) => r.vanId), { id: true, vanNo: true, name: true });
    res.json(rows.map((row) => ({
      ...row,
      quantity: toQty(row.quantity),
      unitCost: toMoney(row.unitCost),
      productName: productMap.get(row.productId)?.name || null,
      sku: productMap.get(row.productId)?.sku || null,
      vanName: vanMap.get(row.vanId)?.name || null,
      vanNo: vanMap.get(row.vanId)?.vanNo || null
    })));
  } catch (e) { next(e); }
});

export default router;
