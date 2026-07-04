import { verifyToken } from '../lib/jwt.js';
import { prisma } from '../lib/prisma.js';
import { isSubscriptionExpired, subscriptionBlockMessage } from '../utils/subscriptionUsage.js';

function isAllowedWhenExpired(req) {
  const path = `${req.baseUrl || ''}${req.path || ''}`;
  if (req.method === 'GET' && (path.startsWith('/api/auth/me') || path.startsWith('/api/subscriptions'))) return true;
  if (req.method === 'GET' && path.startsWith('/api/settings')) return true;
  if (req.method === 'GET' && path.startsWith('/api/tenants/profile')) return true;
  return false;
}

async function markExpiredIfNeeded(user) {
  const subscription = user.tenant?.subscription;
  if (!subscription) return user;
  const expired = isSubscriptionExpired(user.tenant, subscription);
  if (!expired) return user;
  if (user.tenant.status !== 'EXPIRED' && user.tenant.status !== 'SUSPENDED') {
    const [tenant] = await Promise.all([
      prisma.tenant.update({ where: { id: user.tenantId }, data: { status: 'EXPIRED' } }),
      prisma.tenantSubscription.update({ where: { tenantId: user.tenantId }, data: { status: 'expired' } }).catch(() => null)
    ]);
    user.tenant.status = tenant.status;
    if (user.tenant.subscription) user.tenant.subscription.status = 'expired';
  }
  return user;
}

export async function authRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Authentication required' });

    const payload = verifyToken(token);
    if (!payload.userId) return res.status(401).json({ message: 'Invalid tenant user token' });

    let user = await prisma.user.findUnique({
      where: { id: payload.userId },
      include: { tenant: { include: { subscription: { include: { plan: true } } } } }
    });

    if (!user || !user.isActive) return res.status(401).json({ message: 'Invalid or inactive user' });
    user = await markExpiredIfNeeded(user);

    const blockMessage = subscriptionBlockMessage(user.tenant, user.tenant?.subscription);
    if (blockMessage && !isAllowedWhenExpired(req)) {
      return res.status(user.tenant.status === 'SUSPENDED' ? 403 : 402).json({
        message: blockMessage,
        code: user.tenant.status === 'SUSPENDED' ? 'TENANT_SUSPENDED' : 'SUBSCRIPTION_REQUIRED'
      });
    }

    req.user = {
      id: user.id,
      tenantId: user.tenantId,
      name: user.name,
      email: user.email,
      role: user.role,
      tenant: user.tenant
    };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
