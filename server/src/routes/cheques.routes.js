import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postCustomerReceiptJournal, postSupplierPaymentJournal } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);

const chequeSchema = z.object({
  partyType: z.enum(['CUSTOMER', 'SUPPLIER']).default('CUSTOMER'),
  direction: z.enum(['IN', 'OUT']).default('IN'),
  customerId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  chequeNo: z.string().min(2),
  bankName: z.string().optional().nullable(),
  branchName: z.string().optional().nullable(),
  accountName: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  issueDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date(),
  receivedDate: z.coerce.date().optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(['DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED']),
  bankAccountId: z.string().uuid().optional().nullable(),
  eventDate: z.coerce.date().optional(),
  notes: z.string().optional().nullable()
});

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function todayEnd() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function daysFromNow(days) {
  const d = todayEnd();
  d.setDate(d.getDate() + days);
  return d;
}

function normalizeCheque(cheque) {
  return {
    ...cheque,
    amount: Number(cheque.amount || 0),
    partyName: cheque.customer?.name || cheque.supplier?.name || '-',
    partyPhone: cheque.customer?.phone || cheque.supplier?.phone || null,
    bankAccountName: cheque.bankAccount?.name || null
  };
}

async function createChequeEvent(tx, cheque, action, status, notes, userId, eventDate = new Date()) {
  return tx.chequeEvent.create({
    data: {
      tenantId: cheque.tenantId,
      chequeId: cheque.id,
      action,
      status,
      amount: cheque.amount,
      notes: notes || null,
      eventDate,
      createdById: userId || null
    }
  });
}

async function getBankAccount(tx, tenantId, id) {
  if (!id) return null;
  const account = await tx.bankAccount.findFirst({ where: { id, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Cash/Bank account not found'), { status: 404 });
  return account;
}

function partyMessage(cheque) {
  const party = cheque.customer?.name || cheque.supplier?.name || 'Unknown party';
  return `${party} • ${cheque.chequeNo} • LKR ${Number(cheque.amount || 0).toFixed(2)}`;
}

router.get('/summary', requirePermission('cheque:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const start = todayStart();
    const end = todayEnd();
    const upcomingEnd = daysFromNow(7);

    const [total, pending, deposited, cleared, bounced, dueToday, overdue, upcoming, pendingRows, outgoingRows] = await Promise.all([
      prisma.cheque.count({ where: { tenantId } }),
      prisma.cheque.aggregate({ where: { tenantId, status: 'PENDING' }, _sum: { amount: true }, _count: true }),
      prisma.cheque.aggregate({ where: { tenantId, status: 'DEPOSITED' }, _sum: { amount: true }, _count: true }),
      prisma.cheque.aggregate({ where: { tenantId, status: 'CLEARED' }, _sum: { amount: true }, _count: true }),
      prisma.cheque.aggregate({ where: { tenantId, status: 'BOUNCED' }, _sum: { amount: true }, _count: true }),
      prisma.cheque.count({ where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { gte: start, lte: end } } }),
      prisma.cheque.count({ where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { lt: start } } }),
      prisma.cheque.count({ where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { gt: end, lte: upcomingEnd } } }),
      prisma.cheque.findMany({
        where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { lte: upcomingEnd } },
        include: { customer: true, supplier: true, bankAccount: true },
        orderBy: { dueDate: 'asc' },
        take: 8
      }),
      prisma.cheque.findMany({
        where: { tenantId, direction: 'OUT', status: { in: ['PENDING', 'DEPOSITED'] } },
        include: { customer: true, supplier: true, bankAccount: true },
        orderBy: { dueDate: 'asc' },
        take: 8
      })
    ]);

    res.json({
      total,
      pendingCount: pending._count,
      pendingAmount: Number(pending._sum.amount || 0),
      depositedCount: deposited._count,
      depositedAmount: Number(deposited._sum.amount || 0),
      clearedCount: cleared._count,
      clearedAmount: Number(cleared._sum.amount || 0),
      bouncedCount: bounced._count,
      bouncedAmount: Number(bounced._sum.amount || 0),
      dueToday,
      overdue,
      upcoming,
      dueSoon: pendingRows.map(normalizeCheque),
      outgoingDue: outgoingRows.map(normalizeCheque)
    });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('cheque:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.direction) where.direction = String(req.query.direction).toUpperCase();
    if (req.query.partyType) where.partyType = String(req.query.partyType).toUpperCase();
    if (req.query.due === 'overdue') where.dueDate = { lt: todayStart() };
    if (req.query.due === 'today') where.dueDate = { gte: todayStart(), lte: todayEnd() };
    if (req.query.due === 'upcoming') where.dueDate = { gt: todayEnd(), lte: daysFromNow(7) };

    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { chequeNo: { contains: q, mode: 'insensitive' } },
        { bankName: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { supplier: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const cheques = await prisma.cheque.findMany({
      where,
      include: { customer: true, supplier: true, bankAccount: true, events: { orderBy: { eventDate: 'desc' }, take: 5 } },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
      take: 300
    });
    res.json(cheques.map(normalizeCheque));
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('cheque:read'), async (req, res, next) => {
  try {
    const cheque = await prisma.cheque.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { customer: true, supplier: true, bankAccount: true, events: { orderBy: { eventDate: 'desc' } } }
    });
    if (!cheque) return res.status(404).json({ message: 'Cheque not found' });
    res.json(normalizeCheque(cheque));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('cheque:create'), async (req, res, next) => {
  try {
    const data = chequeSchema.parse(req.body);

    if (data.partyType === 'CUSTOMER' && !data.customerId) {
      return res.status(400).json({ message: 'Customer is required for a customer cheque' });
    }
    if (data.partyType === 'SUPPLIER' && !data.supplierId) {
      return res.status(400).json({ message: 'Supplier is required for a supplier cheque' });
    }
    if (data.direction === 'OUT' && !data.bankAccountId) {
      return res.status(400).json({ message: 'Cash/Bank account is required for an outgoing cheque' });
    }

    const created = await prisma.$transaction(async (tx) => {
      if (data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId: req.user.tenantId, isActive: true } });
        if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      }
      if (data.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, tenantId: req.user.tenantId, isActive: true } });
        if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
      }
      if (data.bankAccountId) await getBankAccount(tx, req.user.tenantId, data.bankAccountId);

      const cheque = await tx.cheque.create({
        data: {
          tenantId: req.user.tenantId,
          partyType: data.partyType,
          direction: data.direction,
          customerId: data.partyType === 'CUSTOMER' ? data.customerId : null,
          supplierId: data.partyType === 'SUPPLIER' ? data.supplierId : null,
          bankAccountId: data.bankAccountId || null,
          chequeNo: data.chequeNo.trim(),
          bankName: data.bankName || null,
          branchName: data.branchName || null,
          accountName: data.accountName || null,
          amount: money(data.amount),
          issueDate: data.issueDate || null,
          dueDate: data.dueDate,
          receivedDate: data.receivedDate || new Date(),
          reference: data.reference || null,
          notes: data.notes || null,
          createdById: req.user.id
        },
        include: { customer: true, supplier: true, bankAccount: true }
      });

      await createChequeEvent(tx, cheque, 'CREATED', 'PENDING', 'Cheque registered', req.user.id);
      return cheque;
    });

    if (created.dueDate <= daysFromNow(3) && created.status !== 'CLEARED') {
      await createNotification({
        tenantId: req.user.tenantId,
        type: 'WARNING',
        title: 'Cheque due soon',
        message: `${partyMessage(created)} is due on ${new Date(created.dueDate).toLocaleDateString()}.`,
        priority: 'HIGH',
        entityType: 'Cheque',
        entityId: created.id,
        actionUrl: '/cheques',
        metadata: { chequeNo: created.chequeNo, amount: Number(created.amount || 0) }
      });
    }

    await audit(req, 'CREATE', 'Cheque', created.id, null, created);
    res.status(201).json(normalizeCheque(created));
  } catch (e) {
    if (e.code === 'P2002') e.status = 409, e.message = 'Cheque number already exists for this company';
    next(e);
  }
});

router.patch('/:id/status', requirePermission('cheque:update'), async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const tenantId = req.user.tenantId;

    const before = await prisma.cheque.findFirst({
      where: { id: req.params.id, tenantId },
      include: { customer: true, supplier: true, bankAccount: true }
    });
    if (!before) return res.status(404).json({ message: 'Cheque not found' });
    if (before.status === 'CLEARED') return res.status(400).json({ message: 'Cleared cheques cannot be changed from this page' });
    if (before.status === 'CANCELLED') return res.status(400).json({ message: 'Cancelled cheques cannot be changed' });

    const eventDate = data.eventDate || new Date();
    let result;

    if (data.status === 'DEPOSITED') {
      const accountId = data.bankAccountId || before.bankAccountId;
      const account = accountId ? await getBankAccount(prisma, tenantId, accountId) : null;
      result = await prisma.cheque.update({
        where: { id: before.id },
        data: { status: 'DEPOSITED', bankAccountId: account?.id || before.bankAccountId, depositedAt: eventDate, notes: data.notes ?? before.notes },
        include: { customer: true, supplier: true, bankAccount: true, events: { orderBy: { eventDate: 'desc' }, take: 5 } }
      });
      await prisma.chequeEvent.create({ data: { tenantId, chequeId: before.id, action: 'DEPOSITED', status: 'DEPOSITED', amount: before.amount, notes: data.notes || 'Cheque deposited', eventDate, createdById: req.user.id } });
    }

    if (data.status === 'BOUNCED' || data.status === 'CANCELLED') {
      result = await prisma.cheque.update({
        where: { id: before.id },
        data: {
          status: data.status,
          bouncedAt: data.status === 'BOUNCED' ? eventDate : before.bouncedAt,
          notes: data.notes ?? before.notes
        },
        include: { customer: true, supplier: true, bankAccount: true, events: { orderBy: { eventDate: 'desc' }, take: 5 } }
      });
      await prisma.chequeEvent.create({ data: { tenantId, chequeId: before.id, action: data.status, status: data.status, amount: before.amount, notes: data.notes || data.status, eventDate, createdById: req.user.id } });
      if (data.status === 'BOUNCED') {
        await notifyTenantRoles({
          tenantId,
          roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
          type: 'DANGER',
          title: 'Cheque bounced',
          message: `${partyMessage(before)} was marked as bounced.`,
          priority: 'URGENT',
          entityType: 'Cheque',
          entityId: before.id,
          actionUrl: '/cheques'
        });
      }
    }

    if (data.status === 'CLEARED') {
      const resultFromTx = await prisma.$transaction(async (tx) => {
        const cheque = await tx.cheque.findFirst({ where: { id: before.id, tenantId }, include: { customer: true, supplier: true, bankAccount: true } });
        if (!cheque) throw Object.assign(new Error('Cheque not found'), { status: 404 });
        if (cheque.status === 'CLEARED') throw Object.assign(new Error('Cheque is already cleared'), { status: 400 });

        const accountId = data.bankAccountId || cheque.bankAccountId;
        const account = await getBankAccount(tx, tenantId, accountId);
        const amount = money(cheque.amount);
        let payment = null;

        if (cheque.direction === 'IN') {
          payment = await tx.payment.create({
            data: {
              tenantId,
              customerId: cheque.customerId || null,
              supplierId: cheque.supplierId || null,
              bankAccountId: account.id,
              receiptNo: await nextReceiptNo(tx, tenantId),
              direction: 'IN',
              method: 'CHEQUE',
              amount,
              reference: cheque.chequeNo,
              paidAt: eventDate,
              notes: data.notes || `Cheque cleared ${cheque.chequeNo}`
            },
            include: { customer: true, supplier: true, bankAccount: true }
          });

          if (cheque.customerId) {
            const customer = await tx.customer.findFirst({ where: { id: cheque.customerId, tenantId } });
            if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
            if (Number(customer.balance || 0) < amount) throw Object.assign(new Error('Cheque amount is greater than customer outstanding balance'), { status: 400 });
            await tx.customer.update({ where: { id: cheque.customerId }, data: { balance: { decrement: amount } } });
            await postCustomerReceiptJournal(tx, { tenantId, payment, bankAccount: account, createdById: req.user.id });
          }

          await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: amount } } });
          await tx.bankTransaction.create({
            data: { tenantId, bankAccountId: account.id, type: 'CUSTOMER_RECEIPT', direction: 'IN', amount, refType: 'Cheque', refId: cheque.id, description: `Cheque cleared ${cheque.chequeNo}`, transactionDate: eventDate }
          });
        }

        if (cheque.direction === 'OUT') {
          payment = await tx.payment.create({
            data: {
              tenantId,
              customerId: cheque.customerId || null,
              supplierId: cheque.supplierId || null,
              bankAccountId: account.id,
              receiptNo: await nextReceiptNo(tx, tenantId),
              direction: 'OUT',
              method: 'CHEQUE',
              amount,
              reference: cheque.chequeNo,
              paidAt: eventDate,
              notes: data.notes || `Outgoing cheque cleared ${cheque.chequeNo}`
            },
            include: { customer: true, supplier: true, bankAccount: true }
          });

          if (cheque.supplierId) {
            const supplier = await tx.supplier.findFirst({ where: { id: cheque.supplierId, tenantId } });
            if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
            if (Number(supplier.balance || 0) < amount) throw Object.assign(new Error('Cheque amount is greater than supplier payable balance'), { status: 400 });
            await tx.supplier.update({ where: { id: cheque.supplierId }, data: { balance: { decrement: amount } } });
            await postSupplierPaymentJournal(tx, { tenantId, payment, bankAccount: account, createdById: req.user.id });
          }

          await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { decrement: amount } } });
          await tx.bankTransaction.create({
            data: { tenantId, bankAccountId: account.id, type: 'SUPPLIER_PAYMENT', direction: 'OUT', amount, refType: 'Cheque', refId: cheque.id, description: `Outgoing cheque cleared ${cheque.chequeNo}`, transactionDate: eventDate }
          });
        }

        const updated = await tx.cheque.update({
          where: { id: cheque.id },
          data: { status: 'CLEARED', bankAccountId: account.id, paymentId: payment?.id || null, clearedAt: eventDate, notes: data.notes ?? cheque.notes },
          include: { customer: true, supplier: true, bankAccount: true, events: { orderBy: { eventDate: 'desc' }, take: 5 } }
        });
        await createChequeEvent(tx, updated, 'CLEARED', 'CLEARED', data.notes || `Payment ${payment?.receiptNo || ''}`.trim(), req.user.id, eventDate);
        return { cheque: updated, payment };
      });
      result = resultFromTx.cheque;
    }

    await audit(req, `CHEQUE_${data.status}`, 'Cheque', before.id, before, result);
    res.json(normalizeCheque(result));
  } catch (e) { next(e); }
});

router.post('/due-alerts', requirePermission('cheque:remind'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const dueCheques = await prisma.cheque.findMany({
      where: { tenantId, status: { in: ['PENDING', 'DEPOSITED'] }, dueDate: { lte: daysFromNow(3) } },
      include: { customer: true, supplier: true, bankAccount: true },
      orderBy: { dueDate: 'asc' },
      take: 100
    });

    const notifications = [];
    for (const cheque of dueCheques) {
      notifications.push(await createNotification({
        tenantId,
        type: cheque.dueDate < todayStart() ? 'DANGER' : 'WARNING',
        title: cheque.dueDate < todayStart() ? 'Overdue cheque' : 'Cheque due soon',
        message: `${partyMessage(cheque)} is due on ${new Date(cheque.dueDate).toLocaleDateString()}.`,
        priority: cheque.dueDate < todayStart() ? 'URGENT' : 'HIGH',
        entityType: 'Cheque',
        entityId: cheque.id,
        actionUrl: '/cheques',
        metadata: { chequeNo: cheque.chequeNo, amount: Number(cheque.amount || 0), status: cheque.status }
      }));
    }

    await audit(req, 'GENERATE_CHEQUE_ALERTS', 'Cheque', null, null, { count: notifications.filter(Boolean).length });
    res.json({ created: notifications.filter(Boolean).length, totalDue: dueCheques.length });
  } catch (e) { next(e); }
});

export default router;
