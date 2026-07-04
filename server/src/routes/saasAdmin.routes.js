import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { platformAdminRequired, platformLoginHandler } from '../middleware/platformAuth.js';
import { getTenantUsage, normalizeDate } from '../utils/subscriptionUsage.js';

const router = Router();

router.post('/login', (req, res, next) => {
  try { platformLoginHandler(req, res); } catch (e) { next(e); }
});

router.use(platformAdminRequired);

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + Number(days));
  return date;
}

function planSelect() {
  return {
    id: true,
    code: true,
    name: true,
    monthlyPrice: true,
    maxUsers: true,
    maxProducts: true,
    maxInvoicesPerMonth: true,
    maxBranches: true,
    allowPos: true,
    allowInventory: true,
    allowReports: true,
    allowAdvancedReports: true,
    allowApi: true,
    allowMultiWarehouse: true,
    allowApprovals: true,
    allowManufacturing: true,
    allowBatchTracking: true,
    allowServiceJobs: true,
    allowCrm: true,
    allowQuotations: true,
    allowHrPayroll: true,
    allowProjects: true,
    allowInstallments: true,
    allowBankReconciliation: true,
    allowFixedAssets: true,
    allowMultiCurrency: true,
    allowLoyalty: true,
    allowDelivery: true,
    allowBudgeting: true,
    allowCampaigns: true,
    allowDashboardBuilder: true
  };
}

router.get('/me', (req, res) => {
  res.json({ admin: req.platformAdmin });
});

router.get('/overview', async (req, res, next) => {
  try {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const [tenantTotal, active, trial, suspended, expired, users, invoicesThisMonth, products, documents, subscriptions] = await Promise.all([
      prisma.tenant.count(),
      prisma.tenant.count({ where: { status: 'ACTIVE' } }),
      prisma.tenant.count({ where: { status: 'TRIAL' } }),
      prisma.tenant.count({ where: { status: 'SUSPENDED' } }),
      prisma.tenant.count({ where: { status: 'EXPIRED' } }),
      prisma.user.count(),
      prisma.invoice.count({ where: { createdAt: { gte: monthStart } } }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.businessDocument.count().catch(() => 0),
      prisma.tenantSubscription.findMany({ include: { plan: true } })
    ]);

    const monthlyRecurringRevenue = subscriptions
      .filter((s) => ['active', 'paid'].includes(String(s.status || '').toLowerCase()))
      .reduce((sum, s) => sum + Number(s.plan?.monthlyPrice || 0), 0);

    const expiringSoon = subscriptions.filter((s) => {
      const end = s.status === 'trial' ? s.trialEndsAt : s.currentPeriodEndsAt;
      if (!end) return false;
      const days = (new Date(end).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      return days >= 0 && days <= 7;
    }).length;

    res.json({
      tenants: { total: tenantTotal, active, trial, suspended, expired },
      usage: { users, invoicesThisMonth, products, documents },
      billing: { monthlyRecurringRevenue, expiringSoon }
    });
  } catch (e) { next(e); }
});

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { monthlyPrice: 'asc' }, select: planSelect() });
    res.json(plans);
  } catch (e) { next(e); }
});

const planSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(40).transform((v) => v.toUpperCase().replace(/[^A-Z0-9_]/g, '_')),
  monthlyPrice: z.coerce.number().nonnegative().default(0),
  maxUsers: z.coerce.number().int().positive().default(1),
  maxProducts: z.coerce.number().int().positive().default(20),
  maxInvoicesPerMonth: z.coerce.number().int().positive().default(30),
  maxBranches: z.coerce.number().int().positive().default(1),
  allowPos: z.boolean().default(false),
  allowInventory: z.boolean().default(true),
  allowReports: z.boolean().default(true),
  allowAdvancedReports: z.boolean().default(false),
  allowApi: z.boolean().default(false),
  allowMultiWarehouse: z.boolean().default(false),
  allowApprovals: z.boolean().default(false),
  allowManufacturing: z.boolean().default(false),
  allowBatchTracking: z.boolean().default(false),
  allowServiceJobs: z.boolean().default(false),
  allowCrm: z.boolean().default(false),
  allowQuotations: z.boolean().default(false),
  allowHrPayroll: z.boolean().default(false),
  allowProjects: z.boolean().default(false),
  allowInstallments: z.boolean().default(false),
  allowBankReconciliation: z.boolean().default(false),
  allowFixedAssets: z.boolean().default(false),
  allowMultiCurrency: z.boolean().default(false),
  allowLoyalty: z.boolean().default(false),
  allowDelivery: z.boolean().default(false),
  allowBudgeting: z.boolean().default(false),
  allowCampaigns: z.boolean().default(false),
  allowDashboardBuilder: z.boolean().default(false)
});

router.post('/plans', async (req, res, next) => {
  try {
    const data = planSchema.parse(req.body);
    const plan = await prisma.subscriptionPlan.create({ data, select: planSelect() });
    res.status(201).json(plan);
  } catch (e) { next(e); }
});

router.patch('/plans/:id', async (req, res, next) => {
  try {
    const data = planSchema.partial().parse(req.body);
    const plan = await prisma.subscriptionPlan.update({ where: { id: req.params.id }, data, select: planSelect() });
    res.json(plan);
  } catch (e) { next(e); }
});

router.get('/tenants', async (req, res, next) => {
  try {
    const q = req.query.q?.toString().trim();
    const status = req.query.status?.toString();
    const tenants = await prisma.tenant.findMany({
      where: {
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { code: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } }
        ] } : {})
      },
      include: {
        subscription: { include: { plan: { select: planSelect() } } },
        _count: { select: { users: true, products: true, invoices: true, customers: true, suppliers: true, documents: true, serviceJobs: true, loyaltyAccounts: true, crmLeads: true, fixedAssets: true, currencies: true, exchangeRates: true, quotations: true, salesOrders: true, employees: true, payrollRuns: true, projects: true, projectTasks: true, installmentPlans: true, bankStatements: true, bankReconciliations: true, deliveryOrders: true, marketingCampaigns: true, campaignRecipients: true, campaignTemplates: true, dashboardLayouts: true, dashboardWidgets: true, dashboardShortcuts: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(tenants);
  } catch (e) { next(e); }
});

router.get('/tenants/:id', async (req, res, next) => {
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { id: req.params.id },
      include: {
        subscription: { include: { plan: { select: planSelect() } } },
        users: { select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } },
        branches: { include: { warehouses: true } },
        _count: { select: { customers: true, suppliers: true, products: true, invoices: true, purchaseOrders: true, documents: true, serviceJobs: true, loyaltyAccounts: true, crmLeads: true, fixedAssets: true, currencies: true, exchangeRates: true, quotations: true, salesOrders: true, employees: true, payrollRuns: true, projects: true, projectTasks: true, installmentPlans: true, bankStatements: true, bankReconciliations: true, deliveryOrders: true, marketingCampaigns: true, campaignRecipients: true, campaignTemplates: true, dashboardLayouts: true, dashboardWidgets: true, dashboardShortcuts: true } }
      }
    });
    if (!tenant) return res.status(404).json({ message: 'Company not found' });
    const usage = await getTenantUsage(tenant.id);
    res.json({ tenant, usage });
  } catch (e) { next(e); }
});

router.patch('/tenants/:id/status', async (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED']) }).parse(req.body);
    const tenant = await prisma.tenant.update({ where: { id: req.params.id }, data: { status }, include: { subscription: { include: { plan: true } } } });
    if (tenant.subscription) {
      const subscriptionStatus = status === 'ACTIVE' ? 'active' : status === 'TRIAL' ? 'trial' : status.toLowerCase();
      await prisma.tenantSubscription.update({ where: { tenantId: tenant.id }, data: { status: subscriptionStatus } }).catch(() => null);
    }
    res.json(tenant);
  } catch (e) { next(e); }
});

router.patch('/tenants/:id/subscription', async (req, res, next) => {
  try {
    const data = z.object({
      planId: z.string().uuid().optional(),
      planCode: z.string().optional(),
      status: z.enum(['trial', 'active', 'paid', 'expired', 'suspended', 'cancelled']).optional(),
      trialEndsAt: z.string().optional().nullable(),
      currentPeriodEndsAt: z.string().optional().nullable()
    }).parse(req.body);

    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    let planId = data.planId;
    if (!planId && data.planCode) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { code: data.planCode } });
      if (!plan) return res.status(404).json({ message: 'Plan not found' });
      planId = plan.id;
    }

    if (!planId) {
      const fallbackPlan = await prisma.subscriptionPlan.findFirst({ orderBy: { monthlyPrice: 'asc' } });
      if (!fallbackPlan) return res.status(404).json({ message: 'No subscription plans found. Create a plan first.' });
      planId = fallbackPlan.id;
    }

    const subscription = await prisma.tenantSubscription.upsert({
      where: { tenantId: tenant.id },
      create: {
        tenantId: tenant.id,
        planId,
        status: data.status || 'trial',
        trialEndsAt: normalizeDate(data.trialEndsAt),
        currentPeriodEndsAt: normalizeDate(data.currentPeriodEndsAt)
      },
      update: {
        ...(planId ? { planId } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.trialEndsAt !== undefined ? { trialEndsAt: normalizeDate(data.trialEndsAt) } : {}),
        ...(data.currentPeriodEndsAt !== undefined ? { currentPeriodEndsAt: normalizeDate(data.currentPeriodEndsAt) } : {})
      },
      include: { plan: true }
    });

    const tenantStatus = subscription.status === 'trial' ? 'TRIAL' : ['active', 'paid'].includes(subscription.status) ? 'ACTIVE' : subscription.status === 'suspended' ? 'SUSPENDED' : 'EXPIRED';
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: tenantStatus } });
    res.json(subscription);
  } catch (e) { next(e); }
});

router.post('/tenants/:id/extend-trial', async (req, res, next) => {
  try {
    const { days } = z.object({ days: z.coerce.number().int().min(1).max(365).default(14) }).parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id }, include: { subscription: true } });
    if (!tenant) return res.status(404).json({ message: 'Company not found' });
    if (!tenant.subscription) return res.status(404).json({ message: 'Subscription not found' });

    const base = tenant.subscription.trialEndsAt && new Date(tenant.subscription.trialEndsAt).getTime() > Date.now()
      ? new Date(tenant.subscription.trialEndsAt)
      : new Date();
    base.setDate(base.getDate() + days);

    const [subscription] = await Promise.all([
      prisma.tenantSubscription.update({ where: { tenantId: tenant.id }, data: { status: 'trial', trialEndsAt: base }, include: { plan: true } }),
      prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'TRIAL' } })
    ]);
    res.json(subscription);
  } catch (e) { next(e); }
});

router.post('/tenants/:id/renew', async (req, res, next) => {
  try {
    const { months, planId, planCode } = z.object({ months: z.coerce.number().int().min(1).max(36).default(1), planId: z.string().uuid().optional(), planCode: z.string().optional() }).parse(req.body);
    const tenant = await prisma.tenant.findUnique({ where: { id: req.params.id } });
    if (!tenant) return res.status(404).json({ message: 'Company not found' });

    let finalPlanId = planId;
    if (!finalPlanId && planCode) {
      const plan = await prisma.subscriptionPlan.findUnique({ where: { code: planCode } });
      if (!plan) return res.status(404).json({ message: 'Plan not found' });
      finalPlanId = plan.id;
    }

    const current = await prisma.tenantSubscription.findUnique({ where: { tenantId: tenant.id } });
    const base = current?.currentPeriodEndsAt && new Date(current.currentPeriodEndsAt).getTime() > Date.now()
      ? new Date(current.currentPeriodEndsAt)
      : new Date();
    base.setMonth(base.getMonth() + months);

    const subscription = await prisma.tenantSubscription.update({
      where: { tenantId: tenant.id },
      data: { status: 'active', currentPeriodEndsAt: base, ...(finalPlanId ? { planId: finalPlanId } : {}) },
      include: { plan: true }
    });
    await prisma.tenant.update({ where: { id: tenant.id }, data: { status: 'ACTIVE' } });
    res.json(subscription);
  } catch (e) { next(e); }
});

export default router;
