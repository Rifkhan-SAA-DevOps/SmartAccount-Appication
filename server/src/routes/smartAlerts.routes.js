import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(requirePermission('smartalert:read'));
router.use(planFeatureGuard('allowAdvancedReports'));

const generateSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minPriority: z.enum(['critical', 'high', 'medium', 'low']).optional().default('high'),
  notifyOwners: z.boolean().optional().default(true)
});

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function pct(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 10;
}

function parseRange(query = {}) {
  const now = new Date();
  const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
  defaultFrom.setHours(0, 0, 0, 0);
  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : now;
  if (query.from) from.setHours(0, 0, 0, 0);
  if (query.to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function daysBetween(from, to) {
  const ms = Math.max(1, new Date(to).getTime() - new Date(from).getTime());
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}

function priorityRank(priority) {
  return { critical: 4, high: 3, medium: 2, low: 1 }[priority] || 1;
}

function typeFromPriority(priority) {
  if (priority === 'critical') return 'DANGER';
  if (priority === 'high') return 'WARNING';
  if (priority === 'medium') return 'WARNING';
  return 'INFO';
}

function notificationPriority(priority) {
  if (priority === 'critical') return 'URGENT';
  if (priority === 'high') return 'HIGH';
  if (priority === 'medium') return 'NORMAL';
  return 'LOW';
}

function makeAlert({ key, priority = 'medium', module = 'General', title, problem, reason, action, actionUrl = '/', entityType = null, entityId = null, value = 0, impact = 'Business attention needed' }) {
  return {
    key,
    priority,
    module,
    title,
    problem,
    reason,
    action,
    actionUrl,
    entityType,
    entityId,
    value: money(value),
    impact,
    score: priorityRank(priority) * 25
  };
}

async function safe(factory, fallback) {
  try { return await factory(); }
  catch { return fallback; }
}

async function loadAlertSnapshot(tenantId, from, to) {
  const now = new Date();
  const soon = new Date(now);
  soon.setDate(soon.getDate() + 30);
  const week = new Date(now);
  week.setDate(week.getDate() + 7);

  const [
    invoices,
    overdueInvoices,
    expenses,
    products,
    customers,
    suppliers,
    bankAccounts,
    pendingApprovals,
    serviceJobs,
    crmLeads,
    expiringBatches,
    dueCheques
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: from, lte: to } },
      include: { customer: true, items: true },
      orderBy: { issueDate: 'desc' },
      take: 500
    }),
    prisma.invoice.findMany({
      where: { tenantId, status: { notIn: ['PAID', 'CANCELLED'] }, balance: { gt: 0 }, dueDate: { lt: now } },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
      take: 50
    }),
    prisma.expense.findMany({ where: { tenantId, spentAt: { gte: from, lte: to } }, orderBy: { amount: 'desc' }, take: 500 }),
    prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 1000 }),
    prisma.customer.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' }, take: 300 }),
    prisma.supplier.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' }, take: 300 }),
    prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 100 }),
    safe(() => prisma.approvalRequest.findMany({ where: { tenantId, status: 'PENDING' }, orderBy: { requestedAt: 'asc' }, take: 50 }), []),
    safe(() => prisma.serviceJob.findMany({ where: { tenantId, status: { notIn: ['COMPLETED', 'CANCELLED'] }, OR: [{ dueAt: { lte: week } }, { scheduledAt: { lte: week } }] }, orderBy: { dueAt: 'asc' }, take: 50 }), []),
    safe(() => prisma.crmLead.findMany({ where: { tenantId, status: { notIn: ['WON', 'LOST'] }, nextFollowUpAt: { lte: now } }, orderBy: { nextFollowUpAt: 'asc' }, take: 50 }), []),
    safe(() => prisma.productBatch.findMany({ where: { tenantId, expiryDate: { gte: now, lte: soon }, qtyIn: { gt: 0 } }, include: { product: true, warehouse: true }, orderBy: { expiryDate: 'asc' }, take: 50 }), []),
    safe(() => prisma.cheque.findMany({ where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { lte: week } }, orderBy: { dueDate: 'asc' }, take: 50 }), [])
  ]);

  const days = daysBetween(from, to);
  const salesTotal = money(invoices.reduce((sum, invoice) => sum + num(invoice.total), 0));
  const salesPaid = money(invoices.reduce((sum, invoice) => sum + num(invoice.paid), 0));
  const invoiceBalance = money(invoices.reduce((sum, invoice) => sum + num(invoice.balance), 0));
  const cogs = money(invoices.flatMap((invoice) => invoice.items || []).reduce((sum, item) => sum + num(item.qty) * num(item.costPrice), 0));
  const grossProfit = money(salesTotal - cogs);
  const expenseTotal = money(expenses.reduce((sum, expense) => sum + num(expense.amount), 0));
  const netProfit = money(grossProfit - expenseTotal);
  const cashBankBalance = money(bankAccounts.reduce((sum, account) => sum + num(account.currentBalance), 0));
  const receivables = money(customers.reduce((sum, customer) => sum + num(customer.balance), 0));
  const payables = money(suppliers.reduce((sum, supplier) => sum + num(supplier.balance), 0));
  const inventoryValue = money(products.reduce((sum, product) => sum + num(product.stockQty) * num(product.costPrice), 0));
  const overdueAmount = money(overdueInvoices.reduce((sum, invoice) => sum + num(invoice.balance), 0));
  const averageDailyExpense = money(expenseTotal / days);
  const cashRunwayDays = averageDailyExpense > 0 ? Math.floor(cashBankBalance / averageDailyExpense) : 999;
  const grossMarginPercent = salesTotal > 0 ? pct(grossProfit / salesTotal) : 0;
  const expenseToSalesPercent = salesTotal > 0 ? pct(expenseTotal / salesTotal) : 0;
  const collectionRatePercent = salesTotal > 0 ? pct(salesPaid / salesTotal) : 0;

  const lowStock = products
    .filter((product) => num(product.reorderLevel) > 0 && num(product.stockQty) <= num(product.reorderLevel))
    .sort((a, b) => num(a.stockQty) - num(b.stockQty))
    .slice(0, 25);

  const overstock = products
    .filter((product) => num(product.reorderLevel) > 0 && num(product.stockQty) >= num(product.reorderLevel) * 4 && num(product.stockQty) * num(product.costPrice) > 0)
    .sort((a, b) => num(b.stockQty) * num(b.costPrice) - num(a.stockQty) * num(a.costPrice))
    .slice(0, 25);

  const highReceivables = customers.filter((customer) => num(customer.balance) > 0).slice(0, 25);
  const highPayables = suppliers.filter((supplier) => num(supplier.balance) > 0).slice(0, 25);

  return {
    range: { from, to, days },
    metrics: {
      salesTotal,
      salesPaid,
      invoiceBalance,
      cogs,
      grossProfit,
      expenseTotal,
      netProfit,
      cashBankBalance,
      receivables,
      payables,
      inventoryValue,
      overdueAmount,
      averageDailyExpense,
      cashRunwayDays,
      grossMarginPercent,
      expenseToSalesPercent,
      collectionRatePercent,
      invoiceCount: invoices.length,
      overdueInvoiceCount: overdueInvoices.length,
      lowStockCount: lowStock.length,
      pendingApprovalCount: pendingApprovals.length,
      serviceJobDueCount: serviceJobs.length,
      crmFollowupDueCount: crmLeads.length,
      expiringBatchCount: expiringBatches.length,
      dueChequeCount: dueCheques.length
    },
    lists: {
      overdueInvoices: overdueInvoices.map((row) => ({ id: row.id, invoiceNo: row.invoiceNo, customer: row.customer?.name || 'Walk-in', dueDate: row.dueDate, balance: money(row.balance) })),
      lowStock: lowStock.map((row) => ({ id: row.id, name: row.name, sku: row.sku, stockQty: num(row.stockQty), reorderLevel: num(row.reorderLevel), value: money(num(row.stockQty) * num(row.costPrice)) })),
      overstock: overstock.map((row) => ({ id: row.id, name: row.name, sku: row.sku, stockQty: num(row.stockQty), reorderLevel: num(row.reorderLevel), value: money(num(row.stockQty) * num(row.costPrice)) })),
      highReceivables: highReceivables.map((row) => ({ id: row.id, name: row.name, phone: row.phone, balance: money(row.balance), creditLimit: money(row.creditLimit) })),
      highPayables: highPayables.map((row) => ({ id: row.id, name: row.name, phone: row.phone, balance: money(row.balance) })),
      pendingApprovals: pendingApprovals.map((row) => ({ id: row.id, requestNo: row.requestNo, title: row.title, priority: row.priority, amount: money(row.amount), requestedAt: row.requestedAt })),
      serviceJobs: serviceJobs.map((row) => ({ id: row.id, jobNo: row.jobNo, title: row.title, status: row.status, priority: row.priority, dueAt: row.dueAt || row.scheduledAt })),
      crmLeads: crmLeads.map((row) => ({ id: row.id, leadNo: row.leadNo, title: row.title, contactName: row.contactName, expectedValue: money(row.expectedValue), nextFollowUpAt: row.nextFollowUpAt })),
      expiringBatches: expiringBatches.map((row) => ({ id: row.id, product: row.product?.name || '-', batchNo: row.batchNo, warehouse: row.warehouse?.name || '-', expiryDate: row.expiryDate, qtyIn: num(row.qtyIn) })),
      dueCheques: dueCheques.map((row) => ({ id: row.id, chequeNo: row.chequeNo, direction: row.direction, amount: money(row.amount), dueDate: row.dueDate, status: row.status }))
    }
  };
}

function buildRecommendations(snapshot) {
  const { metrics, lists } = snapshot;
  const alerts = [];

  if (metrics.netProfit < 0) {
    alerts.push(makeAlert({ key: 'negative-profit', priority: 'critical', module: 'Accounting', title: 'Business is running at a loss', problem: `Estimated net loss is LKR ${Math.abs(metrics.netProfit).toLocaleString()}.`, reason: `Sales are LKR ${metrics.salesTotal.toLocaleString()}, COGS is LKR ${metrics.cogs.toLocaleString()}, and expenses are LKR ${metrics.expenseTotal.toLocaleString()}.`, action: 'Review selling price, product cost, discounts, and high expense categories before creating more purchases.', actionUrl: '/accounting', value: Math.abs(metrics.netProfit), impact: 'Profit risk' }));
  }

  if (metrics.cashRunwayDays !== 999 && metrics.cashRunwayDays <= 14) {
    alerts.push(makeAlert({ key: 'low-cash-runway', priority: metrics.cashRunwayDays <= 7 ? 'critical' : 'high', module: 'Cash / Bank', title: 'Cash runway is low', problem: `Current cash/bank balance can cover about ${metrics.cashRunwayDays} day(s) of average expenses.`, reason: `Cash/bank is LKR ${metrics.cashBankBalance.toLocaleString()} and average daily expense is LKR ${metrics.averageDailyExpense.toLocaleString()}.`, action: 'Collect receivables, pause non-urgent expenses, and delay low-priority supplier payments.', actionUrl: '/cash-bank', value: metrics.cashBankBalance, impact: 'Cash flow risk' }));
  }

  if (metrics.expenseToSalesPercent >= 60 && metrics.salesTotal > 0) {
    alerts.push(makeAlert({ key: 'high-expense-ratio', priority: metrics.expenseToSalesPercent >= 80 ? 'high' : 'medium', module: 'Expenses', title: 'Expenses are high compared to sales', problem: `Expenses are ${metrics.expenseToSalesPercent}% of sales.`, reason: `For the selected period, expenses are LKR ${metrics.expenseTotal.toLocaleString()} and sales are LKR ${metrics.salesTotal.toLocaleString()}.`, action: 'Check recurring expenses like rent, salaries, utilities, transport, subscriptions, and unnecessary purchases.', actionUrl: '/cash-bank', value: metrics.expenseTotal, impact: 'Margin pressure' }));
  }

  if (metrics.overdueInvoiceCount > 0) {
    alerts.push(makeAlert({ key: 'overdue-invoices', priority: metrics.overdueAmount > metrics.cashBankBalance ? 'critical' : 'high', module: 'Sales / Invoices', title: 'Overdue invoices need collection', problem: `${metrics.overdueInvoiceCount} overdue invoice(s) have pending balance of LKR ${metrics.overdueAmount.toLocaleString()}.`, reason: 'Late customer payments reduce cash flow even when sales look good.', action: 'Call highest-balance customers first and record payment receipts immediately.', actionUrl: '/invoices', value: metrics.overdueAmount, impact: 'Collection risk' }));
  }

  if (metrics.collectionRatePercent < 70 && metrics.salesTotal > 0) {
    alerts.push(makeAlert({ key: 'low-collection-rate', priority: 'medium', module: 'Ledgers', title: 'Sales collection rate is weak', problem: `Only ${metrics.collectionRatePercent}% of period sales are collected.`, reason: `Sales paid amount is LKR ${metrics.salesPaid.toLocaleString()} out of LKR ${metrics.salesTotal.toLocaleString()}.`, action: 'Use customer ledger and statements to follow up unpaid and partial invoices.', actionUrl: '/ledgers', value: metrics.invoiceBalance, impact: 'Receivable control' }));
  }

  if (metrics.lowStockCount > 0) {
    alerts.push(makeAlert({ key: 'low-stock', priority: metrics.lowStockCount >= 10 ? 'high' : 'medium', module: 'Inventory', title: 'Low-stock products found', problem: `${metrics.lowStockCount} product(s) are at or below reorder level.`, reason: 'Selling can stop when fast-moving items go out of stock.', action: 'Create purchase orders or GRNs for the most important low-stock products.', actionUrl: '/products', value: metrics.lowStockCount, impact: 'Stockout risk' }));
  }

  if (lists.overstock.length > 0) {
    alerts.push(makeAlert({ key: 'overstock', priority: 'medium', module: 'Inventory', title: 'Some products may be overstocked', problem: `${lists.overstock.length} product(s) have high stock compared to reorder level.`, reason: 'Overstock locks business cash inside slow-moving inventory.', action: 'Create bundle offers, campaigns, or reduce future purchase quantities for these items.', actionUrl: '/products', value: lists.overstock.reduce((sum, row) => sum + num(row.value), 0), impact: 'Cash locked in inventory' }));
  }

  if (metrics.payables > metrics.cashBankBalance && metrics.payables > 0) {
    alerts.push(makeAlert({ key: 'payables-higher-than-cash', priority: 'high', module: 'Suppliers', title: 'Supplier payables are higher than cash', problem: `Payables are LKR ${metrics.payables.toLocaleString()}, but cash/bank is LKR ${metrics.cashBankBalance.toLocaleString()}.`, reason: 'The business may struggle if suppliers request payment quickly.', action: 'Prioritize critical suppliers and plan payments based on expected customer collections.', actionUrl: '/suppliers', value: metrics.payables, impact: 'Supplier payment risk' }));
  }

  if (metrics.pendingApprovalCount > 0) {
    alerts.push(makeAlert({ key: 'pending-approvals', priority: metrics.pendingApprovalCount > 5 ? 'high' : 'medium', module: 'Approvals', title: 'Pending approvals may delay work', problem: `${metrics.pendingApprovalCount} approval request(s) are waiting.`, reason: 'Purchases, expenses, discounts, or other workflow actions may be blocked.', action: 'Open Approvals and approve/reject the oldest urgent requests.', actionUrl: '/approvals', value: metrics.pendingApprovalCount, impact: 'Operational delay' }));
  }

  if (metrics.serviceJobDueCount > 0) {
    alerts.push(makeAlert({ key: 'due-service-jobs', priority: 'medium', module: 'Service Jobs', title: 'Service jobs need follow-up', problem: `${metrics.serviceJobDueCount} service job(s) are due soon or overdue.`, reason: 'Late service delivery can affect customer satisfaction.', action: 'Assign technicians and update job status from the Service Jobs page.', actionUrl: '/service-jobs', value: metrics.serviceJobDueCount, impact: 'Customer service risk' }));
  }

  if (metrics.crmFollowupDueCount > 0) {
    alerts.push(makeAlert({ key: 'crm-followups', priority: 'medium', module: 'CRM', title: 'CRM follow-ups are due', problem: `${metrics.crmFollowupDueCount} lead follow-up(s) are due.`, reason: 'Missed follow-ups reduce conversion chances.', action: 'Contact the highest-value leads and update their next follow-up date.', actionUrl: '/crm', value: metrics.crmFollowupDueCount, impact: 'Sales opportunity risk' }));
  }

  if (metrics.expiringBatchCount > 0) {
    alerts.push(makeAlert({ key: 'expiring-batches', priority: 'high', module: 'Expiry / Batch', title: 'Product batches are expiring soon', problem: `${metrics.expiringBatchCount} batch(es) expire within 30 days.`, reason: 'Expired stock causes waste, returns, and compliance problems.', action: 'Sell, transfer, discount, or isolate expiring batches before expiry.', actionUrl: '/batches', value: metrics.expiringBatchCount, impact: 'Expiry loss risk' }));
  }

  if (metrics.dueChequeCount > 0) {
    alerts.push(makeAlert({ key: 'due-cheques', priority: 'medium', module: 'Cheques', title: 'Cheques are due soon', problem: `${metrics.dueChequeCount} cheque(s) are due within 7 days.`, reason: 'Cheque follow-up is needed to avoid missed deposits, bounces, or payment delays.', action: 'Review cheque status and prepare deposit/payment actions.', actionUrl: '/cheques', value: metrics.dueChequeCount, impact: 'Cheque control' }));
  }

  if (!alerts.length) {
    alerts.push(makeAlert({ key: 'healthy', priority: 'low', module: 'General', title: 'No major smart alert found', problem: 'The selected data does not show a critical risk.', reason: 'Sales, expenses, cash, stock, and receivables look acceptable based on available records.', action: 'Keep entering invoices, payments, expenses, purchases, and stock movements accurately.', actionUrl: '/dashboard', impact: 'Healthy status' }));
  }

  return alerts.sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || b.value - a.value);
}

function buildSummary(snapshot, recommendations) {
  const { metrics } = snapshot;
  const critical = recommendations.filter((item) => item.priority === 'critical').length;
  const high = recommendations.filter((item) => item.priority === 'high').length;
  const healthScore = Math.max(0, 100 - critical * 25 - high * 12 - recommendations.filter((item) => item.priority === 'medium').length * 5);
  const headline = critical > 0 ? 'Critical attention needed' : high > 0 ? 'Some important risks need action' : 'Business looks stable from available data';
  return {
    headline,
    healthScore,
    message: `${headline}. Net sales are LKR ${metrics.salesTotal.toLocaleString()}, net profit is LKR ${metrics.netProfit.toLocaleString()}, cash/bank is LKR ${metrics.cashBankBalance.toLocaleString()}, receivables are LKR ${metrics.receivables.toLocaleString()}, and payables are LKR ${metrics.payables.toLocaleString()}.`,
    counts: {
      total: recommendations.length,
      critical,
      high,
      medium: recommendations.filter((item) => item.priority === 'medium').length,
      low: recommendations.filter((item) => item.priority === 'low').length
    }
  };
}

router.get('/summary', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const snapshot = await loadAlertSnapshot(req.user.tenantId, from, to);
    const recommendations = buildRecommendations(snapshot);
    const summary = buildSummary(snapshot, recommendations);
    res.json({ ...snapshot, summary, recommendations });
  } catch (e) { next(e); }
});

router.post('/generate-notifications', requirePermission('smartalert:manage'), async (req, res, next) => {
  try {
    const data = generateSchema.parse(req.body || {});
    const { from, to } = parseRange(data);
    const snapshot = await loadAlertSnapshot(req.user.tenantId, from, to);
    const recommendations = buildRecommendations(snapshot)
      .filter((item) => priorityRank(item.priority) >= priorityRank(data.minPriority))
      .filter((item) => item.key !== 'healthy')
      .slice(0, 20);

    const created = [];
    for (const item of recommendations) {
      const payload = {
        tenantId: req.user.tenantId,
        type: typeFromPriority(item.priority),
        title: item.title,
        message: `${item.problem} Action: ${item.action}`,
        priority: notificationPriority(item.priority),
        entityType: item.entityType || 'SmartAlert',
        entityId: item.entityId || item.key,
        actionUrl: item.actionUrl,
        metadata: { module: item.module, reason: item.reason, impact: item.impact, value: item.value, version: '4.7' }
      };

      if (data.notifyOwners && ['critical', 'high'].includes(item.priority)) {
        created.push(...await notifyTenantRoles({ ...payload, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'] }));
      } else {
        created.push(await createNotification(payload));
      }
    }

    const saved = created.filter(Boolean);
    await audit(req, 'GENERATE_SMART_ALERTS', 'SmartAlert', 'v4.7', null, { count: saved.length, minPriority: data.minPriority });
    res.status(201).json({ created: saved.length, recommendations: recommendations.length, notifications: saved });
  } catch (e) { next(e); }
});

export default router;
