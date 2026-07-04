import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postCustomerReceiptJournal } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowInstallments', 'installment / hire purchase management'));

const FREQUENCIES = ['DAILY', 'WEEKLY', 'MONTHLY'];
const PLAN_STATUSES = ['ACTIVE', 'COMPLETED', 'DEFAULTED', 'CANCELLED'];
const METHODS = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

const planSchema = z.object({
  customerId: z.string().uuid(),
  invoiceId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  principalAmount: z.coerce.number().positive(),
  downPayment: z.coerce.number().nonnegative().default(0),
  interestRate: z.coerce.number().min(0).default(0),
  interestAmount: z.coerce.number().min(0).optional().nullable(),
  installmentCount: z.coerce.number().int().min(1).max(120),
  frequency: z.enum(FREQUENCIES).default('MONTHLY'),
  startDate: z.coerce.date(),
  penaltyRate: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(1500).optional().nullable(),
  downPaymentMethod: z.enum(METHODS).optional().default('CASH'),
  downPaymentBankAccountId: z.string().uuid().optional().nullable(),
  downPaymentReference: z.string().trim().max(120).optional().nullable()
});

const fromInvoiceSchema = planSchema.omit({ customerId: true, invoiceId: true, principalAmount: true }).extend({
  principalAmount: z.coerce.number().positive().optional().nullable()
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive(),
  method: z.enum(METHODS).default('CASH'),
  bankAccountId: z.string().uuid().optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  paidAt: z.coerce.date().optional()
});

function addFrequency(date, index, frequency) {
  const d = new Date(date);
  if (frequency === 'DAILY') d.setDate(d.getDate() + index);
  else if (frequency === 'WEEKLY') d.setDate(d.getDate() + index * 7);
  else d.setMonth(d.getMonth() + index);
  return d;
}

function invoiceStatus(balance) {
  if (Number(balance || 0) <= 0) return 'PAID';
  return 'PARTIAL';
}

async function nextPlanNo(tx, tenantId) {
  const count = await tx.installmentPlan.count({ where: { tenantId } });
  return `INS${String(count + 1001).padStart(4, '0')}`;
}

async function findAccount(tx, tenantId, id) {
  if (!id) return null;
  const account = await tx.bankAccount.findFirst({ where: { id, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Cash/Bank account not found'), { status: 404 });
  return account;
}

async function receiptPayment(tx, { tenantId, customerId, invoice, account, amount, method, reference, notes, paidAt, createdById }) {
  const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

  let updatedInvoice = null;
  if (invoice) {
    if (amount > Number(invoice.balance || 0)) throw Object.assign(new Error(`Amount cannot be greater than invoice balance LKR ${Number(invoice.balance || 0).toFixed(2)}`), { status: 400 });
    const newPaid = money(Number(invoice.paid || 0) + amount);
    const newBalance = money(Math.max(0, Number(invoice.balance || 0) - amount));
    updatedInvoice = await tx.invoice.update({ where: { id: invoice.id }, data: { paid: newPaid, balance: newBalance, status: invoiceStatus(newBalance) } });
  }

  await tx.customer.update({ where: { id: customerId }, data: { balance: { decrement: amount } } });

  const payment = await tx.payment.create({
    data: {
      tenantId,
      invoiceId: invoice?.id || null,
      customerId,
      bankAccountId: account?.id || null,
      receiptNo: await nextReceiptNo(tx, tenantId),
      direction: 'IN',
      method,
      amount,
      reference: reference || null,
      paidAt: paidAt || new Date(),
      notes: notes || 'Installment receipt'
    },
    include: { customer: true, invoice: true, bankAccount: true }
  });

  if (account) {
    await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: amount } } });
    await tx.bankTransaction.create({ data: { tenantId, bankAccountId: account.id, type: 'CUSTOMER_RECEIPT', direction: 'IN', amount, refType: 'InstallmentPayment', refId: payment.id, description: payment.notes || `Installment receipt ${payment.receiptNo}`, transactionDate: payment.paidAt } });
  }

  await postCustomerReceiptJournal(tx, { tenantId, payment, bankAccount: account, createdById });
  return { payment, invoice: updatedInvoice };
}

function buildSchedule({ tenantId, planId, startDate, frequency, count, financedAmount, interestAmount }) {
  const rows = [];
  const principalBase = money(Number(financedAmount || 0) / count);
  const interestBase = money(Number(interestAmount || 0) / count);
  let principalUsed = 0;
  let interestUsed = 0;
  for (let i = 1; i <= count; i += 1) {
    const principal = i === count ? money(Number(financedAmount || 0) - principalUsed) : principalBase;
    const interest = i === count ? money(Number(interestAmount || 0) - interestUsed) : interestBase;
    principalUsed = money(principalUsed + principal);
    interestUsed = money(interestUsed + interest);
    const amount = money(principal + interest);
    rows.push({ tenantId, planId, installmentNo: i, dueDate: addFrequency(startDate, i - 1, frequency), principal, interest, amount, balance: amount, status: 'DUE' });
  }
  return rows;
}

function normalizePlan(plan) {
  const schedules = plan.schedules || [];
  const now = new Date();
  const due = schedules.filter((s) => ['DUE', 'PARTIAL', 'OVERDUE'].includes(s.status));
  const overdue = due.filter((s) => new Date(s.dueDate).getTime() < now.getTime() && Number(s.balance || 0) > 0);
  return {
    ...plan,
    customerName: plan.customer?.name || '-',
    customerPhone: plan.customer?.phone || '',
    invoiceNo: plan.invoice?.invoiceNo || '-',
    paidCount: schedules.filter((s) => s.status === 'PAID').length,
    dueCount: due.length,
    overdueCount: overdue.length,
    nextDue: due.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate))[0] || null,
    progress: Number(plan.totalPayable || 0) > 0 ? Math.round((Number(plan.paidAmount || 0) / Number(plan.totalPayable || 1)) * 100) : 0
  };
}

async function refreshPlan(tx, tenantId, planId) {
  const schedules = await tx.installmentSchedule.findMany({ where: { tenantId, planId }, orderBy: { installmentNo: 'asc' } });
  const paidAmount = money(schedules.reduce((sum, s) => sum + Number(s.paidAmount || 0), 0));
  const balance = money(schedules.reduce((sum, s) => sum + Number(s.balance || 0), 0));
  const nextDue = schedules.find((s) => Number(s.balance || 0) > 0);
  const status = balance <= 0 ? 'COMPLETED' : 'ACTIVE';
  return tx.installmentPlan.update({ where: { id: planId }, data: { paidAmount, balance, nextDueDate: nextDue?.dueDate || null, status }, include: includePlan() });
}

function includePlan() {
  return { customer: true, invoice: true, schedules: { orderBy: { installmentNo: 'asc' } }, payments: { orderBy: { paidAt: 'desc' }, take: 20 } };
}

async function createPlan(tx, req, data, invoice = null) {
  const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId: req.user.tenantId, isActive: true } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
  if (invoice && invoice.customerId !== customer.id) throw Object.assign(new Error('Invoice customer does not match selected customer'), { status: 400 });

  const principalAmount = money(data.principalAmount);
  if (data.downPayment > principalAmount) throw Object.assign(new Error('Down payment cannot be greater than principal amount'), { status: 400 });
  const downPayment = money(data.downPayment || 0);
  const financedAmount = money(principalAmount - downPayment);
  const interestAmount = money(data.interestAmount ?? (financedAmount * Number(data.interestRate || 0) / 100));
  const totalPayable = money(financedAmount + interestAmount);
  const planNo = await nextPlanNo(tx, req.user.tenantId);

  const plan = await tx.installmentPlan.create({
    data: {
      tenantId: req.user.tenantId,
      customerId: customer.id,
      invoiceId: invoice?.id || data.invoiceId || null,
      planNo,
      title: data.title,
      principalAmount,
      downPayment,
      financedAmount,
      interestRate: data.interestRate || 0,
      interestAmount,
      totalPayable,
      balance: totalPayable,
      installmentCount: data.installmentCount,
      frequency: data.frequency,
      startDate: data.startDate,
      penaltyRate: data.penaltyRate || 0,
      notes: data.notes || null,
      createdById: req.user.id
    }
  });

  const schedules = buildSchedule({ tenantId: req.user.tenantId, planId: plan.id, startDate: data.startDate, frequency: data.frequency, count: data.installmentCount, financedAmount, interestAmount });
  await tx.installmentSchedule.createMany({ data: schedules });

  if (invoice && interestAmount > 0) {
    invoice = await tx.invoice.update({
      where: { id: invoice.id },
      data: { total: { increment: interestAmount }, balance: { increment: interestAmount }, notes: [invoice.notes, `Installment interest added: LKR ${interestAmount.toFixed(2)} (${planNo})`].filter(Boolean).join('\n') }
    });
    await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: interestAmount } } });
  }

  if (!invoice) {
    await tx.customer.update({ where: { id: customer.id }, data: { balance: { increment: totalPayable } } });
  }

  let downPaymentReceipt = null;
  if (invoice && downPayment > 0) {
    const account = await findAccount(tx, req.user.tenantId, data.downPaymentBankAccountId);
    downPaymentReceipt = await receiptPayment(tx, { tenantId: req.user.tenantId, customerId: customer.id, invoice, account, amount: downPayment, method: data.downPaymentMethod || 'CASH', reference: data.downPaymentReference || `Down payment ${planNo}`, notes: `Down payment for installment plan ${planNo}`, paidAt: new Date(), createdById: req.user.id });
    await tx.installmentPayment.create({ data: { tenantId: req.user.tenantId, planId: plan.id, customerId: customer.id, paymentId: downPaymentReceipt.payment.id, bankAccountId: account?.id || null, receiptNo: downPaymentReceipt.payment.receiptNo, amount: downPayment, method: data.downPaymentMethod || 'CASH', reference: data.downPaymentReference || null, notes: 'Down payment', paidAt: downPaymentReceipt.payment.paidAt, createdById: req.user.id } });
  }

  return refreshPlan(tx, req.user.tenantId, plan.id);
}

router.get('/summary', requirePermission('installment:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const week = new Date();
    week.setDate(week.getDate() + 7);
    const [plans, overdueCount, dueThisWeek, collected] = await Promise.all([
      prisma.installmentPlan.findMany({ where: { tenantId }, include: includePlan(), orderBy: { createdAt: 'desc' }, take: 200 }),
      prisma.installmentSchedule.count({ where: { tenantId, dueDate: { lt: now }, status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] }, balance: { gt: 0 } } }),
      prisma.installmentSchedule.count({ where: { tenantId, dueDate: { gte: now, lte: week }, status: { in: ['DUE', 'PARTIAL'] }, balance: { gt: 0 } } }),
      prisma.installmentPayment.aggregate({ where: { tenantId }, _sum: { amount: true } })
    ]);
    const active = plans.filter((p) => p.status === 'ACTIVE').length;
    const outstanding = plans.reduce((sum, p) => sum + Number(p.balance || 0), 0);
    res.json({ active, completed: plans.filter((p) => p.status === 'COMPLETED').length, overdueCount, dueThisWeek, outstanding: money(outstanding), collected: money(collected._sum.amount || 0), recentPlans: plans.slice(0, 8).map(normalizePlan) });
  } catch (e) { next(e); }
});

router.get('/plans', requirePermission('installment:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ planNo: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }];
    const plans = await prisma.installmentPlan.findMany({ where, include: includePlan(), orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(plans.map(normalizePlan));
  } catch (e) { next(e); }
});

router.get('/plans/:id', requirePermission('installment:read'), async (req, res, next) => {
  try {
    const plan = await prisma.installmentPlan.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includePlan() });
    if (!plan) return res.status(404).json({ message: 'Installment plan not found' });
    res.json(normalizePlan(plan));
  } catch (e) { next(e); }
});

router.post('/plans', requirePermission('installment:create'), async (req, res, next) => {
  try {
    const data = planSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      let invoice = null;
      if (data.invoiceId) {
        invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, tenantId: req.user.tenantId } });
        if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      }
      return createPlan(tx, req, data, invoice);
    });
    await audit(req, 'CREATE', 'InstallmentPlan', result.id, null, result);
    res.status(201).json(normalizePlan(result));
  } catch (e) { next(e); }
});

router.post('/from-invoice/:invoiceId', requirePermission('installment:create'), async (req, res, next) => {
  try {
    const body = fromInvoiceSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: req.params.invoiceId, tenantId: req.user.tenantId } });
      if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      if (!invoice.customerId) throw Object.assign(new Error('Invoice must have a customer before converting to installment'), { status: 400 });
      if (Number(invoice.balance || 0) <= 0) throw Object.assign(new Error('Invoice has no outstanding balance'), { status: 400 });
      return createPlan(tx, req, { ...body, customerId: invoice.customerId, invoiceId: invoice.id, principalAmount: body.principalAmount || Number(invoice.balance || 0) }, invoice);
    });
    await audit(req, 'CONVERT', 'InstallmentPlan', result.id, null, result);
    res.status(201).json(normalizePlan(result));
  } catch (e) { next(e); }
});

router.post('/plans/:id/pay', requirePermission('installment:pay'), async (req, res, next) => {
  try {
    const data = paymentSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const plan = await tx.installmentPlan.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includePlan() });
      if (!plan) throw Object.assign(new Error('Installment plan not found'), { status: 404 });
      if (plan.status !== 'ACTIVE') throw Object.assign(new Error('Only active installment plans can receive payments'), { status: 400 });
      const amount = money(data.amount);
      if (amount > Number(plan.balance || 0)) throw Object.assign(new Error(`Amount cannot be greater than plan balance LKR ${Number(plan.balance || 0).toFixed(2)}`), { status: 400 });
      const account = await findAccount(tx, req.user.tenantId, data.bankAccountId);
      const invoice = plan.invoiceId ? await tx.invoice.findFirst({ where: { id: plan.invoiceId, tenantId: req.user.tenantId } }) : null;
      const receipt = await receiptPayment(tx, { tenantId: req.user.tenantId, customerId: plan.customerId, invoice, account, amount, method: data.method, reference: data.reference || `Installment ${plan.planNo}`, notes: data.notes || `Installment payment for ${plan.planNo}`, paidAt: data.paidAt || new Date(), createdById: req.user.id });

      let remaining = amount;
      const dueSchedules = await tx.installmentSchedule.findMany({ where: { tenantId: req.user.tenantId, planId: plan.id, balance: { gt: 0 } }, orderBy: [{ dueDate: 'asc' }, { installmentNo: 'asc' }] });
      for (const schedule of dueSchedules) {
        if (remaining <= 0) break;
        const take = money(Math.min(remaining, Number(schedule.balance || 0)));
        const newPaid = money(Number(schedule.paidAmount || 0) + take);
        const newBalance = money(Number(schedule.balance || 0) - take);
        await tx.installmentSchedule.update({ where: { id: schedule.id }, data: { paidAmount: newPaid, balance: newBalance, status: newBalance <= 0 ? 'PAID' : 'PARTIAL', paidAt: newBalance <= 0 ? (data.paidAt || new Date()) : null } });
        await tx.installmentPayment.create({ data: { tenantId: req.user.tenantId, planId: plan.id, scheduleId: schedule.id, customerId: plan.customerId, paymentId: receipt.payment.id, bankAccountId: account?.id || null, receiptNo: receipt.payment.receiptNo, amount: take, method: data.method, reference: data.reference || null, notes: data.notes || null, paidAt: receipt.payment.paidAt, createdById: req.user.id } });
        remaining = money(remaining - take);
      }
      const updated = await refreshPlan(tx, req.user.tenantId, plan.id);
      return { plan: updated, payment: receipt.payment };
    });
    await audit(req, 'PAY', 'InstallmentPlan', result.plan.id, null, result);
    res.status(201).json({ plan: normalizePlan(result.plan), payment: result.payment });
  } catch (e) { next(e); }
});

router.patch('/plans/:id/status', requirePermission('installment:update'), async (req, res, next) => {
  try {
    const data = z.object({ status: z.enum(PLAN_STATUSES), notes: z.string().optional().nullable() }).parse(req.body);
    const before = await prisma.installmentPlan.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includePlan() });
    if (!before) return res.status(404).json({ message: 'Installment plan not found' });
    const updated = await prisma.installmentPlan.update({ where: { id: before.id }, data: { status: data.status, notes: data.notes ?? before.notes }, include: includePlan() });
    await audit(req, 'STATUS', 'InstallmentPlan', updated.id, before, updated);
    res.json(normalizePlan(updated));
  } catch (e) { next(e); }
});

router.post('/alerts/overdue', requirePermission('installment:read'), async (req, res, next) => {
  try {
    const now = new Date();
    const schedules = await prisma.installmentSchedule.findMany({ where: { tenantId: req.user.tenantId, dueDate: { lt: now }, balance: { gt: 0 }, status: { in: ['DUE', 'PARTIAL', 'OVERDUE'] } }, include: { plan: { include: { customer: true } } }, take: 80 });
    let created = 0;
    for (const schedule of schedules) {
      await prisma.installmentSchedule.update({ where: { id: schedule.id }, data: { status: 'OVERDUE' } });
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT', 'SALES_STAFF'], type: 'DANGER', title: 'Overdue installment', message: `${schedule.plan.planNo} installment ${schedule.installmentNo} is overdue. Customer: ${schedule.plan.customer?.name || '-'}, Balance: LKR ${Number(schedule.balance || 0).toFixed(2)}`, priority: 'HIGH', entityType: 'InstallmentPlan', entityId: schedule.planId, actionUrl: '/installments' });
      created += 1;
    }
    res.json({ created, checked: schedules.length });
  } catch (e) { next(e); }
});

export default router;
