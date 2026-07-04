import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import { createNotification, ensureReminderSetting, generateBusinessAlerts } from '../utils/notifications.js';
import { buildWhatsAppLink, logWhatsAppMessage, sendEmailMessage } from '../utils/messaging.js';

const router = Router();
router.use(authRequired);

const notificationSchema = z.object({
  userId: z.string().optional().nullable(),
  type: z.enum(['INFO', 'SUCCESS', 'WARNING', 'DANGER']).default('INFO'),
  title: z.string().min(2),
  message: z.string().min(2),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  actionUrl: z.string().optional().nullable(),
  metadata: z.any().optional().nullable()
});

const settingsSchema = z.object({
  lowStockEnabled: z.boolean().optional(),
  customerCreditEnabled: z.boolean().optional(),
  supplierPaymentEnabled: z.boolean().optional(),
  approvalEnabled: z.boolean().optional(),
  subscriptionEnabled: z.boolean().optional(),
  emailEnabled: z.boolean().optional(),
  whatsappEnabled: z.boolean().optional(),
  reminderDaysBeforeDue: z.coerce.number().int().min(0).max(60).optional(),
  whatsappDefaultPhone: z.string().optional().nullable(),
  dailySummaryEmail: z.string().optional().nullable()
});

const sendSchema = z.object({
  recipient: z.string().min(3),
  subject: z.string().optional().nullable(),
  message: z.string().min(2),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable()
});

router.get('/summary', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const personalWhere = { tenantId, OR: [{ userId: null }, { userId: req.user.id }] };
    const [unread, urgent, warnings, latest, logsToday] = await Promise.all([
      prisma.notification.count({ where: { ...personalWhere, isRead: false } }),
      prisma.notification.count({ where: { ...personalWhere, isRead: false, priority: { in: ['HIGH', 'URGENT'] } } }),
      prisma.notification.count({ where: { ...personalWhere, isRead: false, type: { in: ['WARNING', 'DANGER'] } } }),
      prisma.notification.findMany({
        where: personalWhere,
        orderBy: { createdAt: 'desc' },
        take: 8
      }),
      prisma.communicationLog.count({
        where: {
          tenantId,
          createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) }
        }
      })
    ]);
    res.json({ unread, urgent, warnings, logsToday, latest });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const status = req.query.status?.toString() || 'ALL';
    const type = req.query.type?.toString() || 'ALL';
    const priority = req.query.priority?.toString() || 'ALL';
    const mineOnly = req.query.mine === 'true';
    const take = Math.min(Number(req.query.take || 100), 300);

    const notifications = await prisma.notification.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(mineOnly ? { userId: req.user.id } : { OR: [{ userId: null }, { userId: req.user.id }] }),
        ...(status === 'UNREAD' ? { isRead: false } : {}),
        ...(status === 'READ' ? { isRead: true } : {}),
        ...(type !== 'ALL' ? { type } : {}),
        ...(priority !== 'ALL' ? { priority } : {})
      },
      include: { user: { select: { name: true, email: true, role: true } } },
      orderBy: [{ isRead: 'asc' }, { createdAt: 'desc' }],
      take
    });
    res.json(notifications);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('notification:create'), async (req, res, next) => {
  try {
    const data = notificationSchema.parse(req.body);
    let userId = data.userId || null;
    if (userId) {
      const user = await prisma.user.findFirst({ where: { id: userId, tenantId: req.user.tenantId } });
      if (!user) return res.status(404).json({ message: 'Notification user not found in this company' });
    }
    const notification = await createNotification({ tenantId: req.user.tenantId, userId, ...data, dedupe: false });
    await audit(req, 'CREATE', 'Notification', notification.id, null, notification);
    res.status(201).json(notification);
  } catch (e) { next(e); }
});

router.put('/:id/read', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const before = await prisma.notification.findFirst({
      where: {
        id: req.params.id,
        tenantId: req.user.tenantId,
        OR: [{ userId: null }, { userId: req.user.id }]
      }
    });
    if (!before) return res.status(404).json({ message: 'Notification not found' });
    const notification = await prisma.notification.update({
      where: { id: before.id },
      data: { isRead: true, readAt: new Date() }
    });
    res.json(notification);
  } catch (e) { next(e); }
});

router.put('/read-all', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const result = await prisma.notification.updateMany({
      where: { tenantId: req.user.tenantId, isRead: false, OR: [{ userId: null }, { userId: req.user.id }] },
      data: { isRead: true, readAt: new Date() }
    });
    res.json({ updated: result.count });
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('notification:manage'), async (req, res, next) => {
  try {
    const before = await prisma.notification.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Notification not found' });
    await prisma.notification.delete({ where: { id: before.id } });
    await audit(req, 'DELETE', 'Notification', before.id, before, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/generate-alerts', requirePermission('notification:manage'), async (req, res, next) => {
  try {
    const created = await generateBusinessAlerts(req.user.tenantId);
    await audit(req, 'GENERATE_ALERTS', 'Notification', null, null, { count: created.length });
    res.json({ created: created.length, notifications: created.slice(0, 20) });
  } catch (e) { next(e); }
});

router.get('/settings/reminders', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const settings = await ensureReminderSetting(req.user.tenantId);
    res.json(settings);
  } catch (e) { next(e); }
});

router.put('/settings/reminders', requirePermission('notification:manage'), async (req, res, next) => {
  try {
    const data = settingsSchema.parse(req.body);
    const before = await ensureReminderSetting(req.user.tenantId);
    const settings = await prisma.reminderSetting.update({
      where: { tenantId: req.user.tenantId },
      data: {
        ...(data.lowStockEnabled !== undefined ? { lowStockEnabled: data.lowStockEnabled } : {}),
        ...(data.customerCreditEnabled !== undefined ? { customerCreditEnabled: data.customerCreditEnabled } : {}),
        ...(data.supplierPaymentEnabled !== undefined ? { supplierPaymentEnabled: data.supplierPaymentEnabled } : {}),
        ...(data.approvalEnabled !== undefined ? { approvalEnabled: data.approvalEnabled } : {}),
        ...(data.subscriptionEnabled !== undefined ? { subscriptionEnabled: data.subscriptionEnabled } : {}),
        ...(data.emailEnabled !== undefined ? { emailEnabled: data.emailEnabled } : {}),
        ...(data.whatsappEnabled !== undefined ? { whatsappEnabled: data.whatsappEnabled } : {}),
        ...(data.reminderDaysBeforeDue !== undefined ? { reminderDaysBeforeDue: data.reminderDaysBeforeDue } : {}),
        ...(data.whatsappDefaultPhone !== undefined ? { whatsappDefaultPhone: data.whatsappDefaultPhone || null } : {}),
        ...(data.dailySummaryEmail !== undefined ? { dailySummaryEmail: data.dailySummaryEmail || null } : {})
      }
    });
    await audit(req, 'UPDATE', 'ReminderSetting', settings.id, before, settings);
    res.json(settings);
  } catch (e) { next(e); }
});

router.get('/communication-logs', requirePermission('notification:read'), async (req, res, next) => {
  try {
    const channel = req.query.channel?.toString() || 'ALL';
    const logs = await prisma.communicationLog.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(channel !== 'ALL' ? { channel } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(logs);
  } catch (e) { next(e); }
});

router.post('/send-email', requirePermission('notification:send'), async (req, res, next) => {
  try {
    const data = sendSchema.parse(req.body);
    const setting = await ensureReminderSetting(req.user.tenantId);
    if (!setting.emailEnabled) return res.status(403).json({ message: 'Email reminders are disabled in Notification Settings' });
    const log = await sendEmailMessage({
      tenantId: req.user.tenantId,
      to: data.recipient,
      subject: data.subject || 'SmartLedger Reminder',
      message: data.message,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      createdById: req.user.id
    });
    await audit(req, 'SEND_EMAIL', 'CommunicationLog', log.id, null, log);
    res.status(201).json(log);
  } catch (e) { next(e); }
});

router.post('/send-whatsapp', requirePermission('notification:send'), async (req, res, next) => {
  try {
    const data = sendSchema.parse(req.body);
    const setting = await ensureReminderSetting(req.user.tenantId);
    if (!setting.whatsappEnabled) return res.status(403).json({ message: 'WhatsApp reminders are disabled in Notification Settings' });
    const log = await logWhatsAppMessage({
      tenantId: req.user.tenantId,
      to: data.recipient,
      message: data.message,
      entityType: data.entityType || null,
      entityId: data.entityId || null,
      createdById: req.user.id
    });
    await audit(req, 'SEND_WHATSAPP_LINK', 'CommunicationLog', log.id, null, log);
    res.status(201).json({ ...log, whatsappLink: buildWhatsAppLink(data.recipient, data.message) });
  } catch (e) { next(e); }
});

export default router;
