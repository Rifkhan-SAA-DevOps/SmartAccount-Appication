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
router.use(planFeatureGuard('allowLoyalty', 'customer loyalty / membership'));

const tierSchema = z.object({
  name: z.string().trim().min(2).max(80),
  minPoints: z.coerce.number().int().min(0).default(0),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  pointsMultiplier: z.coerce.number().min(0).max(100).default(1),
  priority: z.coerce.number().int().min(0).default(0),
  isActive: z.boolean().default(true)
});

const ruleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  earnAmountStep: z.coerce.number().positive().default(100),
  earnPoints: z.coerce.number().int().positive().default(1),
  redemptionValue: z.coerce.number().positive().default(1),
  minRedeemPoints: z.coerce.number().int().min(1).default(100),
  expiryDays: z.coerce.number().int().positive().optional().nullable(),
  isDefault: z.boolean().default(false),
  isActive: z.boolean().default(true)
});

const enrollSchema = z.object({
  customerId: z.string().uuid(),
  tierId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const earnSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  description: z.string().trim().max(500).optional().nullable(),
  refType: z.string().trim().max(80).optional().nullable(),
  refId: z.string().trim().max(120).optional().nullable()
});

const redeemSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  points: z.coerce.number().int().positive(),
  notes: z.string().trim().max(500).optional().nullable()
});

const adjustSchema = z.object({
  customerId: z.string().uuid(),
  points: z.coerce.number().int(),
  description: z.string().trim().min(2).max(500),
  type: z.enum(['ADJUST', 'BONUS', 'EXPIRE']).default('ADJUST')
}).refine((data) => data.points !== 0, { message: 'Points cannot be zero' });

async function nextMemberNo(tx, tenantId) {
  const count = await tx.loyaltyAccount.count({ where: { tenantId } });
  return `MEM${String(count + 1001).padStart(4, '0')}`;
}

async function nextVoucherNo(tx, tenantId) {
  const count = await tx.rewardVoucher.count({ where: { tenantId } });
  return `RV${String(count + 1001).padStart(4, '0')}`;
}

async function defaultRule(tx, tenantId) {
  let rule = await tx.loyaltyRule.findFirst({ where: { tenantId, isActive: true, isDefault: true } });
  if (!rule) {
    rule = await tx.loyaltyRule.findFirst({ where: { tenantId, isActive: true }, orderBy: { createdAt: 'asc' } });
  }
  if (!rule) {
    rule = await tx.loyaltyRule.create({ data: { tenantId, name: 'Default Loyalty Rule', earnAmountStep: 100, earnPoints: 1, redemptionValue: 1, minRedeemPoints: 100, isDefault: true } });
  }
  return rule;
}

async function ensureDefaultTiers(tx, tenantId) {
  const count = await tx.loyaltyTier.count({ where: { tenantId } });
  if (count > 0) return;
  const tiers = [
    { name: 'Bronze', minPoints: 0, discountPercent: 0, pointsMultiplier: 1, priority: 10 },
    { name: 'Silver', minPoints: 500, discountPercent: 2, pointsMultiplier: 1.25, priority: 20 },
    { name: 'Gold', minPoints: 1500, discountPercent: 5, pointsMultiplier: 1.5, priority: 30 },
    { name: 'VIP', minPoints: 5000, discountPercent: 10, pointsMultiplier: 2, priority: 40 }
  ];
  for (const tier of tiers) await tx.loyaltyTier.create({ data: { tenantId, ...tier } });
}

async function findTierForPoints(tx, tenantId, points) {
  await ensureDefaultTiers(tx, tenantId);
  return tx.loyaltyTier.findFirst({ where: { tenantId, isActive: true, minPoints: { lte: Math.max(0, Number(points || 0)) } }, orderBy: [{ minPoints: 'desc' }, { priority: 'desc' }] });
}

async function ensureCustomer(tx, tenantId, customerId) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
  return customer;
}

async function ensureAccount(tx, tenantId, customerId, userId = null) {
  await ensureCustomer(tx, tenantId, customerId);
  let account = await tx.loyaltyAccount.findUnique({ where: { tenantId_customerId: { tenantId, customerId } }, include: { tier: true, customer: true } });
  if (account) return account;
  const tier = await findTierForPoints(tx, tenantId, 0);
  account = await tx.loyaltyAccount.create({
    data: { tenantId, customerId, tierId: tier?.id || null, memberNo: await nextMemberNo(tx, tenantId), notes: 'Auto-enrolled', lastActivityAt: new Date() },
    include: { tier: true, customer: true }
  });
  await tx.loyaltyTransaction.create({ data: { tenantId, accountId: account.id, customerId, type: 'ENROLL', points: 0, balanceAfter: 0, description: 'Customer enrolled in loyalty program', createdById: userId } });
  return account;
}

function normalizeAccount(row) {
  return {
    ...row,
    customerName: row.customer?.name || '-',
    customerPhone: row.customer?.phone || '',
    tierName: row.tier?.name || '-',
    discountPercent: Number(row.tier?.discountPercent || 0),
    pointsMultiplier: Number(row.tier?.pointsMultiplier || 1)
  };
}

function normalizeVoucher(row) {
  return {
    ...row,
    customerName: row.customer?.name || '-',
    memberNo: row.account?.memberNo || '-',
    discountAmount: money(row.discountAmount),
    expired: row.expiresAt ? new Date(row.expiresAt).getTime() < Date.now() && row.status === 'ACTIVE' : false
  };
}

router.get('/summary', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const [members, activeVouchers, redeemedVouchers, txs, topMembers, expiringVouchers] = await Promise.all([
      prisma.loyaltyAccount.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.rewardVoucher.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.rewardVoucher.count({ where: { tenantId, status: 'REDEEMED' } }),
      prisma.loyaltyTransaction.findMany({ where: { tenantId }, orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.loyaltyAccount.findMany({ where: { tenantId }, include: { customer: true, tier: true }, orderBy: { pointsBalance: 'desc' }, take: 8 }),
      prisma.rewardVoucher.findMany({ where: { tenantId, status: 'ACTIVE', expiresAt: { gte: now } }, include: { customer: true, account: true }, orderBy: { expiresAt: 'asc' }, take: 8 })
    ]);
    const earned = txs.filter((t) => Number(t.points || 0) > 0).reduce((s, t) => s + Number(t.points || 0), 0);
    const redeemed = txs.filter((t) => Number(t.points || 0) < 0).reduce((s, t) => s + Math.abs(Number(t.points || 0)), 0);
    res.json({ members, activeVouchers, redeemedVouchers, earned, redeemed, topMembers: topMembers.map(normalizeAccount), expiringVouchers: expiringVouchers.map(normalizeVoucher) });
  } catch (e) { next(e); }
});

router.get('/tiers', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    await prisma.$transaction((tx) => ensureDefaultTiers(tx, req.user.tenantId));
    const tiers = await prisma.loyaltyTier.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ minPoints: 'asc' }, { priority: 'asc' }] });
    res.json(tiers);
  } catch (e) { next(e); }
});

router.post('/tiers', requirePermission('loyalty:manage'), async (req, res, next) => {
  try {
    const data = tierSchema.parse(req.body);
    const tier = await prisma.loyaltyTier.create({ data: { tenantId: req.user.tenantId, ...data } });
    await audit(req, 'CREATE', 'LoyaltyTier', tier.id, null, tier);
    res.status(201).json(tier);
  } catch (e) { next(e); }
});

router.patch('/tiers/:id', requirePermission('loyalty:manage'), async (req, res, next) => {
  try {
    const before = await prisma.loyaltyTier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Tier not found' });
    const data = tierSchema.partial().parse(req.body);
    const tier = await prisma.loyaltyTier.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'LoyaltyTier', tier.id, before, tier);
    res.json(tier);
  } catch (e) { next(e); }
});

router.get('/rules', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    await prisma.$transaction((tx) => defaultRule(tx, req.user.tenantId));
    const rules = await prisma.loyaltyRule.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }] });
    res.json(rules);
  } catch (e) { next(e); }
});

router.post('/rules', requirePermission('loyalty:manage'), async (req, res, next) => {
  try {
    const data = ruleSchema.parse(req.body);
    const rule = await prisma.$transaction(async (tx) => {
      if (data.isDefault) await tx.loyaltyRule.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.loyaltyRule.create({ data: { tenantId: req.user.tenantId, ...data } });
    });
    await audit(req, 'CREATE', 'LoyaltyRule', rule.id, null, rule);
    res.status(201).json(rule);
  } catch (e) { next(e); }
});

router.get('/accounts', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { memberNo: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { customer: { phone: { contains: q, mode: 'insensitive' } } }
    ];
    const rows = await prisma.loyaltyAccount.findMany({ where, include: { customer: true, tier: true }, orderBy: { pointsBalance: 'desc' }, take: 300 });
    res.json(rows.map(normalizeAccount));
  } catch (e) { next(e); }
});

router.get('/customers/:id', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    const account = await prisma.loyaltyAccount.findUnique({ where: { tenantId_customerId: { tenantId: req.user.tenantId, customerId: req.params.id } }, include: { customer: true, tier: true, transactions: { orderBy: { createdAt: 'desc' }, take: 50 }, vouchers: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!account) return res.status(404).json({ message: 'Loyalty account not found' });
    res.json(normalizeAccount(account));
  } catch (e) { next(e); }
});

router.post('/enroll', requirePermission('loyalty:create'), async (req, res, next) => {
  try {
    const data = enrollSchema.parse(req.body);
    const account = await prisma.$transaction(async (tx) => {
      await ensureCustomer(tx, req.user.tenantId, data.customerId);
      const tier = data.tierId ? await tx.loyaltyTier.findFirst({ where: { id: data.tierId, tenantId: req.user.tenantId } }) : await findTierForPoints(tx, req.user.tenantId, 0);
      const existing = await tx.loyaltyAccount.findUnique({ where: { tenantId_customerId: { tenantId: req.user.tenantId, customerId: data.customerId } }, include: { customer: true, tier: true } });
      if (existing) return existing;
      const created = await tx.loyaltyAccount.create({ data: { tenantId: req.user.tenantId, customerId: data.customerId, tierId: tier?.id || null, memberNo: await nextMemberNo(tx, req.user.tenantId), notes: data.notes || null, lastActivityAt: new Date() }, include: { customer: true, tier: true } });
      await tx.loyaltyTransaction.create({ data: { tenantId: req.user.tenantId, accountId: created.id, customerId: data.customerId, type: 'ENROLL', points: 0, balanceAfter: 0, description: data.notes || 'Customer enrolled', createdById: req.user.id } });
      return created;
    });
    await audit(req, 'ENROLL', 'LoyaltyAccount', account.id, null, account);
    res.status(201).json(normalizeAccount(account));
  } catch (e) { next(e); }
});

router.post('/earn', requirePermission('loyalty:earn'), async (req, res, next) => {
  try {
    const data = earnSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const account = await ensureAccount(tx, req.user.tenantId, data.customerId, req.user.id);
      const rule = await defaultRule(tx, req.user.tenantId);
      if (data.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, tenantId: req.user.tenantId, customerId: data.customerId } });
        if (!invoice) throw Object.assign(new Error('Invoice not found for this customer'), { status: 404 });
      }
      const multiplier = Number(account.tier?.pointsMultiplier || 1);
      const basePoints = Math.floor((Number(data.amount || 0) / Number(rule.earnAmountStep || 100)) * Number(rule.earnPoints || 1));
      const points = Math.max(0, Math.floor(basePoints * multiplier));
      if (points <= 0) throw Object.assign(new Error('Amount is not enough to earn points'), { status: 400 });
      const nextBalance = Number(account.pointsBalance || 0) + points;
      const tier = await findTierForPoints(tx, req.user.tenantId, nextBalance);
      const updated = await tx.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: nextBalance, lifetimeEarned: { increment: points }, tierId: tier?.id || account.tierId, lastActivityAt: new Date() }, include: { customer: true, tier: true } });
      await tx.customer.update({ where: { id: data.customerId }, data: { loyalty: nextBalance } }).catch(() => null);
      const expiresAt = rule.expiryDays ? new Date(Date.now() + Number(rule.expiryDays) * 86400000) : null;
      const txRow = await tx.loyaltyTransaction.create({ data: { tenantId: req.user.tenantId, accountId: account.id, customerId: data.customerId, invoiceId: data.invoiceId || null, type: 'EARN', points, amount: data.amount, balanceAfter: nextBalance, description: data.description || `Earned ${points} point(s)`, refType: data.refType || 'SALE', refId: data.refId || data.invoiceId || null, expiresAt, createdById: req.user.id } });
      return { account: updated, transaction: txRow, points };
    });
    await audit(req, 'EARN', 'LoyaltyTransaction', result.transaction.id, null, result.transaction);
    res.status(201).json({ ...result, account: normalizeAccount(result.account) });
  } catch (e) { next(e); }
});

router.post('/redeem', requirePermission('loyalty:redeem'), async (req, res, next) => {
  try {
    const data = redeemSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const account = await ensureAccount(tx, req.user.tenantId, data.customerId, req.user.id);
      const rule = await defaultRule(tx, req.user.tenantId);
      if (Number(data.points) < Number(rule.minRedeemPoints || 0)) throw Object.assign(new Error(`Minimum redeem points is ${rule.minRedeemPoints}`), { status: 400 });
      if (Number(account.pointsBalance || 0) < Number(data.points)) throw Object.assign(new Error('Not enough points to redeem'), { status: 400 });
      if (data.invoiceId) {
        const invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, tenantId: req.user.tenantId, customerId: data.customerId } });
        if (!invoice) throw Object.assign(new Error('Invoice not found for this customer'), { status: 404 });
      }
      const nextBalance = Number(account.pointsBalance || 0) - Number(data.points);
      const discountAmount = money(Number(data.points) * Number(rule.redemptionValue || 1));
      const expiresAt = rule.expiryDays ? new Date(Date.now() + Number(rule.expiryDays) * 86400000) : null;
      const voucher = await tx.rewardVoucher.create({ data: { tenantId: req.user.tenantId, accountId: account.id, customerId: data.customerId, invoiceId: data.invoiceId || null, voucherNo: await nextVoucherNo(tx, req.user.tenantId), pointsCost: data.points, discountAmount, expiresAt, notes: data.notes || null, createdById: req.user.id }, include: { customer: true, account: true } });
      const updated = await tx.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: nextBalance, lifetimeRedeemed: { increment: data.points }, lastActivityAt: new Date() }, include: { customer: true, tier: true } });
      await tx.customer.update({ where: { id: data.customerId }, data: { loyalty: nextBalance } }).catch(() => null);
      const txRow = await tx.loyaltyTransaction.create({ data: { tenantId: req.user.tenantId, accountId: account.id, customerId: data.customerId, invoiceId: data.invoiceId || null, voucherId: voucher.id, type: 'REDEEM', points: -Math.abs(Number(data.points)), amount: discountAmount, balanceAfter: nextBalance, description: data.notes || `Redeemed ${data.points} point(s)`, refType: 'REWARD_VOUCHER', refId: voucher.id, createdById: req.user.id } });
      return { account: updated, voucher, transaction: txRow };
    });
    await audit(req, 'REDEEM', 'RewardVoucher', result.voucher.id, null, result.voucher);
    await createNotification({ tenantId: req.user.tenantId, type: 'SUCCESS', title: 'Reward voucher created', message: `${result.voucher.voucherNo} worth LKR ${Number(result.voucher.discountAmount || 0).toFixed(2)} created.`, priority: 'NORMAL', entityType: 'RewardVoucher', entityId: result.voucher.id, actionUrl: '/loyalty' });
    res.status(201).json({ ...result, account: normalizeAccount(result.account), voucher: normalizeVoucher(result.voucher) });
  } catch (e) { next(e); }
});

router.post('/adjust', requirePermission('loyalty:manage'), async (req, res, next) => {
  try {
    const data = adjustSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const account = await ensureAccount(tx, req.user.tenantId, data.customerId, req.user.id);
      const nextBalance = Math.max(0, Number(account.pointsBalance || 0) + Number(data.points));
      const tier = await findTierForPoints(tx, req.user.tenantId, nextBalance);
      const updated = await tx.loyaltyAccount.update({ where: { id: account.id }, data: { pointsBalance: nextBalance, tierId: tier?.id || account.tierId, ...(data.points > 0 ? { lifetimeEarned: { increment: data.points } } : { lifetimeRedeemed: { increment: Math.abs(data.points) } }), lastActivityAt: new Date() }, include: { customer: true, tier: true } });
      await tx.customer.update({ where: { id: data.customerId }, data: { loyalty: nextBalance } }).catch(() => null);
      const txRow = await tx.loyaltyTransaction.create({ data: { tenantId: req.user.tenantId, accountId: account.id, customerId: data.customerId, type: data.type, points: data.points, balanceAfter: nextBalance, description: data.description, refType: 'MANUAL', createdById: req.user.id } });
      return { account: updated, transaction: txRow };
    });
    await audit(req, 'ADJUST', 'LoyaltyTransaction', result.transaction.id, null, result.transaction);
    res.status(201).json({ ...result, account: normalizeAccount(result.account) });
  } catch (e) { next(e); }
});

router.get('/vouchers', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    const rows = await prisma.rewardVoucher.findMany({ where, include: { customer: true, account: true }, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(rows.map(normalizeVoucher));
  } catch (e) { next(e); }
});

router.post('/vouchers/:id/redeem', requirePermission('loyalty:redeem'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.rewardVoucher.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { customer: true, account: true } });
      if (!before) throw Object.assign(new Error('Voucher not found'), { status: 404 });
      if (before.status !== 'ACTIVE') throw Object.assign(new Error('Voucher is not active'), { status: 400 });
      if (before.expiresAt && new Date(before.expiresAt).getTime() < Date.now()) throw Object.assign(new Error('Voucher has expired'), { status: 400 });
      const voucher = await tx.rewardVoucher.update({ where: { id: before.id }, data: { status: 'REDEEMED', redeemedAt: new Date(), invoiceId: req.body?.invoiceId || before.invoiceId || null }, include: { customer: true, account: true } });
      return { before, voucher };
    });
    await audit(req, 'VOUCHER_REDEEMED', 'RewardVoucher', result.voucher.id, result.before, result.voucher);
    res.json(normalizeVoucher(result.voucher));
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('loyalty:read'), async (req, res, next) => {
  try {
    const soon = new Date();
    soon.setDate(soon.getDate() + Number(req.body?.days || 7));
    const rows = await prisma.rewardVoucher.findMany({ where: { tenantId: req.user.tenantId, status: 'ACTIVE', expiresAt: { lte: soon } }, include: { customer: true }, take: 80 });
    let created = 0;
    for (const row of rows) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'WARNING', title: 'Reward voucher expiring', message: `${row.voucherNo} for ${row.customer?.name || 'customer'} expires soon.`, priority: 'NORMAL', entityType: 'RewardVoucher', entityId: row.id, actionUrl: '/loyalty' });
      created += 1;
    }
    res.json({ created, expiring: rows.length });
  } catch (e) { next(e); }
});

export default router;
