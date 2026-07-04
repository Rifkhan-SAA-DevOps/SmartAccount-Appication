import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { buildSubscriptionSummary, getTenantUsage, buildLimitSummary, buildFeatureSummary } from '../utils/subscriptionUsage.js';

const router = Router();

router.get('/plans', async (req, res, next) => {
  try {
    const plans = await prisma.subscriptionPlan.findMany({ orderBy: { monthlyPrice: 'asc' } });
    res.json(plans);
  } catch (e) { next(e); }
});

router.get('/current', authRequired, requirePermission('subscription:read'), async (req, res, next) => {
  try {
    const summary = await buildSubscriptionSummary(req.user.tenantId);
    res.json(summary);
  } catch (e) { next(e); }
});

router.get('/usage', authRequired, requirePermission('subscription:read'), async (req, res, next) => {
  try {
    const subscription = await prisma.tenantSubscription.findUnique({ where: { tenantId: req.user.tenantId }, include: { plan: true } });
    const usage = await getTenantUsage(req.user.tenantId);
    res.json({ usage, limits: buildLimitSummary(subscription?.plan, usage), features: buildFeatureSummary(subscription?.plan) });
  } catch (e) { next(e); }
});

export default router;
