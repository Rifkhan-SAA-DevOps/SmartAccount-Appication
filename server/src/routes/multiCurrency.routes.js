import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';
import { postCurrencyRevaluationJournal } from '../utils/accountingPost.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowMultiCurrency', 'multi-currency / exchange rates'));

const currencySchema = z.object({
  code: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(2).max(80),
  symbol: z.string().trim().max(8).optional().nullable(),
  decimalPlaces: z.coerce.number().int().min(0).max(6).default(2),
  isBase: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
  notes: z.string().trim().max(500).optional().nullable()
});

const rateSchema = z.object({
  fromCurrency: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  toCurrency: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  rate: z.coerce.number().positive(),
  rateDate: z.coerce.date().optional(),
  source: z.string().trim().max(80).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable()
});

const assignSchema = z.object({
  currencyCode: z.string().trim().min(3).max(3).transform((v) => v.toUpperCase()),
  foreignBalance: z.coerce.number().default(0),
  exchangeRate: z.coerce.number().positive().default(1)
});

const revalueSchema = z.object({
  entityType: z.enum(['CUSTOMER', 'SUPPLIER', 'BANK']),
  entityId: z.string().uuid(),
  newRate: z.coerce.number().positive(),
  notes: z.string().trim().max(500).optional().nullable(),
  postJournal: z.boolean().optional().default(true)
});

function dayStart(date = new Date()) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function tenantBaseCurrency(tenantId) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { currency: true } });
  return tenant?.currency || 'LKR';
}

async function ensureBaseCurrency(tx, tenantId, baseCode = 'LKR') {
  const code = String(baseCode || 'LKR').toUpperCase();
  await tx.currency.upsert({
    where: { tenantId_code: { tenantId, code } },
    update: { isBase: true, isActive: true },
    create: { tenantId, code, name: code === 'LKR' ? 'Sri Lankan Rupee' : code, symbol: code, isBase: true, isActive: true }
  });
}

async function latestRate(tx, tenantId, fromCurrency, toCurrency, date = new Date()) {
  const from = String(fromCurrency || '').toUpperCase();
  const to = String(toCurrency || '').toUpperCase();
  if (!from || !to || from === to) return 1;
  const direct = await tx.exchangeRate.findFirst({ where: { tenantId, fromCurrency: from, toCurrency: to, rateDate: { lte: date } }, orderBy: { rateDate: 'desc' } });
  if (direct) return Number(direct.rate || 1);
  const reverse = await tx.exchangeRate.findFirst({ where: { tenantId, fromCurrency: to, toCurrency: from, rateDate: { lte: date } }, orderBy: { rateDate: 'desc' } });
  if (reverse && Number(reverse.rate || 0) > 0) return Number((1 / Number(reverse.rate)).toFixed(6));
  return null;
}

function normalizeCurrency(row) {
  return row;
}

function normalizeRate(row) {
  return { ...row, rate: Number(row.rate || 0) };
}

function normalizeRevaluation(row) {
  return {
    ...row,
    oldRate: Number(row.oldRate || 0),
    newRate: Number(row.newRate || 0),
    foreignBalance: Number(row.foreignBalance || 0),
    baseBefore: Number(row.baseBefore || 0),
    baseAfter: Number(row.baseAfter || 0),
    gainLoss: Number(row.gainLoss || 0)
  };
}

async function loadExposureEntity(tx, tenantId, entityType, entityId) {
  if (entityType === 'CUSTOMER') {
    const row = await tx.customer.findFirst({ where: { id: entityId, tenantId } });
    if (!row) throw Object.assign(new Error('Customer not found'), { status: 404 });
    return { row, name: row.name, model: 'customer', balanceField: 'balance' };
  }
  if (entityType === 'SUPPLIER') {
    const row = await tx.supplier.findFirst({ where: { id: entityId, tenantId } });
    if (!row) throw Object.assign(new Error('Supplier not found'), { status: 404 });
    return { row, name: row.name, model: 'supplier', balanceField: 'balance' };
  }
  const row = await tx.bankAccount.findFirst({ where: { id: entityId, tenantId } });
  if (!row) throw Object.assign(new Error('Bank account not found'), { status: 404 });
  return { row, name: row.name, model: 'bankAccount', balanceField: 'currentBalance' };
}

router.get('/summary', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const base = await tenantBaseCurrency(tenantId);
    await prisma.$transaction((tx) => ensureBaseCurrency(tx, tenantId, base));
    const [currencies, rates, customers, suppliers, banks, revaluations] = await Promise.all([
      prisma.currency.count({ where: { tenantId, isActive: true } }),
      prisma.exchangeRate.count({ where: { tenantId } }),
      prisma.customer.findMany({ where: { tenantId, currencyCode: { not: base }, isActive: true } }),
      prisma.supplier.findMany({ where: { tenantId, currencyCode: { not: base }, isActive: true } }),
      prisma.bankAccount.findMany({ where: { tenantId, currencyCode: { not: base }, isActive: true } }),
      prisma.currencyRevaluation.findMany({ where: { tenantId }, orderBy: { revaluedAt: 'desc' }, take: 5 })
    ]);
    const customerExposure = customers.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const supplierExposure = suppliers.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const bankExposure = banks.reduce((sum, row) => sum + Number(row.currentBalance || 0), 0);
    res.json({ baseCurrency: base, currencies, rates, foreignCustomers: customers.length, foreignSuppliers: suppliers.length, foreignBanks: banks.length, customerExposure: money(customerExposure), supplierExposure: money(supplierExposure), bankExposure: money(bankExposure), netExposure: Number((customerExposure + bankExposure - supplierExposure).toFixed(2)), recentRevaluations: revaluations.map(normalizeRevaluation) });
  } catch (e) { next(e); }
});

router.get('/currencies', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const base = await tenantBaseCurrency(req.user.tenantId);
    await prisma.$transaction((tx) => ensureBaseCurrency(tx, req.user.tenantId, base));
    const rows = await prisma.currency.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ isBase: 'desc' }, { code: 'asc' }] });
    res.json(rows.map(normalizeCurrency));
  } catch (e) { next(e); }
});

router.post('/currencies', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const data = currencySchema.parse(req.body);
    const currency = await prisma.$transaction(async (tx) => {
      if (data.isBase) await tx.currency.updateMany({ where: { tenantId: req.user.tenantId }, data: { isBase: false } });
      return tx.currency.upsert({ where: { tenantId_code: { tenantId: req.user.tenantId, code: data.code } }, update: data, create: { tenantId: req.user.tenantId, ...data } });
    });
    await audit(req, 'UPSERT', 'Currency', currency.id, null, currency);
    res.status(201).json(currency);
  } catch (e) { next(e); }
});

router.patch('/currencies/:id', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const before = await prisma.currency.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Currency not found' });
    const data = currencySchema.partial().parse(req.body);
    const currency = await prisma.$transaction(async (tx) => {
      if (data.isBase) await tx.currency.updateMany({ where: { tenantId: req.user.tenantId }, data: { isBase: false } });
      return tx.currency.update({ where: { id: before.id }, data });
    });
    await audit(req, 'UPDATE', 'Currency', currency.id, before, currency);
    res.json(currency);
  } catch (e) { next(e); }
});

router.get('/rates', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.fromCurrency) where.fromCurrency = String(req.query.fromCurrency).toUpperCase();
    if (req.query.toCurrency) where.toCurrency = String(req.query.toCurrency).toUpperCase();
    const rows = await prisma.exchangeRate.findMany({ where, orderBy: { rateDate: 'desc' }, take: 200 });
    res.json(rows.map(normalizeRate));
  } catch (e) { next(e); }
});

router.post('/rates', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const data = rateSchema.parse(req.body);
    if (data.fromCurrency === data.toCurrency) return res.status(400).json({ message: 'From and to currency cannot be same' });
    const rateDate = data.rateDate || new Date();
    const rate = await prisma.exchangeRate.create({ data: { tenantId: req.user.tenantId, fromCurrency: data.fromCurrency, toCurrency: data.toCurrency, rate: data.rate, rateDate, source: data.source || null, notes: data.notes || null, createdById: req.user.id } });
    await audit(req, 'CREATE', 'ExchangeRate', rate.id, null, rate);
    res.status(201).json(normalizeRate(rate));
  } catch (e) { next(e); }
});

router.post('/convert', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const data = z.object({ amount: z.coerce.number(), fromCurrency: z.string().min(3).max(3), toCurrency: z.string().min(3).max(3), rateDate: z.coerce.date().optional() }).parse(req.body);
    const rate = await latestRate(prisma, req.user.tenantId, data.fromCurrency, data.toCurrency, data.rateDate || new Date());
    if (!rate) return res.status(404).json({ message: 'No exchange rate found for this conversion' });
    res.json({ amount: money(data.amount), fromCurrency: data.fromCurrency.toUpperCase(), toCurrency: data.toCurrency.toUpperCase(), rate, convertedAmount: money(Number(data.amount) * rate) });
  } catch (e) { next(e); }
});

router.get('/exposure', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const base = await tenantBaseCurrency(req.user.tenantId);
    const [customers, suppliers, banks] = await Promise.all([
      prisma.customer.findMany({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.supplier.findMany({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.bankAccount.findMany({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, isActive: true }, orderBy: { name: 'asc' } })
    ]);
    res.json({
      baseCurrency: base,
      customers: customers.map((r) => ({ ...r, entityType: 'CUSTOMER', entityName: r.name, baseBalance: Number(r.balance || 0), foreignBalance: Number(r.foreignBalance || 0) })),
      suppliers: suppliers.map((r) => ({ ...r, entityType: 'SUPPLIER', entityName: r.name, baseBalance: Number(r.balance || 0), foreignBalance: Number(r.foreignBalance || 0) })),
      banks: banks.map((r) => ({ ...r, entityType: 'BANK', entityName: r.name, baseBalance: Number(r.currentBalance || 0), foreignBalance: Number(r.foreignBalance || 0) }))
    });
  } catch (e) { next(e); }
});

router.post('/customers/:id/currency', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const data = assignSchema.parse(req.body);
    const balance = money(Number(data.foreignBalance || 0) * Number(data.exchangeRate || 1));
    const before = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Customer not found' });
    const row = await prisma.customer.update({ where: { id: before.id }, data: { currencyCode: data.currencyCode, foreignBalance: data.foreignBalance, exchangeRate: data.exchangeRate, balance } });
    await audit(req, 'ASSIGN_CURRENCY', 'Customer', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/suppliers/:id/currency', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const data = assignSchema.parse(req.body);
    const balance = money(Number(data.foreignBalance || 0) * Number(data.exchangeRate || 1));
    const before = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Supplier not found' });
    const row = await prisma.supplier.update({ where: { id: before.id }, data: { currencyCode: data.currencyCode, foreignBalance: data.foreignBalance, exchangeRate: data.exchangeRate, balance } });
    await audit(req, 'ASSIGN_CURRENCY', 'Supplier', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/banks/:id/currency', requirePermission('currency:manage'), async (req, res, next) => {
  try {
    const data = assignSchema.parse(req.body);
    const currentBalance = money(Number(data.foreignBalance || 0) * Number(data.exchangeRate || 1));
    const before = await prisma.bankAccount.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Bank account not found' });
    const row = await prisma.bankAccount.update({ where: { id: before.id }, data: { currencyCode: data.currencyCode, foreignBalance: data.foreignBalance, exchangeRate: data.exchangeRate, currentBalance } });
    await audit(req, 'ASSIGN_CURRENCY', 'BankAccount', row.id, before, row);
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/revaluations', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const rows = await prisma.currencyRevaluation.findMany({ where: { tenantId: req.user.tenantId }, orderBy: { revaluedAt: 'desc' }, take: 200 });
    res.json(rows.map(normalizeRevaluation));
  } catch (e) { next(e); }
});

router.post('/revaluations', requirePermission('currency:revalue'), async (req, res, next) => {
  try {
    const data = revalueSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const { row, name, model, balanceField } = await loadExposureEntity(tx, req.user.tenantId, data.entityType, data.entityId);
      const foreignBalance = Number(row.foreignBalance || 0);
      const oldRate = Number(row.exchangeRate || 1);
      const baseBefore = money(foreignBalance * oldRate);
      const baseAfter = money(foreignBalance * Number(data.newRate));
      const gainLoss = money(baseAfter - baseBefore);
      const revaluation = await tx.currencyRevaluation.create({
        data: { tenantId: req.user.tenantId, entityType: data.entityType, entityId: row.id, entityName: name, currencyCode: row.currencyCode, foreignBalance, oldRate, newRate: data.newRate, baseBefore, baseAfter, gainLoss, posted: false, notes: data.notes || null, createdById: req.user.id }
      });
      await tx[model].update({ where: { id: row.id }, data: { exchangeRate: data.newRate, [balanceField]: baseAfter } });
      let journal = null;
      if (data.postJournal && gainLoss !== 0) {
        journal = await postCurrencyRevaluationJournal(tx, { tenantId: req.user.tenantId, revaluation, createdById: req.user.id });
        if (journal) await tx.currencyRevaluation.update({ where: { id: revaluation.id }, data: { posted: true, journalEntryId: journal.id } });
      }
      return { revaluation: await tx.currencyRevaluation.findUnique({ where: { id: revaluation.id } }), journal };
    });
    await createNotification({ tenantId: req.user.tenantId, userId: req.user.id, type: 'INFO', title: 'Currency revaluation posted', message: `${result.revaluation.entityName || result.revaluation.entityType} revalued. Gain/loss: LKR ${Number(result.revaluation.gainLoss || 0).toFixed(2)}.`, priority: 'NORMAL', entityType: 'CurrencyRevaluation', entityId: result.revaluation.id, actionUrl: '/multi-currency' });
    await audit(req, 'REVALUE', 'CurrencyRevaluation', result.revaluation.id, null, result.revaluation);
    res.status(201).json({ revaluation: normalizeRevaluation(result.revaluation), journalEntryId: result.journal?.id || null });
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('currency:read'), async (req, res, next) => {
  try {
    const base = await tenantBaseCurrency(req.user.tenantId);
    const exposures = await prisma.customer.count({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, foreignBalance: { not: 0 } } })
      + await prisma.supplier.count({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, foreignBalance: { not: 0 } } })
      + await prisma.bankAccount.count({ where: { tenantId: req.user.tenantId, currencyCode: { not: base }, foreignBalance: { not: 0 } } });
    if (exposures > 0) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'], type: 'INFO', title: 'Foreign currency exposure exists', message: `${exposures} foreign currency balances should be reviewed/revalued.`, priority: 'NORMAL', entityType: 'Currency', actionUrl: '/multi-currency' });
    }
    res.json({ created: exposures > 0 ? 1 : 0, exposures });
  } catch (e) { next(e); }
});

export default router;
