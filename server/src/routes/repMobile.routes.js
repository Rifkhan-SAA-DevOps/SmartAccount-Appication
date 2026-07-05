import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

const PAYMENT_METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CREDIT'];
const VISIT_STATUSES = ['PLANNED', 'VISITED', 'ORDER_TAKEN', 'NO_ORDER', 'SHOP_CLOSED', 'OWNER_NOT_AVAILABLE', 'PAYMENT_PROMISED', 'SKIPPED'];

function allowRepMobile(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const permissions = [
      `repMobile:${action}`,
      'repMobile:*',
      `distribution:${action}`,
      'distribution:*',
      `shopSupply:${action}`,
      'shopSupply:*',
      `shopCollections:${action}`,
      'shopCollections:*',
      `vanStock:${action}`,
      'vanStock:*'
    ];
    const fallbackRead = ['customer:read', 'product:read', 'invoice:read', 'reports:read'];
    const fallbackWrite = ['customer:update', 'invoice:create', 'payment:create'];
    const allowed = can(role, '*')
      || permissions.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));

    if (!allowed) return res.status(403).json({ message: `Permission denied: repMobile:${action}` });
    next();
  };
}

function asNumber(value) {
  return Number(value || 0);
}

function asMoney(value) {
  return money(asNumber(value));
}

function asQty(value) {
  return Number(Number(value || 0).toFixed(3));
}

function sum(items, selector) {
  return asMoney(items.reduce((total, item) => total + asNumber(selector(item)), 0));
}

function todayRange(query) {
  const date = query.date ? new Date(query.date) : new Date();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  return { date, from, to };
}

function nextNo(prefix, count) {
  return `${prefix}${String(count + 1001).padStart(5, '0')}`;
}

async function safeFindMany(model, args = {}) {
  if (!prisma[model]) return [];
  return prisma[model].findMany(args);
}

async function safeCount(model, args = {}) {
  if (!prisma[model]) return 0;
  return prisma[model].count(args);
}

async function safeFindUnique(model, args = {}) {
  if (!prisma[model]) return null;
  return prisma[model].findUnique(args);
}

function routeLabel(route) {
  if (!route) return 'No route';
  return `${route.routeNo || ''}${route.routeNo ? ' - ' : ''}${route.name || 'Route'}`;
}

function shopLabel(shop) {
  if (!shop) return 'Unknown shop';
  return `${shop.shopCode || ''}${shop.shopCode ? ' - ' : ''}${shop.shopName || 'Shop'}`;
}

function employeeLabel(employee) {
  if (!employee) return 'Unassigned';
  return employee.name || 'Employee';
}

function vanLabel(van) {
  if (!van) return 'No van';
  return `${van.vanNo || ''}${van.vanNo ? ' - ' : ''}${van.name || van.vehicleNo || 'Van'}`;
}

async function loadMasterData(tenantId, filters = {}) {
  const whereShop = { tenantId, isActive: true };
  if (filters.routeId) whereShop.routeId = filters.routeId;
  if (filters.employeeId) whereShop.assignedEmployeeId = filters.employeeId;

  const [routes, shops, employees, vans, products] = await Promise.all([
    safeFindMany('distributionRoute', { where: { tenantId, isActive: true }, orderBy: [{ routeNo: 'asc' }, { name: 'asc' }] }),
    safeFindMany('shopProfile', { where: whereShop, orderBy: [{ area: 'asc' }, { shopName: 'asc' }] }),
    safeFindMany('employee', { where: { tenantId }, orderBy: { name: 'asc' } }).catch(() => []),
    safeFindMany('distributionVan', { where: { tenantId, isActive: true }, orderBy: [{ vanNo: 'asc' }, { name: 'asc' }] }),
    safeFindMany('product', { where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 300 })
  ]);

  const routeMap = new Map(routes.map((route) => [route.id, route]));
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));

  return {
    routes,
    shops: shops.map((shop) => ({
      ...shop,
      routeName: routeLabel(routeMap.get(shop.routeId)),
      employeeName: employeeLabel(employeeMap.get(shop.assignedEmployeeId))
    })),
    employees,
    vans,
    products
  };
}

router.get('/summary', allowRepMobile('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = todayRange(req.query);
    const routeId = req.query.routeId || undefined;
    const employeeId = req.query.employeeId || undefined;
    const vanId = req.query.vanId || undefined;

    const masterData = await loadMasterData(tenantId, { routeId, employeeId });

    const visitWhere = { tenantId, plannedAt: { gte: from, lte: to } };
    if (routeId) visitWhere.routeId = routeId;
    if (employeeId) visitWhere.employeeId = employeeId;

    const collectionWhere = { tenantId, collectedAt: { gte: from, lte: to } };
    if (routeId) collectionWhere.routeId = routeId;
    if (employeeId) collectionWhere.employeeId = employeeId;

    const supplyWhere = { tenantId, supplyDate: { gte: from, lte: to } };
    if (routeId) supplyWhere.routeId = routeId;
    if (employeeId) supplyWhere.employeeId = employeeId;
    if (vanId) supplyWhere.vanId = vanId;

    const returnWhere = { tenantId, returnDate: { gte: from, lte: to } };
    if (routeId) returnWhere.routeId = routeId;
    if (employeeId) returnWhere.employeeId = employeeId;
    if (vanId) returnWhere.vanId = vanId;

    const [visits, collections, supplies, returns, vanStocks] = await Promise.all([
      safeFindMany('shopVisit', { where: visitWhere, orderBy: { plannedAt: 'asc' } }),
      safeFindMany('shopCollection', { where: collectionWhere, orderBy: { collectedAt: 'desc' }, take: 50 }),
      safeFindMany('shopSupplyInvoice', { where: supplyWhere, include: { items: true }, orderBy: { supplyDate: 'desc' }, take: 50 }),
      safeFindMany('shopReturn', { where: returnWhere, include: { items: true }, orderBy: { returnDate: 'desc' }, take: 50 }),
      vanId ? safeFindMany('vanStock', { where: { tenantId, vanId }, orderBy: { productId: 'asc' } }) : []
    ]);

    const routeMap = new Map(masterData.routes.map((route) => [route.id, route]));
    const shopMap = new Map(masterData.shops.map((shop) => [shop.id, shop]));
    const employeeMap = new Map(masterData.employees.map((employee) => [employee.id, employee]));
    const vanMap = new Map(masterData.vans.map((van) => [van.id, van]));
    const productMap = new Map(masterData.products.map((product) => [product.id, product]));

    const plannedShopIds = new Set(visits.map((visit) => visit.shopId));
    const routeShops = masterData.shops.map((shop) => {
      const visit = visits.find((item) => item.shopId === shop.id);
      return {
        ...shop,
        todayVisit: visit || null,
        visitStatus: visit?.status || 'NOT_PLANNED',
        outstanding: asMoney(shop.currentOutstanding)
      };
    });

    const statusCounts = visits.reduce((map, visit) => {
      map[visit.status] = (map[visit.status] || 0) + 1;
      return map;
    }, {});

    const collectionByMethod = collections.reduce((map, collection) => {
      map[collection.method] = asMoney((map[collection.method] || 0) + asNumber(collection.amount));
      return map;
    }, {});

    const topOutstanding = [...masterData.shops]
      .sort((a, b) => asNumber(b.currentOutstanding) - asNumber(a.currentOutstanding))
      .slice(0, 8)
      .map((shop) => ({ id: shop.id, shopName: shop.shopName, shopCode: shop.shopCode, routeName: shop.routeName, outstanding: asMoney(shop.currentOutstanding), creditLimit: asMoney(shop.creditLimit), isBlocked: shop.isBlocked }));

    res.json({
      date: from,
      filters: { routeId, employeeId, vanId },
      masterData,
      summary: {
        shopsOnRoute: masterData.shops.length,
        plannedVisits: visits.length,
        visited: visits.filter((visit) => ['VISITED', 'ORDER_TAKEN', 'NO_ORDER', 'PAYMENT_PROMISED'].includes(visit.status)).length,
        notVisited: Math.max(0, masterData.shops.length - plannedShopIds.size),
        supplyCount: supplies.length,
        supplyTotal: sum(supplies, (item) => item.total),
        supplyPaid: sum(supplies, (item) => item.paid),
        supplyBalance: sum(supplies, (item) => item.balance),
        collectionCount: collections.length,
        collectionTotal: sum(collections, (item) => item.amount),
        returnCount: returns.length,
        returnCredit: sum(returns, (item) => item.creditAmount || item.total),
        outstandingTotal: sum(masterData.shops, (shop) => shop.currentOutstanding),
        blockedShops: masterData.shops.filter((shop) => shop.isBlocked).length,
        statusCounts,
        collectionByMethod
      },
      routeShops,
      visits: visits.map((visit) => ({
        ...visit,
        shopName: shopLabel(shopMap.get(visit.shopId)),
        routeName: routeLabel(routeMap.get(visit.routeId)),
        employeeName: employeeLabel(employeeMap.get(visit.employeeId))
      })),
      collections: collections.map((collection) => ({
        ...collection,
        shopName: shopLabel(shopMap.get(collection.shopId)),
        routeName: routeLabel(routeMap.get(collection.routeId)),
        employeeName: employeeLabel(employeeMap.get(collection.employeeId))
      })),
      supplies: supplies.map((supply) => ({
        ...supply,
        shopName: shopLabel(shopMap.get(supply.shopId)),
        routeName: routeLabel(routeMap.get(supply.routeId)),
        employeeName: employeeLabel(employeeMap.get(supply.employeeId)),
        vanName: vanLabel(vanMap.get(supply.vanId))
      })),
      vanStock: vanStocks.map((stock) => ({
        ...stock,
        productName: productMap.get(stock.productId)?.name || stock.productId,
        sku: productMap.get(stock.productId)?.sku || '',
        stockValue: asMoney(asNumber(stock.quantity) * asNumber(productMap.get(stock.productId)?.costPrice))
      })),
      topOutstanding
    });
  } catch (e) { next(e); }
});

const visitSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  status: z.enum(VISIT_STATUSES).optional().default('VISITED'),
  orderTaken: z.coerce.boolean().optional().default(false),
  collectionPromise: z.coerce.number().nonnegative().optional().default(0),
  plannedAt: z.coerce.date().optional(),
  visitedAt: z.coerce.date().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  noOrderReason: z.string().trim().max(250).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

router.post('/visits', allowRepMobile('create'), async (req, res, next) => {
  try {
    if (!prisma.shopVisit || !prisma.shopProfile) {
      return res.status(400).json({ message: 'Distribution foundation is not installed yet.' });
    }

    const data = visitSchema.parse(req.body);
    const shop = await prisma.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId } });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });

    const count = await prisma.shopVisit.count({ where: { tenantId: req.user.tenantId } });
    const status = data.status;
    const visit = await prisma.shopVisit.create({
      data: {
        tenantId: req.user.tenantId,
        visitNo: nextNo('VST', count),
        shopId: shop.id,
        routeId: data.routeId || shop.routeId || null,
        employeeId: data.employeeId || shop.assignedEmployeeId || null,
        plannedAt: data.plannedAt || new Date(),
        visitedAt: data.visitedAt || (status === 'PLANNED' ? null : new Date()),
        status,
        orderTaken: data.orderTaken || status === 'ORDER_TAKEN',
        collectionPromise: asMoney(data.collectionPromise),
        nextFollowUpAt: data.nextFollowUpAt || null,
        noOrderReason: data.noOrderReason || null,
        notes: data.notes || null,
        createdById: req.user.id
      }
    });

    await audit(req, 'CREATE', 'ShopVisit', visit.id, null, visit).catch(() => null);
    res.status(201).json({ message: 'Shop visit saved', visit });
  } catch (e) { next(e); }
});

const collectionSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: z.enum(PAYMENT_METHODS).optional().default('CASH'),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  collectedAt: z.coerce.date().optional()
});

async function allocateCollection(tx, tenantId, shopId, amount) {
  if (!tx.shopSupplyInvoice) return [];
  let remaining = asMoney(amount);
  const updates = [];
  const invoices = await tx.shopSupplyInvoice.findMany({
    where: { tenantId, shopId, status: 'POSTED', balance: { gt: 0 } },
    orderBy: { supplyDate: 'asc' }
  });

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const balance = asNumber(invoice.balance);
    const applied = Math.min(balance, remaining);
    const paid = asMoney(asNumber(invoice.paid) + applied);
    const newBalance = asMoney(balance - applied);
    await tx.shopSupplyInvoice.update({
      where: { id: invoice.id },
      data: { paid, balance: newBalance }
    });
    updates.push({ supplyInvoiceId: invoice.id, supplyNo: invoice.supplyNo, applied: asMoney(applied) });
    remaining = asMoney(remaining - applied);
  }
  return updates;
}

router.post('/collections', allowRepMobile('create'), async (req, res, next) => {
  try {
    if (!prisma.shopCollection || !prisma.shopProfile) {
      return res.status(400).json({ message: 'Shop collection module is not installed yet.' });
    }

    const data = collectionSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
      const count = await tx.shopCollection.count({ where: { tenantId: req.user.tenantId } });
      const amount = asMoney(data.amount);

      const collection = await tx.shopCollection.create({
        data: {
          tenantId: req.user.tenantId,
          collectionNo: nextNo('COL', count),
          shopId: shop.id,
          customerId: shop.customerId || null,
          routeId: data.routeId || shop.routeId || null,
          employeeId: data.employeeId || shop.assignedEmployeeId || null,
          amount,
          method: data.method,
          reference: data.reference || null,
          notes: data.notes || null,
          collectedAt: data.collectedAt || new Date(),
          createdById: req.user.id
        }
      });

      await tx.shopProfile.update({
        where: { id: shop.id },
        data: { currentOutstanding: asMoney(asNumber(shop.currentOutstanding) - amount) }
      });

      if (shop.customerId && tx.customer) {
        const customer = await tx.customer.findUnique({ where: { id: shop.customerId } });
        if (customer) await tx.customer.update({ where: { id: customer.id }, data: { balance: asMoney(asNumber(customer.balance) - amount) } });
      }

      const allocations = await allocateCollection(tx, req.user.tenantId, shop.id, amount);
      return { collection, allocations };
    });

    await audit(req, 'CREATE', 'ShopCollection', result.collection.id, null, result).catch(() => null);
    res.status(201).json({ message: 'Collection saved', ...result });
  } catch (e) { next(e); }
});

const quickSupplyItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  freeQty: z.coerce.number().nonnegative().optional().default(0),
  unitPrice: z.coerce.number().nonnegative().optional().default(0),
  discount: z.coerce.number().nonnegative().optional().default(0)
});

const quickSupplySchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  vanId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  supplyDate: z.coerce.date().optional(),
  paid: z.coerce.number().nonnegative().optional().default(0),
  discount: z.coerce.number().nonnegative().optional().default(0),
  tax: z.coerce.number().nonnegative().optional().default(0),
  paymentMethod: z.enum(PAYMENT_METHODS).optional().default('CREDIT'),
  notes: z.string().trim().max(1000).optional().nullable(),
  items: z.array(quickSupplyItemSchema).min(1)
});

async function reduceStockForSupply(tx, tenantId, item, vanId) {
  if (!item.productId) return;
  const totalQty = asQty(asNumber(item.qty) + asNumber(item.freeQty));
  if (vanId && tx.vanStock) {
    const existing = await tx.vanStock.findUnique({ where: { tenantId_vanId_productId: { tenantId, vanId, productId: item.productId } } }).catch(() => null);
    if (existing) {
      await tx.vanStock.update({ where: { id: existing.id }, data: { quantity: asQty(asNumber(existing.quantity) - totalQty) } });
      if (tx.vanStockMovement) {
        await tx.vanStockMovement.create({
          data: { tenantId, vanId, productId: item.productId, type: 'MOBILE_SUPPLY_OUT', quantity: totalQty, refType: 'RepMobile', notes: 'Reduced from mobile sales rep supply' }
        }).catch(() => null);
      }
      return;
    }
  }

  if (tx.product) {
    const product = await tx.product.findUnique({ where: { id: item.productId } });
    if (product) await tx.product.update({ where: { id: product.id }, data: { stockQty: asQty(asNumber(product.stockQty) - totalQty) } });
  }
}

router.post('/quick-supply', allowRepMobile('create'), async (req, res, next) => {
  try {
    if (!prisma.shopSupplyInvoice || !prisma.shopSupplyInvoiceItem || !prisma.shopProfile) {
      return res.status(400).json({ message: 'Shop supply module is not installed yet.' });
    }

    const data = quickSupplySchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });

      const items = data.items.map((item) => {
        const total = asMoney((asNumber(item.qty) * asNumber(item.unitPrice)) - asNumber(item.discount));
        return { ...item, total };
      });
      const subtotal = sum(items, (item) => item.total);
      const total = asMoney(subtotal - asNumber(data.discount) + asNumber(data.tax));
      const paid = asMoney(data.paid);
      const balance = asMoney(total - paid);
      const count = await tx.shopSupplyInvoice.count({ where: { tenantId: req.user.tenantId } });

      const invoice = await tx.shopSupplyInvoice.create({
        data: {
          tenantId: req.user.tenantId,
          supplyNo: nextNo('SSI', count),
          shopId: shop.id,
          customerId: shop.customerId || null,
          routeId: data.routeId || shop.routeId || null,
          employeeId: data.employeeId || shop.assignedEmployeeId || null,
          vanId: data.vanId || null,
          warehouseId: data.warehouseId || null,
          status: 'POSTED',
          supplyDate: data.supplyDate || new Date(),
          subtotal,
          discount: asMoney(data.discount),
          tax: asMoney(data.tax),
          total,
          paid,
          balance,
          paymentMethod: data.paymentMethod,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: items.map((item) => ({
              productId: item.productId || null,
              description: item.description,
              qty: asQty(item.qty),
              freeQty: asQty(item.freeQty),
              unitPrice: asMoney(item.unitPrice),
              discount: asMoney(item.discount),
              total: item.total
            }))
          }
        },
        include: { items: true }
      });

      for (const item of items) await reduceStockForSupply(tx, req.user.tenantId, item, data.vanId || null);

      await tx.shopProfile.update({
        where: { id: shop.id },
        data: { currentOutstanding: asMoney(asNumber(shop.currentOutstanding) + balance) }
      });

      if (shop.customerId && tx.customer) {
        const customer = await tx.customer.findUnique({ where: { id: shop.customerId } });
        if (customer) await tx.customer.update({ where: { id: customer.id }, data: { balance: asMoney(asNumber(customer.balance) + balance) } });
      }

      let collection = null;
      if (paid > 0 && tx.shopCollection) {
        const collectionCount = await tx.shopCollection.count({ where: { tenantId: req.user.tenantId } });
        collection = await tx.shopCollection.create({
          data: {
            tenantId: req.user.tenantId,
            collectionNo: nextNo('COL', collectionCount),
            shopId: shop.id,
            customerId: shop.customerId || null,
            routeId: invoice.routeId,
            employeeId: invoice.employeeId,
            amount: paid,
            method: data.paymentMethod === 'CREDIT' ? 'CASH' : data.paymentMethod,
            reference: invoice.supplyNo,
            notes: 'Auto collection from mobile quick supply',
            collectedAt: invoice.supplyDate,
            createdById: req.user.id
          }
        });
      }

      return { invoice, collection };
    });

    await audit(req, 'CREATE', 'ShopSupplyInvoice', result.invoice.id, null, result).catch(() => null);
    res.status(201).json({ message: 'Mobile supply invoice posted', ...result });
  } catch (e) { next(e); }
});

const closingSchema = z.object({
  vanId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  cashCollected: z.coerce.number().nonnegative().optional().default(0),
  chequeCollected: z.coerce.number().nonnegative().optional().default(0),
  creditSales: z.coerce.number().nonnegative().optional().default(0),
  routeExpense: z.coerce.number().nonnegative().optional().default(0),
  soldValue: z.coerce.number().nonnegative().optional().default(0),
  returnedValue: z.coerce.number().nonnegative().optional().default(0),
  damagedValue: z.coerce.number().nonnegative().optional().default(0),
  missingValue: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable()
});

router.post('/day-closing', allowRepMobile('create'), async (req, res, next) => {
  try {
    if (!prisma.vanDailyClosing) return res.status(400).json({ message: 'Van daily closing module is not installed yet.' });
    const data = closingSchema.parse(req.body);
    const count = await prisma.vanDailyClosing.count({ where: { tenantId: req.user.tenantId } });
    const closing = await prisma.vanDailyClosing.create({
      data: {
        tenantId: req.user.tenantId,
        closingNo: nextNo('VCL', count),
        vanId: data.vanId,
        routeId: data.routeId || null,
        employeeId: data.employeeId || null,
        closingDate: new Date(),
        cashCollected: asMoney(data.cashCollected),
        chequeCollected: asMoney(data.chequeCollected),
        creditSales: asMoney(data.creditSales),
        routeExpense: asMoney(data.routeExpense),
        soldValue: asMoney(data.soldValue),
        returnedValue: asMoney(data.returnedValue),
        damagedValue: asMoney(data.damagedValue),
        missingValue: asMoney(data.missingValue),
        status: 'POSTED',
        notes: data.notes || null
      }
    });
    await audit(req, 'CREATE', 'VanDailyClosing', closing.id, null, closing).catch(() => null);
    res.status(201).json({ message: 'Daily route closing saved', closing });
  } catch (e) { next(e); }
});

export default router;
