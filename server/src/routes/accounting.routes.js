import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowReports'));

const accountTypeEnum = z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE', 'COST_OF_GOODS_SOLD']);
const normalBalanceEnum = z.enum(['DEBIT', 'CREDIT']);

const accountSchema = z.object({
  code: z.string().min(1),
  name: z.string().min(1),
  type: accountTypeEnum,
  normalBalance: normalBalanceEnum.optional().default('DEBIT')
});

const journalLineSchema = z.object({
  ledgerAccountId: z.string().uuid(),
  description: z.string().optional().nullable(),
  debit: z.coerce.number().nonnegative().optional().default(0),
  credit: z.coerce.number().nonnegative().optional().default(0)
}).refine((line) => Number(line.debit || 0) > 0 || Number(line.credit || 0) > 0, {
  message: 'Each journal line needs either debit or credit'
}).refine((line) => !(Number(line.debit || 0) > 0 && Number(line.credit || 0) > 0), {
  message: 'One line cannot have both debit and credit'
});

const journalEntrySchema = z.object({
  entryDate: z.coerce.date().optional(),
  description: z.string().min(1),
  reference: z.string().optional().nullable(),
  lines: z.array(journalLineSchema).min(2)
});

const DEFAULT_ACCOUNTS = [
  { code: '1000', name: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1010', name: 'Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '1200', name: 'Inventory Asset', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '2100', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: '3000', name: 'Owner Capital', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '4000', name: 'Sales Revenue', type: 'INCOME', normalBalance: 'CREDIT' },
  { code: '4010', name: 'Sales Returns and Allowances', type: 'INCOME', normalBalance: 'DEBIT' },
  { code: '5000', name: 'Cost of Goods Sold', type: 'COST_OF_GOODS_SOLD', normalBalance: 'DEBIT' },
  { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '6010', name: 'Rent Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '6020', name: 'Salary Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '6030', name: 'Utility Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '6040', name: 'Transport Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '6050', name: 'Inventory Adjustment Expense', type: 'EXPENSE', normalBalance: 'DEBIT' }
];

function parseDateRange(query) {
  const now = new Date();
  const from = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), 1);
  const to = query.to ? new Date(query.to) : now;
  if (query.to && String(query.to).length <= 10) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function sum(items, selector) {
  return money(items.reduce((total, item) => total + Number(selector(item) || 0), 0));
}

async function nextEntryNo(tx, tenantId) {
  const count = await tx.journalEntry.count({ where: { tenantId } });
  return `JE${String(count + 1001).padStart(4, '0')}`;
}

async function getOperatingTotals(tenantId, from, to) {
  const [invoices, salesReturns, expenses, products, customers, suppliers, bankAccounts] = await Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, status: { not: 'CANCELLED' }, issueDate: { gte: from, lte: to } },
      include: { items: true }
    }),
    prisma.salesReturn.findMany({
      where: { tenantId, status: 'POSTED', returnDate: { gte: from, lte: to } },
      include: { items: { include: { product: true } } }
    }),
    prisma.expense.findMany({ where: { tenantId, spentAt: { gte: from, lte: to } } }),
    prisma.product.findMany({ where: { tenantId, isActive: true } }),
    prisma.customer.findMany({ where: { tenantId, isActive: true } }),
    prisma.supplier.findMany({ where: { tenantId, isActive: true } }),
    prisma.bankAccount.findMany({ where: { tenantId, isActive: true } })
  ]);

  const grossSales = sum(invoices, (invoice) => invoice.total);
  const salesReturnsTotal = sum(salesReturns, (salesReturn) => salesReturn.total);
  const netSales = money(grossSales - salesReturnsTotal);
  const cogsFromInvoices = sum(invoices.flatMap((invoice) => invoice.items), (item) => Number(item.qty) * Number(item.costPrice));
  const cogsFromReturns = sum(salesReturns.flatMap((salesReturn) => salesReturn.items), (item) => Number(item.qty) * Number(item.product?.costPrice || 0));
  const costOfGoodsSold = money(Math.max(0, cogsFromInvoices - cogsFromReturns));
  const grossProfit = money(netSales - costOfGoodsSold);
  const operatingExpenses = sum(expenses, (expense) => expense.amount);
  const netProfit = money(grossProfit - operatingExpenses);

  const cashAndBank = sum(bankAccounts, (account) => account.currentBalance);
  const receivables = sum(customers, (customer) => customer.balance);
  const payables = sum(suppliers, (supplier) => supplier.balance);
  const inventoryValue = sum(products, (product) => Number(product.stockQty) * Number(product.costPrice));
  const assets = money(cashAndBank + receivables + inventoryValue);
  const liabilities = payables;
  const equity = money(assets - liabilities);

  return {
    from,
    to,
    sales: {
      invoiceCount: invoices.length,
      grossSales,
      salesReturns: salesReturnsTotal,
      netSales
    },
    profitLoss: {
      netSales,
      costOfGoodsSold,
      grossProfit,
      operatingExpenses,
      netProfit
    },
    balanceSheet: {
      assets: {
        cashAndBank,
        accountsReceivable: receivables,
        inventory: inventoryValue,
        totalAssets: assets
      },
      liabilities: {
        accountsPayable: payables,
        totalLiabilities: liabilities
      },
      equity: {
        currentPeriodProfit: netProfit,
        estimatedOwnerEquity: equity,
        totalEquity: equity
      },
      check: money(assets - liabilities - equity)
    },
    counts: {
      products: products.length,
      customers: customers.length,
      suppliers: suppliers.length,
      bankAccounts: bankAccounts.length,
      expenses: expenses.length,
      returns: salesReturns.length
    }
  };
}

router.post('/setup-defaults', requirePermission('accounting:manage'), async (req, res, next) => {
  try {
    const accounts = await prisma.$transaction(async (tx) => {
      const created = [];
      for (const account of DEFAULT_ACCOUNTS) {
        created.push(await tx.ledgerAccount.upsert({
          where: { tenantId_code: { tenantId: req.user.tenantId, code: account.code } },
          update: { name: account.name, type: account.type, normalBalance: account.normalBalance, isSystem: true, isActive: true },
          create: { tenantId: req.user.tenantId, ...account, isSystem: true }
        }));
      }
      return created;
    });

    await audit(req, 'SETUP_DEFAULTS', 'LedgerAccount', 'default-chart-of-accounts', null, { count: accounts.length });
    res.status(201).json({ message: 'Default chart of accounts is ready', count: accounts.length, accounts });
  } catch (e) { next(e); }
});

router.get('/chart-of-accounts', requirePermission('accounting:read'), async (req, res, next) => {
  try {
    const accounts = await prisma.ledgerAccount.findMany({
      where: { tenantId: req.user.tenantId, isActive: true },
      orderBy: [{ code: 'asc' }]
    });
    res.json(accounts);
  } catch (e) { next(e); }
});

router.post('/chart-of-accounts', requirePermission('accounting:manage'), async (req, res, next) => {
  try {
    const data = accountSchema.parse(req.body);
    const account = await prisma.ledgerAccount.create({
      data: { tenantId: req.user.tenantId, ...data }
    });
    await audit(req, 'CREATE', 'LedgerAccount', account.id, null, account);
    res.status(201).json(account);
  } catch (e) { next(e); }
});

router.get('/journal-entries', requirePermission('accounting:read'), async (req, res, next) => {
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { tenantId: req.user.tenantId },
      include: { lines: { include: { ledgerAccount: true } } },
      orderBy: { entryDate: 'desc' },
      take: 100
    });
    res.json(entries);
  } catch (e) { next(e); }
});

router.post('/journal-entries', requirePermission('accounting:manage'), async (req, res, next) => {
  try {
    const data = journalEntrySchema.parse(req.body);
    const totalDebit = money(data.lines.reduce((total, line) => total + Number(line.debit || 0), 0));
    const totalCredit = money(data.lines.reduce((total, line) => total + Number(line.credit || 0), 0));
    if (totalDebit <= 0 || totalDebit !== totalCredit) {
      return res.status(400).json({ message: `Journal entry must balance. Debit: ${totalDebit}, Credit: ${totalCredit}` });
    }

    const result = await prisma.$transaction(async (tx) => {
      const accountIds = data.lines.map((line) => line.ledgerAccountId);
      const accounts = await tx.ledgerAccount.findMany({ where: { tenantId: req.user.tenantId, id: { in: accountIds }, isActive: true } });
      if (accounts.length !== new Set(accountIds).size) throw Object.assign(new Error('One or more ledger accounts were not found'), { status: 404 });

      const entry = await tx.journalEntry.create({
        data: {
          tenantId: req.user.tenantId,
          entryNo: await nextEntryNo(tx, req.user.tenantId),
          entryDate: data.entryDate || new Date(),
          description: data.description,
          reference: data.reference || null,
          createdById: req.user.id,
          lines: {
            create: data.lines.map((line) => ({
              ledgerAccountId: line.ledgerAccountId,
              description: line.description || null,
              debit: money(line.debit || 0),
              credit: money(line.credit || 0)
            }))
          }
        },
        include: { lines: { include: { ledgerAccount: true } } }
      });
      return entry;
    });

    await audit(req, 'CREATE', 'JournalEntry', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/trial-balance', requirePermission('accounting:read'), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const accounts = await prisma.ledgerAccount.findMany({
      where: { tenantId: req.user.tenantId, isActive: true },
      include: {
        lines: {
          where: { journalEntry: { tenantId: req.user.tenantId, status: 'POSTED', entryDate: { gte: from, lte: to } } }
        }
      },
      orderBy: { code: 'asc' }
    });

    const rows = accounts.map((account) => {
      const debit = sum(account.lines, (line) => line.debit);
      const credit = sum(account.lines, (line) => line.credit);
      const balance = account.normalBalance === 'DEBIT' ? money(debit - credit) : money(credit - debit);
      return { id: account.id, code: account.code, name: account.name, type: account.type, normalBalance: account.normalBalance, debit, credit, balance };
    });

    const totalDebit = sum(rows, (row) => row.debit);
    const totalCredit = sum(rows, (row) => row.credit);
    res.json({ from, to, totalDebit, totalCredit, difference: money(totalDebit - totalCredit), rows });
  } catch (e) { next(e); }
});

router.get('/profit-loss', requirePermission('accounting:read'), planFeatureGuard('allowAdvancedReports'), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const totals = await getOperatingTotals(req.user.tenantId, from, to);
    res.json({ from, to, ...totals.profitLoss, sales: totals.sales, counts: totals.counts });
  } catch (e) { next(e); }
});

router.get('/balance-sheet', requirePermission('accounting:read'), planFeatureGuard('allowAdvancedReports'), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const totals = await getOperatingTotals(req.user.tenantId, from, to);
    res.json({ asOf: to, periodFrom: from, periodTo: to, ...totals.balanceSheet, currentPeriodProfit: totals.profitLoss.netProfit });
  } catch (e) { next(e); }
});

router.get('/summary', requirePermission('accounting:read'), planFeatureGuard('allowAdvancedReports'), async (req, res, next) => {
  try {
    const { from, to } = parseDateRange(req.query);
    const totals = await getOperatingTotals(req.user.tenantId, from, to);
    const [accountCount, journalCount] = await Promise.all([
      prisma.ledgerAccount.count({ where: { tenantId: req.user.tenantId, isActive: true } }),
      prisma.journalEntry.count({ where: { tenantId: req.user.tenantId } })
    ]);
    res.json({ ...totals, accountCount, journalCount });
  } catch (e) { next(e); }
});

export default router;
