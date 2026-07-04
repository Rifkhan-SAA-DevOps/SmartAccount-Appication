import { prisma } from '../lib/prisma.js';

export function startOfCurrentMonth(date = new Date()) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
}

export function normalizeDate(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function subscriptionEndDate(subscription) {
  if (!subscription) return null;
  if (subscription.status === 'trial') return subscription.trialEndsAt || null;
  return subscription.currentPeriodEndsAt || null;
}

export function isSubscriptionExpired(tenant, subscription, now = new Date()) {
  if (!tenant) return true;
  if (tenant.status === 'SUSPENDED' || tenant.status === 'EXPIRED') return true;
  if (!subscription) return true;

  const endDate = subscriptionEndDate(subscription);
  if (endDate && new Date(endDate).getTime() < now.getTime()) return true;
  return ['cancelled', 'expired', 'suspended'].includes(String(subscription.status || '').toLowerCase());
}

export function subscriptionBlockMessage(tenant, subscription) {
  if (!tenant) return 'Company account not found';
  if (tenant.status === 'SUSPENDED') return 'Company account suspended. Contact SaaS owner/admin.';
  if (tenant.status === 'EXPIRED') return 'Subscription expired. Upgrade or renew the plan to continue.';
  if (!subscription) return 'No active subscription plan found.';
  if (['cancelled', 'expired', 'suspended'].includes(String(subscription.status || '').toLowerCase())) {
    return `Subscription is ${subscription.status}. Renew the plan to continue.`;
  }
  const endDate = subscriptionEndDate(subscription);
  if (endDate && new Date(endDate).getTime() < Date.now()) {
    return 'Subscription period ended. Renew the plan to continue.';
  }
  return null;
}

export function planValue(plan, key, fallback = 0) {
  const value = plan?.[key];
  if (value === null || value === undefined) return fallback;
  return Number(value);
}

export async function getTenantUsage(tenantId, tx = prisma) {
  const monthStart = startOfCurrentMonth();
  const [users, products, invoicesThisMonth, branches, warehouses, documents, customers, suppliers, batches, serviceJobs, crmLeads, quotations, salesOrders, employees, payrollRuns, projects, projectTasks, installmentPlans, bankStatements, bankReconciliations, fixedAssets, currencies, exchangeRates, loyaltyAccounts, rewardVouchers, deliveryOrders, budgets, forecastScenarios, marketingCampaigns, campaignRecipients, campaignTemplates, dashboardLayouts, dashboardWidgets, dashboardShortcuts] = await Promise.all([
    tx.user.count({ where: { tenantId } }),
    tx.product.count({ where: { tenantId, isActive: true } }),
    tx.invoice.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
    tx.branch.count({ where: { tenantId } }),
    tx.warehouse.count({ where: { tenantId, isActive: true } }),
    tx.businessDocument.count({ where: { tenantId } }).catch(() => 0),
    tx.customer.count({ where: { tenantId, isActive: true } }),
    tx.supplier.count({ where: { tenantId, isActive: true } }),
    tx.productBatch.count({ where: { tenantId } }).catch(() => 0),
    tx.serviceJob.count({ where: { tenantId } }).catch(() => 0),
    tx.crmLead.count({ where: { tenantId } }).catch(() => 0),
    tx.quotation.count({ where: { tenantId } }).catch(() => 0),
    tx.salesOrder.count({ where: { tenantId } }).catch(() => 0),
    tx.employee.count({ where: { tenantId } }).catch(() => 0),
    tx.payrollRun.count({ where: { tenantId } }).catch(() => 0),
    tx.project.count({ where: { tenantId } }).catch(() => 0),
    tx.projectTask.count({ where: { tenantId } }).catch(() => 0),
    tx.installmentPlan.count({ where: { tenantId } }).catch(() => 0),
    tx.bankStatement.count({ where: { tenantId } }).catch(() => 0),
    tx.bankReconciliation.count({ where: { tenantId } }).catch(() => 0),
    tx.fixedAsset.count({ where: { tenantId } }).catch(() => 0),
    tx.currency.count({ where: { tenantId } }).catch(() => 0),
    tx.exchangeRate.count({ where: { tenantId } }).catch(() => 0),
    tx.loyaltyAccount.count({ where: { tenantId } }).catch(() => 0),
    tx.rewardVoucher.count({ where: { tenantId } }).catch(() => 0),
    tx.deliveryOrder.count({ where: { tenantId } }).catch(() => 0),
    tx.budget.count({ where: { tenantId } }).catch(() => 0),
    tx.forecastScenario.count({ where: { tenantId } }).catch(() => 0),
    tx.marketingCampaign.count({ where: { tenantId } }).catch(() => 0),
    tx.campaignRecipient.count({ where: { tenantId } }).catch(() => 0),
    tx.campaignTemplate.count({ where: { tenantId } }).catch(() => 0),
    tx.dashboardLayout.count({ where: { tenantId } }).catch(() => 0),
    tx.dashboardWidget.count({ where: { tenantId } }).catch(() => 0),
    tx.dashboardShortcut.count({ where: { tenantId } }).catch(() => 0)
  ]);
  return { users, products, invoicesThisMonth, branches, warehouses, documents, customers, suppliers, batches, serviceJobs, crmLeads, quotations, salesOrders, employees, payrollRuns, projects, projectTasks, installmentPlans, bankStatements, bankReconciliations, fixedAssets, currencies, exchangeRates, loyaltyAccounts, rewardVouchers, deliveryOrders, budgets, forecastScenarios, marketingCampaigns, campaignRecipients, campaignTemplates, dashboardLayouts, dashboardWidgets, dashboardShortcuts };
}

export function buildLimitSummary(plan, usage) {
  return {
    users: { used: usage.users, limit: planValue(plan, 'maxUsers', 1), reached: usage.users >= planValue(plan, 'maxUsers', 1) },
    products: { used: usage.products, limit: planValue(plan, 'maxProducts', 20), reached: usage.products >= planValue(plan, 'maxProducts', 20) },
    invoicesThisMonth: { used: usage.invoicesThisMonth, limit: planValue(plan, 'maxInvoicesPerMonth', 30), reached: usage.invoicesThisMonth >= planValue(plan, 'maxInvoicesPerMonth', 30) },
    branches: { used: usage.branches, limit: planValue(plan, 'maxBranches', 1), reached: usage.branches >= planValue(plan, 'maxBranches', 1) },
    warehouses: { used: usage.warehouses, limit: plan?.allowMultiWarehouse ? 'multi' : 1, reached: !plan?.allowMultiWarehouse && usage.warehouses >= 1 },
    batches: { used: usage.batches || 0, limit: plan?.allowBatchTracking ? 'enabled' : 0, reached: !plan?.allowBatchTracking && Number(usage.batches || 0) > 0 },
    serviceJobs: { used: usage.serviceJobs || 0, limit: plan?.allowServiceJobs ? 'enabled' : 0, reached: !plan?.allowServiceJobs && Number(usage.serviceJobs || 0) > 0 },
    crmLeads: { used: usage.crmLeads || 0, limit: plan?.allowCrm ? 'enabled' : 0, reached: !plan?.allowCrm && Number(usage.crmLeads || 0) > 0 },
    quotations: { used: usage.quotations || 0, limit: plan?.allowQuotations ? 'enabled' : 0, reached: !plan?.allowQuotations && Number(usage.quotations || 0) > 0 },
    salesOrders: { used: usage.salesOrders || 0, limit: plan?.allowQuotations ? 'enabled' : 0, reached: !plan?.allowQuotations && Number(usage.salesOrders || 0) > 0 },
    employees: { used: usage.employees || 0, limit: plan?.allowHrPayroll ? 'enabled' : 0, reached: !plan?.allowHrPayroll && Number(usage.employees || 0) > 0 },
    payrollRuns: { used: usage.payrollRuns || 0, limit: plan?.allowHrPayroll ? 'enabled' : 0, reached: !plan?.allowHrPayroll && Number(usage.payrollRuns || 0) > 0 },
    projects: { used: usage.projects || 0, limit: plan?.allowProjects ? 'enabled' : 0, reached: !plan?.allowProjects && Number(usage.projects || 0) > 0 },
    projectTasks: { used: usage.projectTasks || 0, limit: plan?.allowProjects ? 'enabled' : 0, reached: !plan?.allowProjects && Number(usage.projectTasks || 0) > 0 },
    installmentPlans: { used: usage.installmentPlans || 0, limit: plan?.allowInstallments ? 'enabled' : 0, reached: !plan?.allowInstallments && Number(usage.installmentPlans || 0) > 0 },
    bankStatements: { used: usage.bankStatements || 0, limit: plan?.allowBankReconciliation ? 'enabled' : 0, reached: !plan?.allowBankReconciliation && Number(usage.bankStatements || 0) > 0 },
    bankReconciliations: { used: usage.bankReconciliations || 0, limit: plan?.allowBankReconciliation ? 'enabled' : 0, reached: !plan?.allowBankReconciliation && Number(usage.bankReconciliations || 0) > 0 },
    fixedAssets: { used: usage.fixedAssets || 0, limit: plan?.allowFixedAssets ? 'enabled' : 0, reached: !plan?.allowFixedAssets && Number(usage.fixedAssets || 0) > 0 },
    currencies: { used: usage.currencies || 0, limit: plan?.allowMultiCurrency ? 'enabled' : 0, reached: !plan?.allowMultiCurrency && Number(usage.currencies || 0) > 1 },
    exchangeRates: { used: usage.exchangeRates || 0, limit: plan?.allowMultiCurrency ? 'enabled' : 0, reached: !plan?.allowMultiCurrency && Number(usage.exchangeRates || 0) > 0 },
    loyaltyAccounts: { used: usage.loyaltyAccounts || 0, limit: plan?.allowLoyalty ? 'enabled' : 0, reached: !plan?.allowLoyalty && Number(usage.loyaltyAccounts || 0) > 0 },
    rewardVouchers: { used: usage.rewardVouchers || 0, limit: plan?.allowLoyalty ? 'enabled' : 0, reached: !plan?.allowLoyalty && Number(usage.rewardVouchers || 0) > 0 },
    deliveryOrders: { used: usage.deliveryOrders || 0, limit: plan?.allowDelivery ? 'enabled' : 0, reached: !plan?.allowDelivery && Number(usage.deliveryOrders || 0) > 0 },
    budgets: { used: usage.budgets || 0, limit: plan?.allowBudgeting ? 'enabled' : 0, reached: !plan?.allowBudgeting && Number(usage.budgets || 0) > 0 },
    forecastScenarios: { used: usage.forecastScenarios || 0, limit: plan?.allowBudgeting ? 'enabled' : 0, reached: !plan?.allowBudgeting && Number(usage.forecastScenarios || 0) > 0 },
    marketingCampaigns: { used: usage.marketingCampaigns || 0, limit: plan?.allowCampaigns ? 'enabled' : 0, reached: !plan?.allowCampaigns && Number(usage.marketingCampaigns || 0) > 0 },
    campaignRecipients: { used: usage.campaignRecipients || 0, limit: plan?.allowCampaigns ? 'enabled' : 0, reached: !plan?.allowCampaigns && Number(usage.campaignRecipients || 0) > 0 },
    campaignTemplates: { used: usage.campaignTemplates || 0, limit: plan?.allowCampaigns ? 'enabled' : 0, reached: !plan?.allowCampaigns && Number(usage.campaignTemplates || 0) > 0 },
    dashboardLayouts: { used: usage.dashboardLayouts || 0, limit: plan?.allowDashboardBuilder ? 'enabled' : 0, reached: !plan?.allowDashboardBuilder && Number(usage.dashboardLayouts || 0) > 0 },
    dashboardWidgets: { used: usage.dashboardWidgets || 0, limit: plan?.allowDashboardBuilder ? 'enabled' : 0, reached: !plan?.allowDashboardBuilder && Number(usage.dashboardWidgets || 0) > 0 },
    dashboardShortcuts: { used: usage.dashboardShortcuts || 0, limit: plan?.allowDashboardBuilder ? 'enabled' : 0, reached: !plan?.allowDashboardBuilder && Number(usage.dashboardShortcuts || 0) > 0 }
  };
}

export function buildFeatureSummary(plan) {
  return {
    pos: Boolean(plan?.allowPos),
    inventory: Boolean(plan?.allowInventory),
    reports: Boolean(plan?.allowReports),
    advancedReports: Boolean(plan?.allowAdvancedReports),
    api: Boolean(plan?.allowApi),
    multiWarehouse: Boolean(plan?.allowMultiWarehouse),
    approvals: Boolean(plan?.allowApprovals),
    manufacturing: Boolean(plan?.allowManufacturing),
    batchTracking: Boolean(plan?.allowBatchTracking),
    serviceJobs: Boolean(plan?.allowServiceJobs),
    crm: Boolean(plan?.allowCrm),
    quotations: Boolean(plan?.allowQuotations),
    hrPayroll: Boolean(plan?.allowHrPayroll),
    projects: Boolean(plan?.allowProjects),
    installments: Boolean(plan?.allowInstallments),
    bankReconciliation: Boolean(plan?.allowBankReconciliation),
    fixedAssets: Boolean(plan?.allowFixedAssets),
    multiCurrency: Boolean(plan?.allowMultiCurrency),
    loyalty: Boolean(plan?.allowLoyalty),
    delivery: Boolean(plan?.allowDelivery),
    budgeting: Boolean(plan?.allowBudgeting),
    campaigns: Boolean(plan?.allowCampaigns),
    dashboardBuilder: Boolean(plan?.allowDashboardBuilder)
  };
}

export async function buildSubscriptionSummary(tenantId) {
  const subscription = await prisma.tenantSubscription.findUnique({
    where: { tenantId },
    include: { tenant: true, plan: true }
  });
  if (!subscription) return { subscription: null, usage: null, limits: null, features: null, blocked: true, blockMessage: 'No subscription found' };
  const usage = await getTenantUsage(tenantId);
  const blocked = isSubscriptionExpired(subscription.tenant, subscription);
  return {
    subscription,
    usage,
    limits: buildLimitSummary(subscription.plan, usage),
    features: buildFeatureSummary(subscription.plan),
    blocked,
    blockMessage: blocked ? subscriptionBlockMessage(subscription.tenant, subscription) : null
  };
}
