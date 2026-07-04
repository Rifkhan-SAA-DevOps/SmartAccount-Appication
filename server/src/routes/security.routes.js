import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);
router.use(requirePermission('security:read'));

const manualEventSchema = z.object({
  severity: z.enum(['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('INFO'),
  type: z.string().min(2).default('MANUAL_NOTE'),
  title: z.string().min(2),
  description: z.string().optional().nullable()
});

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
}

function buildLoginWhere(req) {
  const from = req.query.from ? new Date(req.query.from) : daysAgo(30);
  const status = req.query.status?.toString() || 'ALL';
  const userId = req.query.userId?.toString() || 'ALL';
  return {
    tenantId: req.user.tenantId,
    createdAt: { gte: from },
    ...(status !== 'ALL' ? { status } : {}),
    ...(userId !== 'ALL' ? { userId } : {})
  };
}

router.get('/summary', async (req, res, next) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sevenDays = daysAgo(7);

    const [users, loginsToday, failed7d, trustedDevices, untrustedDevices, recentLogins, recentEvents] = await Promise.all([
      prisma.user.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true }, orderBy: { name: 'asc' } }),
      prisma.loginHistory.count({ where: { tenantId: req.user.tenantId, status: 'SUCCESS', createdAt: { gte: today } } }),
      prisma.loginHistory.count({ where: { tenantId: req.user.tenantId, status: 'FAILED', createdAt: { gte: sevenDays } } }),
      prisma.trustedDevice.count({ where: { tenantId: req.user.tenantId, isTrusted: true, revokedAt: null } }),
      prisma.trustedDevice.count({ where: { tenantId: req.user.tenantId, isTrusted: false, revokedAt: null } }),
      prisma.loginHistory.findMany({ where: { tenantId: req.user.tenantId }, include: { user: { select: { name: true, email: true, role: true } } }, orderBy: { createdAt: 'desc' }, take: 8 }),
      prisma.securityEvent.findMany({ where: { tenantId: req.user.tenantId }, include: { user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' }, take: 8 })
    ]);

    let score = 100;
    if (failed7d > 0) score -= Math.min(30, failed7d * 4);
    if (untrustedDevices > 0) score -= Math.min(20, untrustedDevices * 3);
    if (users.some((u) => !u.isActive)) score -= 5;
    score = Math.max(0, score);

    res.json({
      score,
      users: users.length,
      activeUsers: users.filter((u) => u.isActive).length,
      disabledUsers: users.filter((u) => !u.isActive).length,
      loginsToday,
      failed7d,
      trustedDevices,
      untrustedDevices,
      usersList: users,
      recentLogins,
      recentEvents
    });
  } catch (e) { next(e); }
});

router.get('/login-history', async (req, res, next) => {
  try {
    const rows = await prisma.loginHistory.findMany({
      where: buildLoginWhere(req),
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.take || 200), 500)
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/devices', async (req, res, next) => {
  try {
    const rows = await prisma.trustedDevice.findMany({
      where: { tenantId: req.user.tenantId },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { lastSeenAt: 'desc' },
      take: 300
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/devices/:id/trust', requirePermission('security:manage'), async (req, res, next) => {
  try {
    const before = await prisma.trustedDevice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Device not found' });
    const device = await prisma.trustedDevice.update({ where: { id: before.id }, data: { isTrusted: true, revokedAt: null } });
    await prisma.securityEvent.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, severity: 'INFO', type: 'DEVICE_TRUSTED', title: 'Device marked as trusted', description: device.deviceName || device.deviceHash, ip: req.ip } });
    await audit(req, 'TRUST_DEVICE', 'TrustedDevice', device.id, before, device);
    res.json(device);
  } catch (e) { next(e); }
});

router.post('/devices/:id/revoke', requirePermission('security:manage'), async (req, res, next) => {
  try {
    const before = await prisma.trustedDevice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Device not found' });
    const device = await prisma.trustedDevice.update({ where: { id: before.id }, data: { isTrusted: false, revokedAt: new Date() } });
    await prisma.securityEvent.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, severity: 'HIGH', type: 'DEVICE_REVOKED', title: 'Device revoked', description: device.deviceName || device.deviceHash, ip: req.ip } });
    await audit(req, 'REVOKE_DEVICE', 'TrustedDevice', device.id, before, device);
    res.json(device);
  } catch (e) { next(e); }
});

router.get('/events', async (req, res, next) => {
  try {
    const severity = req.query.severity?.toString() || 'ALL';
    const rows = await prisma.securityEvent.findMany({
      where: { tenantId: req.user.tenantId, ...(severity !== 'ALL' ? { severity } : {}) },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.take || 200), 500)
    });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/events', requirePermission('security:manage'), async (req, res, next) => {
  try {
    const data = manualEventSchema.parse(req.body || {});
    const event = await prisma.securityEvent.create({ data: { tenantId: req.user.tenantId, userId: req.user.id, ...data } });
    await audit(req, 'CREATE', 'SecurityEvent', event.id, null, event);
    res.status(201).json(event);
  } catch (e) { next(e); }
});

export default router;
