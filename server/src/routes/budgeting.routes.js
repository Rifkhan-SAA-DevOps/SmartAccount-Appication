import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowBudgeting', 'budgeting / forecasting'));

const BUDGET_STATUSES = ['DRAFT', 'ACTIVE', 'APPROVED', 'CLOSED', 'CANCELLED'];
const PERIOD_TYPES = ['MONTHLY', 'QUARTERLY', 'YEARLY'];
const LINE_TYPES = ['INCOME', 'EXPENSE', 'CASH_INFLOW', 'CASH_OUTFLOW', 'OTHER'];
const SCENARIO_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'];

const budgetSchema = z.object({
  name: z.string().trim().min(2).max(160),
  fiscalYear: z.coerce.number().int().min(2000).max(2100),
  periodType: z.enum(PERIOD_TYPES).optional().default('MONTHLY'),
  status: z.enum(BUDGET_STATUSES).optional().default('DRAFT'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  notes: z.string().trim().max(1500).optional().nullable()
});

const budgetLineSchema = z.object({
  ledgerAccountId: z.string().uuid().optional().nullable(),
  lineType: z.enum(LINE_TYPES),
  periodMonth: z.coerce.number().int().min(1).max(12).optional().nullable(),
  periodLabel: z.string().trim().max(80).optional().nullable(),
  description: z.string().trim().min(1).max(240),
  budgetAmount: z.coerce.number().nonnegative(),
  alertPercent: z.coerce.number().positive().max(999).optional().default(100),
  notes: z.string().trim().max(700).optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(BUDGET_STATUSES),
  notes: z.string().trim().max(1000).optional().nullable()
});

const scenarioSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.string().trim().max(80).optional().default('CASH_FLOW'),
  status: z.enum(SCENARIO_STATUSES).optional().default('DRAFT'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  openingCash: z.coerce.number().optional().default(0),
  growthRate: z.coerce.number().optional().default(0),
  collectionDays: z.coerce.number().int().nonnegative().optional().default(0),
  paymentDays: z.coerce.number().int().nonnegative().optional().default(0),
  notes: z.string().trim().max(1500).optional().nullable()
});

const forecastGenerateSchema = z.object({
  months: z.coerce.number().int().min(1).max(36).optional().default(12),
  monthlySales: z.coerce.number().nonnegative().optional().default(0),
  monthlyOtherInflows: z.coerce.number().nonnegative().optional().default(0),
  monthlyPurchases: z.coerce.number().nonnegative().optional().default(0),
  monthlyPayroll: z.coerce.number().nonnegative().optional().default(0),
  monthlyExpenses: z.coerce.number().nonnegative().optional().default(0),
  growthRate: z.coerce.number().optional().nullable()
});

function includeBudget() {
  return {
    lines: { include: { ledgerAccount: true }, orderBy: [{ periodMonth: 'asc' }, { createdAt: 'asc' }] }
  };
}

function ym(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function endOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1, 0, 0, 0, 0);
}

async function nextBudgetNo(tx, tenantId) {
  const count = await tx.budget.count({ where: { tenantId } });
  return `BUD${String(count + 1001).padStart(4, '0')}`;
}

async function nextScenarioNo(tx, tenantId) {
  const count = await tx.forecastScenario.count({ where: { tenantId } });
  return `FC${String(count + 1001).padStart(4, '0')}`;
}

async function recalcBudgetTotals(tx, budgetId) {
  const lines = await tx.budgetLine.findMany({ where: { budgetId } });
  const totalIncomeBudget = money(lines.filter((l) => ['INCOME', 'CASH_INFLOW'].includes(l.lineType)).reduce((sum, l) => sum + Number(l.budgetAmount || 0), 0));
  const totalExpenseBudget = money(lines.filter((l) => ['EXPENSE', 'CASH_OUTFLOW'].includes(l.lineType)).reduce((sum, l) => sum + Number(l.budgetAmount || 0), 0));
  return tx.budget.update({ where: { id: budgetId }, data: { totalIncomeBudget, totalExpenseBudget }, include: includeBudget() });
}

function signedActual(line) {
  const debit = Number(line.debit || 0);
  const credit = Number(line.credit || 0);
  const normal = line.ledgerAccount?.normalBalance || 'DEBIT';
  return normal === 'CREDIT' ? credit - debit : debit - credit;
}

async function budgetVariance(tx, budget) {
  const lines = budget.lines || await tx.budgetLine.findMany({ where: { budgetId: budget.id }, include: { ledgerAccount: true } });
  const accountIds = [...new Set(lines.map((l) => l.ledgerAccountId).filter(Boolean))];
  const actualByAccount = new Map();
  if (accountIds.length) {
    const journalLines = await tx.journalEntryLine.findMany({
      where: {
        ledgerAccountId: { in: accountIds },
        journalEntry: { tenantId: budget.tenantId, status: 'POSTED', entryDate: { gte: budget.startDate, lte: budget.endDate } }
      },
      include: { ledgerAccount: true }
    });
    for (const line of journalLines) {
      actualByAccount.set(line.ledgerAccountId, money((actualByAccount.get(line.ledgerAccountId) || 0) + signedActual(line)));
    }
  }

  const rows = lines.map((line) => {
    const actualAmount = line.ledgerAccountId ? money(actualByAccount.get(line.ledgerAccountId) || 0) : 0;
    const variance = money(Number(line.budgetAmount || 0) - actualAmount);
    const usedPercent = Number(line.budgetAmount || 0) > 0 ? money((actualAmount / Number(line.budgetAmount || 0)) * 100) : 0;
    const isOverBudget = ['EXPENSE', 'CASH_OUTFLOW'].includes(line.lineType) && Number(line.budgetAmount || 0) > 0 && actualAmount > Number(line.budgetAmount || 0) * (Number(line.alertPercent || 100) / 100);
    return {
      ...line,
      budgetAmount: money(line.budgetAmount),
      actualAmount,
      variance,
      usedPercent,
      isOverBudget,
      ledgerName: line.ledgerAccount ? `${line.ledgerAccount.code} · ${line.ledgerAccount.name}` : 'Manual line'
    };
  });
  const totalBudget = money(rows.reduce((sum, r) => sum + Number(r.budgetAmount || 0), 0));
  const totalActual = money(rows.reduce((sum, r) => sum + Number(r.actualAmount || 0), 0));
  const totalVariance = money(totalBudget - totalActual);
  return { rows, totalBudget, totalActual, totalVariance, overBudgetCount: rows.filter((r) => r.isOverBudget).length };
}

router.get('/summary', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const [activeBudgets, draftBudgets, scenarios, currentBudget, recentForecast] = await Promise.all([
      prisma.budget.count({ where: { tenantId, status: { in: ['ACTIVE', 'APPROVED'] } } }),
      prisma.budget.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.forecastScenario.count({ where: { tenantId } }),
      prisma.budget.findFirst({ where: { tenantId, startDate: { lte: now }, endDate: { gte: now }, status: { in: ['ACTIVE', 'APPROVED'] } }, include: includeBudget(), orderBy: { createdAt: 'desc' } }),
      prisma.forecastScenario.findFirst({ where: { tenantId }, include: { lines: { orderBy: { periodStart: 'asc' }, take: 24 } }, orderBy: { createdAt: 'desc' } })
    ]);
    const variance = currentBudget ? await budgetVariance(prisma, currentBudget) : null;
    const closingCash = recentForecast?.lines?.length ? Number(recentForecast.lines[recentForecast.lines.length - 1].closingCash || 0) : 0;
    res.json({ activeBudgets, draftBudgets, scenarios, currentBudget: currentBudget ? { id: currentBudget.id, budgetNo: currentBudget.budgetNo, name: currentBudget.name, totalIncomeBudget: money(currentBudget.totalIncomeBudget), totalExpenseBudget: money(currentBudget.totalExpenseBudget), overBudgetCount: variance?.overBudgetCount || 0, totalVariance: variance?.totalVariance || 0 } : null, recentForecast: recentForecast ? { id: recentForecast.id, scenarioNo: recentForecast.scenarioNo, name: recentForecast.name, closingCash: money(closingCash), lineCount: recentForecast.lines.length } : null });
  } catch (e) { next(e); }
});

router.get('/accounts', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const rows = await prisma.ledgerAccount.findMany({ where: { tenantId: req.user.tenantId, isActive: true, type: { in: ['INCOME', 'EXPENSE', 'COST_OF_GOODS_SOLD'] } }, orderBy: [{ type: 'asc' }, { code: 'asc' }] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/budgets', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.fiscalYear) where.fiscalYear = Number(req.query.fiscalYear);
    const rows = await prisma.budget.findMany({ where, include: { lines: true }, orderBy: [{ fiscalYear: 'desc' }, { createdAt: 'desc' }], take: 200 });
    res.json(rows.map((row) => ({ ...row, totalIncomeBudget: money(row.totalIncomeBudget), totalExpenseBudget: money(row.totalExpenseBudget), lineCount: row.lines.length })));
  } catch (e) { next(e); }
});

router.get('/budgets/:id', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const row = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBudget() });
    if (!row) return res.status(404).json({ message: 'Budget not found' });
    const variance = await budgetVariance(prisma, row);
    res.json({ ...row, totalIncomeBudget: money(row.totalIncomeBudget), totalExpenseBudget: money(row.totalExpenseBudget), variance });
  } catch (e) { next(e); }
});

router.post('/budgets', requirePermission('budget:create'), async (req, res, next) => {
  try {
    const data = budgetSchema.parse(req.body);
    if (data.endDate < data.startDate) return res.status(400).json({ message: 'End date must be after start date' });
    const budget = await prisma.$transaction(async (tx) => {
      const budgetNo = await nextBudgetNo(tx, req.user.tenantId);
      return tx.budget.create({ data: { tenantId: req.user.tenantId, budgetNo, createdById: req.user.id, ...data }, include: includeBudget() });
    });
    await audit(req, 'CREATE', 'Budget', budget.id, null, budget);
    res.status(201).json(budget);
  } catch (e) { next(e); }
});

router.patch('/budgets/:id', requirePermission('budget:update'), async (req, res, next) => {
  try {
    const data = budgetSchema.partial().parse(req.body);
    if (data.startDate && data.endDate && data.endDate < data.startDate) return res.status(400).json({ message: 'End date must be after start date' });
    const before = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Budget not found' });
    const budget = await prisma.budget.update({ where: { id: before.id }, data, include: includeBudget() });
    await audit(req, 'UPDATE', 'Budget', budget.id, before, budget);
    res.json(budget);
  } catch (e) { next(e); }
});

router.patch('/budgets/:id/status', requirePermission('budget:approve'), async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const before = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Budget not found' });
    const extra = data.status === 'APPROVED' ? { approvedById: req.user.id, approvedAt: new Date() } : data.status === 'CLOSED' ? { closedAt: new Date() } : {};
    const budget = await prisma.budget.update({ where: { id: before.id }, data: { status: data.status, notes: data.notes ?? before.notes, ...extra }, include: includeBudget() });
    await audit(req, 'STATUS', 'Budget', budget.id, before, budget);
    res.json(budget);
  } catch (e) { next(e); }
});

router.post('/budgets/:id/lines', requirePermission('budget:update'), async (req, res, next) => {
  try {
    const data = budgetLineSchema.parse(req.body);
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    if (data.ledgerAccountId) {
      const account = await prisma.ledgerAccount.findFirst({ where: { id: data.ledgerAccountId, tenantId: req.user.tenantId, isActive: true } });
      if (!account) return res.status(404).json({ message: 'Ledger account not found' });
    }
    const line = await prisma.$transaction(async (tx) => {
      const saved = await tx.budgetLine.create({ data: { tenantId: req.user.tenantId, budgetId: budget.id, ...data, ledgerAccountId: data.ledgerAccountId || null, periodMonth: data.periodMonth || null, periodLabel: data.periodLabel || null, budgetAmount: money(data.budgetAmount), alertPercent: money(data.alertPercent || 100) }, include: { ledgerAccount: true } });
      await recalcBudgetTotals(tx, budget.id);
      return saved;
    });
    await audit(req, 'CREATE_LINE', 'Budget', budget.id, null, line);
    res.status(201).json(line);
  } catch (e) { next(e); }
});

router.delete('/budget-lines/:lineId', requirePermission('budget:update'), async (req, res, next) => {
  try {
    const line = await prisma.budgetLine.findFirst({ where: { id: req.params.lineId, tenantId: req.user.tenantId } });
    if (!line) return res.status(404).json({ message: 'Budget line not found' });
    await prisma.$transaction(async (tx) => {
      await tx.budgetLine.delete({ where: { id: line.id } });
      await recalcBudgetTotals(tx, line.budgetId);
    });
    await audit(req, 'DELETE_LINE', 'BudgetLine', line.id, line, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/budgets/:id/variance', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBudget() });
    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    res.json(await budgetVariance(prisma, budget));
  } catch (e) { next(e); }
});

router.post('/budgets/:id/alerts', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBudget() });
    if (!budget) return res.status(404).json({ message: 'Budget not found' });
    const variance = await budgetVariance(prisma, budget);
    let created = 0;
    for (const line of variance.rows.filter((r) => r.isOverBudget)) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'], type: 'WARNING', title: 'Budget exceeded', message: `${line.description} is ${line.usedPercent}% used. Budget ${money(line.budgetAmount)}, actual ${money(line.actualAmount)}.`, priority: 'HIGH', entityType: 'Budget', entityId: budget.id, actionUrl: '/budgeting' });
      created += 1;
    }
    res.json({ created, overBudgetCount: variance.overBudgetCount });
  } catch (e) { next(e); }
});

router.get('/scenarios', requirePermission('budget:read'), async (req, res, next) => {
  try {
    const rows = await prisma.forecastScenario.findMany({ where: { tenantId: req.user.tenantId }, include: { lines: { orderBy: { periodStart: 'asc' }, take: 36 } }, orderBy: { createdAt: 'desc' }, take: 120 });
    res.json(rows.map((row) => ({ ...row, openingCash: money(row.openingCash), growthRate: Number(row.growthRate || 0), lineCount: row.lines.length, finalClosingCash: row.lines.length ? money(row.lines[row.lines.length - 1].closingCash) : money(row.openingCash) })));
  } catch (e) { next(e); }
});

router.post('/scenarios', requirePermission('budget:create'), async (req, res, next) => {
  try {
    const data = scenarioSchema.parse(req.body);
    if (data.endDate < data.startDate) return res.status(400).json({ message: 'End date must be after start date' });
    const scenario = await prisma.$transaction(async (tx) => {
      const scenarioNo = await nextScenarioNo(tx, req.user.tenantId);
      return tx.forecastScenario.create({ data: { tenantId: req.user.tenantId, scenarioNo, createdById: req.user.id, ...data, openingCash: money(data.openingCash), growthRate: money(data.growthRate) }, include: { lines: true } });
    });
    await audit(req, 'CREATE', 'ForecastScenario', scenario.id, null, scenario);
    res.status(201).json(scenario);
  } catch (e) { next(e); }
});

router.patch('/scenarios/:id', requirePermission('budget:update'), async (req, res, next) => {
  try {
    const data = scenarioSchema.partial().parse(req.body);
    const before = await prisma.forecastScenario.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Forecast scenario not found' });
    const row = await prisma.forecastScenario.update({ where: { id: before.id }, data: { ...data, openingCash: data.openingCash === undefined ? undefined : money(data.openingCash), growthRate: data.growthRate === undefined ? undefined : money(data.growthRate) }, include: { lines: true } });
    await audit(req, 'UPDATE', 'ForecastScenario', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/scenarios/:id/generate-cash-flow', requirePermission('budget:update'), async (req, res, next) => {
  try {
    const data = forecastGenerateSchema.parse(req.body);
    const scenario = await prisma.forecastScenario.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!scenario) return res.status(404).json({ message: 'Forecast scenario not found' });
    const growth = Number(data.growthRate ?? scenario.growthRate ?? 0) / 100;
    const start = new Date(scenario.startDate);
    let closing = Number(scenario.openingCash || 0);
    const lines = [];
    for (let i = 0; i < data.months; i += 1) {
      const periodStart = addMonths(start, i);
      const periodEnd = endOfMonth(periodStart);
      const factor = Math.pow(1 + growth, i);
      const expectedInflows = money((Number(data.monthlySales || 0) + Number(data.monthlyOtherInflows || 0)) * factor);
      const expectedOutflows = money((Number(data.monthlyPurchases || 0) + Number(data.monthlyPayroll || 0) + Number(data.monthlyExpenses || 0)) * factor);
      const netCashFlow = money(expectedInflows - expectedOutflows);
      closing = money(closing + netCashFlow);
      lines.push({ tenantId: req.user.tenantId, scenarioId: scenario.id, periodStart, periodEnd, periodLabel: ym(periodStart), expectedInflows, expectedOutflows, netCashFlow, closingCash: closing, notes: `Generated cash-flow forecast month ${i + 1}` });
    }
    const result = await prisma.$transaction(async (tx) => {
      await tx.cashFlowForecastLine.deleteMany({ where: { scenarioId: scenario.id } });
      await tx.cashFlowForecastLine.createMany({ data: lines });
      return tx.forecastScenario.findUnique({ where: { id: scenario.id }, include: { lines: { orderBy: { periodStart: 'asc' } } } });
    });
    await audit(req, 'GENERATE_CASH_FLOW', 'ForecastScenario', scenario.id, scenario, result);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
