import { prisma } from '../lib/prisma.js';
import { buildLimitSummary, buildSubscriptionSummary, getTenantUsage, subscriptionBlockMessage } from '../utils/subscriptionUsage.js';

function activePlanOrResponse(req, res) {
  const plan = req.user?.tenant?.subscription?.plan;
  const blockMessage = subscriptionBlockMessage(req.user?.tenant, req.user?.tenant?.subscription);
  if (blockMessage) {
    res.status(req.user?.tenant?.status === 'SUSPENDED' ? 403 : 402).json({ message: blockMessage, code: 'SUBSCRIPTION_REQUIRED' });
    return null;
  }
  if (!plan) {
    res.status(403).json({ message: 'No active subscription plan' });
    return null;
  }
  return plan;
}

export function planFeatureGuard(featureName, label = featureName) {
  return (req, res, next) => {
    const plan = activePlanOrResponse(req, res);
    if (!plan) return;
    if (!plan[featureName]) {
      return res.status(403).json({
        message: `Your current plan does not allow ${label}`,
        code: 'FEATURE_LOCKED',
        feature: featureName,
        plan: plan.code
      });
    }
    next();
  };
}

export function limitGuard(limitType) {
  return async (req, res, next) => {
    const plan = activePlanOrResponse(req, res);
    if (!plan) return;

    if (limitType === 'users') {
      const count = await prisma.user.count({ where: { tenantId: req.user.tenantId } });
      if (count >= Number(plan.maxUsers || 1)) {
        return res.status(403).json({ message: `User limit reached for ${plan.name} plan`, code: 'LIMIT_REACHED', limitType, used: count, limit: plan.maxUsers });
      }
    }

    if (limitType === 'products') {
      const count = await prisma.product.count({ where: { tenantId: req.user.tenantId, isActive: true } });
      if (count >= Number(plan.maxProducts || 0)) {
        return res.status(403).json({ message: `Product limit reached for ${plan.name} plan`, code: 'LIMIT_REACHED', limitType, used: count, limit: plan.maxProducts });
      }
    }

    if (limitType === 'invoices') {
      const start = new Date();
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      const count = await prisma.invoice.count({ where: { tenantId: req.user.tenantId, createdAt: { gte: start } } });
      if (count >= Number(plan.maxInvoicesPerMonth || 0)) {
        return res.status(403).json({ message: `Monthly invoice limit reached for ${plan.name} plan`, code: 'LIMIT_REACHED', limitType, used: count, limit: plan.maxInvoicesPerMonth });
      }
    }

    if (limitType === 'branches') {
      const count = await prisma.branch.count({ where: { tenantId: req.user.tenantId } });
      if (count >= Number(plan.maxBranches || 1)) {
        return res.status(403).json({ message: `Branch limit reached for ${plan.name} plan`, code: 'LIMIT_REACHED', limitType, used: count, limit: plan.maxBranches });
      }
    }

    if (limitType === 'warehouses') {
      const count = await prisma.warehouse.count({ where: { tenantId: req.user.tenantId, isActive: true } });
      if (count >= 1 && !plan.allowMultiWarehouse) {
        return res.status(403).json({ message: 'Your current plan does not allow multiple warehouses', code: 'FEATURE_LOCKED', limitType });
      }
    }

    next();
  };
}

export async function subscriptionStatus(req, res) {
  const summary = await buildSubscriptionSummary(req.user.tenantId);
  res.json(summary);
}

export async function planUsage(req, res) {
  const plan = req.user?.tenant?.subscription?.plan;
  const usage = await getTenantUsage(req.user.tenantId);
  res.json({ usage, limits: buildLimitSummary(plan, usage) });
}
