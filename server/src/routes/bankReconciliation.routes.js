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
router.use(planFeatureGuard('allowBankReconciliation', 'bank reconciliation'));

const lineSchema = z.object({
  transactionDate: z.coerce.date(),
  description: z.string().min(1),
  reference: z.string().optional().nullable(),
  direction: z.enum(['IN', 'OUT']),
  amount: z.coerce.number().positive(),
  balanceAfter: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable()
});

const statementSchema = z.object({
  bankAccountId: z.string().uuid(),
  name: z.string().min(2),
  statementDate: z.coerce.date().optional(),
  periodFrom: z.coerce.date().optional().nullable(),
  periodTo: z.coerce.date().optional().nullable(),
  openingBalance: z.coerce.number().optional().default(0),
  closingBalance: z.coerce.number().optional().default(0),
  notes: z.string().optional().nullable(),
  csvText: z.string().optional().nullable(),
  lines: z.array(lineSchema).optional().default([])
});

const matchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  notes: z.string().optional().nullable()
});

const autoMatchSchema = z.object({
  daysTolerance: z.coerce.number().int().min(0).max(30).optional().default(3),
  amountTolerance: z.coerce.number().min(0).max(1000).optional().default(0)
});

const reconciliationSchema = z.object({
  bankAccountId: z.string().uuid(),
  periodFrom: z.coerce.date().optional().nullable(),
  periodTo: z.coerce.date().optional().nullable(),
  statementClosingBalance: z.coerce.number().default(0),
  notes: z.string().optional().nullable()
});

function parseCsvText(csvText = '') {
  const rows = [];
  for (const raw of String(csvText || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^date\s*,/i.test(line)) continue;
    const cols = line.split(',').map((v) => v.trim());
    if (cols.length < 5) continue;
    const [date, description, reference, directionOrDebit, amountOrCredit, balance] = cols;
    let direction = String(directionOrDebit || '').toUpperCase();
    let amount = Number(amountOrCredit || 0);
    if (!['IN', 'OUT'].includes(direction)) {
      const debit = Number(directionOrDebit || 0);
      const credit = Number(amountOrCredit || 0);
      direction = credit > 0 ? 'IN' : 'OUT';
      amount = credit > 0 ? credit : debit;
    }
    if (!date || !description || !amount || amount <= 0) continue;
    rows.push({ transactionDate: new Date(date), description, reference: reference || null, direction, amount, balanceAfter: balance ? Number(balance) : null });
  }
  return rows;
}

async function nextImportNo(tx, tenantId) {
  const count = await tx.bankStatement.count({ where: { tenantId } });
  return `BST${String(count + 1001).padStart(4, '0')}`;
}

async function nextReconciliationNo(tx, tenantId) {
  const count = await tx.bankReconciliation.count({ where: { tenantId } });
  return `REC${String(count + 1001).padStart(4, '0')}`;
}

async function findAccount(tx, tenantId, bankAccountId) {
  const account = await tx.bankAccount.findFirst({ where: { id: bankAccountId, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Bank account not found'), { status: 404 });
  return account;
}

function normalizeStatement(row) {
  const total = Number(row.totalDebit || 0) + Number(row.totalCredit || 0);
  const matchedLines = row.lines?.filter((l) => l.isMatched)?.length || 0;
  const lineCount = row.lines?.length || row._count?.lines || 0;
  return {
    ...row,
    bankAccountName: row.bankAccount?.name || '-',
    lineCount,
    matchedLines,
    matchPercent: lineCount ? Math.round((matchedLines / lineCount) * 100) : 0,
    totalDebit: Number(row.totalDebit || 0),
    totalCredit: Number(row.totalCredit || 0),
    totalAmount: Number(total || 0)
  };
}

function normalizeLine(row) {
  return {
    ...row,
    bankAccountName: row.bankAccount?.name || '-',
    statementName: row.statement?.name || '-',
    amountLabel: money(row.amount),
    matchCount: row.matches?.length || 0
  };
}

function normalizeSystemTx(row) {
  return {
    ...row,
    bankAccountName: row.bankAccount?.name || '-',
    amountLabel: money(row.amount),
    matchCount: row.reconciliationMatches?.length || 0
  };
}

function dateDistanceDays(a, b) {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function textScore(statementLine, systemTx) {
  const source = `${statementLine.description || ''} ${statementLine.reference || ''}`.toLowerCase();
  const target = `${systemTx.description || ''} ${systemTx.refType || ''} ${systemTx.refId || ''}`.toLowerCase();
  if (!source || !target) return 0;
  if (source.includes(String(systemTx.refId || '').toLowerCase()) && systemTx.refId) return 3;
  const tokens = source.split(/\W+/).filter((t) => t.length > 3);
  return tokens.filter((t) => target.includes(t)).length;
}

async function getUnmatchedTransactions(tx, tenantId, bankAccountId) {
  const matched = await tx.bankReconciliationMatch.findMany({ where: { tenantId, bankAccountId }, select: { bankTransactionId: true } });
  const ids = matched.map((m) => m.bankTransactionId);
  return tx.bankTransaction.findMany({
    where: { tenantId, bankAccountId, ...(ids.length ? { id: { notIn: ids } } : {}) },
    include: { bankAccount: true, reconciliationMatches: true },
    orderBy: { transactionDate: 'desc' },
    take: 500
  });
}

async function createMatch(tx, { tenantId, line, transaction, matchType, notes, userId }) {
  const difference = money(Number(line.amount || 0) - Number(transaction.amount || 0));
  const match = await tx.bankReconciliationMatch.create({
    data: {
      tenantId,
      statementLineId: line.id,
      bankTransactionId: transaction.id,
      bankAccountId: line.bankAccountId,
      matchType,
      amount: Math.min(Number(line.amount || 0), Number(transaction.amount || 0)),
      difference,
      notes: notes || null,
      matchedById: userId
    }
  });
  await tx.bankStatementLine.update({ where: { id: line.id }, data: { isMatched: true, matchedAt: new Date(), ignored: false } });
  return match;
}

router.get('/summary', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [statements, lines, matchedLines, ignoredLines, accounts, recentReconciliations] = await Promise.all([
      prisma.bankStatement.count({ where: { tenantId } }),
      prisma.bankStatementLine.count({ where: { tenantId } }),
      prisma.bankStatementLine.count({ where: { tenantId, isMatched: true } }),
      prisma.bankStatementLine.count({ where: { tenantId, ignored: true } }),
      prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, include: { bankReconciliationMatches: true, transactions: true } }),
      prisma.bankReconciliation.findMany({ where: { tenantId }, include: { bankAccount: true }, orderBy: { createdAt: 'desc' }, take: 6 })
    ]);
    const unmatchedLines = Math.max(0, lines - matchedLines - ignoredLines);
    const accountSummary = accounts.map((a) => ({ id: a.id, name: a.name, currentBalance: money(a.currentBalance), systemTransactions: a.transactions.length, matchedTransactions: a.bankReconciliationMatches.length }));
    res.json({ statements, lines, matchedLines, ignoredLines, unmatchedLines, matchPercent: lines ? Math.round((matchedLines / lines) * 100) : 0, accountSummary, recentReconciliations });
  } catch (e) { next(e); }
});

router.get('/statements', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.bankAccountId) where.bankAccountId = String(req.query.bankAccountId);
    const rows = await prisma.bankStatement.findMany({ where, include: { bankAccount: true, lines: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(rows.map(normalizeStatement));
  } catch (e) { next(e); }
});

router.post('/statements', requirePermission('bankrecon:create'), async (req, res, next) => {
  try {
    const data = statementSchema.parse(req.body);
    const csvLines = parseCsvText(data.csvText);
    const allLines = [...(data.lines || []), ...csvLines].filter(Boolean);
    if (!allLines.length) return res.status(400).json({ message: 'Add at least one statement line or paste CSV text' });

    const created = await prisma.$transaction(async (tx) => {
      await findAccount(tx, req.user.tenantId, data.bankAccountId);
      const importNo = await nextImportNo(tx, req.user.tenantId);
      const totalDebit = money(allLines.filter((l) => l.direction === 'OUT').reduce((sum, l) => sum + Number(l.amount || 0), 0));
      const totalCredit = money(allLines.filter((l) => l.direction === 'IN').reduce((sum, l) => sum + Number(l.amount || 0), 0));
      return tx.bankStatement.create({
        data: {
          tenantId: req.user.tenantId,
          bankAccountId: data.bankAccountId,
          importNo,
          name: data.name,
          statementDate: data.statementDate || new Date(),
          periodFrom: data.periodFrom || null,
          periodTo: data.periodTo || null,
          openingBalance: money(data.openingBalance || 0),
          closingBalance: money(data.closingBalance || 0),
          totalDebit,
          totalCredit,
          notes: data.notes || null,
          createdById: req.user.id,
          lines: { create: allLines.map((line) => ({ tenantId: req.user.tenantId, bankAccountId: data.bankAccountId, transactionDate: line.transactionDate, description: line.description, reference: line.reference || null, direction: line.direction, amount: money(line.amount), balanceAfter: line.balanceAfter === null || line.balanceAfter === undefined ? null : money(line.balanceAfter), notes: line.notes || null })) }
        },
        include: { bankAccount: true, lines: true }
      });
    });
    await audit(req, 'CREATE', 'BankStatement', created.id, null, created);
    res.status(201).json(normalizeStatement(created));
  } catch (e) { next(e); }
});

router.get('/statements/:id', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    const row = await prisma.bankStatement.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { bankAccount: true, lines: { include: { matches: { include: { bankTransaction: true } } }, orderBy: { transactionDate: 'asc' } } } });
    if (!row) return res.status(404).json({ message: 'Statement not found' });
    res.json({ ...normalizeStatement(row), lines: row.lines.map(normalizeLine) });
  } catch (e) { next(e); }
});

router.get('/lines', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.bankAccountId) where.bankAccountId = String(req.query.bankAccountId);
    if (req.query.statementId) where.statementId = String(req.query.statementId);
    if (req.query.matched === 'true') where.isMatched = true;
    if (req.query.matched === 'false') where.isMatched = false;
    if (req.query.ignored === 'true') where.ignored = true;
    if (req.query.ignored === 'false') where.ignored = false;
    const rows = await prisma.bankStatementLine.findMany({ where, include: { bankAccount: true, statement: true, matches: { include: { bankTransaction: true } } }, orderBy: { transactionDate: 'desc' }, take: 500 });
    res.json(rows.map(normalizeLine));
  } catch (e) { next(e); }
});

router.get('/transactions/unmatched', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    if (!req.query.bankAccountId) return res.status(400).json({ message: 'bankAccountId is required' });
    const rows = await getUnmatchedTransactions(prisma, req.user.tenantId, String(req.query.bankAccountId));
    res.json(rows.map(normalizeSystemTx));
  } catch (e) { next(e); }
});

router.post('/lines/:id/match', requirePermission('bankrecon:match'), async (req, res, next) => {
  try {
    const data = matchSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const line = await tx.bankStatementLine.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!line) throw Object.assign(new Error('Statement line not found'), { status: 404 });
      if (line.isMatched) throw Object.assign(new Error('Statement line already matched'), { status: 400 });
      const transaction = await tx.bankTransaction.findFirst({ where: { id: data.bankTransactionId, tenantId: req.user.tenantId, bankAccountId: line.bankAccountId } });
      if (!transaction) throw Object.assign(new Error('System bank transaction not found'), { status: 404 });
      const existing = await tx.bankReconciliationMatch.findFirst({ where: { tenantId: req.user.tenantId, bankTransactionId: transaction.id } });
      if (existing) throw Object.assign(new Error('System transaction already matched'), { status: 400 });
      return createMatch(tx, { tenantId: req.user.tenantId, line, transaction, matchType: 'MANUAL', notes: data.notes, userId: req.user.id });
    });
    await audit(req, 'MATCH', 'BankStatementLine', req.params.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.delete('/matches/:id', requirePermission('bankrecon:match'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const match = await tx.bankReconciliationMatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!match) throw Object.assign(new Error('Match not found'), { status: 404 });
      await tx.bankReconciliationMatch.delete({ where: { id: match.id } });
      const remaining = await tx.bankReconciliationMatch.count({ where: { statementLineId: match.statementLineId } });
      if (!remaining) await tx.bankStatementLine.update({ where: { id: match.statementLineId }, data: { isMatched: false, matchedAt: null } });
      return match;
    });
    await audit(req, 'UNMATCH', 'BankReconciliationMatch', result.id, result, null);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.post('/lines/:id/ignore', requirePermission('bankrecon:match'), async (req, res, next) => {
  try {
    const before = await prisma.bankStatementLine.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Statement line not found' });
    const line = await prisma.bankStatementLine.update({ where: { id: before.id }, data: { ignored: !before.ignored } });
    await audit(req, 'IGNORE', 'BankStatementLine', line.id, before, line);
    res.json(normalizeLine(line));
  } catch (e) { next(e); }
});

router.post('/statements/:id/auto-match', requirePermission('bankrecon:match'), async (req, res, next) => {
  try {
    const options = autoMatchSchema.parse(req.body || {});
    const result = await prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { lines: true } });
      if (!statement) throw Object.assign(new Error('Statement not found'), { status: 404 });
      const unmatchedTransactions = await getUnmatchedTransactions(tx, req.user.tenantId, statement.bankAccountId);
      const used = new Set();
      const created = [];
      for (const line of statement.lines.filter((l) => !l.isMatched && !l.ignored)) {
        const candidates = unmatchedTransactions
          .filter((txRow) => !used.has(txRow.id))
          .filter((txRow) => txRow.direction === line.direction)
          .filter((txRow) => Math.abs(Number(txRow.amount || 0) - Number(line.amount || 0)) <= Number(options.amountTolerance || 0))
          .filter((txRow) => dateDistanceDays(txRow.transactionDate, line.transactionDate) <= Number(options.daysTolerance || 0))
          .map((txRow) => ({ txRow, score: textScore(line, txRow) + (new Date(txRow.transactionDate).toDateString() === new Date(line.transactionDate).toDateString() ? 2 : 0) }))
          .sort((a, b) => b.score - a.score);
        if (candidates.length === 1 || (candidates[0] && candidates[0].score > (candidates[1]?.score || -1))) {
          const transaction = candidates[0].txRow;
          used.add(transaction.id);
          created.push(await createMatch(tx, { tenantId: req.user.tenantId, line, transaction, matchType: 'AUTO', notes: 'Auto matched by amount/date/reference', userId: req.user.id }));
        }
      }
      if (created.length) await tx.bankStatement.update({ where: { id: statement.id }, data: { status: 'MATCHED' } });
      return { created: created.length, matches: created };
    });
    await audit(req, 'AUTO_MATCH', 'BankStatement', req.params.id, null, result);
    res.json(result);
  } catch (e) { next(e); }
});

router.get('/reconciliations', requirePermission('bankrecon:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.bankAccountId) where.bankAccountId = String(req.query.bankAccountId);
    const rows = await prisma.bankReconciliation.findMany({ where, include: { bankAccount: true }, orderBy: { createdAt: 'desc' }, take: 200 });
    res.json(rows.map((r) => ({ ...r, bankAccountName: r.bankAccount?.name || '-', statementClosingBalance: Number(r.statementClosingBalance || 0), systemClosingBalance: Number(r.systemClosingBalance || 0), matchedAmount: Number(r.matchedAmount || 0), unreconciledAmount: Number(r.unreconciledAmount || 0), difference: Number(r.difference || 0) })));
  } catch (e) { next(e); }
});

router.post('/reconciliations', requirePermission('bankrecon:create'), async (req, res, next) => {
  try {
    const data = reconciliationSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const account = await findAccount(tx, req.user.tenantId, data.bankAccountId);
      const periodWhere = { tenantId: req.user.tenantId, bankAccountId: account.id };
      if (data.periodFrom || data.periodTo) {
        periodWhere.transactionDate = {};
        if (data.periodFrom) periodWhere.transactionDate.gte = data.periodFrom;
        if (data.periodTo) periodWhere.transactionDate.lte = data.periodTo;
      }
      const statementLines = await tx.bankStatementLine.findMany({ where: periodWhere });
      const matches = await tx.bankReconciliationMatch.findMany({ where: { tenantId: req.user.tenantId, bankAccountId: account.id } });
      const matchedLineIds = new Set(matches.map((m) => m.statementLineId));
      const matchedAmount = statementLines.filter((l) => matchedLineIds.has(l.id)).reduce((sum, l) => sum + Number(l.amount || 0), 0);
      const unreconciledAmount = statementLines.filter((l) => !matchedLineIds.has(l.id) && !l.ignored).reduce((sum, l) => sum + Number(l.amount || 0), 0);
      const systemClosingBalance = Number(account.currentBalance || 0);
      const difference = money(Number(data.statementClosingBalance || 0) - systemClosingBalance);
      const rec = await tx.bankReconciliation.create({ data: { tenantId: req.user.tenantId, bankAccountId: account.id, reconciliationNo: await nextReconciliationNo(tx, req.user.tenantId), periodFrom: data.periodFrom || null, periodTo: data.periodTo || null, statementClosingBalance: money(data.statementClosingBalance || 0), systemClosingBalance: money(systemClosingBalance), matchedAmount: money(matchedAmount), unreconciledAmount: money(unreconciledAmount), difference, status: Math.abs(difference) < 0.01 && unreconciledAmount === 0 ? 'CLOSED' : 'OPEN', notes: data.notes || null, createdById: req.user.id }, include: { bankAccount: true } });
      return rec;
    });
    if (result.status === 'OPEN') {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'], type: 'WARNING', title: 'Bank reconciliation has difference', message: `${result.reconciliationNo} difference is LKR ${Number(result.difference || 0).toFixed(2)}.`, priority: 'HIGH', entityType: 'BankReconciliation', entityId: result.id, actionUrl: '/bank-reconciliation' });
    } else {
      await createNotification({ tenantId: req.user.tenantId, userId: req.user.id, type: 'SUCCESS', title: 'Bank reconciliation closed', message: `${result.reconciliationNo} is fully reconciled.`, entityType: 'BankReconciliation', entityId: result.id, actionUrl: '/bank-reconciliation' });
    }
    await audit(req, 'CREATE', 'BankReconciliation', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
