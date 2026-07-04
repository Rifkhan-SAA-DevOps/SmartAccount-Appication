import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createApprovalNotification } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowApprovals', 'approval workflow'));

const APPROVAL_TYPES = [
  'EXPENSE',
  'PURCHASE_ORDER',
  'STOCK_TRANSFER',
  'DISCOUNT',
  'INVOICE_CANCEL',
  'INVOICE_DELETE',
  'STOCK_ADJUSTMENT',
  'SUPPLIER_PAYMENT',
  'CUSTOMER_CREDIT',
  'OTHER'
];

const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

const ruleSchema = z.object({
  name: z.string().min(2),
  type: z.enum(APPROVAL_TYPES).or(z.literal('GENERAL')).default('GENERAL'),
  minAmount: z.coerce.number().nonnegative().default(0),
  approverRoles: z.string().min(1).default('OWNER,ADMIN'),
  isActive: z.boolean().optional().default(true)
});

const requestSchema = z.object({
  type: z.enum(APPROVAL_TYPES),
  title: z.string().min(2),
  description: z.string().optional().nullable(),
  amount: z.coerce.number().nonnegative().default(0),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  priority: z.enum(PRIORITIES).default('NORMAL'),
  payload: z.any().optional().nullable()
});

const decisionSchema = z.object({
  note: z.string().optional().nullable()
});

async function nextApprovalNo(tx, tenantId) {
  const count = await tx.approvalRequest.count({ where: { tenantId } });
  return `APR${String(count + 1001).padStart(4, '0')}`;
}

function roleList(value) {
  return String(value || 'OWNER,ADMIN')
    .split(',')
    .map((role) => role.trim().toUpperCase())
    .filter(Boolean);
}

async function ensureDefaultRules(tenantId) {
  const count = await prisma.approvalRule.count({ where: { tenantId } });
  if (count > 0) return;

  await prisma.approvalRule.createMany({
    data: [
      { tenantId, name: 'Expense approval over 5,000', type: 'EXPENSE', minAmount: 5000, approverRoles: 'OWNER,ADMIN' },
      { tenantId, name: 'Purchase order approval over 25,000', type: 'PURCHASE_ORDER', minAmount: 25000, approverRoles: 'OWNER,ADMIN' },
      { tenantId, name: 'Stock adjustment approval', type: 'STOCK_ADJUSTMENT', minAmount: 0, approverRoles: 'OWNER,ADMIN,INVENTORY_MANAGER' },
      { tenantId, name: 'Invoice cancel/delete approval', type: 'INVOICE_CANCEL', minAmount: 0, approverRoles: 'OWNER,ADMIN,ACCOUNTANT' },
      { tenantId, name: 'Manual approval fallback', type: 'GENERAL', minAmount: 0, approverRoles: 'OWNER,ADMIN' }
    ],
    skipDuplicates: true
  });
}

async function findApplicableRule(tx, tenantId, type) {
  const specific = await tx.approvalRule.findFirst({
    where: { tenantId, type, isActive: true },
    orderBy: { minAmount: 'desc' }
  });
  if (specific) return specific;
  return tx.approvalRule.findFirst({
    where: { tenantId, type: 'GENERAL', isActive: true },
    orderBy: { minAmount: 'asc' }
  });
}

async function canDecide(user, request, tx = prisma) {
  if (!user || request.tenantId !== user.tenantId) return false;
  if (user.role === 'OWNER') return true;
  if (request.requestedById === user.id) return false;
  const rule = await findApplicableRule(tx, user.tenantId, request.type);
  const allowedRoles = roleList(rule?.approverRoles);
  return allowedRoles.includes(user.role);
}

router.get('/types', requirePermission('approval:read'), async (req, res) => {
  res.json({ types: APPROVAL_TYPES, statuses: STATUSES, priorities: PRIORITIES });
});

router.get('/summary', requirePermission('approval:read'), async (req, res, next) => {
  try {
    await ensureDefaultRules(req.user.tenantId);
    const [pending, approved, rejected, mine, urgent, recent] = await Promise.all([
      prisma.approvalRequest.count({ where: { tenantId: req.user.tenantId, status: 'PENDING' } }),
      prisma.approvalRequest.count({ where: { tenantId: req.user.tenantId, status: 'APPROVED' } }),
      prisma.approvalRequest.count({ where: { tenantId: req.user.tenantId, status: 'REJECTED' } }),
      prisma.approvalRequest.count({ where: { tenantId: req.user.tenantId, requestedById: req.user.id, status: 'PENDING' } }),
      prisma.approvalRequest.count({ where: { tenantId: req.user.tenantId, status: 'PENDING', priority: { in: ['HIGH', 'URGENT'] } } }),
      prisma.approvalRequest.findMany({
        where: { tenantId: req.user.tenantId },
        include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 8
      })
    ]);
    res.json({ pending, approved, rejected, mine, urgent, recent });
  } catch (e) { next(e); }
});

router.get('/rules', requirePermission('approval:read'), async (req, res, next) => {
  try {
    await ensureDefaultRules(req.user.tenantId);
    const rules = await prisma.approvalRule.findMany({
      where: { tenantId: req.user.tenantId },
      orderBy: [{ isActive: 'desc' }, { type: 'asc' }, { minAmount: 'asc' }]
    });
    res.json(rules);
  } catch (e) { next(e); }
});

router.post('/rules', requirePermission('approval:manage'), async (req, res, next) => {
  try {
    const data = ruleSchema.parse(req.body);
    const rule = await prisma.approvalRule.create({
      data: {
        tenantId: req.user.tenantId,
        name: data.name,
        type: data.type,
        minAmount: money(data.minAmount),
        approverRoles: data.approverRoles,
        isActive: data.isActive
      }
    });
    await audit(req, 'CREATE', 'ApprovalRule', rule.id, null, rule);
    res.status(201).json(rule);
  } catch (e) { next(e); }
});

router.put('/rules/:id', requirePermission('approval:manage'), async (req, res, next) => {
  try {
    const before = await prisma.approvalRule.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Approval rule not found' });
    const data = ruleSchema.partial().parse(req.body);
    const rule = await prisma.approvalRule.update({
      where: { id: before.id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.minAmount !== undefined ? { minAmount: money(data.minAmount) } : {}),
        ...(data.approverRoles !== undefined ? { approverRoles: data.approverRoles } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {})
      }
    });
    await audit(req, 'UPDATE', 'ApprovalRule', rule.id, before, rule);
    res.json(rule);
  } catch (e) { next(e); }
});

router.get('/requests', requirePermission('approval:read'), async (req, res, next) => {
  try {
    await ensureDefaultRules(req.user.tenantId);
    const status = req.query.status?.toString();
    const type = req.query.type?.toString();
    const mine = req.query.mine === 'true';
    const requests = await prisma.approvalRequest.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(status && status !== 'ALL' ? { status } : {}),
        ...(type && type !== 'ALL' ? { type } : {}),
        ...(mine ? { requestedById: req.user.id } : {})
      },
      include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } },
      orderBy: [{ status: 'asc' }, { requestedAt: 'desc' }],
      take: 200
    });
    res.json(requests);
  } catch (e) { next(e); }
});

router.post('/requests', requirePermission('approval:create'), async (req, res, next) => {
  try {
    const data = requestSchema.parse(req.body);
    await ensureDefaultRules(req.user.tenantId);

    const request = await prisma.$transaction(async (tx) => {
      const amount = money(data.amount || 0);
      const rule = await findApplicableRule(tx, req.user.tenantId, data.type);
      const needsApproval = rule ? amount >= Number(rule.minAmount || 0) : true;
      const status = needsApproval ? 'PENDING' : 'APPROVED';
      return tx.approvalRequest.create({
        data: {
          tenantId: req.user.tenantId,
          requestNo: await nextApprovalNo(tx, req.user.tenantId),
          type: data.type,
          title: data.title,
          description: data.description || null,
          amount,
          entityType: data.entityType || null,
          entityId: data.entityId || null,
          priority: data.priority,
          payload: data.payload || null,
          requestedById: req.user.id,
          status,
          decidedById: status === 'APPROVED' ? req.user.id : null,
          decidedAt: status === 'APPROVED' ? new Date() : null,
          decisionNote: status === 'APPROVED' ? 'Auto-approved because amount is below the active rule threshold.' : null
        },
        include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } }
      });
    });

    await audit(req, 'CREATE', 'ApprovalRequest', request.id, null, request);
    await createApprovalNotification(req.user.tenantId, request, request.status === 'APPROVED' ? 'APPROVED' : 'CREATED').catch(() => null);
    res.status(201).json(request);
  } catch (e) { next(e); }
});

router.post('/requests/:id/approve', requirePermission('approval:decide'), async (req, res, next) => {
  try {
    const data = decisionSchema.parse(req.body);
    const before = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Approval request not found' });
    if (before.status !== 'PENDING') return res.status(400).json({ message: `Request is already ${before.status.toLowerCase()}` });
    if (!(await canDecide(req.user, before))) return res.status(403).json({ message: 'You are not allowed to approve this request' });

    const request = await prisma.approvalRequest.update({
      where: { id: before.id },
      data: { status: 'APPROVED', decidedById: req.user.id, decidedAt: new Date(), decisionNote: data.note || 'Approved' },
      include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } }
    });
    await audit(req, 'APPROVE', 'ApprovalRequest', request.id, before, request);
    await createApprovalNotification(req.user.tenantId, request, 'APPROVED').catch(() => null);
    res.json(request);
  } catch (e) { next(e); }
});

router.post('/requests/:id/reject', requirePermission('approval:decide'), async (req, res, next) => {
  try {
    const data = decisionSchema.parse(req.body);
    const before = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Approval request not found' });
    if (before.status !== 'PENDING') return res.status(400).json({ message: `Request is already ${before.status.toLowerCase()}` });
    if (!(await canDecide(req.user, before))) return res.status(403).json({ message: 'You are not allowed to reject this request' });

    const request = await prisma.approvalRequest.update({
      where: { id: before.id },
      data: { status: 'REJECTED', decidedById: req.user.id, decidedAt: new Date(), decisionNote: data.note || 'Rejected' },
      include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } }
    });
    await audit(req, 'REJECT', 'ApprovalRequest', request.id, before, request);
    await createApprovalNotification(req.user.tenantId, request, 'REJECTED').catch(() => null);
    res.json(request);
  } catch (e) { next(e); }
});

router.post('/requests/:id/cancel', requirePermission('approval:create'), async (req, res, next) => {
  try {
    const before = await prisma.approvalRequest.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Approval request not found' });
    if (before.status !== 'PENDING') return res.status(400).json({ message: `Request is already ${before.status.toLowerCase()}` });
    const canCancel = before.requestedById === req.user.id || ['OWNER', 'ADMIN'].includes(req.user.role);
    if (!canCancel) return res.status(403).json({ message: 'You cannot cancel this request' });

    const request = await prisma.approvalRequest.update({
      where: { id: before.id },
      data: { status: 'CANCELLED', decidedById: req.user.id, decidedAt: new Date(), decisionNote: 'Cancelled by requester/admin' },
      include: { requestedBy: { select: { name: true, email: true, role: true } }, decidedBy: { select: { name: true, email: true, role: true } } }
    });
    await audit(req, 'CANCEL', 'ApprovalRequest', request.id, before, request);
    await createApprovalNotification(req.user.tenantId, request, 'CANCELLED').catch(() => null);
    res.json(request);
  } catch (e) { next(e); }
});

export default router;
