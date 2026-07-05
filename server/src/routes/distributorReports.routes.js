import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function allowDistributorReports(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  const role = req.user.role;
  const allowed = can(role, '*')
    || can(role, 'distributorReports:read')
    || can(role, 'distribution:read')
    || can(role, 'shopSupply:read')
    || can(role, 'shopCollections:read')
    || can(role, 'shopReturns:read')
    || can(role, 'vanStock:read')
    || can(role, 'reports:read');

  if (!allowed) return res.status(403).json({ message: 'Permission denied: distributorReports:read' });
  next();
}

router.use(allowDistributorReports);

const REPORT_STATUSES = ['POSTED', 'COMPLETED', 'CLOSED', 'DELIVERED', 'PAID', 'PARTIAL'];

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

function sumQty(items, selector) {
  return asQty(items.reduce((total, item) => total + asNumber(selector(item)), 0));
}

function parseDateRange(query) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  if (query.to && String(query.to).length <= 10) to.setHours(23, 59, 59, 999);
  return { from, to };
}

async function safeFindMany(model, args = {}) {
  if (!prisma[model]) return [];
  return prisma[model].findMany(args);
}

async function safeCount(model, args = {}) {
  if (!prisma[model]) return 0;
  return prisma[model].count(args);
}

async function loadLookupMaps(tenantId) {
  const [shops, routes, employees, vans, products] = await Promise.all([
    safeFindMany('shopProfile', { where: { tenantId }, select: { id: true, shopCode: true, shopName: true, ownerName: true, area: true, routeId: true, assignedEmployeeId: true, creditLimit: true, currentOutstanding: true, isBlocked: true } }),
    safeFindMany('distributionRoute', { where: { tenantId }, select: { id: true, routeNo: true, name: true, area: true, targetDailySales: true, assignedEmployeeId: true } }),
    safeFindMany('employee', { where: { tenantId }, select: { id: true, name: true, phone: true } }).catch(() => []),
    safeFindMany('distributionVan', { where: { tenantId }, select: { id: true, vanNo: true, name: true, vehicleNo: true, routeId: true, driverEmployeeId: true } }),
    safeFindMany('product', { where: { tenantId }, select: { id: true, sku: true, name: true, costPrice: true, salePrice: true, stockQty: true } })
  ]);

  const shopMap = new Map(shops.map((shop) => [shop.id, shop]));
  const routeMap = new Map(routes.map((route) => [route.id, route]));
  const employeeMap = new Map(employees.map((employee) => [employee.id, employee]));
  const vanMap = new Map(vans.map((van) => [van.id, van]));
  const productMap = new Map(products.map((product) => [product.id, product]));
  return { shops, routes, employees, vans, products, shopMap, routeMap, employeeMap, vanMap, productMap };
}

function employeeName(employee) {
  if (!employee) return 'Unassigned';
  return employee.name || 'Employee';
}

function routeName(route) {
  if (!route) return 'No route';
  return `${route.routeNo || ''}${route.routeNo ? ' - ' : ''}${route.name || 'Route'}`;
}

function shopName(shop) {
  if (!shop) return 'Unknown shop';
  return `${shop.shopCode || ''}${shop.shopCode ? ' - ' : ''}${shop.shopName || 'Shop'}`;
}

function productName(product, fallback = 'Unknown product') {
  if (!product) return fallback;
  return `${product.sku || ''}${product.sku ? ' - ' : ''}${product.name || fallback}`;
}

function groupById(items, idSelector, seedIds = []) {
  const map = new Map(seedIds.map((id) => [id, []]));
  for (const item of items) {
    const id = idSelector(item) || 'unassigned';
    if (!map.has(id)) map.set(id, []);
    map.get(id).push(item);
  }
  return map;
}

async function loadBaseData(tenantId, from, to) {
  const [supplies, collections, returns, visits, closings, vanMovements, redemptions] = await Promise.all([
    safeFindMany('shopSupplyInvoice', {
      where: { tenantId, supplyDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      include: { items: true },
      orderBy: { supplyDate: 'desc' }
    }),
    safeFindMany('shopCollection', {
      where: { tenantId, collectedAt: { gte: from, lte: to } },
      orderBy: { collectedAt: 'desc' }
    }),
    safeFindMany('shopReturn', {
      where: { tenantId, returnDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      include: { items: true },
      orderBy: { returnDate: 'desc' }
    }),
    safeFindMany('shopVisit', {
      where: { tenantId, plannedAt: { gte: from, lte: to } },
      orderBy: { plannedAt: 'desc' }
    }),
    safeFindMany('vanDailyClosing', {
      where: { tenantId, closingDate: { gte: from, lte: to } },
      orderBy: { closingDate: 'desc' }
    }),
    safeFindMany('vanStockMovement', {
      where: { tenantId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' }
    }),
    safeFindMany('tradeOfferRedemption', {
      where: { tenantId, redeemedAt: { gte: from, lte: to } },
      orderBy: { redeemedAt: 'desc' }
    })
  ]);

  return { supplies, collections, returns, visits, closings, vanMovements, redemptions };
}

router.get('/summary', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const data = await loadBaseData(tenantId, from, to);

    const postedSupplies = data.supplies.filter((supply) => supply.status !== 'DRAFT');
    const postedReturns = data.returns.filter((item) => item.status !== 'DRAFT');
    const totalSales = sum(postedSupplies, (supply) => supply.total);
    const totalReturns = sum(postedReturns, (ret) => ret.creditAmount || ret.total);
    const netSales = asMoney(totalSales - totalReturns);
    const totalCollections = sum(data.collections, (collection) => collection.amount);
    const totalOutstanding = sum(lookups.shops, (shop) => shop.currentOutstanding);
    const overdueInvoices = data.supplies.filter((supply) => asNumber(supply.balance) > 0 && supply.dueDate && new Date(supply.dueDate) < new Date());
    const overdueOutstanding = sum(overdueInvoices, (supply) => supply.balance);
    const activeRouteCount = lookups.routes.length;
    const activeShopCount = lookups.shops.filter((shop) => !shop.isBlocked).length;
    const blockedShopCount = lookups.shops.filter((shop) => shop.isBlocked).length;
    const collectionRate = netSales > 0 ? Math.min(100, Math.round((totalCollections / netSales) * 100)) : 0;

    const routeGroups = groupById(postedSupplies, (supply) => supply.routeId, lookups.routes.map((route) => route.id));
    const topRoutes = [...routeGroups.entries()].map(([routeId, supplies]) => {
      const route = lookups.routeMap.get(routeId);
      return {
        routeId,
        routeName: routeName(route),
        sales: sum(supplies, (supply) => supply.total),
        invoices: supplies.length,
        target: asMoney(route?.targetDailySales || 0)
      };
    }).sort((a, b) => b.sales - a.sales).slice(0, 5);

    const topOutstanding = [...lookups.shops]
      .sort((a, b) => asNumber(b.currentOutstanding) - asNumber(a.currentOutstanding))
      .slice(0, 8)
      .map((shop) => ({
        shopId: shop.id,
        shopName: shopName(shop),
        area: shop.area,
        outstanding: asMoney(shop.currentOutstanding),
        creditLimit: asMoney(shop.creditLimit),
        blocked: shop.isBlocked
      }));

    res.json({
      from,
      to,
      cards: {
        totalSales,
        totalReturns,
        netSales,
        totalCollections,
        totalOutstanding,
        overdueOutstanding,
        collectionRate,
        activeRouteCount,
        activeShopCount,
        blockedShopCount,
        visits: data.visits.length,
        vanClosings: data.closings.length,
        offerRedemptions: data.redemptions.length
      },
      topRoutes,
      topOutstanding
    });
  } catch (e) { next(e); }
});

router.get('/route-sales', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const data = await loadBaseData(tenantId, from, to);

    const rows = lookups.routes.map((route) => {
      const supplies = data.supplies.filter((supply) => supply.routeId === route.id && supply.status !== 'DRAFT');
      const collections = data.collections.filter((collection) => collection.routeId === route.id);
      const returns = data.returns.filter((ret) => ret.routeId === route.id && ret.status !== 'DRAFT');
      const visits = data.visits.filter((visit) => visit.routeId === route.id);
      const shops = lookups.shops.filter((shop) => shop.routeId === route.id);
      const sales = sum(supplies, (supply) => supply.total);
      const target = asMoney(route.targetDailySales || 0);
      return {
        routeId: route.id,
        routeNo: route.routeNo,
        routeName: route.name,
        area: route.area,
        target,
        sales,
        collections: sum(collections, (collection) => collection.amount),
        returns: sum(returns, (ret) => ret.creditAmount || ret.total),
        outstanding: sum(shops, (shop) => shop.currentOutstanding),
        invoices: supplies.length,
        shops: shops.length,
        visits: visits.length,
        targetAchieved: target > 0 ? Math.round((sales / target) * 100) : 0
      };
    }).sort((a, b) => b.sales - a.sales);

    res.json({ from, to, rows });
  } catch (e) { next(e); }
});

router.get('/shop-outstanding', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const data = await loadBaseData(tenantId, from, to);

    const rows = lookups.shops.map((shop) => {
      const route = lookups.routeMap.get(shop.routeId);
      const employee = lookups.employeeMap.get(shop.assignedEmployeeId);
      const supplies = data.supplies.filter((supply) => supply.shopId === shop.id && supply.status !== 'DRAFT');
      const collections = data.collections.filter((collection) => collection.shopId === shop.id);
      const returns = data.returns.filter((ret) => ret.shopId === shop.id && ret.status !== 'DRAFT');
      const overdue = supplies.filter((supply) => asNumber(supply.balance) > 0 && supply.dueDate && new Date(supply.dueDate) < new Date());
      const outstanding = asMoney(shop.currentOutstanding);
      const creditLimit = asMoney(shop.creditLimit);
      return {
        shopId: shop.id,
        shopCode: shop.shopCode,
        shopName: shop.shopName,
        ownerName: shop.ownerName,
        phone: shop.phone,
        area: shop.area,
        routeName: routeName(route),
        salesRep: employeeName(employee),
        sales: sum(supplies, (supply) => supply.total),
        collections: sum(collections, (collection) => collection.amount),
        returns: sum(returns, (ret) => ret.creditAmount || ret.total),
        outstanding,
        creditLimit,
        availableCredit: asMoney(creditLimit - outstanding),
        overdueOutstanding: sum(overdue, (supply) => supply.balance),
        isBlocked: shop.isBlocked,
        risk: shop.isBlocked || (creditLimit > 0 && outstanding >= creditLimit) ? 'HIGH' : outstanding > creditLimit * 0.75 ? 'MEDIUM' : 'LOW'
      };
    }).sort((a, b) => b.outstanding - a.outstanding);

    res.json({ from, to, rows });
  } catch (e) { next(e); }
});

router.get('/collections', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const collections = await safeFindMany('shopCollection', {
      where: { tenantId, collectedAt: { gte: from, lte: to } },
      orderBy: { collectedAt: 'desc' }
    });

    const rows = collections.map((collection) => ({
      id: collection.id,
      collectionNo: collection.collectionNo,
      collectedAt: collection.collectedAt,
      shopName: shopName(lookups.shopMap.get(collection.shopId)),
      routeName: routeName(lookups.routeMap.get(collection.routeId)),
      salesRep: employeeName(lookups.employeeMap.get(collection.employeeId)),
      method: collection.method,
      amount: asMoney(collection.amount),
      reference: collection.reference,
      notes: collection.notes
    }));

    const methodSummary = Object.values(rows.reduce((acc, row) => {
      const key = row.method || 'UNKNOWN';
      acc[key] ||= { method: key, amount: 0, count: 0 };
      acc[key].amount = asMoney(acc[key].amount + row.amount);
      acc[key].count += 1;
      return acc;
    }, {})).sort((a, b) => b.amount - a.amount);

    res.json({ from, to, total: sum(rows, (row) => row.amount), methodSummary, rows });
  } catch (e) { next(e); }
});

router.get('/product-movement', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const data = await loadBaseData(tenantId, from, to);

    const productStats = new Map();
    function ensure(productId, fallback) {
      const key = productId || fallback || 'unknown';
      if (!productStats.has(key)) {
        const product = lookups.productMap.get(productId);
        productStats.set(key, {
          productId,
          productName: productName(product, fallback || 'Unknown product'),
          suppliedQty: 0,
          freeQty: 0,
          returnedQty: 0,
          netQty: 0,
          salesValue: 0,
          returnValue: 0,
          netValue: 0
        });
      }
      return productStats.get(key);
    }

    for (const supply of data.supplies.filter((item) => item.status !== 'DRAFT')) {
      for (const item of supply.items || []) {
        const stat = ensure(item.productId, item.description);
        stat.suppliedQty = asQty(stat.suppliedQty + asNumber(item.qty));
        stat.freeQty = asQty(stat.freeQty + asNumber(item.freeQty));
        stat.salesValue = asMoney(stat.salesValue + asNumber(item.total));
      }
    }

    for (const ret of data.returns.filter((item) => item.status !== 'DRAFT')) {
      for (const item of ret.items || []) {
        const stat = ensure(item.productId, item.description);
        stat.returnedQty = asQty(stat.returnedQty + asNumber(item.qty));
        stat.returnValue = asMoney(stat.returnValue + asNumber(item.total));
      }
    }

    const rows = [...productStats.values()].map((row) => ({
      ...row,
      netQty: asQty(row.suppliedQty - row.returnedQty),
      netValue: asMoney(row.salesValue - row.returnValue)
    })).sort((a, b) => b.netValue - a.netValue);

    res.json({ from, to, rows });
  } catch (e) { next(e); }
});

router.get('/van-closing', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const closings = await safeFindMany('vanDailyClosing', {
      where: { tenantId, closingDate: { gte: from, lte: to } },
      orderBy: { closingDate: 'desc' }
    });

    const rows = closings.map((closing) => ({
      id: closing.id,
      closingNo: closing.closingNo,
      closingDate: closing.closingDate,
      status: closing.status,
      vanName: lookups.vanMap.get(closing.vanId)?.name || 'Van',
      vehicleNo: lookups.vanMap.get(closing.vanId)?.vehicleNo,
      routeName: routeName(lookups.routeMap.get(closing.routeId)),
      salesRep: employeeName(lookups.employeeMap.get(closing.employeeId)),
      loadedValue: asMoney(closing.loadedValue),
      soldValue: asMoney(closing.soldValue),
      returnedValue: asMoney(closing.returnedValue),
      damagedValue: asMoney(closing.damagedValue),
      missingValue: asMoney(closing.missingValue),
      cashCollected: asMoney(closing.cashCollected),
      chequeCollected: asMoney(closing.chequeCollected),
      creditSales: asMoney(closing.creditSales),
      routeExpense: asMoney(closing.routeExpense),
      variance: asMoney(asNumber(closing.loadedValue) - asNumber(closing.soldValue) - asNumber(closing.returnedValue) - asNumber(closing.damagedValue) - asNumber(closing.missingValue))
    }));

    res.json({
      from,
      to,
      totals: {
        loadedValue: sum(rows, (row) => row.loadedValue),
        soldValue: sum(rows, (row) => row.soldValue),
        returnedValue: sum(rows, (row) => row.returnedValue),
        damagedValue: sum(rows, (row) => row.damagedValue),
        missingValue: sum(rows, (row) => row.missingValue),
        cashCollected: sum(rows, (row) => row.cashCollected),
        chequeCollected: sum(rows, (row) => row.chequeCollected),
        creditSales: sum(rows, (row) => row.creditSales),
        routeExpense: sum(rows, (row) => row.routeExpense)
      },
      rows
    });
  } catch (e) { next(e); }
});

router.get('/rep-performance', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const data = await loadBaseData(tenantId, from, to);

    const employeeIds = new Set([
      ...lookups.employees.map((employee) => employee.id),
      ...data.supplies.map((supply) => supply.employeeId).filter(Boolean),
      ...data.collections.map((collection) => collection.employeeId).filter(Boolean),
      ...data.visits.map((visit) => visit.employeeId).filter(Boolean)
    ]);

    const rows = [...employeeIds].map((employeeId) => {
      const employee = lookups.employeeMap.get(employeeId);
      const supplies = data.supplies.filter((supply) => supply.employeeId === employeeId && supply.status !== 'DRAFT');
      const collections = data.collections.filter((collection) => collection.employeeId === employeeId);
      const visits = data.visits.filter((visit) => visit.employeeId === employeeId);
      const returns = data.returns.filter((ret) => ret.employeeId === employeeId && ret.status !== 'DRAFT');
      const sales = sum(supplies, (supply) => supply.total);
      const collectionAmount = sum(collections, (collection) => collection.amount);
      return {
        employeeId,
        name: employeeName(employee),
        phone: employee?.phone,
        invoices: supplies.length,
        sales,
        collections: collectionAmount,
        returns: sum(returns, (ret) => ret.creditAmount || ret.total),
        visits: visits.length,
        productiveVisits: visits.filter((visit) => visit.orderTaken).length,
        collectionRate: sales > 0 ? Math.round((collectionAmount / sales) * 100) : 0
      };
    }).sort((a, b) => b.sales - a.sales || b.collections - a.collections);

    res.json({ from, to, rows });
  } catch (e) { next(e); }
});

router.get('/returns', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const returns = await safeFindMany('shopReturn', {
      where: { tenantId, returnDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } },
      include: { items: true },
      orderBy: { returnDate: 'desc' }
    });

    const rows = returns.map((ret) => ({
      id: ret.id,
      returnNo: ret.returnNo,
      returnDate: ret.returnDate,
      status: ret.status,
      returnType: ret.returnType,
      stockAction: ret.stockAction,
      shopName: shopName(lookups.shopMap.get(ret.shopId)),
      routeName: routeName(lookups.routeMap.get(ret.routeId)),
      salesRep: employeeName(lookups.employeeMap.get(ret.employeeId)),
      qty: sumQty(ret.items || [], (item) => item.qty),
      creditAmount: asMoney(ret.creditAmount || ret.total),
      reason: ret.reason
    }));

    const typeSummary = Object.values(rows.reduce((acc, row) => {
      const key = row.returnType || 'OTHER';
      acc[key] ||= { returnType: key, count: 0, creditAmount: 0, qty: 0 };
      acc[key].count += 1;
      acc[key].creditAmount = asMoney(acc[key].creditAmount + row.creditAmount);
      acc[key].qty = asQty(acc[key].qty + row.qty);
      return acc;
    }, {})).sort((a, b) => b.creditAmount - a.creditAmount);

    res.json({ from, to, totalCredit: sum(rows, (row) => row.creditAmount), typeSummary, rows });
  } catch (e) { next(e); }
});

router.get('/offer-usage', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseDateRange(req.query);
    const lookups = await loadLookupMaps(tenantId);
    const [offers, redemptions] = await Promise.all([
      safeFindMany('tradeOffer', { where: { tenantId }, orderBy: { priority: 'asc' } }),
      safeFindMany('tradeOfferRedemption', { where: { tenantId, redeemedAt: { gte: from, lte: to } }, orderBy: { redeemedAt: 'desc' } })
    ]);
    const offerMap = new Map(offers.map((offer) => [offer.id, offer]));

    const rows = redemptions.map((redemption) => {
      const offer = offerMap.get(redemption.tradeOfferId);
      return {
        id: redemption.id,
        redeemedAt: redemption.redeemedAt,
        offerNo: offer?.offerNo || 'Offer',
        offerName: offer?.name || 'Unknown offer',
        offerType: offer?.offerType,
        shopName: shopName(lookups.shopMap.get(redemption.shopId)),
        routeName: routeName(lookups.routeMap.get(redemption.routeId)),
        appliedQty: asQty(redemption.appliedQty),
        freeQty: asQty(redemption.freeQty),
        discountAmount: asMoney(redemption.discountAmount)
      };
    });

    const offerSummary = Object.values(rows.reduce((acc, row) => {
      const key = row.offerNo;
      acc[key] ||= { offerNo: row.offerNo, offerName: row.offerName, offerType: row.offerType, redemptions: 0, freeQty: 0, discountAmount: 0 };
      acc[key].redemptions += 1;
      acc[key].freeQty = asQty(acc[key].freeQty + row.freeQty);
      acc[key].discountAmount = asMoney(acc[key].discountAmount + row.discountAmount);
      return acc;
    }, {})).sort((a, b) => b.discountAmount - a.discountAmount || b.freeQty - a.freeQty);

    res.json({ from, to, totals: { redemptions: rows.length, freeQty: sumQty(rows, (row) => row.freeQty), discountAmount: sum(rows, (row) => row.discountAmount) }, offerSummary, rows });
  } catch (e) { next(e); }
});

export default router;
