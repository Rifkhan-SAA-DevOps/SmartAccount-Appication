import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { notifyTenantRoles } from '../utils/notifications.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowDashboardBuilder', 'advanced dashboard builder'));

const WIDGET_TYPES = ['KPI', 'CHART', 'TABLE', 'SHORTCUTS', 'TEXT', 'ALERT'];
const CHART_TYPES = ['BAR', 'LINE', 'PIE', 'DONUT', 'AREA', 'NUMBER'];
const VISIBILITIES = ['ALL_ROLES', 'OWNER_ADMIN', 'ACCOUNTING', 'SALES', 'INVENTORY', 'MANAGEMENT'];

const DATA_SOURCES = [
  { key: 'TODAY_SALES', label: 'Today Sales', type: 'KPI', unit: 'money' },
  { key: 'MONTH_SALES', label: 'This Month Sales', type: 'KPI', unit: 'money' },
  { key: 'TODAY_RECEIPTS', label: 'Today Receipts', type: 'KPI', unit: 'money' },
  { key: 'CASH_BANK_BALANCE', label: 'Cash + Bank Balance', type: 'KPI', unit: 'money' },
  { key: 'CUSTOMER_RECEIVABLES', label: 'Customer Receivables', type: 'KPI', unit: 'money' },
  { key: 'SUPPLIER_PAYABLES', label: 'Supplier Payables', type: 'KPI', unit: 'money' },
  { key: 'OPEN_INVOICES', label: 'Open Invoices', type: 'KPI', unit: 'count' },
  { key: 'OVERDUE_INVOICES', label: 'Overdue Invoices', type: 'KPI', unit: 'count' },
  { key: 'LOW_STOCK_ITEMS', label: 'Low Stock Items', type: 'KPI', unit: 'count' },
  { key: 'INVENTORY_VALUE', label: 'Inventory Value', type: 'KPI', unit: 'money' },
  { key: 'PENDING_APPROVALS', label: 'Pending Approvals', type: 'KPI', unit: 'count' },
  { key: 'ACTIVE_PROJECTS', label: 'Active Projects', type: 'KPI', unit: 'count' },
  { key: 'OVERDUE_TASKS', label: 'Overdue Tasks', type: 'KPI', unit: 'count' },
  { key: 'MONTHLY_SALES_SERIES', label: '6 Month Sales Trend', type: 'CHART', unit: 'money' },
  { key: 'TOP_PRODUCTS', label: 'Top Products', type: 'TABLE', unit: 'money' },
  { key: 'RECENT_TRANSACTIONS', label: 'Recent Bank Transactions', type: 'TABLE', unit: 'money' }
];

const layoutSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  visibility: z.enum(VISIBILITIES).default('ALL_ROLES'),
  refreshInterval: z.coerce.number().int().min(30).max(86400).default(300),
  isDefault: z.boolean().optional().default(false)
});

const widgetSchema = z.object({
  widgetKey: z.string().trim().max(80).optional().nullable(),
  title: z.string().trim().min(2).max(140),
  widgetType: z.enum(WIDGET_TYPES).default('KPI'),
  dataSource: z.string().trim().min(2).max(80).default('MONTH_SALES'),
  chartType: z.enum(CHART_TYPES).optional().nullable(),
  gridX: z.coerce.number().int().min(0).max(24).default(0),
  gridY: z.coerce.number().int().min(0).max(80).default(0),
  gridW: z.coerce.number().int().min(1).max(12).default(3),
  gridH: z.coerce.number().int().min(1).max(10).default(2),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  config: z.any().optional().nullable(),
  isVisible: z.boolean().optional().default(true)
});

const shortcutSchema = z.object({
  title: z.string().trim().min(2).max(80),
  targetUrl: z.string().trim().min(1).max(200),
  icon: z.string().trim().max(40).optional().nullable(),
  color: z.string().trim().max(40).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isActive: z.boolean().optional().default(true)
});

function startOfDay(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
}

function startOfMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

function monthLabel(date) {
  return date.toLocaleString('en-US', { month: 'short', year: '2-digit' });
}

function includeLayout() {
  return {
    widgets: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
    shortcuts: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }
  };
}

async function sumInvoiceTotal(tenantId, from, to = new Date()) {
  const result = await prisma.invoice.aggregate({
    where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: from, lte: to } },
    _sum: { total: true }
  });
  return money(result._sum.total || 0);
}

async function simpleMetric(tenantId, dataSource) {
  const now = new Date();
  if (dataSource === 'TODAY_SALES') return { value: await sumInvoiceTotal(tenantId, startOfDay(now), now), label: 'Today Sales', unit: 'money' };
  if (dataSource === 'MONTH_SALES') return { value: await sumInvoiceTotal(tenantId, startOfMonth(now), now), label: 'This Month Sales', unit: 'money' };
  if (dataSource === 'TODAY_RECEIPTS') {
    const result = await prisma.payment.aggregate({ where: { tenantId, direction: 'IN', paidAt: { gte: startOfDay(now), lte: now } }, _sum: { amount: true } });
    return { value: money(result._sum.amount || 0), label: 'Today Receipts', unit: 'money' };
  }
  if (dataSource === 'CASH_BANK_BALANCE') {
    const result = await prisma.bankAccount.aggregate({ where: { tenantId, isActive: true }, _sum: { currentBalance: true } });
    return { value: money(result._sum.currentBalance || 0), label: 'Cash + Bank Balance', unit: 'money' };
  }
  if (dataSource === 'CUSTOMER_RECEIVABLES') {
    const result = await prisma.customer.aggregate({ where: { tenantId, isActive: true }, _sum: { balance: true } });
    return { value: money(result._sum.balance || 0), label: 'Customer Receivables', unit: 'money' };
  }
  if (dataSource === 'SUPPLIER_PAYABLES') {
    const result = await prisma.supplier.aggregate({ where: { tenantId, isActive: true }, _sum: { balance: true } });
    return { value: money(result._sum.balance || 0), label: 'Supplier Payables', unit: 'money' };
  }
  if (dataSource === 'OPEN_INVOICES') {
    const value = await prisma.invoice.count({ where: { tenantId, status: { in: ['UNPAID', 'PARTIAL'] } } });
    return { value, label: 'Open Invoices', unit: 'count' };
  }
  if (dataSource === 'OVERDUE_INVOICES') {
    const value = await prisma.invoice.count({ where: { tenantId, status: { in: ['UNPAID', 'PARTIAL'] }, dueDate: { lt: now } } });
    return { value, label: 'Overdue Invoices', unit: 'count' };
  }
  if (dataSource === 'LOW_STOCK_ITEMS') {
    const products = await prisma.product.findMany({ where: { tenantId, isActive: true }, select: { stockQty: true, reorderLevel: true } });
    const value = products.filter((p) => Number(p.reorderLevel || 0) > 0 && Number(p.stockQty || 0) <= Number(p.reorderLevel || 0)).length;
    return { value, label: 'Low Stock Items', unit: 'count' };
  }
  if (dataSource === 'INVENTORY_VALUE') {
    const products = await prisma.product.findMany({ where: { tenantId, isActive: true }, select: { stockQty: true, costPrice: true } });
    const value = products.reduce((sum, p) => sum + Number(p.stockQty || 0) * Number(p.costPrice || 0), 0);
    return { value: money(value), label: 'Inventory Value', unit: 'money' };
  }
  if (dataSource === 'PENDING_APPROVALS') {
    const value = await prisma.approvalRequest.count({ where: { tenantId, status: 'PENDING' } }).catch(() => 0);
    return { value, label: 'Pending Approvals', unit: 'count' };
  }
  if (dataSource === 'ACTIVE_PROJECTS') {
    const value = await prisma.project.count({ where: { tenantId, status: { in: ['ACTIVE', 'ON_HOLD'] } } }).catch(() => 0);
    return { value, label: 'Active Projects', unit: 'count' };
  }
  if (dataSource === 'OVERDUE_TASKS') {
    const value = await prisma.projectTask.count({ where: { tenantId, status: { notIn: ['DONE', 'CANCELLED'] }, dueAt: { lt: now } } }).catch(() => 0);
    return { value, label: 'Overdue Tasks', unit: 'count' };
  }
  return { value: 0, label: dataSource, unit: 'number' };
}

async function metricPayload(tenantId, dataSource) {
  if (dataSource === 'MONTHLY_SALES_SERIES') {
    const now = new Date();
    const series = [];
    for (let i = 5; i >= 0; i -= 1) {
      const start = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
      series.push({ label: monthLabel(start), value: await sumInvoiceTotal(tenantId, start, end) });
    }
    const value = series.length ? series[series.length - 1].value : 0;
    return { value, label: '6 Month Sales Trend', unit: 'money', series };
  }
  if (dataSource === 'TOP_PRODUCTS') {
    const rows = await prisma.invoiceItem.groupBy({ by: ['productId'], _sum: { total: true, qty: true }, orderBy: { _sum: { total: 'desc' } }, take: 8, where: { invoice: { tenantId, status: { not: 'CANCELLED' } } } }).catch(() => []);
    const productIds = rows.map((r) => r.productId).filter(Boolean);
    const products = productIds.length ? await prisma.product.findMany({ where: { id: { in: productIds }, tenantId }, select: { id: true, name: true, sku: true } }) : [];
    const map = new Map(products.map((p) => [p.id, p]));
    const table = rows.map((r) => ({ product: map.get(r.productId)?.name || 'Custom item', sku: map.get(r.productId)?.sku || '-', qty: Number(r._sum.qty || 0), total: money(r._sum.total || 0) }));
    return { value: table.reduce((sum, r) => sum + Number(r.total || 0), 0), label: 'Top Products', unit: 'money', rows: table };
  }
  if (dataSource === 'RECENT_TRANSACTIONS') {
    const rows = await prisma.bankTransaction.findMany({ where: { tenantId }, include: { bankAccount: true }, orderBy: { transactionDate: 'desc' }, take: 8 });
    const table = rows.map((r) => ({ date: r.transactionDate?.toISOString(), account: r.bankAccount?.name || '-', direction: r.direction, amount: money(r.amount), description: r.description }));
    return { value: table.reduce((sum, r) => sum + Number(r.amount || 0), 0), label: 'Recent Bank Transactions', unit: 'money', rows: table };
  }
  return simpleMetric(tenantId, dataSource);
}

const defaultWidgets = [
  { title: 'Today Sales', widgetType: 'KPI', dataSource: 'TODAY_SALES', chartType: 'NUMBER', gridX: 0, gridY: 0, gridW: 3, gridH: 2, sortOrder: 10 },
  { title: 'Month Sales', widgetType: 'KPI', dataSource: 'MONTH_SALES', chartType: 'NUMBER', gridX: 3, gridY: 0, gridW: 3, gridH: 2, sortOrder: 20 },
  { title: 'Cash + Bank', widgetType: 'KPI', dataSource: 'CASH_BANK_BALANCE', chartType: 'NUMBER', gridX: 6, gridY: 0, gridW: 3, gridH: 2, sortOrder: 30 },
  { title: 'Overdue Invoices', widgetType: 'ALERT', dataSource: 'OVERDUE_INVOICES', chartType: 'NUMBER', gridX: 9, gridY: 0, gridW: 3, gridH: 2, sortOrder: 40 },
  { title: 'Sales Trend', widgetType: 'CHART', dataSource: 'MONTHLY_SALES_SERIES', chartType: 'BAR', gridX: 0, gridY: 2, gridW: 6, gridH: 4, sortOrder: 50 },
  { title: 'Top Products', widgetType: 'TABLE', dataSource: 'TOP_PRODUCTS', chartType: 'BAR', gridX: 6, gridY: 2, gridW: 6, gridH: 4, sortOrder: 60 }
];

const defaultShortcuts = [
  { title: 'New Invoice', targetUrl: '/invoices', icon: 'receipt', color: 'purple', sortOrder: 10 },
  { title: 'POS', targetUrl: '/pos', icon: 'cart', color: 'green', sortOrder: 20 },
  { title: 'Customers', targetUrl: '/customers', icon: 'users', color: 'blue', sortOrder: 30 },
  { title: 'Reports', targetUrl: '/reports', icon: 'chart', color: 'orange', sortOrder: 40 }
];

async function ensureDefaultLayout(tenantId, userId) {
  let layout = await prisma.dashboardLayout.findFirst({ where: { tenantId, isDefault: true }, include: includeLayout() });
  if (!layout) {
    layout = await prisma.dashboardLayout.create({
      data: { tenantId, name: 'Owner Dashboard', description: 'Default executive dashboard for sales, cash, invoices and stock.', isDefault: true, visibility: 'ALL_ROLES', refreshInterval: 300, createdById: userId },
      include: includeLayout()
    });
  }
  if (!layout.widgets.length) {
    await prisma.dashboardWidget.createMany({ data: defaultWidgets.map((w, index) => ({ tenantId, layoutId: layout.id, widgetKey: w.dataSource, ...w, sortOrder: w.sortOrder || (index + 1) * 10 })) });
  }
  if (!layout.shortcuts.length) {
    await prisma.dashboardShortcut.createMany({ data: defaultShortcuts.map((s, index) => ({ tenantId, layoutId: layout.id, ...s, sortOrder: s.sortOrder || (index + 1) * 10 })) });
  }
  return prisma.dashboardLayout.findUnique({ where: { id: layout.id }, include: includeLayout() });
}

router.get('/library', requirePermission('dashboardbuilder:read'), (req, res) => {
  res.json({ widgetTypes: WIDGET_TYPES, chartTypes: CHART_TYPES, visibilities: VISIBILITIES, dataSources: DATA_SOURCES, defaultWidgets, defaultShortcuts });
});

router.get('/summary', requirePermission('dashboardbuilder:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [layouts, widgets, shortcuts, defaultLayout] = await Promise.all([
      prisma.dashboardLayout.count({ where: { tenantId } }),
      prisma.dashboardWidget.count({ where: { tenantId } }),
      prisma.dashboardShortcut.count({ where: { tenantId, isActive: true } }),
      prisma.dashboardLayout.findFirst({ where: { tenantId, isDefault: true }, include: includeLayout() })
    ]);
    const refreshedWidgets = await prisma.dashboardWidget.count({ where: { tenantId, lastRefreshedAt: { not: null } } });
    res.json({ layouts, widgets, activeShortcuts: shortcuts, refreshedWidgets, defaultLayout });
  } catch (e) { next(e); }
});

router.get('/metrics', requirePermission('dashboardbuilder:read'), async (req, res, next) => {
  try {
    const sources = String(req.query.sources || 'TODAY_SALES,MONTH_SALES,CASH_BANK_BALANCE,OVERDUE_INVOICES').split(',').map((s) => s.trim()).filter(Boolean);
    const metrics = [];
    for (const source of sources) metrics.push({ source, ...(await metricPayload(req.user.tenantId, source)) });
    res.json(metrics);
  } catch (e) { next(e); }
});

router.get('/layouts', requirePermission('dashboardbuilder:read'), async (req, res, next) => {
  try {
    const rows = await prisma.dashboardLayout.findMany({ where: { tenantId: req.user.tenantId }, include: includeLayout(), orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/layouts/:id', requirePermission('dashboardbuilder:read'), async (req, res, next) => {
  try {
    const row = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeLayout() });
    if (!row) return res.status(404).json({ message: 'Dashboard layout not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/defaults', requirePermission('dashboardbuilder:manage'), async (req, res, next) => {
  try {
    const layout = await ensureDefaultLayout(req.user.tenantId, req.user.id);
    await audit(req, 'CREATE_DEFAULTS', 'DashboardLayout', layout.id, null, layout);
    res.status(201).json(layout);
  } catch (e) { next(e); }
});

router.post('/layouts', requirePermission('dashboardbuilder:create'), async (req, res, next) => {
  try {
    const data = layoutSchema.parse(req.body);
    const layout = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.dashboardLayout.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.dashboardLayout.create({ data: { tenantId: req.user.tenantId, createdById: req.user.id, ...data }, include: includeLayout() });
    });
    await audit(req, 'CREATE', 'DashboardLayout', layout.id, null, layout);
    res.status(201).json(layout);
  } catch (e) { next(e); }
});

router.patch('/layouts/:id', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard layout not found' });
    const data = layoutSchema.partial().parse(req.body);
    const layout = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.dashboardLayout.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.dashboardLayout.update({ where: { id: before.id }, data, include: includeLayout() });
    });
    await audit(req, 'UPDATE', 'DashboardLayout', layout.id, before, layout);
    res.json(layout);
  } catch (e) { next(e); }
});

router.post('/layouts/:id/default', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard layout not found' });
    const layout = await prisma.$transaction(async (tx) => {
      await tx.dashboardLayout.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.dashboardLayout.update({ where: { id: before.id }, data: { isDefault: true }, include: includeLayout() });
    });
    await audit(req, 'SET_DEFAULT', 'DashboardLayout', layout.id, before, layout);
    res.json(layout);
  } catch (e) { next(e); }
});

router.delete('/layouts/:id', requirePermission('dashboardbuilder:manage'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard layout not found' });
    await prisma.dashboardLayout.delete({ where: { id: before.id } });
    await audit(req, 'DELETE', 'DashboardLayout', before.id, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/layouts/:id/widgets', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const layout = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!layout) return res.status(404).json({ message: 'Dashboard layout not found' });
    const data = widgetSchema.parse(req.body);
    const payload = await metricPayload(req.user.tenantId, data.dataSource).catch(() => ({ value: 0 }));
    const widget = await prisma.dashboardWidget.create({ data: { tenantId: req.user.tenantId, layoutId: layout.id, ...data, lastValue: money(payload.value || 0), lastPayload: payload, lastRefreshedAt: new Date() } });
    await audit(req, 'CREATE', 'DashboardWidget', widget.id, null, widget);
    res.status(201).json(widget);
  } catch (e) { next(e); }
});

router.patch('/widgets/:id', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardWidget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard widget not found' });
    const data = widgetSchema.partial().parse(req.body);
    const widget = await prisma.dashboardWidget.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'DashboardWidget', widget.id, before, widget);
    res.json(widget);
  } catch (e) { next(e); }
});

router.delete('/widgets/:id', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardWidget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard widget not found' });
    await prisma.dashboardWidget.delete({ where: { id: before.id } });
    await audit(req, 'DELETE', 'DashboardWidget', before.id, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/layouts/:id/shortcuts', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const layout = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!layout) return res.status(404).json({ message: 'Dashboard layout not found' });
    const data = shortcutSchema.parse(req.body);
    const shortcut = await prisma.dashboardShortcut.create({ data: { tenantId: req.user.tenantId, layoutId: layout.id, ...data } });
    await audit(req, 'CREATE', 'DashboardShortcut', shortcut.id, null, shortcut);
    res.status(201).json(shortcut);
  } catch (e) { next(e); }
});

router.patch('/shortcuts/:id', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardShortcut.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard shortcut not found' });
    const data = shortcutSchema.partial().parse(req.body);
    const shortcut = await prisma.dashboardShortcut.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'DashboardShortcut', shortcut.id, before, shortcut);
    res.json(shortcut);
  } catch (e) { next(e); }
});

router.delete('/shortcuts/:id', requirePermission('dashboardbuilder:update'), async (req, res, next) => {
  try {
    const before = await prisma.dashboardShortcut.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Dashboard shortcut not found' });
    await prisma.dashboardShortcut.delete({ where: { id: before.id } });
    await audit(req, 'DELETE', 'DashboardShortcut', before.id, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/layouts/:id/refresh', requirePermission('dashboardbuilder:read'), async (req, res, next) => {
  try {
    const layout = await prisma.dashboardLayout.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeLayout() });
    if (!layout) return res.status(404).json({ message: 'Dashboard layout not found' });
    const refreshed = [];
    for (const widget of layout.widgets.filter((w) => w.isVisible)) {
      const payload = await metricPayload(req.user.tenantId, widget.dataSource).catch((error) => ({ value: 0, label: widget.title, unit: 'number', error: error.message }));
      const saved = await prisma.dashboardWidget.update({ where: { id: widget.id }, data: { lastValue: money(payload.value || 0), lastPayload: payload, lastRefreshedAt: new Date() } });
      refreshed.push(saved);
    }
    if (refreshed.some((w) => ['OVERDUE_INVOICES', 'LOW_STOCK_ITEMS', 'OVERDUE_TASKS'].includes(w.dataSource) && Number(w.lastValue || 0) > 0)) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN'], type: 'WARNING', title: 'Dashboard needs attention', message: 'One or more dashboard alert widgets have active warnings.', priority: 'NORMAL', entityType: 'DashboardLayout', entityId: layout.id, actionUrl: '/dashboard-builder' });
    }
    const updated = await prisma.dashboardLayout.findUnique({ where: { id: layout.id }, include: includeLayout() });
    await audit(req, 'REFRESH', 'DashboardLayout', layout.id, null, { widgetCount: refreshed.length });
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
