import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);
router.use(requirePermission('audit:read'));

const cleanupSchema = z.object({
  days: z.coerce.number().int().min(30).max(3650).default(365)
});

function toDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
}

function buildWhere(req) {
  const from = toDate(req.query.from, new Date(new Date().setDate(new Date().getDate() - 30)));
  const to = toDate(req.query.to, new Date());
  const action = req.query.action?.toString() || 'ALL';
  const entity = req.query.entity?.toString() || 'ALL';
  const userId = req.query.userId?.toString() || 'ALL';
  const search = req.query.search?.toString()?.trim() || '';

  return {
    tenantId: req.user.tenantId,
    ...(from || to ? { createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    ...(action !== 'ALL' ? { action } : {}),
    ...(entity !== 'ALL' ? { entity } : {}),
    ...(userId !== 'ALL' ? { userId: userId === 'SYSTEM' ? null : userId } : {}),
    ...(search ? {
      OR: [
        { action: { contains: search, mode: 'insensitive' } },
        { entity: { contains: search, mode: 'insensitive' } },
        { entityId: { contains: search, mode: 'insensitive' } }
      ]
    } : {})
  };
}

router.get('/summary', async (req, res, next) => {
  try {
    const where = buildWhere(req);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [total, today, byAction, byEntity, users, latest] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.count({ where: { tenantId: req.user.tenantId, createdAt: { gte: todayStart } } }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { _all: true }
      }),
      prisma.auditLog.groupBy({
        by: ['entity'],
        where,
        _count: { _all: true }
      }),
      prisma.user.findMany({
        where: { tenantId: req.user.tenantId },
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: 'asc' }
      }),
      prisma.auditLog.findMany({
        where,
        include: { user: { select: { name: true, email: true, role: true } } },
        orderBy: { createdAt: 'desc' },
        take: 5
      })
    ]);

    res.json({
      total,
      today,
      byAction: byAction.map((item) => ({ action: item.action, count: item._count._all })).sort((a, b) => b.count - a.count).slice(0, 8),
      byEntity: byEntity.map((item) => ({ entity: item.entity, count: item._count._all })).sort((a, b) => b.count - a.count).slice(0, 8),
      users,
      latest
    });
  } catch (e) { next(e); }
});

router.get('/', async (req, res, next) => {
  try {
    const take = Math.min(Number(req.query.take || 150), 500);
    const logs = await prisma.auditLog.findMany({
      where: buildWhere(req),
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take
    });
    res.json(logs);
  } catch (e) { next(e); }
});

router.get('/export.csv', async (req, res, next) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: buildWhere(req),
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
      take: 1000
    });

    const escapeCsv = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const header = ['Time', 'User', 'Role', 'Action', 'Entity', 'Entity ID', 'IP'];
    const rows = logs.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.user?.email || 'System',
      log.user?.role || '-',
      log.action,
      log.entity,
      log.entityId || '',
      log.ip || ''
    ]);
    const csv = [header, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="smartledger-audit-${Date.now()}.csv"`);
    res.send(csv);
  } catch (e) { next(e); }
});

router.delete('/cleanup', requirePermission('audit:manage'), async (req, res, next) => {
  try {
    const data = cleanupSchema.parse(req.body || {});
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - data.days);
    const result = await prisma.auditLog.deleteMany({
      where: { tenantId: req.user.tenantId, createdAt: { lt: cutoff } }
    });
    await audit(req, 'CLEANUP', 'AuditLog', null, null, { deleted: result.count, olderThanDays: data.days });
    res.json({ deleted: result.count, olderThanDays: data.days });
  } catch (e) { next(e); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const log = await prisma.auditLog.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { user: { select: { name: true, email: true, role: true } } }
    });
    if (!log) return res.status(404).json({ message: 'Audit log not found' });
    res.json(log);
  } catch (e) { next(e); }
});

export default router;
