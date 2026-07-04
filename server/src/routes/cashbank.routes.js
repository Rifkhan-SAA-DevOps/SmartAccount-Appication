import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { postBankOpeningJournal, postBankAdjustmentJournal, postBankTransferJournal, postExpenseJournal } from '../utils/accountingPost.js';

const router = Router();
router.use(authRequired);

const methodEnum = z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CREDIT']);

const accountSchema = z.object({
  name: z.string().min(1),
  type: z.string().optional().default('cash'),
  bankName: z.string().optional().nullable(),
  accountNumber: z.string().optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
  isCashAccount: z.boolean().optional().default(false)
});

const expenseSchema = z.object({
  bankAccountId: z.string().uuid().optional().nullable(),
  title: z.string().min(1),
  category: z.string().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: methodEnum.optional().default('CASH'),
  reference: z.string().optional().nullable(),
  spentAt: z.coerce.date().optional(),
  notes: z.string().optional().nullable()
});

const transferSchema = z.object({
  fromAccountId: z.string().uuid(),
  toAccountId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  transactionDate: z.coerce.date().optional(),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const adjustmentSchema = z.object({
  amount: z.coerce.number(),
  direction: z.enum(['IN', 'OUT']),
  description: z.string().min(1),
  transactionDate: z.coerce.date().optional()
});

async function nextExpenseNo(tx, tenantId) {
  const count = await tx.expense.count({ where: { tenantId } });
  return `EXP${String(count + 1001).padStart(4, '0')}`;
}

async function findAccountOrThrow(tx, tenantId, id) {
  const account = await tx.bankAccount.findFirst({ where: { id, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Bank/Cash account not found'), { status: 404 });
  return account;
}

router.get('/summary', requirePermission('cashbank:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [accounts, monthlyExpenses, cashIn, cashOut, recentTransactions] = await Promise.all([
      prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, orderBy: [{ isCashAccount: 'desc' }, { name: 'asc' }] }),
      prisma.expense.aggregate({ where: { tenantId, spentAt: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.bankTransaction.aggregate({ where: { tenantId, direction: 'IN', transactionDate: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.bankTransaction.aggregate({ where: { tenantId, direction: 'OUT', transactionDate: { gte: startOfMonth } }, _sum: { amount: true } }),
      prisma.bankTransaction.findMany({ where: { tenantId }, include: { bankAccount: true }, orderBy: { transactionDate: 'desc' }, take: 10 })
    ]);

    const totalBalance = accounts.reduce((sum, account) => money(sum + Number(account.currentBalance)), 0);

    res.json({
      totalBalance,
      monthlyExpenses: money(monthlyExpenses._sum.amount || 0),
      monthlyCashIn: money(cashIn._sum.amount || 0),
      monthlyCashOut: money(cashOut._sum.amount || 0),
      accountCount: accounts.length,
      accounts,
      recentTransactions
    });
  } catch (e) { next(e); }
});

router.get('/accounts', requirePermission('cashbank:read'), async (req, res, next) => {
  try {
    const accounts = await prisma.bankAccount.findMany({
      where: { tenantId: req.user.tenantId, isActive: true },
      orderBy: [{ isCashAccount: 'desc' }, { name: 'asc' }]
    });
    res.json(accounts);
  } catch (e) { next(e); }
});

router.post('/accounts', requirePermission('cashbank:create'), async (req, res, next) => {
  try {
    const data = accountSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const openingBalance = money(data.openingBalance || 0);
      const account = await tx.bankAccount.create({
        data: {
          tenantId: req.user.tenantId,
          name: data.name,
          type: data.type || 'cash',
          bankName: data.bankName || null,
          accountNumber: data.accountNumber || null,
          openingBalance,
          currentBalance: openingBalance,
          isCashAccount: data.isCashAccount || false
        }
      });

      if (openingBalance !== 0) {
        await tx.bankTransaction.create({
          data: {
            tenantId: req.user.tenantId,
            bankAccountId: account.id,
            type: 'OPENING_BALANCE',
            direction: openingBalance >= 0 ? 'IN' : 'OUT',
            amount: Math.abs(openingBalance),
            description: `Opening balance for ${account.name}`,
            transactionDate: new Date()
          }
        });
      }
      await postBankOpeningJournal(tx, { tenantId: req.user.tenantId, account, createdById: req.user.id });

      return account;
    });

    await audit(req, 'CREATE', 'BankAccount', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/accounts/:id/adjust', requirePermission('cashbank:create'), async (req, res, next) => {
  try {
    const data = adjustmentSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const account = await findAccountOrThrow(tx, req.user.tenantId, req.params.id);
      const amount = money(Math.abs(data.amount));
      const updated = await tx.bankAccount.update({
        where: { id: account.id },
        data: { currentBalance: data.direction === 'IN' ? { increment: amount } : { decrement: amount } }
      });
      const transaction = await tx.bankTransaction.create({
        data: {
          tenantId: req.user.tenantId,
          bankAccountId: account.id,
          type: 'ADJUSTMENT',
          direction: data.direction,
          amount,
          description: data.description,
          transactionDate: data.transactionDate || new Date()
        }
      });
      await postBankAdjustmentJournal(tx, { tenantId: req.user.tenantId, account: updated, transaction, createdById: req.user.id });
      return { account: updated, transaction };
    });

    await audit(req, 'ADJUST', 'BankAccount', req.params.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/expenses', requirePermission('cashbank:read'), async (req, res, next) => {
  try {
    const expenses = await prisma.expense.findMany({
      where: { tenantId: req.user.tenantId },
      include: { bankAccount: true },
      orderBy: { spentAt: 'desc' },
      take: 200
    });
    res.json(expenses);
  } catch (e) { next(e); }
});

router.post('/expenses', requirePermission('cashbank:create'), async (req, res, next) => {
  try {
    const data = expenseSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      let account = null;
      if (data.bankAccountId) account = await findAccountOrThrow(tx, req.user.tenantId, data.bankAccountId);

      const expenseNo = await nextExpenseNo(tx, req.user.tenantId);
      const amount = money(data.amount);
      const expense = await tx.expense.create({
        data: {
          tenantId: req.user.tenantId,
          bankAccountId: account?.id || null,
          expenseNo,
          title: data.title,
          category: data.category || null,
          amount,
          method: data.method,
          paymentMode: data.method.toLowerCase(),
          reference: data.reference || null,
          spentAt: data.spentAt || new Date(),
          notes: data.notes || null,
          createdById: req.user.id
        },
        include: { bankAccount: true }
      });

      let transaction = null;
      if (account) {
        await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { decrement: amount } } });
        transaction = await tx.bankTransaction.create({
          data: {
            tenantId: req.user.tenantId,
            bankAccountId: account.id,
            type: 'EXPENSE',
            direction: 'OUT',
            amount,
            refType: 'Expense',
            refId: expense.id,
            description: `${expenseNo} - ${data.title}`,
            transactionDate: expense.spentAt
          }
        });
      }

      await postExpenseJournal(tx, { tenantId: req.user.tenantId, expense, bankAccount: account, createdById: req.user.id });

      return { expense, transaction };
    });

    await audit(req, 'CREATE', 'Expense', result.expense.id, null, result.expense);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/transfers', requirePermission('cashbank:create'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    if (data.fromAccountId === data.toAccountId) return res.status(400).json({ message: 'From and To accounts must be different' });

    const result = await prisma.$transaction(async (tx) => {
      const from = await findAccountOrThrow(tx, req.user.tenantId, data.fromAccountId);
      const to = await findAccountOrThrow(tx, req.user.tenantId, data.toAccountId);
      const amount = money(data.amount);
      const date = data.transactionDate || new Date();
      if (Number(from.currentBalance) < amount) throw Object.assign(new Error(`Not enough balance in ${from.name}`), { status: 400 });

      const updatedFrom = await tx.bankAccount.update({ where: { id: from.id }, data: { currentBalance: { decrement: amount } } });
      const updatedTo = await tx.bankAccount.update({ where: { id: to.id }, data: { currentBalance: { increment: amount } } });
      const outTx = await tx.bankTransaction.create({ data: { tenantId: req.user.tenantId, bankAccountId: from.id, type: 'BANK_TRANSFER_OUT', direction: 'OUT', amount, refType: 'Transfer', refId: to.id, description: data.notes || `Transfer to ${to.name}`, transactionDate: date } });
      const inTx = await tx.bankTransaction.create({ data: { tenantId: req.user.tenantId, bankAccountId: to.id, type: 'BANK_TRANSFER_IN', direction: 'IN', amount, refType: 'Transfer', refId: from.id, description: data.notes || `Transfer from ${from.name}`, transactionDate: date } });
      await postBankTransferJournal(tx, { tenantId: req.user.tenantId, fromAccount: from, toAccount: to, amount, date, reference: `${outTx.id}:${inTx.id}`, createdById: req.user.id });
      return { from: updatedFrom, to: updatedTo, transactions: [outTx, inTx] };
    });

    await audit(req, 'TRANSFER', 'BankAccount', `${data.fromAccountId}->${data.toAccountId}`, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/transactions', requirePermission('cashbank:read'), async (req, res, next) => {
  try {
    const accountId = req.query.accountId || undefined;
    const transactions = await prisma.bankTransaction.findMany({
      where: { tenantId: req.user.tenantId, ...(accountId ? { bankAccountId: accountId } : {}) },
      include: { bankAccount: true },
      orderBy: { transactionDate: 'desc' },
      take: 300
    });
    res.json(transactions);
  } catch (e) { next(e); }
});

export default router;
