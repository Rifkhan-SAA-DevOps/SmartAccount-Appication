import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);
router.use(requirePermission('assistant:read'));
router.use(planFeatureGuard('allowAdvancedReports'));

const askSchema = z.object({
  question: z.string().min(2).max(500),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function percent(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 10;
}

function parseRange(query = {}) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : now;
  if (query.from) from.setHours(0, 0, 0, 0);
  if (query.to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function buildInsight(type, title, message, action, priority = 'medium') {
  return { type, title, message, action, priority };
}

function topBy(items, selector, limit = 5) {
  return [...items].sort((a, b) => num(selector(b)) - num(selector(a))).slice(0, limit);
}

async function loadBusinessSnapshot(tenantId, from, to) {
  const now = new Date();

  const [
    invoices,
    overdueInvoices,
    expenses,
    purchases,
    salesReturns,
    products,
    customers,
    suppliers,
    bankAccounts,
    pendingApprovals,
    serviceJobs,
    crmLeads
  ] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: from, lte: to } },
      include: { customer: true, items: { include: { product: true } } },
      orderBy: { issueDate: 'desc' }
    }),
    prisma.invoice.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, balance: { gt: 0 }, dueDate: { lt: now } },
      include: { customer: true },
      orderBy: { dueDate: 'asc' },
      take: 10
    }),
    prisma.expense.findMany({
      where: { tenantId, spentAt: { gte: from, lte: to } },
      orderBy: { spentAt: 'desc' }
    }),
    prisma.goodsReceivedNote.findMany({
      where: { tenantId, receivedDate: { gte: from, lte: to } },
      include: { supplier: true, items: true },
      orderBy: { receivedDate: 'desc' }
    }),
    prisma.salesReturn.findMany({
      where: { tenantId, returnDate: { gte: from, lte: to } },
      orderBy: { returnDate: 'desc' }
    }),
    prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.customer.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' } }),
    prisma.supplier.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' } }),
    prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }),
    prisma.approvalRequest.findMany({ where: { tenantId, status: 'PENDING' }, orderBy: { requestedAt: 'asc' }, take: 10 }),
    prisma.serviceJob.findMany({ where: { tenantId, status: { notIn: ['COMPLETED', 'CANCELLED'] } }, orderBy: { scheduledAt: 'asc' }, take: 10 }),
    prisma.crmLead.findMany({ where: { tenantId, status: { notIn: ['WON', 'LOST'] } }, orderBy: { nextFollowUpAt: 'asc' }, take: 10 })
  ]);

  const salesTotal = money(invoices.reduce((sum, invoice) => sum + num(invoice.total), 0));
  const salesPaid = money(invoices.reduce((sum, invoice) => sum + num(invoice.paid), 0));
  const salesBalance = money(invoices.reduce((sum, invoice) => sum + num(invoice.balance), 0));
  const salesReturnTotal = money(salesReturns.reduce((sum, item) => sum + num(item.total), 0));
  const netSales = money(salesTotal - salesReturnTotal);
  const cogs = money(invoices.flatMap((invoice) => invoice.items).reduce((sum, item) => sum + num(item.qty) * num(item.costPrice), 0));
  const grossProfit = money(netSales - cogs);
  const expensesTotal = money(expenses.reduce((sum, expense) => sum + num(expense.amount), 0));
  const netProfit = money(grossProfit - expensesTotal);
  const purchaseTotal = money(purchases.reduce((sum, purchase) => sum + num(purchase.total), 0));
  const cashBankBalance = money(bankAccounts.reduce((sum, account) => sum + num(account.currentBalance), 0));
  const receivables = money(customers.reduce((sum, customer) => sum + num(customer.balance), 0));
  const payables = money(suppliers.reduce((sum, supplier) => sum + num(supplier.balance), 0));
  const inventoryValue = money(products.reduce((sum, product) => sum + num(product.stockQty) * num(product.costPrice), 0));
  const lowStock = products.filter((product) => num(product.reorderLevel) > 0 && num(product.stockQty) <= num(product.reorderLevel));
  const slowMovingStock = products.filter((product) => num(product.stockQty) > 0 && num(product.salePrice) > 0 && num(product.stockQty) >= num(product.reorderLevel || 0) * 3).slice(0, 8);

  const firstHalfDate = new Date(from.getTime() + (to.getTime() - from.getTime()) / 2);
  const firstHalfSales = money(invoices.filter((invoice) => new Date(invoice.issueDate) < firstHalfDate).reduce((sum, invoice) => sum + num(invoice.total), 0));
  const secondHalfSales = money(invoices.filter((invoice) => new Date(invoice.issueDate) >= firstHalfDate).reduce((sum, invoice) => sum + num(invoice.total), 0));
  const salesTrendPercent = firstHalfSales > 0 ? percent((secondHalfSales - firstHalfSales) / firstHalfSales) : 0;

  const customerSales = new Map();
  invoices.forEach((invoice) => {
    const key = invoice.customerId || 'walk-in';
    const current = customerSales.get(key) || { id: invoice.customerId, name: invoice.customer?.name || 'Walk-in Customer', sales: 0, balance: 0, invoices: 0 };
    current.sales = money(current.sales + num(invoice.total));
    current.balance = money(current.balance + num(invoice.balance));
    current.invoices += 1;
    customerSales.set(key, current);
  });

  const productSales = new Map();
  invoices.forEach((invoice) => {
    invoice.items.forEach((item) => {
      const key = item.productId || item.description;
      const current = productSales.get(key) || { id: item.productId, name: item.product?.name || item.description || 'Item', qty: 0, sales: 0, profit: 0 };
      current.qty = money(current.qty + num(item.qty));
      current.sales = money(current.sales + num(item.total));
      current.profit = money(current.profit + num(item.total) - num(item.qty) * num(item.costPrice));
      productSales.set(key, current);
    });
  });

  return {
    period: { from, to },
    metrics: {
      salesTotal,
      salesPaid,
      salesBalance,
      salesReturnTotal,
      netSales,
      cogs,
      grossProfit,
      expensesTotal,
      netProfit,
      purchaseTotal,
      cashBankBalance,
      receivables,
      payables,
      inventoryValue,
      lowStockCount: lowStock.length,
      overdueInvoiceCount: overdueInvoices.length,
      pendingApprovalCount: pendingApprovals.length,
      activeServiceJobCount: serviceJobs.length,
      activeLeadCount: crmLeads.length,
      invoiceCount: invoices.length,
      purchaseCount: purchases.length,
      expenseCount: expenses.length,
      grossMarginPercent: netSales > 0 ? percent(grossProfit / netSales) : 0,
      expenseToSalesPercent: netSales > 0 ? percent(expensesTotal / netSales) : 0,
      salesTrendPercent
    },
    lists: {
      lowStock: lowStock.slice(0, 8).map((product) => ({ id: product.id, name: product.name, sku: product.sku, stockQty: num(product.stockQty), reorderLevel: num(product.reorderLevel) })),
      slowMovingStock: slowMovingStock.map((product) => ({ id: product.id, name: product.name, stockQty: num(product.stockQty), reorderLevel: num(product.reorderLevel), value: money(num(product.stockQty) * num(product.costPrice)) })),
      overdueInvoices: overdueInvoices.map((invoice) => ({ id: invoice.id, invoiceNo: invoice.invoiceNo, customer: invoice.customer?.name || 'Walk-in', balance: num(invoice.balance), dueDate: invoice.dueDate })),
      topCustomersBySales: topBy(Array.from(customerSales.values()), (customer) => customer.sales, 5),
      topProductsBySales: topBy(Array.from(productSales.values()), (product) => product.sales, 5),
      highReceivableCustomers: topBy(customers, (customer) => customer.balance, 5).map((customer) => ({ id: customer.id, name: customer.name, phone: customer.phone, balance: num(customer.balance) })),
      highPayableSuppliers: topBy(suppliers, (supplier) => supplier.balance, 5).map((supplier) => ({ id: supplier.id, name: supplier.name, phone: supplier.phone, balance: num(supplier.balance) })),
      pendingApprovals: pendingApprovals.map((approval) => ({ id: approval.id, requestNo: approval.requestNo, title: approval.title, type: approval.type, amount: num(approval.amount), priority: approval.priority })),
      activeServiceJobs: serviceJobs.map((job) => ({ id: job.id, jobNo: job.jobNo, title: job.title, status: job.status, scheduledAt: job.scheduledAt, dueAt: job.dueAt })),
      activeLeads: crmLeads.map((lead) => ({ id: lead.id, leadNo: lead.leadNo, name: lead.contactName || lead.title, stage: lead.status, expectedValue: num(lead.expectedValue), nextFollowUpAt: lead.nextFollowUpAt }))
    }
  };
}

function buildInsights(snapshot) {
  const { metrics, lists } = snapshot;
  const insights = [];

  if (metrics.netProfit < 0) {
    insights.push(buildInsight('danger', 'Business is currently making a loss', `Net profit is LKR ${metrics.netProfit}. Expenses and cost of goods are higher than the profit generated from sales.`, 'Review high expense categories, slow-moving stock, and product selling prices.', 'high'));
  } else if (metrics.netProfit > 0) {
    insights.push(buildInsight('success', 'Business is profitable for this period', `Estimated net profit is LKR ${metrics.netProfit} with ${metrics.grossMarginPercent}% gross margin.`, 'Keep monitoring expenses and receivables so profit converts into cash.', 'medium'));
  }

  if (metrics.expenseToSalesPercent > 45) {
    insights.push(buildInsight('warning', 'Expenses are high compared to sales', `Expenses are ${metrics.expenseToSalesPercent}% of net sales.`, 'Check rent, salaries, utilities, transport, and other recurring expenses.', 'high'));
  }

  if (metrics.lowStockCount > 0) {
    insights.push(buildInsight('warning', 'Some products need reorder attention', `${metrics.lowStockCount} product(s) are at or below reorder level.`, 'Open Inventory and restock the most important low-stock products first.', 'high'));
  }

  if (metrics.overdueInvoiceCount > 0) {
    insights.push(buildInsight('warning', 'Overdue customer invoices found', `${metrics.overdueInvoiceCount} invoice(s) are overdue and still have balance.`, 'Follow up customers and collect overdue payments.', 'high'));
  }

  if (metrics.receivables > metrics.cashBankBalance && metrics.receivables > 0) {
    insights.push(buildInsight('opportunity', 'Money is tied up with customers', `Receivables are LKR ${metrics.receivables}, higher than cash/bank balance of LKR ${metrics.cashBankBalance}.`, 'Prioritize collection from customers with the highest balances.', 'medium'));
  }

  if (metrics.cashBankBalance < metrics.expensesTotal * 0.25 && metrics.expensesTotal > 0) {
    insights.push(buildInsight('danger', 'Cash/bank balance may be low', `Cash and bank balance is LKR ${metrics.cashBankBalance}, while expenses for this period are LKR ${metrics.expensesTotal}.`, 'Reduce non-urgent spending and collect receivables quickly.', 'high'));
  }

  if (metrics.salesTrendPercent > 10) {
    insights.push(buildInsight('success', 'Sales trend is improving', `Second half sales are ${metrics.salesTrendPercent}% higher than first half sales.`, 'Identify what worked and repeat that sales activity.', 'medium'));
  } else if (metrics.salesTrendPercent < -10) {
    insights.push(buildInsight('warning', 'Sales trend is dropping', `Second half sales are ${Math.abs(metrics.salesTrendPercent)}% lower than first half sales.`, 'Review top products, customer follow-ups, campaigns, and discounts.', 'high'));
  }

  if (lists.slowMovingStock.length > 0) {
    insights.push(buildInsight('opportunity', 'Some inventory may be overstocked', `${lists.slowMovingStock.length} product(s) look high in stock compared with reorder level.`, 'Consider bundle offers, discounts, or supplier purchase control.', 'medium'));
  }

  if (metrics.pendingApprovalCount > 0) {
    insights.push(buildInsight('warning', 'Pending approvals need action', `${metrics.pendingApprovalCount} approval request(s) are waiting.`, 'Review approvals so purchases, expenses, or business actions do not get delayed.', 'medium'));
  }

  if (!insights.length) {
    insights.push(buildInsight('success', 'No major risk detected', 'The selected period does not show a critical issue from the available data.', 'Keep entering invoices, expenses, payments, and stock movements accurately.', 'low'));
  }

  return insights;
}

function buildExecutiveSummary(snapshot, insights) {
  const { metrics } = snapshot;
  const profitText = metrics.netProfit >= 0 ? `profit of LKR ${metrics.netProfit}` : `loss of LKR ${Math.abs(metrics.netProfit)}`;
  const riskCount = insights.filter((item) => item.priority === 'high').length;
  return `For the selected period, the business made net sales of LKR ${metrics.netSales}, expenses of LKR ${metrics.expensesTotal}, and an estimated ${profitText}. Cash/bank balance is LKR ${metrics.cashBankBalance}, receivables are LKR ${metrics.receivables}, and payables are LKR ${metrics.payables}. ${riskCount ? `${riskCount} high-priority issue(s) need attention.` : 'No high-priority issue was detected.'}`;
}

function answerQuestion(question, snapshot, insights) {
  const q = question.toLowerCase();
  const { metrics, lists } = snapshot;

  if (q.includes('profit') || q.includes('loss') || q.includes('margin')) {
    return `Your estimated net profit is LKR ${metrics.netProfit}. Net sales are LKR ${metrics.netSales}, COGS is LKR ${metrics.cogs}, gross profit is LKR ${metrics.grossProfit}, and expenses are LKR ${metrics.expensesTotal}. Gross margin is ${metrics.grossMarginPercent}%.`;
  }

  if (q.includes('sale') || q.includes('invoice') || q.includes('revenue')) {
    const bestCustomers = lists.topCustomersBySales.map((c) => `${c.name} - LKR ${c.sales}`).join(', ') || 'No customer sales found';
    return `Sales for this period are LKR ${metrics.salesTotal}, with ${metrics.invoiceCount} invoice(s). Paid amount is LKR ${metrics.salesPaid}, and remaining invoice balance is LKR ${metrics.salesBalance}. Top customers by sales: ${bestCustomers}.`;
  }

  if (q.includes('stock') || q.includes('inventory') || q.includes('reorder')) {
    const low = lists.lowStock.map((p) => `${p.name} (${p.stockQty}/${p.reorderLevel})`).join(', ') || 'No low-stock products found';
    return `Inventory value is approximately LKR ${metrics.inventoryValue}. Low-stock product count is ${metrics.lowStockCount}. Reorder attention: ${low}.`;
  }

  if (q.includes('customer') || q.includes('receivable') || q.includes('credit')) {
    const customers = lists.highReceivableCustomers.map((c) => `${c.name} - LKR ${c.balance}`).join(', ') || 'No customer balance found';
    return `Total receivables are LKR ${metrics.receivables}. Overdue invoice count is ${metrics.overdueInvoiceCount}. Highest receivable customers: ${customers}.`;
  }

  if (q.includes('supplier') || q.includes('payable')) {
    const suppliers = lists.highPayableSuppliers.map((s) => `${s.name} - LKR ${s.balance}`).join(', ') || 'No supplier balance found';
    return `Total supplier payables are LKR ${metrics.payables}. Purchase total for this period is LKR ${metrics.purchaseTotal}. Highest payable suppliers: ${suppliers}.`;
  }

  if (q.includes('expense') || q.includes('spending') || q.includes('cost')) {
    return `Expenses for this period are LKR ${metrics.expensesTotal}. Expense-to-sales percentage is ${metrics.expenseToSalesPercent}%. If this is high, check recurring costs such as rent, salaries, utilities, transport, and unnecessary purchases.`;
  }

  if (q.includes('cash') || q.includes('bank')) {
    return `Current cash/bank balance is LKR ${metrics.cashBankBalance}. Receivables are LKR ${metrics.receivables}, and payables are LKR ${metrics.payables}. To improve cash flow, collect overdue invoices before making non-urgent payments.`;
  }

  if (q.includes('approval')) {
    const approvals = lists.pendingApprovals.map((a) => `${a.requestNo} - ${a.title}`).join(', ') || 'No pending approvals';
    return `Pending approvals: ${metrics.pendingApprovalCount}. ${approvals}. Review them quickly to avoid business process delays.`;
  }

  if (q.includes('lead') || q.includes('crm') || q.includes('follow')) {
    const leads = lists.activeLeads.map((lead) => `${lead.name} (${lead.stage})`).join(', ') || 'No active leads found';
    return `Active CRM leads: ${metrics.activeLeadCount}. Follow-up list: ${leads}. Focus on leads with high expected value and near follow-up dates.`;
  }

  const topInsight = insights[0];
  return `${buildExecutiveSummary(snapshot, insights)} Main advice: ${topInsight.title}. ${topInsight.action}`;
}

router.get('/insights', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const snapshot = await loadBusinessSnapshot(req.user.tenantId, from, to);
    const insights = buildInsights(snapshot);
    res.json({
      ...snapshot,
      summary: buildExecutiveSummary(snapshot, insights),
      insights,
      suggestedQuestions: [
        'Why is profit low?',
        'Which products need reorder?',
        'Who owes us the most money?',
        'How is cash flow now?',
        'Are expenses too high?',
        'Which customers are buying the most?'
      ]
    });
  } catch (e) { next(e); }
});

router.post('/ask', async (req, res, next) => {
  try {
    const body = askSchema.parse(req.body);
    const { from, to } = parseRange(body);
    const snapshot = await loadBusinessSnapshot(req.user.tenantId, from, to);
    const insights = buildInsights(snapshot);
    const answer = answerQuestion(body.question, snapshot, insights);

    await audit(req, 'ASK', 'SmartAssistant', 'assistant-question', null, { question: body.question });
    res.json({ answer, summary: buildExecutiveSummary(snapshot, insights), relatedInsights: insights.slice(0, 3), metrics: snapshot.metrics });
  } catch (e) { next(e); }
});

export default router;
