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

function allowShopCollections(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const direct = [`shopCollections:${action}`, 'shopCollections:*', `distribution:${action}`, 'distribution:*'];
    const fallbackRead = ['payment:read', 'ledger:read', 'customer:read', 'invoice:read'];
    const fallbackWrite = ['payment:create', 'payment:update', 'customer:update', 'invoice:update'];
    const allowed = can(role, '*')
      || direct.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));
    if (!allowed) return res.status(403).json({ message: `Permission denied: shopCollections:${action}` });
    next();
  };
}

const collectionSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: z.enum(PAYMENT_METHODS).optional().default('CASH'),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  collectedAt: z.coerce.date().optional(),
  autoAllocate: z.coerce.boolean().optional().default(true)
});

const followUpSchema = z.object({
  shopId: z.string().uuid(),
  routeId: z.string().uuid().optional().nullable(),
  employeeId: z.string().uuid().optional().nullable(),
  plannedAt: z.coerce.date(),
  collectionPromise: z.coerce.number().nonnegative().optional().default(0),
  noOrderReason: z.string().trim().max(220).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

function toMoney(value) { return money(Number(value || 0)); }

function dateRange(query) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  if (query.to && String(query.to).length <= 10) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function todayRange() {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

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

async function enrichCollections(rows, tenantId) {
  const [shopMap, routeMap, employeeMap] = await Promise.all([
    mapById('shopProfile', tenantId, rows.map((r) => r.shopId), { id: true, shopCode: true, shopName: true, ownerName: true, area: true, currentOutstanding: true, creditLimit: true }),
    mapById('distributionRoute', tenantId, rows.map((r) => r.routeId), { id: true, routeNo: true, name: true, area: true }),
    mapById('employee', tenantId, rows.map((r) => r.employeeId), { id: true, employeeNo: true, name: true, phone: true })
  ]);

  return rows.map((row) => {
    const shop = shopMap.get(row.shopId);
    const route = routeMap.get(row.routeId);
    const employee = employeeMap.get(row.employeeId);
    return {
      ...row,
      amount: toMoney(row.amount),
      shopName: shop?.shopName || null,
      shopCode: shop?.shopCode || null,
      shopArea: shop?.area || null,
      shopOutstanding: toMoney(shop?.currentOutstanding),
      shopCreditLimit: toMoney(shop?.creditLimit),
      routeName: route?.name || null,
      routeNo: route?.routeNo || null,
      employeeName: employee?.name || null,
      employeeNo: employee?.employeeNo || null
    };
  });
}

async function enrichOutstanding(shops, tenantId) {
  const [routeMap, employeeMap] = await Promise.all([
    mapById('distributionRoute', tenantId, shops.map((s) => s.routeId), { id: true, routeNo: true, name: true, area: true }),
    mapById('employee', tenantId, shops.map((s) => s.assignedEmployeeId), { id: true, employeeNo: true, name: true, phone: true })
  ]);

  const invoiceRows = await prisma.shopSupplyInvoice.findMany({
    where: { tenantId, shopId: { in: shops.map((s) => s.id) }, status: 'POSTED', balance: { gt: 0 } },
    orderBy: [{ dueDate: 'asc' }, { supplyDate: 'asc' }],
    select: { id: true, shopId: true, supplyNo: true, total: true, paid: true, balance: true, supplyDate: true, dueDate: true }
  }).catch(() => []);

  const now = new Date();
  const invoiceMap = new Map();
  for (const row of invoiceRows) {
    const list = invoiceMap.get(row.shopId) || [];
    list.push({
      ...row,
      total: toMoney(row.total),
      paid: toMoney(row.paid),
      balance: toMoney(row.balance),
      isOverdue: row.dueDate ? new Date(row.dueDate) < now : false
    });
    invoiceMap.set(row.shopId, list);
  }

  return shops.map((shop) => {
    const route = routeMap.get(shop.routeId);
    const employee = employeeMap.get(shop.assignedEmployeeId);
    const invoices = invoiceMap.get(shop.id) || [];
    const overdueBalance = invoices.filter((i) => i.isOverdue).reduce((sum, i) => sum + Number(i.balance || 0), 0);
    const oldestDue = invoices.find((i) => i.isOverdue)?.dueDate || invoices[0]?.dueDate || null;
    const outstanding = toMoney(shop.currentOutstanding);
    const creditLimit = toMoney(shop.creditLimit);
    return {
      ...shop,
      currentOutstanding: outstanding,
      creditLimit,
      creditUsedPercent: creditLimit > 0 ? Math.round((outstanding / creditLimit) * 100) : 0,
      overCreditLimit: creditLimit > 0 && outstanding > creditLimit,
      overdueBalance: toMoney(overdueBalance),
      oldestDue,
      openInvoiceCount: invoices.length,
      routeName: route?.name || null,
      routeNo: route?.routeNo || null,
      employeeName: employee?.name || null,
      employeeNo: employee?.employeeNo || null,
      invoices: invoices.slice(0, 5)
    };
  });
}

async function allocateCollectionToInvoices(tx, { tenantId, shopId, amount }) {
  let remaining = toMoney(amount);
  const allocations = [];
  const invoices = await tx.shopSupplyInvoice.findMany({
    where: { tenantId, shopId, status: 'POSTED', balance: { gt: 0 } },
    orderBy: [{ dueDate: 'asc' }, { supplyDate: 'asc' }],
    select: { id: true, supplyNo: true, balance: true }
  });

  for (const invoice of invoices) {
    if (remaining <= 0) break;
    const invoiceBalance = Number(invoice.balance || 0);
    const applied = toMoney(Math.min(remaining, invoiceBalance));
    if (applied <= 0) continue;
    await tx.shopSupplyInvoice.update({
      where: { id: invoice.id },
      data: { paid: { increment: applied }, balance: { decrement: applied } }
    });
    allocations.push({ invoiceId: invoice.id, supplyNo: invoice.supplyNo, amount: applied });
    remaining = toMoney(remaining - applied);
  }

  return { allocations, unapplied: remaining };
}

router.get('/summary', allowShopCollections('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from: todayFrom, to: todayTo } = todayRange();
    const monthFrom = new Date(todayFrom.getFullYear(), todayFrom.getMonth(), 1);

    const [todayCollections, monthCollections, outstandingShops, overdueInvoices, promisedVisits, recentRows] = await Promise.all([
      prisma.shopCollection.findMany({ where: { tenantId, collectedAt: { gte: todayFrom, lt: todayTo } }, select: { amount: true, method: true } }),
      prisma.shopCollection.findMany({ where: { tenantId, collectedAt: { gte: monthFrom, lt: todayTo } }, select: { amount: true, method: true } }),
      prisma.shopProfile.findMany({ where: { tenantId, currentOutstanding: { gt: 0 } }, orderBy: { currentOutstanding: 'desc' }, take: 8 }),
      prisma.shopSupplyInvoice.findMany({ where: { tenantId, status: 'POSTED', balance: { gt: 0 }, dueDate: { lt: new Date() } }, select: { balance: true } }).catch(() => []),
      prisma.shopVisit.count({ where: { tenantId, status: 'PLANNED', collectionPromise: { gt: 0 }, plannedAt: { gte: todayFrom } } }).catch(() => 0),
      prisma.shopCollection.findMany({ where: { tenantId }, orderBy: { collectedAt: 'desc' }, take: 8 })
    ]);

    const todayTotal = todayCollections.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const monthTotal = monthCollections.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const outstandingTotal = outstandingShops.reduce((sum, row) => sum + Number(row.currentOutstanding || 0), 0);
    const overdueTotal = overdueInvoices.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const recentCollections = await enrichCollections(recentRows, tenantId);
    const topOutstanding = await enrichOutstanding(outstandingShops, tenantId);

    res.json({
      todayCollectionTotal: toMoney(todayTotal),
      monthCollectionTotal: toMoney(monthTotal),
      outstandingWatchTotal: toMoney(outstandingTotal),
      overdueTotal: toMoney(overdueTotal),
      overdueCount: overdueInvoices.length,
      promisedVisitCount: promisedVisits,
      methodBreakdown: PAYMENT_METHODS.map((method) => ({ method, total: toMoney(todayCollections.filter((r) => r.method === method).reduce((sum, row) => sum + Number(row.amount || 0), 0)) })),
      topOutstanding,
      recentCollections
    });
  } catch (e) { next(e); }
});

router.get('/master-data', allowShopCollections('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [shops, routes, employees] = await Promise.all([
      prisma.shopProfile.findMany({ where: { tenantId, isActive: true }, orderBy: [{ shopName: 'asc' }], take: 500 }),
      prisma.distributionRoute.findMany({ where: { tenantId, isActive: true }, orderBy: [{ name: 'asc' }], take: 300 }),
      prisma.employee.findMany({ where: { tenantId, status: { not: 'INACTIVE' } }, orderBy: [{ name: 'asc' }], take: 300 }).catch(() => [])
    ]);
    const enrichedShops = await enrichOutstanding(shops, tenantId);
    res.json({ shops: enrichedShops, routes, employees, paymentMethods: PAYMENT_METHODS });
  } catch (e) { next(e); }
});

router.get('/outstanding', allowShopCollections('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId, currentOutstanding: { gt: 0 } };
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    if (req.query.employeeId) where.assignedEmployeeId = String(req.query.employeeId);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { shopName: { contains: q, mode: 'insensitive' } },
      { shopCode: { contains: q, mode: 'insensitive' } },
      { ownerName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { area: { contains: q, mode: 'insensitive' } }
    ];
    const shops = await prisma.shopProfile.findMany({ where, orderBy: { currentOutstanding: 'desc' }, take: 300 });
    const rows = await enrichOutstanding(shops, tenantId);
    const filtered = req.query.overdueOnly === 'true' ? rows.filter((row) => row.overdueBalance > 0) : rows;
    res.json(filtered);
  } catch (e) { next(e); }
});

router.get('/collections', allowShopCollections('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = dateRange(req.query);
    const where = { tenantId, collectedAt: { gte: from, lte: to } };
    if (req.query.shopId) where.shopId = String(req.query.shopId);
    if (req.query.routeId) where.routeId = String(req.query.routeId);
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    const rows = await prisma.shopCollection.findMany({ where, orderBy: { collectedAt: 'desc' }, take: 300 });
    res.json(await enrichCollections(rows, tenantId));
  } catch (e) { next(e); }
});

router.post('/collections', allowShopCollections('write'), async (req, res, next) => {
  try {
    const data = collectionSchema.parse(req.body);
    const tenantId = req.user.tenantId;

    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
      const amount = toMoney(data.amount);
      const currentOutstanding = toMoney(shop.currentOutstanding);
      const newOutstanding = toMoney(Math.max(0, currentOutstanding - amount));
      const appliedToOutstanding = toMoney(currentOutstanding - newOutstanding);
      const collectionNo = await nextNo(tx, 'shopCollection', tenantId, 'collectionNo', 'COL');

      const row = await tx.shopCollection.create({
        data: {
          tenantId,
          collectionNo,
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

      await tx.shopProfile.update({ where: { id: shop.id }, data: { currentOutstanding: newOutstanding } });
      if (shop.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: shop.customerId, tenantId } });
        if (customer) {
          const customerBalance = toMoney(customer.balance);
          await tx.customer.update({ where: { id: customer.id }, data: { balance: toMoney(Math.max(0, customerBalance - amount)) } });
        }
      }

      const allocation = data.autoAllocate
        ? await allocateCollectionToInvoices(tx, { tenantId, shopId: shop.id, amount: appliedToOutstanding })
        : { allocations: [], unapplied: amount };

      return { row, shopName: shop.shopName, oldOutstanding: currentOutstanding, newOutstanding, allocation };
    });

    await audit(req, 'CREATE', 'ShopCollection', result.row.id, null, result.row).catch(() => null);
    res.status(201).json({ message: 'Shop collection recorded', ...result });
  } catch (e) { next(e); }
});

router.post('/follow-ups', allowShopCollections('write'), async (req, res, next) => {
  try {
    const data = followUpSchema.parse(req.body);
    const tenantId = req.user.tenantId;
    const result = await prisma.$transaction(async (tx) => {
      const shop = await tx.shopProfile.findFirst({ where: { id: data.shopId, tenantId } });
      if (!shop) throw Object.assign(new Error('Shop not found'), { status: 404 });
      const visitNo = await nextNo(tx, 'shopVisit', tenantId, 'visitNo', 'VIS');
      return tx.shopVisit.create({
        data: {
          tenantId,
          visitNo,
          shopId: shop.id,
          routeId: data.routeId || shop.routeId || null,
          employeeId: data.employeeId || shop.assignedEmployeeId || null,
          plannedAt: data.plannedAt,
          status: 'PLANNED',
          orderTaken: false,
          collectionPromise: toMoney(data.collectionPromise),
          nextFollowUpAt: data.plannedAt,
          noOrderReason: data.noOrderReason || null,
          notes: data.notes || null,
          createdById: req.user.id
        }
      });
    });
    await audit(req, 'CREATE', 'ShopVisit', result.id, null, result).catch(() => null);
    res.status(201).json({ message: 'Collection follow-up planned', visit: result });
  } catch (e) { next(e); }
});

router.get('/daily-closing', allowShopCollections('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const from = new Date(date); from.setHours(0, 0, 0, 0);
    const to = new Date(from); to.setDate(to.getDate() + 1);
    const where = { tenantId, collectedAt: { gte: from, lt: to } };
    const invoiceWhere = { tenantId, status: 'POSTED', supplyDate: { gte: from, lt: to } };
    const visitWhere = { tenantId, plannedAt: { gte: from, lt: to } };
    if (req.query.routeId) { where.routeId = String(req.query.routeId); invoiceWhere.routeId = String(req.query.routeId); visitWhere.routeId = String(req.query.routeId); }
    if (req.query.employeeId) { where.employeeId = String(req.query.employeeId); invoiceWhere.employeeId = String(req.query.employeeId); visitWhere.employeeId = String(req.query.employeeId); }

    const [collections, invoices, visits] = await Promise.all([
      prisma.shopCollection.findMany({ where, orderBy: { collectedAt: 'desc' } }),
      prisma.shopSupplyInvoice.findMany({ where: invoiceWhere, select: { total: true, paid: true, balance: true } }).catch(() => []),
      prisma.shopVisit.findMany({ where: visitWhere, select: { status: true, collectionPromise: true, orderTaken: true } }).catch(() => [])
    ]);

    const collectionTotal = collections.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const salesTotal = invoices.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const creditAdded = invoices.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const methodBreakdown = PAYMENT_METHODS.map((method) => ({
      method,
      total: toMoney(collections.filter((row) => row.method === method).reduce((sum, row) => sum + Number(row.amount || 0), 0)),
      count: collections.filter((row) => row.method === method).length
    }));

    res.json({
      date: from,
      collectionTotal: toMoney(collectionTotal),
      supplySalesTotal: toMoney(salesTotal),
      creditAdded: toMoney(creditAdded),
      netCashPosition: toMoney(collectionTotal - creditAdded),
      collectionCount: collections.length,
      invoiceCount: invoices.length,
      visitCount: visits.length,
      completedVisitCount: visits.filter((v) => v.status === 'COMPLETED').length,
      promisedCollectionTotal: toMoney(visits.reduce((sum, row) => sum + Number(row.collectionPromise || 0), 0)),
      methodBreakdown,
      collections: await enrichCollections(collections.slice(0, 20), tenantId)
    });
  } catch (e) { next(e); }
});

export default router;
