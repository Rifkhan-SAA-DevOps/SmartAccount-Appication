import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { postAssetDepreciationJournal, postAssetDisposalJournal } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowFixedAssets', 'fixed asset management'));

const assetSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  name: z.string().trim().min(2),
  category: z.string().trim().min(1).default('General'),
  serialNo: z.string().trim().optional().nullable(),
  location: z.string().trim().optional().nullable(),
  custodianEmployeeId: z.string().uuid().optional().nullable(),
  purchaseDate: z.coerce.date(),
  purchaseCost: z.coerce.number().nonnegative(),
  salvageValue: z.coerce.number().nonnegative().default(0),
  usefulLifeMonths: z.coerce.number().int().positive().default(60),
  depreciationMethod: z.string().trim().default('STRAIGHT_LINE'),
  warrantyUntil: z.coerce.date().optional().nullable(),
  nextMaintenanceDate: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable()
});

const maintenanceSchema = z.object({
  maintenanceDate: z.coerce.date().optional(),
  vendor: z.string().optional().nullable(),
  description: z.string().trim().min(2),
  cost: z.coerce.number().nonnegative().default(0),
  nextMaintenanceDate: z.coerce.date().optional().nullable(),
  status: z.string().default('COMPLETED'),
  notes: z.string().optional().nullable()
});

const depreciationSchema = z.object({
  periodStart: z.coerce.date().optional(),
  periodEnd: z.coerce.date().optional(),
  depreciationDate: z.coerce.date().optional(),
  amount: z.coerce.number().positive().optional(),
  notes: z.string().optional().nullable()
});

const disposalSchema = z.object({
  disposalDate: z.coerce.date().optional(),
  disposalAmount: z.coerce.number().nonnegative().default(0),
  notes: z.string().optional().nullable()
});

function includeAsset() {
  return {
    supplier: true,
    depreciations: { orderBy: { depreciationDate: 'desc' }, take: 6 },
    maintenances: { orderBy: { maintenanceDate: 'desc' }, take: 6 }
  };
}

function normalizeAsset(asset) {
  const purchaseCost = Number(asset.purchaseCost || 0);
  const accumulated = Number(asset.accumulatedDepreciation || 0);
  const bookValue = Number(asset.bookValue || purchaseCost - accumulated);
  return {
    ...asset,
    supplierName: asset.supplier?.name || '-',
    purchaseCost: money(purchaseCost),
    accumulatedDepreciation: money(accumulated),
    bookValue: money(bookValue),
    disposalAmount: money(asset.disposalAmount || 0),
    disposalGainLoss: money(asset.disposalGainLoss || 0),
    monthlyDepreciation: money(calculateMonthlyDepreciation(asset)),
    isMaintenanceDue: asset.nextMaintenanceDate ? new Date(asset.nextMaintenanceDate).getTime() <= Date.now() && asset.status === 'ACTIVE' : false
  };
}

async function nextAssetNo(tx, tenantId) {
  const count = await tx.fixedAsset.count({ where: { tenantId } });
  return `FA${String(count + 1001).padStart(4, '0')}`;
}

async function verifySupplier(tx, tenantId, supplierId) {
  if (!supplierId) return null;
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId, isActive: true } });
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
  return supplier;
}

function calculateMonthlyDepreciation(asset) {
  const depreciable = Math.max(0, Number(asset.purchaseCost || 0) - Number(asset.salvageValue || 0));
  const months = Math.max(1, Number(asset.usefulLifeMonths || 1));
  return money(depreciable / months);
}

function defaultPeriod() {
  const end = new Date();
  const start = new Date(end.getFullYear(), end.getMonth(), 1);
  return { start, end };
}

router.get('/summary', requirePermission('asset:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date();
    const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30);
    const [total, active, disposed, underMaintenance, maintenanceDue, assets, depreciation] = await Promise.all([
      prisma.fixedAsset.count({ where: { tenantId } }),
      prisma.fixedAsset.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.fixedAsset.count({ where: { tenantId, status: 'DISPOSED' } }),
      prisma.fixedAsset.count({ where: { tenantId, status: 'MAINTENANCE' } }),
      prisma.fixedAsset.count({ where: { tenantId, status: 'ACTIVE', nextMaintenanceDate: { lte: nextMonth } } }),
      prisma.fixedAsset.findMany({ where: { tenantId }, include: includeAsset(), orderBy: { createdAt: 'desc' }, take: 500 }),
      prisma.fixedAssetDepreciation.aggregate({ where: { tenantId }, _sum: { amount: true } })
    ]);
    const costValue = assets.reduce((sum, asset) => sum + Number(asset.purchaseCost || 0), 0);
    const bookValue = assets.reduce((sum, asset) => sum + Number(asset.bookValue || 0), 0);
    res.json({ total, active, disposed, underMaintenance, maintenanceDue, costValue: money(costValue), bookValue: money(bookValue), totalDepreciationPosted: money(depreciation._sum.amount || 0), recentAssets: assets.slice(0, 8).map(normalizeAsset) });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('asset:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.category) where.category = String(req.query.category);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ assetNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }, { serialNo: { contains: q, mode: 'insensitive' } }, { location: { contains: q, mode: 'insensitive' } }];
    const assets = await prisma.fixedAsset.findMany({ where, include: includeAsset(), orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], take: 500 });
    res.json(assets.map(normalizeAsset));
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('asset:read'), async (req, res, next) => {
  try {
    const asset = await prisma.fixedAsset.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { supplier: true, depreciations: { orderBy: { depreciationDate: 'desc' } }, maintenances: { orderBy: { maintenanceDate: 'desc' } } } });
    if (!asset) return res.status(404).json({ message: 'Asset not found' });
    res.json(normalizeAsset(asset));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('asset:create'), async (req, res, next) => {
  try {
    const data = assetSchema.parse(req.body);
    const asset = await prisma.$transaction(async (tx) => {
      await verifySupplier(tx, req.user.tenantId, data.supplierId);
      const purchaseCost = money(data.purchaseCost || 0);
      const assetNo = await nextAssetNo(tx, req.user.tenantId);
      return tx.fixedAsset.create({ data: { tenantId: req.user.tenantId, assetNo, createdById: req.user.id, ...data, supplierId: data.supplierId || null, serialNo: data.serialNo || null, location: data.location || null, custodianEmployeeId: data.custodianEmployeeId || null, warrantyUntil: data.warrantyUntil || null, nextMaintenanceDate: data.nextMaintenanceDate || null, bookValue: purchaseCost }, include: includeAsset() });
    });
    await audit(req, 'CREATE', 'FixedAsset', asset.id, null, asset);
    res.status(201).json(normalizeAsset(asset));
  } catch (e) { next(e); }
});

router.patch('/:id', requirePermission('asset:update'), async (req, res, next) => {
  try {
    const before = await prisma.fixedAsset.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeAsset() });
    if (!before) return res.status(404).json({ message: 'Asset not found' });
    const data = assetSchema.partial().parse(req.body);
    const asset = await prisma.fixedAsset.update({ where: { id: before.id }, data: { ...data, supplierId: data.supplierId || undefined }, include: includeAsset() });
    await audit(req, 'UPDATE', 'FixedAsset', asset.id, before, asset);
    res.json(normalizeAsset(asset));
  } catch (e) { next(e); }
});

router.post('/:id/depreciate', requirePermission('asset:depreciate'), async (req, res, next) => {
  try {
    const data = depreciationSchema.parse(req.body || {});
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (asset.status !== 'ACTIVE') throw Object.assign(new Error('Only active assets can be depreciated'), { status: 400 });
      const period = defaultPeriod();
      const maxAllowed = Math.max(0, Number(asset.purchaseCost || 0) - Number(asset.salvageValue || 0) - Number(asset.accumulatedDepreciation || 0));
      const amount = money(Math.min(maxAllowed, data.amount || calculateMonthlyDepreciation(asset)));
      if (amount <= 0) throw Object.assign(new Error('No depreciation remaining for this asset'), { status: 400 });
      const accumulatedAfter = money(Number(asset.accumulatedDepreciation || 0) + amount);
      const bookValueAfter = money(Number(asset.purchaseCost || 0) - accumulatedAfter);
      const depreciation = await tx.fixedAssetDepreciation.create({ data: { tenantId: req.user.tenantId, assetId: asset.id, periodStart: data.periodStart || period.start, periodEnd: data.periodEnd || period.end, depreciationDate: data.depreciationDate || new Date(), amount, accumulatedAfter, bookValueAfter, notes: data.notes || null, createdById: req.user.id } });
      const journal = await postAssetDepreciationJournal(tx, { tenantId: req.user.tenantId, asset, depreciation, createdById: req.user.id });
      const updatedDepreciation = journal ? await tx.fixedAssetDepreciation.update({ where: { id: depreciation.id }, data: { journalEntryId: journal.id } }) : depreciation;
      const updatedAsset = await tx.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: accumulatedAfter, bookValue: bookValueAfter, status: bookValueAfter <= Number(asset.salvageValue || 0) ? 'FULLY_DEPRECIATED' : 'ACTIVE' }, include: includeAsset() });
      return { asset: updatedAsset, depreciation: updatedDepreciation, journal };
    });
    await audit(req, 'DEPRECIATE', 'FixedAsset', result.asset.id, null, result);
    res.status(201).json({ asset: normalizeAsset(result.asset), depreciation: result.depreciation });
  } catch (e) { next(e); }
});

router.post('/run-depreciation', requirePermission('asset:depreciate'), async (req, res, next) => {
  try {
    const assets = await prisma.fixedAsset.findMany({ where: { tenantId: req.user.tenantId, status: 'ACTIVE' } });
    let posted = 0;
    for (const asset of assets) {
      const maxAllowed = Math.max(0, Number(asset.purchaseCost || 0) - Number(asset.salvageValue || 0) - Number(asset.accumulatedDepreciation || 0));
      const amount = money(Math.min(maxAllowed, calculateMonthlyDepreciation(asset)));
      if (amount <= 0) continue;
      await prisma.$transaction(async (tx) => {
        const period = defaultPeriod();
        const accumulatedAfter = money(Number(asset.accumulatedDepreciation || 0) + amount);
        const bookValueAfter = money(Number(asset.purchaseCost || 0) - accumulatedAfter);
        const dep = await tx.fixedAssetDepreciation.create({ data: { tenantId: req.user.tenantId, assetId: asset.id, periodStart: period.start, periodEnd: period.end, depreciationDate: new Date(), amount, accumulatedAfter, bookValueAfter, notes: 'Bulk monthly depreciation', createdById: req.user.id } });
        const journal = await postAssetDepreciationJournal(tx, { tenantId: req.user.tenantId, asset, depreciation: dep, createdById: req.user.id });
        if (journal) await tx.fixedAssetDepreciation.update({ where: { id: dep.id }, data: { journalEntryId: journal.id } });
        await tx.fixedAsset.update({ where: { id: asset.id }, data: { accumulatedDepreciation: accumulatedAfter, bookValue: bookValueAfter, status: bookValueAfter <= Number(asset.salvageValue || 0) ? 'FULLY_DEPRECIATED' : 'ACTIVE' } });
      });
      posted += 1;
    }
    res.json({ posted });
  } catch (e) { next(e); }
});

router.post('/:id/maintenance', requirePermission('asset:update'), async (req, res, next) => {
  try {
    const data = maintenanceSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.fixedAsset.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!asset) throw Object.assign(new Error('Asset not found'), { status: 404 });
      const maintenance = await tx.fixedAssetMaintenance.create({ data: { tenantId: req.user.tenantId, assetId: asset.id, createdById: req.user.id, ...data, maintenanceDate: data.maintenanceDate || new Date(), nextMaintenanceDate: data.nextMaintenanceDate || null } });
      const updatedAsset = await tx.fixedAsset.update({ where: { id: asset.id }, data: { nextMaintenanceDate: data.nextMaintenanceDate || asset.nextMaintenanceDate, status: data.status === 'SCHEDULED' ? 'MAINTENANCE' : asset.status }, include: includeAsset() });
      return { asset: updatedAsset, maintenance };
    });
    await audit(req, 'MAINTENANCE', 'FixedAsset', result.asset.id, null, result.maintenance);
    res.status(201).json({ asset: normalizeAsset(result.asset), maintenance: result.maintenance });
  } catch (e) { next(e); }
});

router.post('/:id/dispose', requirePermission('asset:dispose'), async (req, res, next) => {
  try {
    const data = disposalSchema.parse(req.body || {});
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.fixedAsset.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeAsset() });
      if (!before) throw Object.assign(new Error('Asset not found'), { status: 404 });
      if (before.status === 'DISPOSED') throw Object.assign(new Error('Asset is already disposed'), { status: 400 });
      const gainLoss = money(Number(data.disposalAmount || 0) - Number(before.bookValue || 0));
      const disposed = await tx.fixedAsset.update({ where: { id: before.id }, data: { status: 'DISPOSED', disposalDate: data.disposalDate || new Date(), disposalAmount: money(data.disposalAmount || 0), disposalGainLoss: gainLoss, notes: [before.notes, data.notes].filter(Boolean).join('\n') || null }, include: includeAsset() });
      const journal = await postAssetDisposalJournal(tx, { tenantId: req.user.tenantId, asset: disposed, createdById: req.user.id });
      return { before, disposed, journal };
    });
    await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'], type: 'INFO', title: 'Fixed asset disposed', message: `${result.disposed.assetNo} - ${result.disposed.name} disposed.`, priority: 'NORMAL', entityType: 'FixedAsset', entityId: result.disposed.id, actionUrl: '/fixed-assets' });
    await audit(req, 'DISPOSE', 'FixedAsset', result.disposed.id, result.before, result.disposed);
    res.json(normalizeAsset(result.disposed));
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('asset:read'), async (req, res, next) => {
  try {
    const nextMonth = new Date(); nextMonth.setDate(nextMonth.getDate() + 30);
    const rows = await prisma.fixedAsset.findMany({ where: { tenantId: req.user.tenantId, status: 'ACTIVE', nextMaintenanceDate: { lte: nextMonth } }, take: 100 });
    let created = 0;
    for (const asset of rows) {
      await createNotification({ tenantId: req.user.tenantId, type: 'WARNING', title: 'Asset maintenance due', message: `${asset.assetNo} - ${asset.name} maintenance is due.`, priority: 'NORMAL', entityType: 'FixedAsset', entityId: asset.id, actionUrl: '/fixed-assets' });
      created += 1;
    }
    res.json({ created, checked: rows.length });
  } catch (e) { next(e); }
});

export default router;
