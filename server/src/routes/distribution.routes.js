import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function allowDistribution(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const distributionPermissions = [`distribution:${action}`, 'distribution:*'];
    const fallbackRead = ['customer:read', 'invoice:read', 'delivery:read', 'product:read'];
    const fallbackWrite = ['customer:create', 'customer:update', 'invoice:create', 'delivery:create', 'payment:create'];
    const allowed = can(role, '*')
      || distributionPermissions.some((p) => can(role, p))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((p) => can(role, p));
    if (!allowed) return res.status(403).json({ message: `Permission denied: distribution:${action}` });
    next();
  };
}

const routeSchema = z.object({
  routeNo: z.string().trim().min(1).max(40).optional().nullable(),
  name: z.string().trim().min(1).max(160),
  area: z.string().trim().max(160).optional().nullable(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  targetDailySales: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true)
});

const shopSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  shopCode: z.string().trim().min(1).max(50).optional().nullable(),
  shopName: z.string().trim().min(1).max(180),
  ownerName: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  area: z.string().trim().max(160).optional().nullable(),
  category: z.string().trim().max(80).optional().default('Retail Shop'),
  paymentTerms: z.string().trim().max(80).optional().default('Credit'),
  creditLimit: z.coerce.number().nonnegative().optional().default(0),
  currentOutstanding: z.coerce.number().optional().default(0),
  creditDays: z.coerce.number().int().nonnegative().optional().default(7),
  visitFrequency: z.string().trim().max(80).optional().default('Weekly'),
  mapUrl: z.string().trim().max(800).optional().nullable(),
  isBlocked: z.coerce.boolean().optional().default(false),
  isActive: z.coerce.boolean().optional().default(true)
});

const visitSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  plannedAt: z.coerce.date().optional().nullable(),
  visitedAt: z.coerce.date().optional().nullable(),
  status: z.enum(['PLANNED', 'VISITED', 'NO_ORDER', 'SHOP_CLOSED', 'PAYMENT_PROMISED', 'CANCELLED']).optional().default('PLANNED'),
  orderTaken: z.coerce.boolean().optional().default(false),
  collectionPromise: z.coerce.number().nonnegative().optional().default(0),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  noOrderReason: z.string().trim().max(500).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const vanSchema = z.object({
  vanNo: z.string().trim().min(1).max(50).optional().nullable(),
  name: z.string().trim().min(1).max(160),
  vehicleNo: z.string().trim().max(80).optional().nullable(),
  driverEmployeeId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  capacityNotes: z.string().trim().max(500).optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true)
});

const collectionSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CREDIT']).optional().default('CASH'),
  reference: z.string().trim().max(160).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
  collectedAt: z.coerce.date().optional().default(() => new Date())
});

async function nextNo(tx, modelName, tenantId, field, prefix, start = 1001) {
  const count = await tx[modelName].count({ where: { tenantId } });
  return `${prefix}${String(count + start).padStart(4, '0')}`;
}

function toMoney(value) { return money(Number(value || 0)); }
function toQty(value) { return Number(Number(value || 0).toFixed(3)); }

async function employeeNameMap(tenantId, ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma.employee.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true, name: true, employeeNo: true, designation: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

async function routeNameMap(tenantId, ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma.distributionRoute.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true, name: true, routeNo: true, area: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

async function shopNameMap(tenantId, ids = []) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  const rows = await prisma.shopProfile.findMany({ where: { tenantId, id: { in: unique } }, select: { id: true, shopName: true, shopCode: true, phone: true, area: true } });
  return new Map(rows.map((row) => [row.id, row]));
}

function normalizeRoute(route, employeeMap = new Map()) {
  const employee = employeeMap.get(route.assignedEmployeeId);
  return {
    ...route,
    targetDailySales: toMoney(route.targetDailySales),
    assignedEmployeeName: employee?.name || null,
    assignedEmployeeNo: employee?.employeeNo || null
  };
}

function normalizeShop(shop, routeMap = new Map(), employeeMap = new Map()) {
  const route = routeMap.get(shop.routeId);
  const employee = employeeMap.get(shop.assignedEmployeeId);
  return {
    ...shop,
    creditLimit: toMoney(shop.creditLimit),
    currentOutstanding: toMoney(shop.currentOutstanding),
    availableCredit: toMoney(Number(shop.creditLimit || 0) - Number(shop.currentOutstanding || 0)),
    isOverLimit: Number(shop.creditLimit || 0) > 0 && Number(shop.currentOutstanding || 0) > Number(shop.creditLimit || 0),
    routeName: route?.name || null,
    routeNo: route?.routeNo || null,
    assignedEmployeeName: employee?.name || null
  };
}

function normalizeVisit(visit, shopMap = new Map(), routeMap = new Map(), employeeMap = new Map()) {
  const shop = shopMap.get(visit.shopId);
  const route = routeMap.get(visit.routeId);
  const employee = employeeMap.get(visit.employeeId);
  return {
    ...visit,
    collectionPromise: toMoney(visit.collectionPromise),
    shopName: shop?.shopName || null,
    shopCode: shop?.shopCode || null,
    routeName: route?.name || null,
    employeeName: employee?.name || null
  };
}

function normalizeVan(van, routeMap = new Map(), employeeMap = new Map()) {
  const route = routeMap.get(van.routeId);
  const employee = employeeMap.get(van.driverEmployeeId);
  return {
    ...van,
    routeName: route?.name || null,
    driverName: employee?.name || null
  };
}

function normalizeCollection(row, shopMap = new Map(), routeMap = new Map(), employeeMap = new Map()) {
  const shop = shopMap.get(row.shopId);
  const route = routeMap.get(row.routeId);
  const employee = employeeMap.get(row.employeeId);
  return {
    ...row,
    amount: toMoney(row.amount),
    shopName: shop?.shopName || null,
    shopCode: shop?.shopCode || null,
    routeName: route?.name || null,
    employeeName: employee?.name || null
  };
}

router.get('/summary', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [routes, shops, activeShops, blockedShops, vans, visitsToday, collectionsToday, overdueVisits, topOutstanding] = await Promise.all([
      prisma.distributionRoute.count({ where: { tenantId, isActive: true } }),
      prisma.shopProfile.count({ where: { tenantId } }),
      prisma.shopProfile.count({ where: { tenantId, isActive: true, isBlocked: false } }),
      prisma.shopProfile.count({ where: { tenantId, OR: [{ isBlocked: true }, { currentOutstanding: { gt: 0 } }] } }),
      prisma.distributionVan.count({ where: { tenantId, isActive: true } }),
      prisma.shopVisit.count({ where: { tenantId, plannedAt: { gte: today, lt: tomorrow } } }),
      prisma.shopCollection.findMany({ where: { tenantId, collectedAt: { gte: today, lt: tomorrow } }, select: { amount: true } }),
      prisma.shopVisit.count({ where: { tenantId, plannedAt: { lt: new Date() }, status: 'PLANNED' } }),
      prisma.shopProfile.findMany({ where: { tenantId, currentOutstanding: { gt: 0 } }, orderBy: { currentOutstanding: 'desc' }, take: 8 })
    ]);

    const allShopBalances = await prisma.shopProfile.findMany({ where: { tenantId }, select: { currentOutstanding: true, creditLimit: true } });
    const totalOutstanding = allShopBalances.reduce((sum, row) => sum + Number(row.currentOutstanding || 0), 0);
    const totalCreditLimit = allShopBalances.reduce((sum, row) => sum + Number(row.creditLimit || 0), 0);
    const todayCollectionTotal = collectionsToday.reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const routeIds = topOutstanding.map((s) => s.routeId);
    const employeeIds = topOutstanding.map((s) => s.assignedEmployeeId);
    const [routeMap, employeeMap] = await Promise.all([routeNameMap(tenantId, routeIds), employeeNameMap(tenantId, employeeIds)]);

    res.json({
      routes,
      shops,
      activeShops,
      blockedShops,
      vans,
      visitsToday,
      overdueVisits,
      todayCollectionTotal: toMoney(todayCollectionTotal),
      totalOutstanding: toMoney(totalOutstanding),
      totalCreditLimit: toMoney(totalCreditLimit),
      creditUsedPercent: totalCreditLimit > 0 ? Math.round((totalOutstanding / totalCreditLimit) * 100) : 0,
      topOutstanding: topOutstanding.map((s) => normalizeShop(s, routeMap, employeeMap))
    });
  } catch (e) { next(e); }
});

router.get('/sales-reps', allowDistribution('read'), async (req, res, next) => {
  try {
    const rows = await prisma.employee.findMany({
      where: { tenantId: req.user.tenantId, status: { not: 'INACTIVE' } },
      orderBy: [{ name: 'asc' }],
      take: 200
    });
    res.json(rows.map((e) => ({ id: e.id, employeeNo: e.employeeNo, name: e.name, designation: e.designation, phone: e.phone, department: e.department })));
  } catch (e) { next(e); }
});

router.get('/routes', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.active === 'true') where.isActive = true;
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { routeNo: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } }
    ];
    const rows = await prisma.distributionRoute.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], take: 300 });
    const employeeMap = await employeeNameMap(tenantId, rows.map((r) => r.assignedEmployeeId));
    res.json(rows.map((r) => normalizeRoute(r, employeeMap)));
  } catch (e) { next(e); }
});

router.post('/routes', allowDistribution('write'), async (req, res, next) => {
  try {
    const data = routeSchema.parse(req.body);
    const route = await prisma.$transaction(async (tx) => tx.distributionRoute.create({
      data: {
        tenantId: req.user.tenantId,
        routeNo: data.routeNo || await nextNo(tx, 'distributionRoute', req.user.tenantId, 'routeNo', 'RT'),
        name: data.name,
        area: data.area || null,
        assignedEmployeeId: data.assignedEmployeeId || null,
        targetDailySales: money(data.targetDailySales),
        notes: data.notes || null,
        isActive: data.isActive
      }
    }));
    await audit(req, 'CREATE', 'DistributionRoute', route.id, null, route);
    res.status(201).json(normalizeRoute(route));
  } catch (e) { next(e); }
});

router.patch('/routes/:id', allowDistribution('write'), async (req, res, next) => {
  try {
    const current = await prisma.distributionRoute.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!current) return res.status(404).json({ message: 'Route not found' });
    const data = routeSchema.partial().parse(req.body);
    const updated = await prisma.distributionRoute.update({
      where: { id: current.id },
      data: {
        ...data,
        assignedEmployeeId: data.assignedEmployeeId === undefined ? undefined : data.assignedEmployeeId || null,
        area: data.area === undefined ? undefined : data.area || null,
        notes: data.notes === undefined ? undefined : data.notes || null,
        targetDailySales: data.targetDailySales === undefined ? undefined : money(data.targetDailySales)
      }
    });
    await audit(req, 'UPDATE', 'DistributionRoute', updated.id, current, updated);
    res.json(normalizeRoute(updated));
  } catch (e) { next(e); }
});

router.get('/shops', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    if (req.query.employeeId) where.assignedEmployeeId = String(req.query.employeeId);
    if (req.query.blocked === 'true') where.isBlocked = true;
    if (req.query.active === 'true') where.isActive = true;
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { shopCode: { contains: q, mode: 'insensitive' } },
      { shopName: { contains: q, mode: 'insensitive' } },
      { ownerName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } }
    ];
    const rows = await prisma.shopProfile.findMany({ where, orderBy: [{ isBlocked: 'desc' }, { currentOutstanding: 'desc' }, { shopName: 'asc' }], take: 400 });
    const [routeMap, employeeMap] = await Promise.all([
      routeNameMap(tenantId, rows.map((s) => s.routeId)),
      employeeNameMap(tenantId, rows.map((s) => s.assignedEmployeeId))
    ]);
    res.json(rows.map((s) => normalizeShop(s, routeMap, employeeMap)));
  } catch (e) { next(e); }
});

router.post('/shops', allowDistribution('write'), async (req, res, next) => {
  try {
    const data = shopSchema.parse(req.body);
    const shop = await prisma.$transaction(async (tx) => {
      let customerId = data.customerId || null;
      let baseBalance = data.currentOutstanding;
      if (customerId) {
        const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: req.user.tenantId } });
        if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
        if (baseBalance === 0) baseBalance = Number(customer.balance || 0);
      } else {
        const customer = await tx.customer.create({
          data: {
            tenantId: req.user.tenantId,
            name: data.shopName,
            phone: data.phone || null,
            address: data.address || null,
            groupName: 'Retail Shop',
            creditLimit: money(data.creditLimit),
            balance: money(baseBalance)
          }
        });
        customerId = customer.id;
      }

      return tx.shopProfile.create({
        data: {
          tenantId: req.user.tenantId,
          customerId,
          routeId: data.routeId || null,
          assignedEmployeeId: data.assignedEmployeeId || null,
          shopCode: data.shopCode || await nextNo(tx, 'shopProfile', req.user.tenantId, 'shopCode', 'SH'),
          shopName: data.shopName,
          ownerName: data.ownerName || null,
          phone: data.phone || null,
          address: data.address || null,
          area: data.area || null,
          category: data.category || 'Retail Shop',
          paymentTerms: data.paymentTerms || 'Credit',
          creditLimit: money(data.creditLimit),
          currentOutstanding: money(baseBalance),
          creditDays: data.creditDays,
          visitFrequency: data.visitFrequency || 'Weekly',
          mapUrl: data.mapUrl || null,
          isBlocked: data.isBlocked,
          isActive: data.isActive
        }
      });
    });
    await audit(req, 'CREATE', 'ShopProfile', shop.id, null, shop);
    res.status(201).json(normalizeShop(shop));
  } catch (e) { next(e); }
});

router.patch('/shops/:id', allowDistribution('write'), async (req, res, next) => {
  try {
    const current = await prisma.shopProfile.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!current) return res.status(404).json({ message: 'Shop not found' });
    const data = shopSchema.partial().parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.shopProfile.update({
        where: { id: current.id },
        data: {
          ...data,
          routeId: data.routeId === undefined ? undefined : data.routeId || null,
          assignedEmployeeId: data.assignedEmployeeId === undefined ? undefined : data.assignedEmployeeId || null,
          ownerName: data.ownerName === undefined ? undefined : data.ownerName || null,
          phone: data.phone === undefined ? undefined : data.phone || null,
          address: data.address === undefined ? undefined : data.address || null,
          area: data.area === undefined ? undefined : data.area || null,
          mapUrl: data.mapUrl === undefined ? undefined : data.mapUrl || null,
          creditLimit: data.creditLimit === undefined ? undefined : money(data.creditLimit),
          currentOutstanding: data.currentOutstanding === undefined ? undefined : money(data.currentOutstanding)
        }
      });
      if (row.customerId && (data.shopName || data.phone || data.address || data.creditLimit !== undefined || data.currentOutstanding !== undefined)) {
        await tx.customer.updateMany({
          where: { id: row.customerId, tenantId: req.user.tenantId },
          data: {
            name: data.shopName || undefined,
            phone: data.phone === undefined ? undefined : data.phone || null,
            address: data.address === undefined ? undefined : data.address || null,
            creditLimit: data.creditLimit === undefined ? undefined : money(data.creditLimit),
            balance: data.currentOutstanding === undefined ? undefined : money(data.currentOutstanding)
          }
        });
      }
      return row;
    });
    await audit(req, 'UPDATE', 'ShopProfile', updated.id, current, updated);
    res.json(normalizeShop(updated));
  } catch (e) { next(e); }
});

router.get('/visits', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.shopId) where.shopId = String(req.query.shopId);
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const rows = await prisma.shopVisit.findMany({ where, orderBy: [{ plannedAt: 'desc' }, { createdAt: 'desc' }], take: 250 });
    const [shopMap, routeMap, employeeMap] = await Promise.all([
      shopNameMap(tenantId, rows.map((v) => v.shopId)),
      routeNameMap(tenantId, rows.map((v) => v.routeId)),
      employeeNameMap(tenantId, rows.map((v) => v.employeeId))
    ]);
    res.json(rows.map((v) => normalizeVisit(v, shopMap, routeMap, employeeMap)));
  } catch (e) { next(e); }
});

router.post('/visits', allowDistribution('write'), async (req, res, next) => {
  try {
    const data = visitSchema.parse(req.body);
    const shop = await prisma.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId } });
    if (!shop) return res.status(404).json({ message: 'Shop not found' });
    const visit = await prisma.$transaction(async (tx) => tx.shopVisit.create({
      data: {
        tenantId: req.user.tenantId,
        visitNo: await nextNo(tx, 'shopVisit', req.user.tenantId, 'visitNo', 'SV'),
        shopId: data.shopId,
        routeId: data.routeId || shop.routeId || null,
        employeeId: data.employeeId || shop.assignedEmployeeId || null,
        plannedAt: data.plannedAt || new Date(),
        visitedAt: data.visitedAt || null,
        status: data.status,
        orderTaken: data.orderTaken,
        collectionPromise: money(data.collectionPromise),
        nextFollowUpAt: data.nextFollowUpAt || null,
        noOrderReason: data.noOrderReason || null,
        notes: data.notes || null,
        createdById: req.user.id
      }
    }));
    await audit(req, 'CREATE', 'ShopVisit', visit.id, null, visit);
    res.status(201).json(normalizeVisit(visit));
  } catch (e) { next(e); }
});

router.get('/vans', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.active === 'true') where.isActive = true;
    const rows = await prisma.distributionVan.findMany({ where, orderBy: [{ isActive: 'desc' }, { name: 'asc' }], take: 200 });
    const [routeMap, employeeMap] = await Promise.all([
      routeNameMap(tenantId, rows.map((v) => v.routeId)),
      employeeNameMap(tenantId, rows.map((v) => v.driverEmployeeId))
    ]);
    res.json(rows.map((v) => normalizeVan(v, routeMap, employeeMap)));
  } catch (e) { next(e); }
});

router.post('/vans', allowDistribution('write'), async (req, res, next) => {
  try {
    const data = vanSchema.parse(req.body);
    const van = await prisma.$transaction(async (tx) => tx.distributionVan.create({
      data: {
        tenantId: req.user.tenantId,
        vanNo: data.vanNo || await nextNo(tx, 'distributionVan', req.user.tenantId, 'vanNo', 'VN'),
        name: data.name,
        vehicleNo: data.vehicleNo || null,
        driverEmployeeId: data.driverEmployeeId || null,
        routeId: data.routeId || null,
        capacityNotes: data.capacityNotes || null,
        isActive: data.isActive
      }
    }));
    await audit(req, 'CREATE', 'DistributionVan', van.id, null, van);
    res.status(201).json(normalizeVan(van));
  } catch (e) { next(e); }
});

router.patch('/vans/:id', allowDistribution('write'), async (req, res, next) => {
  try {
    const current = await prisma.distributionVan.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!current) return res.status(404).json({ message: 'Van not found' });
    const data = vanSchema.partial().parse(req.body);
    const updated = await prisma.distributionVan.update({
      where: { id: current.id },
      data: {
        ...data,
        vehicleNo: data.vehicleNo === undefined ? undefined : data.vehicleNo || null,
        driverEmployeeId: data.driverEmployeeId === undefined ? undefined : data.driverEmployeeId || null,
        routeId: data.routeId === undefined ? undefined : data.routeId || null,
        capacityNotes: data.capacityNotes === undefined ? undefined : data.capacityNotes || null
      }
    });
    await audit(req, 'UPDATE', 'DistributionVan', updated.id, current, updated);
    res.json(normalizeVan(updated));
  } catch (e) { next(e); }
});

router.get('/collections', allowDistribution('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.shopId) where.shopId = String(req.query.shopId);
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    const rows = await prisma.shopCollection.findMany({ where, orderBy: { collectedAt: 'desc' }, take: 250 });
    const [shopMap, routeMap, employeeMap] = await Promise.all([
      shopNameMap(tenantId, rows.map((c) => c.shopId)),
      routeNameMap(tenantId, rows.map((c) => c.routeId)),
      employeeNameMap(tenantId, rows.map((c) => c.employeeId))
    ]);
    res.json(rows.map((c) => normalizeCollection(c, shopMap, routeMap, employeeMap)));
  } catch (e) { next(e); }
});

router.post('/collections', allowDistribution('write'), async (req, res, next) => {
  try {
    const data = collectionSchema.parse(req.body);
    const collection = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId: req.user.tenantId } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
      const amount = money(data.amount);
      const row = await tx.shopCollection.create({
        data: {
          tenantId: req.user.tenantId,
          collectionNo: await nextNo(tx, 'shopCollection', req.user.tenantId, 'collectionNo', 'SC'),
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
      await tx.shopProfile.update({ where: { id: shop.id }, data: { currentOutstanding: { decrement: amount } } });
      if (shop.customerId) {
        await tx.customer.updateMany({ where: { id: shop.customerId, tenantId: req.user.tenantId }, data: { balance: { decrement: amount } } });
      }
      return row;
    });
    await audit(req, 'CREATE', 'ShopCollection', collection.id, null, collection);
    res.status(201).json(normalizeCollection(collection));
  } catch (e) { next(e); }
});

export default router;
