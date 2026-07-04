import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowCrm', 'CRM / leads / follow-up pipeline'));

const LEAD_STATUSES = ['OPEN', 'FOLLOW_UP', 'QUOTED', 'WON', 'LOST', 'ARCHIVED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const ACTIVITY_TYPES = ['NOTE', 'CALL', 'EMAIL', 'WHATSAPP', 'MEETING', 'TASK', 'QUOTE', 'OTHER'];

const stageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  sortOrder: z.coerce.number().int().min(0).default(0),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  color: z.string().trim().max(40).optional().nullable(),
  isWon: z.boolean().default(false),
  isLost: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

const leadSchema = z.object({
  stageId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  companyName: z.string().trim().max(160).optional().nullable(),
  contactName: z.string().trim().min(2).max(160),
  phone: z.string().trim().max(40).optional().nullable(),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  source: z.string().trim().min(1).max(80).default('Walk-in'),
  status: z.enum(LEAD_STATUSES).default('OPEN'),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  probability: z.coerce.number().int().min(0).max(100).default(0),
  expectedValue: z.coerce.number().nonnegative().default(0),
  expectedCloseDate: z.coerce.date().optional().nullable(),
  nextFollowUpAt: z.coerce.date().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2500).optional().nullable()
});

const updateLeadSchema = leadSchema.partial().extend({
  lostReason: z.string().trim().max(500).optional().nullable()
});

const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default('NOTE'),
  subject: z.string().trim().min(2).max(180),
  notes: z.string().trim().max(1500).optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  outcome: z.string().trim().max(500).optional().nullable(),
  completed: z.boolean().optional().default(false)
});

function cleanLeadInput(data, partial = false) {
  const cleaned = { ...data };
  for (const key of ['email', 'companyName', 'phone', 'customerId', 'stageId', 'assignedToId', 'expectedCloseDate', 'nextFollowUpAt', 'lostReason']) {
    if (cleaned[key] === '') cleaned[key] = null;
    if (!partial && cleaned[key] === undefined) cleaned[key] = null;
  }
  if (cleaned.expectedValue !== undefined) cleaned.expectedValue = money(cleaned.expectedValue || 0);
  Object.keys(cleaned).forEach((key) => { if (cleaned[key] === undefined) delete cleaned[key]; });
  return cleaned;
}

function normalizeLead(row) {
  return {
    ...row,
    expectedValue: money(row.expectedValue),
    weightedValue: money(Number(row.expectedValue || 0) * Number(row.probability || 0) / 100),
    customerName: row.customer?.name || '',
    stageName: row.stage?.name || 'No stage',
    overdueFollowUp: row.nextFollowUpAt ? new Date(row.nextFollowUpAt).getTime() < Date.now() && !['WON', 'LOST', 'ARCHIVED'].includes(row.status) : false,
    activityCount: row.activities?.length || 0
  };
}

async function nextLeadNo(tx, tenantId) {
  const count = await tx.crmLead.count({ where: { tenantId } });
  return `LEAD${String(count + 1001).padStart(4, '0')}`;
}

async function defaultStage(tx, tenantId) {
  let stage = await tx.crmPipelineStage.findFirst({ where: { tenantId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  if (!stage) {
    const defaults = [
      { name: 'New', sortOrder: 10, probability: 10 },
      { name: 'Contacted', sortOrder: 20, probability: 25 },
      { name: 'Quoted', sortOrder: 30, probability: 50 },
      { name: 'Negotiation', sortOrder: 40, probability: 75 },
      { name: 'Won', sortOrder: 90, probability: 100, isWon: true },
      { name: 'Lost', sortOrder: 99, probability: 0, isLost: true }
    ];
    for (const item of defaults) await tx.crmPipelineStage.create({ data: { tenantId, ...item } });
    stage = await tx.crmPipelineStage.findFirst({ where: { tenantId, isActive: true }, orderBy: { sortOrder: 'asc' } });
  }
  return stage;
}

async function verifyStage(tx, tenantId, stageId) {
  if (!stageId) return null;
  const stage = await tx.crmPipelineStage.findFirst({ where: { id: stageId, tenantId, isActive: true } });
  if (!stage) throw Object.assign(new Error('CRM stage not found'), { status: 404 });
  return stage;
}

async function verifyCustomer(tx, tenantId, customerId) {
  if (!customerId) return null;
  const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
  return customer;
}

router.get('/summary', requirePermission('crm:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(nextWeek.getDate() + 7);
    const [openLeads, wonLeads, lostLeads, overdueFollowUps, upcomingFollowUps, rows, stageRows] = await Promise.all([
      prisma.crmLead.count({ where: { tenantId, status: { in: ['OPEN', 'FOLLOW_UP', 'QUOTED'] } } }),
      prisma.crmLead.count({ where: { tenantId, status: 'WON' } }),
      prisma.crmLead.count({ where: { tenantId, status: 'LOST' } }),
      prisma.crmLead.count({ where: { tenantId, nextFollowUpAt: { lt: now }, status: { notIn: ['WON', 'LOST', 'ARCHIVED'] } } }),
      prisma.crmLead.count({ where: { tenantId, nextFollowUpAt: { gte: now, lte: nextWeek }, status: { notIn: ['WON', 'LOST', 'ARCHIVED'] } } }),
      prisma.crmLead.findMany({ where: { tenantId }, include: { stage: true, customer: true, activities: { orderBy: { createdAt: 'desc' }, take: 2 } }, orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.crmPipelineStage.findMany({ where: { tenantId, isActive: true }, orderBy: { sortOrder: 'asc' }, include: { leads: true } })
    ]);
    const pipelineValue = rows.filter((r) => !['WON', 'LOST', 'ARCHIVED'].includes(r.status)).reduce((sum, r) => sum + Number(r.expectedValue || 0), 0);
    const weightedValue = rows.filter((r) => !['WON', 'LOST', 'ARCHIVED'].includes(r.status)).reduce((sum, r) => sum + Number(r.expectedValue || 0) * Number(r.probability || 0) / 100, 0);
    const stageSummary = stageRows.map((stage) => ({ id: stage.id, name: stage.name, probability: stage.probability, count: stage.leads.length, value: money(stage.leads.reduce((sum, lead) => sum + Number(lead.expectedValue || 0), 0)) }));
    res.json({ openLeads, wonLeads, lostLeads, overdueFollowUps, upcomingFollowUps, pipelineValue: money(pipelineValue), weightedValue: money(weightedValue), stageSummary, recentLeads: rows.slice(0, 8).map(normalizeLead) });
  } catch (e) { next(e); }
});

router.get('/stages', requirePermission('crm:read'), async (req, res, next) => {
  try {
    await prisma.$transaction((tx) => defaultStage(tx, req.user.tenantId));
    const stages = await prisma.crmPipelineStage.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    res.json(stages);
  } catch (e) { next(e); }
});

router.post('/stages', requirePermission('crm:manage'), async (req, res, next) => {
  try {
    const data = stageSchema.parse(req.body);
    const stage = await prisma.crmPipelineStage.create({ data: { tenantId: req.user.tenantId, ...data } });
    await audit(req, 'CREATE', 'CrmPipelineStage', stage.id, null, stage);
    res.status(201).json(stage);
  } catch (e) { next(e); }
});

router.patch('/stages/:id', requirePermission('crm:manage'), async (req, res, next) => {
  try {
    const before = await prisma.crmPipelineStage.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'CRM stage not found' });
    const data = stageSchema.partial().parse(req.body);
    const stage = await prisma.crmPipelineStage.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'CrmPipelineStage', stage.id, before, stage);
    res.json(stage);
  } catch (e) { next(e); }
});

router.get('/leads', requirePermission('crm:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.priority) where.priority = String(req.query.priority).toUpperCase();
    if (req.query.stageId) where.stageId = String(req.query.stageId);
    if (req.query.source) where.source = String(req.query.source);
    if (req.query.followup === 'overdue') where.nextFollowUpAt = { lt: new Date() };
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { leadNo: { contains: q, mode: 'insensitive' } },
      { title: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      { companyName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } }
    ];
    const rows = await prisma.crmLead.findMany({ where, include: { stage: true, customer: true, activities: { orderBy: { createdAt: 'desc' }, take: 3 } }, orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }], take: 300 });
    res.json(rows.map(normalizeLead));
  } catch (e) { next(e); }
});

router.get('/leads/:id', requirePermission('crm:read'), async (req, res, next) => {
  try {
    const lead = await prisma.crmLead.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { stage: true, customer: true, activities: { orderBy: { createdAt: 'desc' } } } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    res.json(normalizeLead(lead));
  } catch (e) { next(e); }
});

router.post('/leads', requirePermission('crm:create'), async (req, res, next) => {
  try {
    const data = cleanLeadInput(leadSchema.parse(req.body));
    const lead = await prisma.$transaction(async (tx) => {
      await verifyCustomer(tx, req.user.tenantId, data.customerId);
      const stage = data.stageId ? await verifyStage(tx, req.user.tenantId, data.stageId) : await defaultStage(tx, req.user.tenantId);
      const leadNo = await nextLeadNo(tx, req.user.tenantId);
      const created = await tx.crmLead.create({ data: { tenantId: req.user.tenantId, leadNo, createdById: req.user.id, ...data, stageId: stage?.id || null, probability: data.probability || stage?.probability || 0 }, include: { stage: true, customer: true, activities: true } });
      await tx.crmLeadActivity.create({ data: { tenantId: req.user.tenantId, leadId: created.id, type: 'NOTE', subject: 'Lead created', notes: data.notes || 'New lead added', createdById: req.user.id } });
      return created;
    });
    if (['HIGH', 'URGENT'].includes(lead.priority)) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'WARNING', title: 'High priority lead', message: `${lead.leadNo}: ${lead.title}`, priority: lead.priority, entityType: 'CrmLead', entityId: lead.id, actionUrl: '/crm' });
    }
    await audit(req, 'CREATE', 'CrmLead', lead.id, null, lead);
    res.status(201).json(normalizeLead(lead));
  } catch (e) { next(e); }
});

router.patch('/leads/:id', requirePermission('crm:update'), async (req, res, next) => {
  try {
    const data = cleanLeadInput(updateLeadSchema.parse(req.body), true);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.crmLead.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!before) throw Object.assign(new Error('Lead not found'), { status: 404 });
      await verifyCustomer(tx, req.user.tenantId, data.customerId);
      let stage = null;
      if (data.stageId) stage = await verifyStage(tx, req.user.tenantId, data.stageId);
      const updateData = { ...data };
      if (stage && data.probability === undefined) updateData.probability = stage.probability;
      if (stage?.isWon) { updateData.status = 'WON'; updateData.wonAt = new Date(); updateData.lostAt = null; updateData.lostReason = null; }
      if (stage?.isLost) { updateData.status = 'LOST'; updateData.lostAt = new Date(); updateData.wonAt = null; }
      if (updateData.status === 'WON' && !before.wonAt) updateData.wonAt = new Date();
      if (updateData.status === 'LOST' && !before.lostAt) updateData.lostAt = new Date();
      const lead = await tx.crmLead.update({ where: { id: before.id }, data: updateData, include: { stage: true, customer: true, activities: { orderBy: { createdAt: 'desc' }, take: 3 } } });
      await tx.crmLeadActivity.create({ data: { tenantId: req.user.tenantId, leadId: before.id, type: 'NOTE', subject: 'Lead updated', notes: `Status: ${lead.status}. Stage: ${lead.stage?.name || 'No stage'}`, createdById: req.user.id } });
      return { before, lead };
    });
    await audit(req, 'UPDATE', 'CrmLead', result.lead.id, result.before, result.lead);
    res.json(normalizeLead(result.lead));
  } catch (e) { next(e); }
});

router.post('/leads/:id/activities', requirePermission('crm:update'), async (req, res, next) => {
  try {
    const data = activitySchema.parse(req.body);
    const lead = await prisma.crmLead.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!lead) return res.status(404).json({ message: 'Lead not found' });
    const activity = await prisma.crmLeadActivity.create({ data: { tenantId: req.user.tenantId, leadId: lead.id, type: data.type, subject: data.subject, notes: data.notes || null, dueAt: data.dueAt || null, outcome: data.outcome || null, completedAt: data.completed ? new Date() : null, createdById: req.user.id } });
    if (data.dueAt) await prisma.crmLead.update({ where: { id: lead.id }, data: { nextFollowUpAt: data.dueAt, status: lead.status === 'OPEN' ? 'FOLLOW_UP' : lead.status } });
    await audit(req, 'ACTIVITY', 'CrmLead', lead.id, null, activity);
    res.status(201).json(activity);
  } catch (e) { next(e); }
});

router.patch('/activities/:id/complete', requirePermission('crm:update'), async (req, res, next) => {
  try {
    const data = z.object({ outcome: z.string().trim().max(500).optional().nullable() }).parse(req.body || {});
    const before = await prisma.crmLeadActivity.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Activity not found' });
    const activity = await prisma.crmLeadActivity.update({ where: { id: before.id }, data: { completedAt: new Date(), outcome: data.outcome || before.outcome || 'Completed' } });
    await audit(req, 'COMPLETE', 'CrmLeadActivity', activity.id, before, activity);
    res.json(activity);
  } catch (e) { next(e); }
});

router.post('/leads/:id/convert-customer', requirePermission('crm:convert'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const lead = await tx.crmLead.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { customer: true, stage: true } });
      if (!lead) throw Object.assign(new Error('Lead not found'), { status: 404 });
      if (lead.customerId && lead.customer) return { lead, customer: lead.customer, existing: true };
      const existing = lead.phone ? await tx.customer.findFirst({ where: { tenantId: req.user.tenantId, phone: lead.phone, isActive: true } }) : null;
      const customer = existing || await tx.customer.create({ data: { tenantId: req.user.tenantId, name: lead.companyName || lead.contactName, phone: lead.phone || null, email: lead.email || null, address: null, groupName: 'CRM Lead' } });
      const updated = await tx.crmLead.update({ where: { id: lead.id }, data: { customerId: customer.id, status: 'WON', wonAt: new Date(), probability: 100 }, include: { customer: true, stage: true, activities: true } });
      await tx.crmLeadActivity.create({ data: { tenantId: req.user.tenantId, leadId: lead.id, type: 'NOTE', subject: 'Converted to customer', notes: `Customer created/linked: ${customer.name}`, createdById: req.user.id } });
      return { lead: updated, customer, existing: Boolean(existing) };
    });
    await createNotification({ tenantId: req.user.tenantId, type: 'SUCCESS', title: 'Lead converted to customer', message: `${result.lead.leadNo} converted to ${result.customer.name}`, priority: 'NORMAL', entityType: 'CrmLead', entityId: result.lead.id, actionUrl: '/crm' });
    await audit(req, 'CONVERT', 'CrmLead', result.lead.id, null, { customerId: result.customer.id });
    res.status(result.existing ? 200 : 201).json({ lead: normalizeLead(result.lead), customer: result.customer, existing: result.existing });
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('crm:read'), async (req, res, next) => {
  try {
    const now = new Date();
    const soon = new Date();
    soon.setDate(soon.getDate() + 1);
    const leads = await prisma.crmLead.findMany({ where: { tenantId: req.user.tenantId, nextFollowUpAt: { lte: soon }, status: { notIn: ['WON', 'LOST', 'ARCHIVED'] } }, take: 80 });
    let created = 0;
    for (const lead of leads) {
      const overdue = new Date(lead.nextFollowUpAt).getTime() < now.getTime();
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: overdue ? 'DANGER' : 'INFO', title: overdue ? 'Overdue lead follow-up' : 'Lead follow-up due', message: `${lead.leadNo}: ${lead.title}`, priority: overdue ? 'HIGH' : 'NORMAL', entityType: 'CrmLead', entityId: lead.id, actionUrl: '/crm' });
      created += 1;
    }
    res.json({ created, dueFollowUps: leads.length });
  } catch (e) { next(e); }
});

export default router;
