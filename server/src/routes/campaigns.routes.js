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
router.use(planFeatureGuard('allowCampaigns', 'WhatsApp / email campaigns'));

const CHANNELS = ['EMAIL', 'WHATSAPP', 'SMS', 'IN_APP'];
const CAMPAIGN_STATUSES = ['DRAFT', 'READY', 'SCHEDULED', 'SENDING', 'SENT', 'PAUSED', 'CANCELLED'];
const AUDIENCE_TYPES = ['ALL_CUSTOMERS', 'ACTIVE_CUSTOMERS', 'HAS_BALANCE', 'LOYALTY_MEMBERS', 'DUE_INSTALLMENTS', 'SELECTED_CUSTOMERS'];

const templateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  channel: z.enum(CHANNELS).default('EMAIL'),
  subject: z.string().trim().max(180).optional().nullable(),
  body: z.string().trim().min(2).max(4000),
  isActive: z.boolean().optional().default(true)
});

const campaignSchema = z.object({
  templateId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2).max(160),
  channel: z.enum(CHANNELS).default('EMAIL'),
  audienceType: z.enum(AUDIENCE_TYPES).default('ALL_CUSTOMERS'),
  status: z.enum(CAMPAIGN_STATUSES).optional().default('DRAFT'),
  subject: z.string().trim().max(180).optional().nullable(),
  message: z.string().trim().min(2).max(4000),
  scheduledAt: z.coerce.date().optional().nullable(),
  notes: z.string().trim().max(1200).optional().nullable()
});

const importSchema = z.object({
  audienceType: z.enum(AUDIENCE_TYPES).optional(),
  customerIds: z.array(z.string().uuid()).optional().default([]),
  limit: z.coerce.number().int().min(1).max(1000).optional().default(500)
});

const quickReminderSchema = z.object({
  channel: z.enum(CHANNELS).default('WHATSAPP'),
  minBalance: z.coerce.number().nonnegative().default(1),
  message: z.string().trim().min(2).max(1200).optional().default('Hi {{customerName}}, your pending balance is {{balance}}. Please arrange payment soon. Thank you, {{businessName}}.')
});

function normalizePhone(phone) {
  return String(phone || '').replace(/[^0-9+]/g, '');
}

function recipientAddressFor(channel, customer) {
  if (channel === 'EMAIL') return customer.email || '';
  if (channel === 'IN_APP') return customer.id;
  return normalizePhone(customer.phone);
}

function renderMessage(text, context) {
  return String(text || '').replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (_, key) => {
    const value = context[key];
    return value === undefined || value === null ? '' : String(value);
  });
}

function campaignInclude() {
  return {
    template: true,
    recipients: { orderBy: { createdAt: 'desc' }, take: 250, include: { customer: true } }
  };
}

async function nextCampaignNo(tx, tenantId) {
  const count = await tx.marketingCampaign.count({ where: { tenantId } });
  return `CMP${String(count + 1001).padStart(4, '0')}`;
}

async function tenantName(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
  return tenant?.name || 'SmartLedger';
}

async function updateCampaignCounts(tx, campaignId) {
  const rows = await tx.campaignRecipient.groupBy({ by: ['status'], where: { campaignId }, _count: { status: true } });
  const totalRecipients = rows.reduce((sum, row) => sum + row._count.status, 0);
  const sentCount = rows.filter((row) => ['SENT', 'LOGGED'].includes(row.status)).reduce((sum, row) => sum + row._count.status, 0);
  const failedCount = rows.filter((row) => row.status === 'FAILED').reduce((sum, row) => sum + row._count.status, 0);
  return tx.marketingCampaign.update({ where: { id: campaignId }, data: { totalRecipients, sentCount, failedCount }, include: campaignInclude() });
}

async function customersForAudience({ tenantId, channel, audienceType, customerIds = [], limit = 500 }) {
  const where = { tenantId };
  if (audienceType === 'SELECTED_CUSTOMERS') where.id = { in: customerIds };
  if (audienceType === 'ACTIVE_CUSTOMERS' || audienceType === 'ALL_CUSTOMERS') where.isActive = true;
  if (audienceType === 'HAS_BALANCE') { where.isActive = true; where.balance = { gt: 0 }; }
  if (audienceType === 'LOYALTY_MEMBERS') { where.isActive = true; where.loyaltyAccount = { isNot: null }; }

  if (audienceType === 'DUE_INSTALLMENTS') {
    const today = new Date();
    const schedules = await prisma.installmentSchedule.findMany({
      where: { tenantId, status: { in: ['PENDING', 'PARTIAL', 'OVERDUE'] }, dueDate: { lte: today } },
      include: { plan: { include: { customer: true } } },
      orderBy: { dueDate: 'asc' },
      take: limit
    }).catch(() => []);
    const map = new Map();
    for (const s of schedules) {
      const c = s.plan?.customer;
      if (c?.id && !map.has(c.id)) map.set(c.id, { ...c, dueAmount: Number(s.balanceAmount || s.amount || 0), dueDate: s.dueDate });
    }
    return [...map.values()].filter((c) => recipientAddressFor(channel, c)).slice(0, limit);
  }

  if (channel === 'EMAIL') where.email = { not: null };
  if (['WHATSAPP', 'SMS'].includes(channel)) where.phone = { not: null };

  const rows = await prisma.customer.findMany({ where, orderBy: { name: 'asc' }, take: limit });
  return rows.filter((c) => recipientAddressFor(channel, c));
}

router.get('/summary', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const since = new Date();
    since.setDate(since.getDate() - 30);
    const [campaigns, sent, pending, templates, logs, recent] = await Promise.all([
      prisma.marketingCampaign.count({ where: { tenantId } }),
      prisma.campaignRecipient.count({ where: { tenantId, status: { in: ['SENT', 'LOGGED'] } } }),
      prisma.campaignRecipient.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.campaignTemplate.count({ where: { tenantId, isActive: true } }),
      prisma.communicationLog.count({ where: { tenantId, createdAt: { gte: since } } }).catch(() => 0),
      prisma.marketingCampaign.findFirst({ where: { tenantId }, orderBy: { createdAt: 'desc' } })
    ]);
    res.json({ campaigns, sentRecipients: sent, pendingRecipients: pending, activeTemplates: templates, logsLast30Days: logs, recentCampaign: recent });
  } catch (e) { next(e); }
});

router.get('/customers', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    const rows = await prisma.customer.findMany({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
        ...(q ? { OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q, mode: 'insensitive' } },
          { email: { contains: q, mode: 'insensitive' } }
        ] } : {})
      },
      orderBy: { name: 'asc' },
      take: 300
    });
    res.json(rows.map((c) => ({ ...c, balance: money(c.balance), foreignBalance: money(c.foreignBalance) })));
  } catch (e) { next(e); }
});

router.get('/templates', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const rows = await prisma.campaignTemplate.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }] });
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/templates', requirePermission('campaign:manage'), async (req, res, next) => {
  try {
    const data = templateSchema.parse(req.body);
    const row = await prisma.campaignTemplate.create({ data: { ...data, tenantId: req.user.tenantId } });
    await audit(req, 'CREATE', 'CampaignTemplate', row.id, null, row);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/templates/:id', requirePermission('campaign:manage'), async (req, res, next) => {
  try {
    const before = await prisma.campaignTemplate.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Template not found' });
    const data = templateSchema.partial().parse(req.body);
    const row = await prisma.campaignTemplate.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'CampaignTemplate', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/campaigns', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.channel) where.channel = String(req.query.channel).toUpperCase();
    const rows = await prisma.marketingCampaign.findMany({ where, include: { template: true, _count: { select: { recipients: true } } }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(rows);
  } catch (e) { next(e); }
});

router.get('/campaigns/:id', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const row = await prisma.marketingCampaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: campaignInclude() });
    if (!row) return res.status(404).json({ message: 'Campaign not found' });
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/campaigns', requirePermission('campaign:create'), async (req, res, next) => {
  try {
    const data = campaignSchema.parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      const template = data.templateId ? await tx.campaignTemplate.findFirst({ where: { id: data.templateId, tenantId: req.user.tenantId } }) : null;
      if (data.templateId && !template) throw Object.assign(new Error('Template not found'), { status: 404 });
      return tx.marketingCampaign.create({
        data: {
          ...data,
          templateId: template?.id || null,
          campaignNo: await nextCampaignNo(tx, req.user.tenantId),
          tenantId: req.user.tenantId,
          subject: data.subject || template?.subject || null,
          message: data.message || template?.body || '',
          createdById: req.user.id
        },
        include: campaignInclude()
      });
    });
    await audit(req, 'CREATE', 'MarketingCampaign', row.id, null, row);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/campaigns/:id', requirePermission('campaign:update'), async (req, res, next) => {
  try {
    const before = await prisma.marketingCampaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Campaign not found' });
    if (before.status === 'SENT') return res.status(400).json({ message: 'Sent campaign cannot be edited' });
    const data = campaignSchema.partial().parse(req.body);
    const row = await prisma.marketingCampaign.update({ where: { id: before.id }, data, include: campaignInclude() });
    await audit(req, 'UPDATE', 'MarketingCampaign', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/import-customers', requirePermission('campaign:update'), async (req, res, next) => {
  try {
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (campaign.status === 'SENT') return res.status(400).json({ message: 'Cannot import recipients into a sent campaign' });
    const data = importSchema.parse(req.body);
    const audienceType = data.audienceType || campaign.audienceType;
    const businessName = await tenantName(req.user.tenantId);
    const customers = await customersForAudience({ tenantId: req.user.tenantId, channel: campaign.channel, audienceType, customerIds: data.customerIds, limit: data.limit });

    const created = await prisma.$transaction(async (tx) => {
      let inserted = 0;
      for (const customer of customers) {
        const recipientAddress = recipientAddressFor(campaign.channel, customer);
        if (!recipientAddress) continue;
        await tx.campaignRecipient.upsert({
          where: { campaignId_recipientAddress: { campaignId: campaign.id, recipientAddress } },
          update: { customerId: customer.id, name: customer.name, phone: customer.phone, email: customer.email, channel: campaign.channel, status: 'PENDING', error: null },
          create: { tenantId: req.user.tenantId, campaignId: campaign.id, customerId: customer.id, name: customer.name, phone: customer.phone, email: customer.email, channel: campaign.channel, recipientAddress, status: 'PENDING' }
        });
        inserted += 1;
      }
      const row = await updateCampaignCounts(tx, campaign.id);
      await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { audienceType, status: row.totalRecipients > 0 ? 'READY' : 'DRAFT' } });
      return inserted;
    });

    const row = await prisma.marketingCampaign.findUnique({ where: { id: campaign.id }, include: campaignInclude() });
    await audit(req, 'IMPORT_RECIPIENTS', 'MarketingCampaign', campaign.id, null, { count: created, audienceType, businessName });
    res.json({ campaign: row, imported: created });
  } catch (e) { next(e); }
});

router.post('/campaigns/:id/send', requirePermission('campaign:send'), async (req, res, next) => {
  try {
    const campaign = await prisma.marketingCampaign.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { recipients: { where: { status: { in: ['PENDING', 'FAILED'] } }, include: { customer: true }, take: 1000 } } });
    if (!campaign) return res.status(404).json({ message: 'Campaign not found' });
    if (!campaign.recipients.length) return res.status(400).json({ message: 'No pending recipients to send' });

    const businessName = await tenantName(req.user.tenantId);
    const now = new Date();
    let sent = 0;
    let failed = 0;

    await prisma.$transaction(async (tx) => {
      await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { status: 'SENDING' } });
      for (const recipient of campaign.recipients) {
        try {
          const context = {
            customerName: recipient.customer?.name || recipient.name || 'Customer',
            phone: recipient.phone || '',
            email: recipient.email || '',
            balance: `LKR ${Number(recipient.customer?.balance || 0).toLocaleString()}`,
            loyaltyPoints: recipient.customer?.loyalty || 0,
            businessName
          };
          const message = renderMessage(campaign.message, context);
          const subject = renderMessage(campaign.subject || campaign.name, context);
          await tx.communicationLog.create({
            data: { tenantId: req.user.tenantId, channel: campaign.channel, recipient: recipient.recipientAddress, subject, message, status: 'LOGGED', provider: 'MANUAL', entityType: 'MarketingCampaign', entityId: campaign.id, createdById: req.user.id, sentAt: now }
          });
          await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'SENT', error: null, sentAt: now } });
          sent += 1;
        } catch (err) {
          failed += 1;
          await tx.campaignRecipient.update({ where: { id: recipient.id }, data: { status: 'FAILED', error: err.message || 'Send failed' } }).catch(() => null);
        }
      }
      await updateCampaignCounts(tx, campaign.id);
      await tx.marketingCampaign.update({ where: { id: campaign.id }, data: { status: failed > 0 ? 'READY' : 'SENT', sentAt: failed > 0 ? null : now } });
    });

    await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN'], type: failed ? 'WARNING' : 'SUCCESS', title: 'Campaign processed', message: `${campaign.campaignNo} logged ${sent} message(s), ${failed} failed.`, priority: failed ? 'HIGH' : 'NORMAL', entityType: 'MarketingCampaign', entityId: campaign.id, actionUrl: '/campaigns' });
    await audit(req, 'SEND', 'MarketingCampaign', campaign.id, null, { sent, failed });
    const row = await prisma.marketingCampaign.findUnique({ where: { id: campaign.id }, include: campaignInclude() });
    res.json({ campaign: row, sent, failed });
  } catch (e) { next(e); }
});

router.post('/quick-balance-reminders', requirePermission('campaign:send'), async (req, res, next) => {
  try {
    const data = quickReminderSchema.parse(req.body);
    const businessName = await tenantName(req.user.tenantId);
    const customers = await prisma.customer.findMany({ where: { tenantId: req.user.tenantId, isActive: true, balance: { gte: data.minBalance }, ...(data.channel === 'EMAIL' ? { email: { not: null } } : data.channel === 'IN_APP' ? {} : { phone: { not: null } }) }, orderBy: { balance: 'desc' }, take: 300 });
    let sent = 0;
    for (const customer of customers) {
      const recipient = recipientAddressFor(data.channel, customer);
      if (!recipient) continue;
      const message = renderMessage(data.message, { customerName: customer.name, balance: `LKR ${Number(customer.balance || 0).toLocaleString()}`, businessName, phone: customer.phone || '', email: customer.email || '' });
      await prisma.communicationLog.create({ data: { tenantId: req.user.tenantId, channel: data.channel, recipient, subject: 'Payment reminder', message, status: 'LOGGED', provider: 'MANUAL', entityType: 'Customer', entityId: customer.id, createdById: req.user.id, sentAt: new Date() } });
      sent += 1;
    }
    await audit(req, 'QUICK_BALANCE_REMINDERS', 'CommunicationLog', null, null, { sent, channel: data.channel, minBalance: data.minBalance });
    res.json({ sent });
  } catch (e) { next(e); }
});

router.get('/logs', requirePermission('campaign:read'), async (req, res, next) => {
  try {
    const rows = await prisma.communicationLog.findMany({ where: { tenantId: req.user.tenantId, ...(req.query.channel ? { channel: String(req.query.channel).toUpperCase() } : {}), ...(req.query.entityType ? { entityType: String(req.query.entityType) } : {}) }, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(rows);
  } catch (e) { next(e); }
});

export default router;
