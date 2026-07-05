import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function allowDistributorDashboard(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Authentication required' });
  const role = req.user.role;
  const allowed = can(role, '*')
    || can(role, 'distributorDashboard:read')
    || can(role, 'distributorReports:read')
    || can(role, 'distribution:read')
    || can(role, 'shopSupply:read')
    || can(role, 'shopCollections:read')
    || can(role, 'shopReturns:read')
    || can(role, 'vanStock:read')
    || can(role, 'reports:read');

  if (!allowed) return res.status(403).json({ message: 'Permission denied: distributorDashboard:read' });
  next();
}

router.use(allowDistributorDashboard);

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

function dayRange(query) {
  const date = query.date ? new Date(query.date) : new Date();
  const from = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const to = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
  const previousFrom = new Date(from);
  previousFrom.setDate(previousFrom.getDate() - 1);
  const previousTo = new Date(to);
  previousTo.setDate(previousTo.getDate() - 1);
  return { date, from, to, previousFrom, previousTo };
}

async function safeFindMany(model, args = {}) {
  if (!prisma[model]) return [];
  return prisma[model].findMany(args);
}

async function safeCount(model, args = {}) {
  if (!prisma[model]) return 0;
  return prisma[model].count(args);
}

function groupBy(items, keySelector) {
  const map = new Map();
  for (const item of items) {
    const key = keySelector(item) || 'unassigned';
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

function percent(part, total) {
  if (!asNumber(total)) return 0;
  return Math.round((asNumber(part) / asNumber(total)) * 100);
}

function trend(todayValue, yesterdayValue) {
  const today = asNumber(todayValue);
  const yesterday = asNumber(yesterdayValue);
  if (!yesterday && today) return 100;
  if (!yesterday) return 0;
  return Math.round(((today - yesterday) / Math.abs(yesterday)) * 100);
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

async function loadLookups(tenantId) {
  const [routes, shops, employees, vans, products] = await Promise.all([
    safeFindMany('distributionRoute', { where: { tenantId, isActive: true }, select: { id: true, routeNo: true, name: true, area: true, targetDailySales: true, assignedEmployeeId: true } }),
    safeFindMany('shopProfile', { where: { tenantId, isActive: true }, select: { id: true, shopCode: true, shopName: true, area: true, routeId: true, assignedEmployeeId: true, creditLimit: true, currentOutstanding: true, isBlocked: true } }),
    safeFindMany('employee', { where: { tenantId }, select: { id: true, name: true, phone: true } }).catch(() => []),
    safeFindMany('distributionVan', { where: { tenantId, isActive: true }, select: { id: true, vanNo: true, name: true, vehicleNo: true, routeId: true, driverEmployeeId: true } }),
    safeFindMany('product', { where: { tenantId, isActive: true }, select: { id: true, sku: true, name: true, stockQty: true, reorderLevel: true, costPrice: true, salePrice: true } })
  ]);

  return {
    routes,
    shops,
    employees,
    vans,
    products,
    routeMap: new Map(routes.map((route) => [route.id, route])),
    shopMap: new Map(shops.map((shop) => [shop.id, shop])),
    employeeMap: new Map(employees.map((employee) => [employee.id, employee])),
    vanMap: new Map(vans.map((van) => [van.id, van])),
    productMap: new Map(products.map((product) => [product.id, product]))
  };
}

async function loadDayData(tenantId, from, to) {
  const [supplies, collections, returns, visits, closings, vanLoads, vanStocks, vanMovements, redemptions] = await Promise.all([
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
      orderBy: { plannedAt: 'asc' }
    }),
    safeFindMany('vanDailyClosing', {
      where: { tenantId, closingDate: { gte: from, lte: to } },
      orderBy: { closingDate: 'desc' }
    }),
    safeFindMany('vanLoad', {
      where: { tenantId, loadDate: { gte: from, lte: to } },
      include: { items: true },
      orderBy: { loadDate: 'desc' }
    }),
    safeFindMany('vanStock', { where: { tenantId } }),
    safeFindMany('vanStockMovement', {
      where: { tenantId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: 'desc' }
    }),
    safeFindMany('tradeOfferRedemption', {
      where: { tenantId, redeemedAt: { gte: from, lte: to } },
      orderBy: { redeemedAt: 'desc' }
    })
  ]);
  return { supplies, collections, returns, visits, closings, vanLoads, vanStocks, vanMovements, redemptions };
}

function buildCards(data, previousData, lookups) {
  const postedSupplies = data.supplies.filter((item) => item.status !== 'DRAFT');
  const previousPostedSupplies = previousData.supplies.filter((item) => item.status !== 'DRAFT');
  const postedReturns = data.returns.filter((item) => item.status !== 'DRAFT');
  const todaySales = sum(postedSupplies, (item) => item.total);
  const yesterdaySales = sum(previousPostedSupplies, (item) => item.total);
  const todayCollections = sum(data.collections, (item) => item.amount);
  const yesterdayCollections = sum(previousData.collections, (item) => item.amount);
  const todayReturns = sum(postedReturns, (item) => item.creditAmount || item.total);
  const todayNetSales = asMoney(todaySales - todayReturns);
  const outstanding = sum(lookups.shops, (shop) => shop.currentOutstanding);
  const targetSales = sum(lookups.routes, (route) => route.targetDailySales);
  const routeExpenses = sum(data.closings, (closing) => closing.routeExpense);
  const pendingVisits = data.visits.filter((visit) => ['PLANNED', 'PENDING'].includes(String(visit.status).toUpperCase())).length;
  const completedVisits = data.visits.filter((visit) => ['VISITED', 'COMPLETED', 'DONE'].includes(String(visit.status).toUpperCase())).length;
  const overdueShops = lookups.shops.filter((shop) => asNumber(shop.currentOutstanding) > asNumber(shop.creditLimit) && asNumber(shop.creditLimit) > 0).length;
  const closedVans = data.closings.filter((closing) => String(closing.status).toUpperCase() === 'CLOSED').length;

  return {
    todaySales,
    todayNetSales,
    todayCollections,
    todayReturns,
    outstanding,
    targetSales,
    targetAchievement: percent(todaySales, targetSales),
    collectionRate: percent(todayCollections, todaySales),
    routeExpenses,
    pendingVisits,
    completedVisits,
    totalVisits: data.visits.length,
    overdueShops,
    blockedShops: lookups.shops.filter((shop) => shop.isBlocked).length,
    activeRoutes: lookups.routes.length,
    activeShops: lookups.shops.length,
    activeVans: lookups.vans.length,
    closedVans,
    salesTrend: trend(todaySales, yesterdaySales),
    collectionTrend: trend(todayCollections, yesterdayCollections)
  };
}

function buildRouteBoard(data, lookups) {
  const postedSupplies = data.supplies.filter((item) => item.status !== 'DRAFT');
  const suppliesByRoute = groupBy(postedSupplies, (item) => item.routeId);
  const collectionsByRoute = groupBy(data.collections, (item) => item.routeId);
  const returnsByRoute = groupBy(data.returns.filter((item) => item.status !== 'DRAFT'), (item) => item.routeId);
  const visitsByRoute = groupBy(data.visits, (item) => item.routeId);
  const closingsByRoute = groupBy(data.closings, (item) => item.routeId);

  return lookups.routes.map((route) => {
    const routeSupplies = suppliesByRoute.get(route.id) || [];
    const routeCollections = collectionsByRoute.get(route.id) || [];
    const routeReturns = returnsByRoute.get(route.id) || [];
    const routeVisits = visitsByRoute.get(route.id) || [];
    const routeClosings = closingsByRoute.get(route.id) || [];
    const sales = sum(routeSupplies, (item) => item.total);
    const collections = sum(routeCollections, (item) => item.amount);
    const returns = sum(routeReturns, (item) => item.creditAmount || item.total);
    const shopCount = lookups.shops.filter((shop) => shop.routeId === route.id).length;
    const employee = lookups.employeeMap.get(route.assignedEmployeeId);

    return {
      routeId: route.id,
      routeName: routeLabel(route),
      area: route.area || '-',
      sales,
      collections,
      returns,
      netSales: asMoney(sales - returns),
      target: asMoney(route.targetDailySales),
      achievement: percent(sales, route.targetDailySales),
      invoices: routeSupplies.length,
      shops: shopCount,
      visits: routeVisits.length,
      completedVisits: routeVisits.filter((visit) => String(visit.status).toUpperCase() !== 'PLANNED').length,
      closings: routeClosings.length,
      salesRep: employeeLabel(employee)
    };
  }).sort((a, b) => b.sales - a.sales);
}

function buildRepBoard(data, lookups) {
  const employeeIds = new Set([
    ...lookups.routes.map((route) => route.assignedEmployeeId).filter(Boolean),
    ...lookups.shops.map((shop) => shop.assignedEmployeeId).filter(Boolean),
    ...data.supplies.map((item) => item.employeeId).filter(Boolean),
    ...data.collections.map((item) => item.employeeId).filter(Boolean),
    ...data.visits.map((item) => item.employeeId).filter(Boolean)
  ]);

  return [...employeeIds].map((employeeId) => {
    const employee = lookups.employeeMap.get(employeeId);
    const supplies = data.supplies.filter((item) => item.employeeId === employeeId && item.status !== 'DRAFT');
    const collections = data.collections.filter((item) => item.employeeId === employeeId);
    const visits = data.visits.filter((item) => item.employeeId === employeeId);
    const returns = data.returns.filter((item) => item.employeeId === employeeId && item.status !== 'DRAFT');
    const sales = sum(supplies, (item) => item.total);
    const collectionAmount = sum(collections, (item) => item.amount);
    const returnAmount = sum(returns, (item) => item.creditAmount || item.total);
    return {
      employeeId,
      name: employeeLabel(employee),
      phone: employee?.phone || '-',
      sales,
      collections: collectionAmount,
      returns: returnAmount,
      netSales: asMoney(sales - returnAmount),
      invoices: supplies.length,
      visits: visits.length,
      completedVisits: visits.filter((visit) => String(visit.status).toUpperCase() !== 'PLANNED').length,
      collectionRate: percent(collectionAmount, sales)
    };
  }).sort((a, b) => b.netSales - a.netSales).slice(0, 10);
}

function buildVanBoard(data, lookups) {
  const closingByVan = groupBy(data.closings, (item) => item.vanId);
  const stockByVan = groupBy(data.vanStocks, (item) => item.vanId);
  const loadsByVan = groupBy(data.vanLoads, (item) => item.vanId);
  return lookups.vans.map((van) => {
    const closings = closingByVan.get(van.id) || [];
    const stocks = stockByVan.get(van.id) || [];
    const loads = loadsByVan.get(van.id) || [];
    const stockQty = sumQty(stocks, (item) => item.quantity);
    const stockValue = stocks.reduce((total, stock) => {
      const product = lookups.productMap.get(stock.productId);
      return total + (asNumber(stock.quantity) * asNumber(product?.costPrice));
    }, 0);
    const cash = sum(closings, (item) => item.cashCollected);
    const cheque = sum(closings, (item) => item.chequeCollected);
    const credit = sum(closings, (item) => item.creditSales);
    const damaged = sum(closings, (item) => item.damagedValue);
    const missing = sum(closings, (item) => item.missingValue);
    return {
      vanId: van.id,
      vanName: vanLabel(van),
      vehicleNo: van.vehicleNo || '-',
      routeName: routeLabel(lookups.routeMap.get(van.routeId)),
      loads: loads.length,
      closings: closings.length,
      stockQty,
      stockValue: asMoney(stockValue),
      cash,
      cheque,
      credit,
      damaged,
      missing,
      closingStatus: closings.some((closing) => String(closing.status).toUpperCase() === 'CLOSED') ? 'Closed today' : 'Not closed'
    };
  }).sort((a, b) => b.stockValue - a.stockValue);
}

function buildActionList(data, lookups, cards) {
  const actions = [];
  const overdueShops = lookups.shops
    .filter((shop) => asNumber(shop.currentOutstanding) > asNumber(shop.creditLimit) && asNumber(shop.creditLimit) > 0)
    .sort((a, b) => asNumber(b.currentOutstanding) - asNumber(a.currentOutstanding))
    .slice(0, 5);

  for (const shop of overdueShops) {
    actions.push({
      type: 'credit-risk',
      priority: 'Critical',
      title: `${shopLabel(shop)} exceeded credit limit`,
      detail: `Outstanding ${asMoney(shop.currentOutstanding)} vs limit ${asMoney(shop.creditLimit)}. Stop further credit or collect payment.`,
      routeName: routeLabel(lookups.routeMap.get(shop.routeId)),
      amount: asMoney(shop.currentOutstanding)
    });
  }

  const openVisits = data.visits
    .filter((visit) => ['PLANNED', 'PENDING'].includes(String(visit.status).toUpperCase()))
    .slice(0, 5);
  for (const visit of openVisits) {
    actions.push({
      type: 'visit',
      priority: 'High',
      title: `Pending visit: ${shopLabel(lookups.shopMap.get(visit.shopId))}`,
      detail: visit.noOrderReason || visit.notes || 'Sales rep has not completed this shop visit yet.',
      routeName: routeLabel(lookups.routeMap.get(visit.routeId)),
      amount: asMoney(visit.collectionPromise)
    });
  }

  const unclosedVans = lookups.vans.filter((van) => !data.closings.some((closing) => closing.vanId === van.id && String(closing.status).toUpperCase() === 'CLOSED')).slice(0, 5);
  for (const van of unclosedVans) {
    actions.push({
      type: 'van-closing',
      priority: 'Medium',
      title: `${vanLabel(van)} daily closing pending`,
      detail: 'Close route cash, cheque, credit sales, returns, damaged and missing stock before end of day.',
      routeName: routeLabel(lookups.routeMap.get(van.routeId)),
      amount: 0
    });
  }

  if (cards.targetSales > 0 && cards.targetAchievement < 60) {
    actions.unshift({
      type: 'target',
      priority: 'High',
      title: 'Daily route sales target is behind',
      detail: `Only ${cards.targetAchievement}% of today's target is achieved. Push high-performing routes and follow up planned visits.`,
      routeName: 'All routes',
      amount: cards.todaySales
    });
  }

  return actions.slice(0, 12);
}

function buildTimeline(data, lookups) {
  const events = [];
  for (const supply of data.supplies.slice(0, 10)) {
    events.push({
      id: `supply-${supply.id}`,
      time: supply.supplyDate,
      type: 'Supply',
      title: `${supply.supplyNo || 'Supply'} • ${shopLabel(lookups.shopMap.get(supply.shopId))}`,
      amount: asMoney(supply.total),
      status: supply.status
    });
  }
  for (const collection of data.collections.slice(0, 10)) {
    events.push({
      id: `collection-${collection.id}`,
      time: collection.collectedAt,
      type: 'Collection',
      title: `${collection.collectionNo || 'Collection'} • ${shopLabel(lookups.shopMap.get(collection.shopId))}`,
      amount: asMoney(collection.amount),
      status: collection.method
    });
  }
  for (const ret of data.returns.slice(0, 10)) {
    events.push({
      id: `return-${ret.id}`,
      time: ret.returnDate,
      type: 'Return',
      title: `${ret.returnNo || 'Return'} • ${shopLabel(lookups.shopMap.get(ret.shopId))}`,
      amount: asMoney(ret.creditAmount || ret.total),
      status: ret.returnType
    });
  }
  return events.sort((a, b) => new Date(b.time) - new Date(a.time)).slice(0, 15);
}

router.get('/summary', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { date, from, to, previousFrom, previousTo } = dayRange(req.query);
    const lookups = await loadLookups(tenantId);
    const [data, previousData] = await Promise.all([
      loadDayData(tenantId, from, to),
      loadDayData(tenantId, previousFrom, previousTo)
    ]);

    const cards = buildCards(data, previousData, lookups);
    const routes = buildRouteBoard(data, lookups);
    const reps = buildRepBoard(data, lookups);
    const vans = buildVanBoard(data, lookups);
    const actions = buildActionList(data, lookups, cards);
    const timeline = buildTimeline(data, lookups);

    const productRows = data.supplies.flatMap((supply) => (supply.items || []).map((item) => ({ ...item, routeId: supply.routeId, shopId: supply.shopId })));
    const productGroups = groupBy(productRows, (item) => item.productId);
    const topProducts = [...productGroups.entries()].map(([productId, rows]) => {
      const product = lookups.productMap.get(productId);
      return {
        productId,
        productName: product ? `${product.sku || ''}${product.sku ? ' - ' : ''}${product.name}` : 'Unknown product',
        qty: sumQty(rows, (row) => row.qty),
        freeQty: sumQty(rows, (row) => row.freeQty),
        value: sum(rows, (row) => row.total)
      };
    }).sort((a, b) => b.value - a.value).slice(0, 8);

    const stockWarnings = lookups.products
      .filter((product) => asNumber(product.stockQty) <= asNumber(product.reorderLevel))
      .sort((a, b) => asNumber(a.stockQty) - asNumber(b.stockQty))
      .slice(0, 8)
      .map((product) => ({
        productId: product.id,
        productName: `${product.sku || ''}${product.sku ? ' - ' : ''}${product.name}`,
        stockQty: asQty(product.stockQty),
        reorderLevel: asQty(product.reorderLevel),
        estimatedValue: asMoney(asNumber(product.stockQty) * asNumber(product.costPrice))
      }));

    const methodBreakdown = ['CASH', 'BANK', 'CARD', 'CHEQUE', 'CREDIT'].map((method) => ({
      method,
      amount: sum(data.collections.filter((collection) => String(collection.method).toUpperCase() === method), (collection) => collection.amount),
      count: data.collections.filter((collection) => String(collection.method).toUpperCase() === method).length
    })).filter((item) => item.amount > 0 || item.count > 0);

    res.json({
      date,
      from,
      to,
      cards,
      routes,
      reps,
      vans,
      topProducts,
      stockWarnings,
      actions,
      timeline,
      methodBreakdown,
      counts: {
        supplies: data.supplies.length,
        collections: data.collections.length,
        returns: data.returns.length,
        visits: data.visits.length,
        closings: data.closings.length,
        vanLoads: data.vanLoads.length,
        offerRedemptions: data.redemptions.length
      }
    });
  } catch (error) { next(error); }
});

router.get('/quick-status', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = dayRange(req.query);
    const [supplyCount, collectionCount, returnCount, pendingVisitCount] = await Promise.all([
      safeCount('shopSupplyInvoice', { where: { tenantId, supplyDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } } }),
      safeCount('shopCollection', { where: { tenantId, collectedAt: { gte: from, lte: to } } }),
      safeCount('shopReturn', { where: { tenantId, returnDate: { gte: from, lte: to }, status: { not: 'CANCELLED' } } }),
      safeCount('shopVisit', { where: { tenantId, plannedAt: { gte: from, lte: to }, status: 'PLANNED' } })
    ]);
    res.json({ supplyCount, collectionCount, returnCount, pendingVisitCount });
  } catch (error) { next(error); }
});

export default router;
