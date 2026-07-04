import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { money } from '../utils/number.js';
import { audit } from '../utils/audit.js';
import { buildStatementHtml } from '../utils/statementHtml.js';

const router = Router();
router.use(authRequired);

function toStartDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T00:00:00.000`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toEndDate(value) {
  if (!value) return null;
  const d = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateValue(value) {
  return new Date(value).getTime();
}

function byDate(a, b) {
  const da = dateValue(a.date);
  const db = dateValue(b.date);
  if (da !== db) return da - db;
  return (a.order || 0) - (b.order || 0);
}

function applyCustomerBalances(entries, from, to) {
  let openingBalance = 0;
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const sorted = [...entries].sort(byDate);
  const periodEntries = [];

  sorted.forEach((entry) => {
    const debit = money(entry.debit || 0);
    const credit = money(entry.credit || 0);
    const entryDate = new Date(entry.date);
    const beforePeriod = from && entryDate < from;
    const afterPeriod = to && entryDate > to;

    if (beforePeriod) {
      openingBalance = money(openingBalance + debit - credit);
      running = openingBalance;
      return;
    }

    if (afterPeriod) return;

    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
    running = money(running + debit - credit);
    periodEntries.push({ ...entry, debit, credit, balance: running });
  });

  return { openingBalance, totalDebit, totalCredit, closingBalance: running, entries: periodEntries };
}

function applySupplierBalances(entries, from, to) {
  let openingBalance = 0;
  let running = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const sorted = [...entries].sort(byDate);
  const periodEntries = [];

  sorted.forEach((entry) => {
    const debit = money(entry.debit || 0);
    const credit = money(entry.credit || 0);
    const entryDate = new Date(entry.date);
    const beforePeriod = from && entryDate < from;
    const afterPeriod = to && entryDate > to;

    if (beforePeriod) {
      openingBalance = money(openingBalance + credit - debit);
      running = openingBalance;
      return;
    }

    if (afterPeriod) return;

    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
    running = money(running + credit - debit);
    periodEntries.push({ ...entry, debit, credit, balance: running });
  });

  return { openingBalance, totalDebit, totalCredit, closingBalance: running, entries: periodEntries };
}

function cleanParty(party) {
  if (!party) return null;
  return {
    id: party.id,
    name: party.name,
    phone: party.phone,
    email: party.email,
    address: party.address,
    balance: party.balance,
    creditLimit: party.creditLimit
  };
}

function buildCustomerEntries(customer) {
  const entries = [];

  customer.invoices.forEach((invoice, index) => {
    entries.push({
      id: `invoice-${invoice.id}`,
      order: index,
      date: invoice.issueDate,
      type: 'INVOICE',
      ref: invoice.invoiceNo,
      description: `Invoice ${invoice.invoiceNo}`,
      debit: Number(invoice.total || 0),
      credit: 0
    });
  });

  customer.salesReturns.forEach((ret, index) => {
    entries.push({
      id: `sales-return-${ret.id}`,
      order: 2000 + index,
      date: ret.returnDate,
      type: 'SALES RETURN',
      ref: ret.returnNo,
      description: ret.reason ? `Sales return - ${ret.reason}` : `Sales return ${ret.returnNo}`,
      debit: 0,
      credit: Number(ret.total || 0)
    });
  });

  customer.payments.forEach((payment, index) => {
    const direction = payment.direction;
    entries.push({
      id: `payment-${payment.id}`,
      order: 4000 + index,
      date: payment.paidAt,
      type: direction === 'IN' ? 'PAYMENT RECEIVED' : 'REFUND PAID',
      ref: payment.receiptNo || payment.reference || 'PAYMENT',
      description: payment.notes || (direction === 'IN' ? 'Payment received' : 'Refund paid'),
      method: payment.method,
      debit: direction === 'OUT' ? Number(payment.amount || 0) : 0,
      credit: direction === 'IN' ? Number(payment.amount || 0) : 0
    });
  });

  return entries;
}

function buildSupplierEntries(supplier) {
  const entries = [];

  supplier.grns.forEach((grn, index) => {
    entries.push({
      id: `grn-${grn.id}`,
      order: index,
      date: grn.receivedDate,
      type: 'GRN',
      ref: grn.grnNo,
      description: `Goods received ${grn.grnNo}`,
      debit: 0,
      credit: Number(grn.total || 0)
    });
  });

  supplier.purchaseReturns.forEach((ret, index) => {
    entries.push({
      id: `purchase-return-${ret.id}`,
      order: 2000 + index,
      date: ret.returnDate,
      type: 'PURCHASE RETURN',
      ref: ret.returnNo,
      description: ret.reason ? `Purchase return - ${ret.reason}` : `Purchase return ${ret.returnNo}`,
      debit: Number(ret.total || 0),
      credit: 0
    });
  });

  supplier.payments.forEach((payment, index) => {
    const isSupplierRefund = payment.direction === 'IN';
    entries.push({
      id: `payment-${payment.id}`,
      order: 4000 + index,
      date: payment.paidAt,
      type: isSupplierRefund ? 'SUPPLIER REFUND' : 'SUPPLIER PAYMENT',
      ref: payment.receiptNo || payment.reference || 'PAYMENT',
      description: payment.notes || (isSupplierRefund ? 'Supplier refund received' : 'Supplier payment'),
      method: payment.method,
      debit: isSupplierRefund ? 0 : Number(payment.amount || 0),
      credit: isSupplierRefund ? Number(payment.amount || 0) : 0
    });
  });

  return entries;
}

async function getTenantAndSettings(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  let settings = await prisma.tenantSetting.findUnique({ where: { tenantId } });
  if (!settings) settings = await prisma.tenantSetting.create({ data: { tenantId } });
  return { tenant, settings };
}

async function buildCustomerStatement(req) {
  const from = toStartDate(req.query.from?.toString());
  const to = toEndDate(req.query.to?.toString());

  const customer = await prisma.customer.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      invoices: { orderBy: { issueDate: 'asc' } },
      payments: { orderBy: { paidAt: 'asc' } },
      salesReturns: { orderBy: { returnDate: 'asc' } }
    }
  });

  if (!customer) return null;

  const summary = applyCustomerBalances(buildCustomerEntries(customer), from, to);
  return {
    partyType: 'CUSTOMER',
    party: cleanParty(customer),
    from,
    to,
    generatedAt: new Date(),
    storedBalance: Number(customer.balance || 0),
    ...summary
  };
}

async function buildSupplierStatement(req) {
  const from = toStartDate(req.query.from?.toString());
  const to = toEndDate(req.query.to?.toString());

  const supplier = await prisma.supplier.findFirst({
    where: { id: req.params.id, tenantId: req.user.tenantId },
    include: {
      grns: { orderBy: { receivedDate: 'asc' } },
      payments: { orderBy: { paidAt: 'asc' } },
      purchaseReturns: { orderBy: { returnDate: 'asc' } }
    }
  });

  if (!supplier) return null;

  const summary = applySupplierBalances(buildSupplierEntries(supplier), from, to);
  return {
    partyType: 'SUPPLIER',
    party: cleanParty(supplier),
    from,
    to,
    generatedAt: new Date(),
    storedBalance: Number(supplier.balance || 0),
    ...summary
  };
}

router.get('/customers/:id', requirePermission('statement:read'), async (req, res, next) => {
  try {
    const statement = await buildCustomerStatement(req);
    if (!statement) return res.status(404).json({ message: 'Customer not found' });
    res.json(statement);
  } catch (e) { next(e); }
});

router.get('/suppliers/:id', requirePermission('statement:read'), async (req, res, next) => {
  try {
    const statement = await buildSupplierStatement(req);
    if (!statement) return res.status(404).json({ message: 'Supplier not found' });
    res.json(statement);
  } catch (e) { next(e); }
});

router.get('/customers/:id/print', requirePermission('statement:export'), async (req, res, next) => {
  try {
    const statement = await buildCustomerStatement(req);
    if (!statement) return res.status(404).send('<h1>Customer not found</h1>');
    const { tenant, settings } = await getTenantAndSettings(req.user.tenantId);
    await audit(req, 'EXPORT', 'CustomerStatement', req.params.id, null, { party: statement.party?.name, from: statement.from, to: statement.to });
    const html = buildStatementHtml({ statement, tenant, settings });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
});

router.get('/suppliers/:id/print', requirePermission('statement:export'), async (req, res, next) => {
  try {
    const statement = await buildSupplierStatement(req);
    if (!statement) return res.status(404).send('<h1>Supplier not found</h1>');
    const { tenant, settings } = await getTenantAndSettings(req.user.tenantId);
    await audit(req, 'EXPORT', 'SupplierStatement', req.params.id, null, { party: statement.party?.name, from: statement.from, to: statement.to });
    const html = buildStatementHtml({ statement, tenant, settings });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
});

export default router;
