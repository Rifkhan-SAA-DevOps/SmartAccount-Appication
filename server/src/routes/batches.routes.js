import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowBatchTracking', 'batch / expiry tracking'));

const BATCH_STATUSES = ['ACTIVE', 'DEPLETED', 'EXPIRED', 'RECALLED', 'BLOCKED'];

const batchSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  grnId: z.string().uuid().optional().nullable(),
  batchNo: z.string().min(1),
  manufactureDate: z.coerce.date().optional().nullable(),
  receivedDate: z.coerce.date().optional(),
  expiryDate: z.coerce.date().optional().nullable(),
  qtyIn: z.coerce.number().positive(),
  quantity: z.coerce.number().nonnegative().optional().nullable(),
  unitCost: z.coerce.number().nonnegative().optional().default(0),
  status: z.enum(BATCH_STATUSES).optional().default('ACTIVE'),
  notes: z.string().optional().nullable(),
  adjustStock: z.boolean().optional().default(true)
});

const batchUpdateSchema = batchSchema.partial().omit({ productId: true, warehouseId: true, qtyIn: true, quantity: true, adjustStock: true });

const adjustSchema = z.object({
  quantityChange: z.coerce.number(),
  reason: z.string().optional().default('Manual batch adjustment'),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable()
}).refine((data) => Number(data.quantityChange) !== 0, { message: 'Quantity change cannot be zero' });

const consumeSchema = z.object({
  quantity: z.coerce.number().positive(),
  reason: z.string().optional().default('Batch consumption'),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable(),
  movementType: z.enum(['SALE', 'ADJUSTMENT', 'PURCHASE_RETURN']).optional().default('SALE')
});

const fifoSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantity: z.coerce.number().positive(),
  reason: z.string().optional().default('FIFO stock consumption'),
  refType: z.string().optional().nullable(),
  refId: z.string().optional().nullable(),
  movementType: z.enum(['SALE', 'ADJUSTMENT', 'PURCHASE_RETURN']).optional().default('SALE')
});

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(days) {
  const d = todayStart();
  d.setDate(d.getDate() + Number(days));
  d.setHours(23, 59, 59, 999);
  return d;
}

function includeBatch() {
  return {
    product: true,
    warehouse: true,
    supplier: true,
    grn: true,
    events: { orderBy: { eventDate: 'desc' }, take: 5 }
  };
}

function normalizeBatch(batch) {
  const qty = Number(batch.quantity || 0);
  const unitCost = Number(batch.unitCost || 0);
  const expiryDate = batch.expiryDate ? new Date(batch.expiryDate) : null;
  const now = todayStart();
  const daysToExpire = expiryDate ? Math.ceil((expiryDate.getTime() - now.getTime()) / 86400000) : null;
  return {
    ...batch,
    productName: batch.product?.name || '-',
    warehouseName: batch.warehouse?.name || '-',
    supplierName: batch.supplier?.name || '-',
    grnNo: batch.grn?.grnNo || '-',
    stockValue: money(qty * unitCost),
    daysToExpire,
    expiryState: expiryDate ? (daysToExpire < 0 ? 'EXPIRED' : daysToExpire <= 30 ? 'NEAR_EXPIRY' : 'OK') : 'NO_EXPIRY'
  };
}

async function verifyProduct(tx, tenantId, productId) {
  const product = await tx.product.findFirst({ where: { id: productId, tenantId, isActive: true } });
  if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
  return product;
}

async function verifySupplier(tx, tenantId, supplierId) {
  if (!supplierId) return null;
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId, isActive: true } });
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
  return supplier;
}

async function verifyGrn(tx, tenantId, grnId) {
  if (!grnId) return null;
  const grn = await tx.goodsReceivedNote.findFirst({ where: { id: grnId, tenantId } });
  if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
  return grn;
}

async function createBatchEvent(tx, batch, action, quantity, data = {}, userId = null) {
  return tx.productBatchEvent.create({
    data: {
      tenantId: batch.tenantId,
      batchId: batch.id,
      action,
      quantity,
      balanceAfter: data.balanceAfter ?? batch.quantity,
      refType: data.refType || null,
      refId: data.refId || null,
      notes: data.notes || null,
      eventDate: data.eventDate || new Date(),
      createdById: userId
    }
  });
}

async function decrementWarehouseStock(tx, { tenantId, productId, warehouseId, quantity }) {
  const stock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } } });
  if (!stock || Number(stock.quantity || 0) < Number(quantity || 0)) {
    throw Object.assign(new Error('Not enough warehouse stock'), { status: 400 });
  }
  return tx.productStock.update({ where: { id: stock.id }, data: { quantity: { decrement: quantity } } });
}

async function activeBatchesForFifo(tx, tenantId, productId, warehouseId) {
  return tx.productBatch.findMany({
    where: { tenantId, productId, warehouseId, status: 'ACTIVE', quantity: { gt: 0 } },
    include: includeBatch(),
    orderBy: [{ expiryDate: 'asc' }, { receivedDate: 'asc' }, { createdAt: 'asc' }]
  });
}

function buildFifoPlan(batches, requiredQty) {
  let remaining = Number(requiredQty || 0);
  const allocations = [];
  for (const batch of batches) {
    if (remaining <= 0) break;
    const available = Number(batch.quantity || 0);
    const take = Math.min(available, remaining);
    if (take > 0) {
      allocations.push({ ...normalizeBatch(batch), allocateQty: take });
      remaining = Number((remaining - take).toFixed(3));
    }
  }
  return { allocations, remaining, enough: remaining <= 0 };
}

router.get('/summary', requirePermission('batch:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = todayStart();
    const nearEnd = daysFromNow(30);
    const [total, active, depleted, expired, nearExpiry, rows] = await Promise.all([
      prisma.productBatch.count({ where: { tenantId } }),
      prisma.productBatch.count({ where: { tenantId, status: 'ACTIVE', quantity: { gt: 0 } } }),
      prisma.productBatch.count({ where: { tenantId, OR: [{ status: 'DEPLETED' }, { quantity: { lte: 0 } }] } }),
      prisma.productBatch.count({ where: { tenantId, OR: [{ status: 'EXPIRED' }, { expiryDate: { lt: now } }] } }),
      prisma.productBatch.count({ where: { tenantId, status: 'ACTIVE', expiryDate: { gte: now, lte: nearEnd }, quantity: { gt: 0 } } }),
      prisma.productBatch.findMany({ where: { tenantId }, include: includeBatch(), orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }], take: 500 })
    ]);
    const stockValue = rows.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.unitCost || 0), 0);
    const nearExpiryRows = rows.filter((row) => {
      const d = row.expiryDate ? new Date(row.expiryDate) : null;
      return d && d >= now && d <= nearEnd && Number(row.quantity || 0) > 0 && row.status === 'ACTIVE';
    }).slice(0, 8);
    res.json({ total, active, depleted, expired, nearExpiry, stockValue: money(stockValue), nearExpiryRows: nearExpiryRows.map(normalizeBatch), recentRows: rows.slice(0, 8).map(normalizeBatch) });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('batch:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.productId) where.productId = String(req.query.productId);
    if (req.query.warehouseId) where.warehouseId = String(req.query.warehouseId);
    if (req.query.supplierId) where.supplierId = String(req.query.supplierId);
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.expiring === '30') where.expiryDate = { gte: todayStart(), lte: daysFromNow(30) };
    if (req.query.expiring === '60') where.expiryDate = { gte: todayStart(), lte: daysFromNow(60) };
    if (req.query.expiring === 'expired') where.expiryDate = { lt: todayStart() };
    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { batchNo: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { product: { sku: { contains: q, mode: 'insensitive' } } }
      ];
    }
    const batches = await prisma.productBatch.findMany({ where, include: includeBatch(), orderBy: [{ expiryDate: 'asc' }, { createdAt: 'desc' }], take: 500 });
    res.json(batches.map(normalizeBatch));
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('batch:read'), async (req, res, next) => {
  try {
    const batch = await prisma.productBatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { ...includeBatch(), movements: { orderBy: { createdAt: 'desc' }, take: 20 } } });
    if (!batch) return res.status(404).json({ message: 'Batch not found' });
    res.json(normalizeBatch(batch));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('batch:create'), async (req, res, next) => {
  try {
    const data = batchSchema.parse(req.body);
    const created = await prisma.$transaction(async (tx) => {
      const product = await verifyProduct(tx, req.user.tenantId, data.productId);
      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      await verifySupplier(tx, req.user.tenantId, data.supplierId);
      await verifyGrn(tx, req.user.tenantId, data.grnId);

      const quantity = data.quantity === null || data.quantity === undefined ? data.qtyIn : data.quantity;
      const batch = await tx.productBatch.create({
        data: {
          tenantId: req.user.tenantId,
          productId: data.productId,
          warehouseId: warehouse.id,
          supplierId: data.supplierId || null,
          grnId: data.grnId || null,
          batchNo: data.batchNo.trim(),
          manufactureDate: data.manufactureDate || null,
          receivedDate: data.receivedDate || new Date(),
          expiryDate: data.expiryDate || null,
          qtyIn: data.qtyIn,
          quantity,
          unitCost: data.unitCost || product.costPrice || 0,
          status: Number(quantity) <= 0 ? 'DEPLETED' : data.status,
          notes: data.notes || null,
          createdById: req.user.id
        },
        include: includeBatch()
      });

      await tx.product.update({ where: { id: product.id }, data: { trackExpiry: true, ...(data.adjustStock ? { stockQty: { increment: quantity } } : {}) } });
      if (data.adjustStock && Number(quantity) > 0) {
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id, quantity });
        await tx.stockMovement.create({
          data: { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id, batchId: batch.id, type: 'PURCHASE', quantity, unitCost: data.unitCost || product.costPrice || 0, refType: data.grnId ? 'GRN_BATCH' : 'BATCH_OPENING', refId: data.grnId || batch.id, notes: `Batch ${batch.batchNo} stock added` }
        });
      }
      await createBatchEvent(tx, batch, 'CREATED', quantity, { balanceAfter: quantity, refType: data.grnId ? 'GRN' : 'BATCH', refId: data.grnId || batch.id, notes: data.notes || 'Batch created' }, req.user.id);
      return batch;
    });
    await audit(req, 'CREATE', 'ProductBatch', created.id, null, created);
    res.status(201).json(normalizeBatch(created));
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('batch:update'), async (req, res, next) => {
  try {
    const before = await prisma.productBatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBatch() });
    if (!before) return res.status(404).json({ message: 'Batch not found' });
    const data = batchUpdateSchema.parse(req.body);
    const updated = await prisma.productBatch.update({
      where: { id: before.id },
      data: {
        ...(data.batchNo !== undefined ? { batchNo: data.batchNo.trim() } : {}),
        ...(data.supplierId !== undefined ? { supplierId: data.supplierId || null } : {}),
        ...(data.grnId !== undefined ? { grnId: data.grnId || null } : {}),
        ...(data.manufactureDate !== undefined ? { manufactureDate: data.manufactureDate || null } : {}),
        ...(data.receivedDate !== undefined ? { receivedDate: data.receivedDate || new Date() } : {}),
        ...(data.expiryDate !== undefined ? { expiryDate: data.expiryDate || null } : {}),
        ...(data.unitCost !== undefined ? { unitCost: data.unitCost } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.notes !== undefined ? { notes: data.notes } : {})
      },
      include: includeBatch()
    });
    await audit(req, 'UPDATE', 'ProductBatch', updated.id, before, updated);
    res.json(normalizeBatch(updated));
  } catch (e) { next(e); }
});

router.post('/:id/adjust', requirePermission('batch:update'), async (req, res, next) => {
  try {
    const data = adjustSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.productBatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBatch() });
      if (!before) throw Object.assign(new Error('Batch not found'), { status: 404 });
      const currentQty = Number(before.quantity || 0);
      const nextQty = Number((currentQty + Number(data.quantityChange)).toFixed(3));
      if (nextQty < 0) throw Object.assign(new Error('Adjustment cannot make batch quantity negative'), { status: 400 });
      if (Number(data.quantityChange) < 0) {
        await decrementWarehouseStock(tx, { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, quantity: Math.abs(Number(data.quantityChange)) });
        await tx.product.update({ where: { id: before.productId }, data: { stockQty: { decrement: Math.abs(Number(data.quantityChange)) } } });
      } else {
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, quantity: Number(data.quantityChange) });
        await tx.product.update({ where: { id: before.productId }, data: { stockQty: { increment: Number(data.quantityChange) } } });
      }
      const updated = await tx.productBatch.update({ where: { id: before.id }, data: { quantity: nextQty, status: nextQty <= 0 ? 'DEPLETED' : 'ACTIVE' }, include: includeBatch() });
      await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, batchId: before.id, type: 'ADJUSTMENT', quantity: Number(data.quantityChange), unitCost: before.unitCost, refType: data.refType || 'BATCH_ADJUSTMENT', refId: data.refId || before.id, notes: data.reason } });
      await createBatchEvent(tx, updated, 'ADJUSTED', Number(data.quantityChange), { balanceAfter: nextQty, refType: data.refType || 'BATCH_ADJUSTMENT', refId: data.refId || before.id, notes: data.reason }, req.user.id);
      return { before, updated };
    });
    await audit(req, 'ADJUST', 'ProductBatch', result.updated.id, result.before, result.updated);
    res.json(normalizeBatch(result.updated));
  } catch (e) { next(e); }
});

router.post('/:id/consume', requirePermission('batch:update'), async (req, res, next) => {
  try {
    const data = consumeSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.productBatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBatch() });
      if (!before) throw Object.assign(new Error('Batch not found'), { status: 404 });
      if (Number(before.quantity || 0) < Number(data.quantity)) throw Object.assign(new Error('Not enough quantity in this batch'), { status: 400 });
      await decrementWarehouseStock(tx, { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, quantity: data.quantity });
      await tx.product.update({ where: { id: before.productId }, data: { stockQty: { decrement: data.quantity } } });
      const nextQty = Number((Number(before.quantity || 0) - Number(data.quantity)).toFixed(3));
      const updated = await tx.productBatch.update({ where: { id: before.id }, data: { quantity: nextQty, status: nextQty <= 0 ? 'DEPLETED' : before.status }, include: includeBatch() });
      await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, batchId: before.id, type: data.movementType, quantity: -Math.abs(Number(data.quantity)), unitCost: before.unitCost, refType: data.refType || 'BATCH_CONSUME', refId: data.refId || before.id, notes: data.reason } });
      await createBatchEvent(tx, updated, 'CONSUMED', -Math.abs(Number(data.quantity)), { balanceAfter: nextQty, refType: data.refType || 'BATCH_CONSUME', refId: data.refId || before.id, notes: data.reason }, req.user.id);
      return { before, updated };
    });
    await audit(req, 'CONSUME', 'ProductBatch', result.updated.id, result.before, result.updated);
    res.json(normalizeBatch(result.updated));
  } catch (e) { next(e); }
});

router.post('/:id/mark-expired', requirePermission('batch:update'), async (req, res, next) => {
  try {
    const consumeRemaining = req.body?.consumeRemaining === true;
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.productBatch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeBatch() });
      if (!before) throw Object.assign(new Error('Batch not found'), { status: 404 });
      let nextQty = Number(before.quantity || 0);
      if (consumeRemaining && nextQty > 0) {
        await decrementWarehouseStock(tx, { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, quantity: nextQty });
        await tx.product.update({ where: { id: before.productId }, data: { stockQty: { decrement: nextQty } } });
        await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: before.productId, warehouseId: before.warehouseId, batchId: before.id, type: 'ADJUSTMENT', quantity: -nextQty, unitCost: before.unitCost, refType: 'BATCH_EXPIRED', refId: before.id, notes: 'Expired batch stock removed' } });
        nextQty = 0;
      }
      const updated = await tx.productBatch.update({ where: { id: before.id }, data: { status: 'EXPIRED', quantity: nextQty }, include: includeBatch() });
      await createBatchEvent(tx, updated, 'EXPIRED', consumeRemaining ? -Math.abs(Number(before.quantity || 0)) : 0, { balanceAfter: nextQty, refType: 'BATCH_EXPIRED', refId: before.id, notes: consumeRemaining ? 'Marked expired and remaining stock removed' : 'Marked expired' }, req.user.id);
      return { before, updated };
    });
    await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'INVENTORY_MANAGER'], type: 'DANGER', title: 'Batch marked expired', message: `${result.updated.product?.name || 'Product'} batch ${result.updated.batchNo} was marked expired.`, priority: 'HIGH', entityType: 'ProductBatch', entityId: result.updated.id, actionUrl: '/batches' });
    await audit(req, 'EXPIRE', 'ProductBatch', result.updated.id, result.before, result.updated);
    res.json(normalizeBatch(result.updated));
  } catch (e) { next(e); }
});

router.post('/fifo/preview', requirePermission('batch:read'), async (req, res, next) => {
  try {
    const data = fifoSchema.parse(req.body);
    const batches = await activeBatchesForFifo(prisma, req.user.tenantId, data.productId, data.warehouseId);
    res.json(buildFifoPlan(batches, data.quantity));
  } catch (e) { next(e); }
});

router.post('/fifo/consume', requirePermission('batch:update'), async (req, res, next) => {
  try {
    const data = fifoSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const batches = await activeBatchesForFifo(tx, req.user.tenantId, data.productId, data.warehouseId);
      const plan = buildFifoPlan(batches, data.quantity);
      if (!plan.enough) throw Object.assign(new Error(`Not enough batch stock. Short by ${plan.remaining}`), { status: 400 });
      const updated = [];
      for (const allocation of plan.allocations) {
        const before = batches.find((b) => b.id === allocation.id);
        const take = Number(allocation.allocateQty);
        const nextQty = Number((Number(before.quantity || 0) - take).toFixed(3));
        const batch = await tx.productBatch.update({ where: { id: before.id }, data: { quantity: nextQty, status: nextQty <= 0 ? 'DEPLETED' : before.status }, include: includeBatch() });
        await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: batch.productId, warehouseId: batch.warehouseId, batchId: batch.id, type: data.movementType, quantity: -take, unitCost: batch.unitCost, refType: data.refType || 'FIFO_CONSUME', refId: data.refId || batch.id, notes: data.reason } });
        await createBatchEvent(tx, batch, 'FIFO_CONSUMED', -take, { balanceAfter: nextQty, refType: data.refType || 'FIFO_CONSUME', refId: data.refId || batch.id, notes: data.reason }, req.user.id);
        updated.push(batch);
      }
      await decrementWarehouseStock(tx, { tenantId: req.user.tenantId, productId: data.productId, warehouseId: data.warehouseId, quantity: data.quantity });
      await tx.product.update({ where: { id: data.productId }, data: { stockQty: { decrement: data.quantity } } });
      return { plan, updated };
    });
    await audit(req, 'FIFO_CONSUME', 'ProductBatch', data.productId, null, result);
    res.json({ ...result.plan, updated: result.updated.map(normalizeBatch) });
  } catch (e) { next(e); }
});

router.post('/alerts/expiry', requirePermission('batch:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = todayStart();
    const nearEnd = daysFromNow(Number(req.body?.days || 30));
    const rows = await prisma.productBatch.findMany({
      where: { tenantId, status: 'ACTIVE', quantity: { gt: 0 }, expiryDate: { lte: nearEnd } },
      include: includeBatch(),
      orderBy: { expiryDate: 'asc' },
      take: 50
    });
    let created = 0;
    for (const row of rows) {
      const expired = row.expiryDate && new Date(row.expiryDate) < now;
      await createNotification({
        tenantId,
        type: expired ? 'DANGER' : 'WARNING',
        title: expired ? 'Expired batch stock' : 'Near-expiry batch stock',
        message: `${row.product?.name || 'Product'} batch ${row.batchNo} ${expired ? 'expired' : 'will expire soon'} (${row.expiryDate ? new Date(row.expiryDate).toLocaleDateString() : 'no date'}). Qty: ${Number(row.quantity || 0)}.`,
        priority: expired ? 'URGENT' : 'HIGH',
        entityType: 'ProductBatch',
        entityId: row.id,
        actionUrl: '/batches',
        metadata: { batchNo: row.batchNo, quantity: Number(row.quantity || 0), expiryDate: row.expiryDate }
      });
      created += 1;
    }
    res.json({ created, checked: rows.length });
  } catch (e) { next(e); }
});

export default router;
