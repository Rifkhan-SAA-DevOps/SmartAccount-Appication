import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard, limitGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, ensureProductStock, getOrCreateDefaultWarehouse, getOrCreateMainBranch } from '../utils/stock.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowInventory'));

const branchSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase().trim()),
  address: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  isMain: z.boolean().optional().default(false)
});

const warehouseSchema = z.object({
  branchId: z.string().uuid().optional().nullable(),
  name: z.string().min(2),
  code: z.string().min(2).max(20).transform((v) => v.toUpperCase().trim()),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true)
});

const transferItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive()
});

const transferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  transferDate: z.coerce.date().optional(),
  notes: z.string().optional().nullable(),
  items: z.array(transferItemSchema).min(1)
});

function tenantPlan(req) {
  return req.user?.tenant?.subscription?.plan || null;
}

async function ensureBootstrap(tenantId) {
  await prisma.$transaction(async (tx) => {
    const branch = await getOrCreateMainBranch(tx, tenantId);
    const warehouse = await getOrCreateDefaultWarehouse(tx, tenantId, branch.id);
    await syncExistingProductsToWarehouse(tx, tenantId, warehouse.id, true);
  });
}

async function nextTransferNo(tx, tenantId) {
  const count = await tx.stockTransfer.count({ where: { tenantId } });
  return `TRF${String(count + 1001).padStart(4, '0')}`;
}

async function syncExistingProductsToWarehouse(tx, tenantId, warehouseId, useCurrentProductStock = false) {
  const products = await tx.product.findMany({ where: { tenantId, isActive: true } });
  for (const product of products) {
    const existing = await tx.productStock.findUnique({
      where: { tenantId_productId_warehouseId: { tenantId, productId: product.id, warehouseId } }
    });
    if (!existing) {
      await tx.productStock.create({
        data: {
          tenantId,
          productId: product.id,
          warehouseId,
          quantity: useCurrentProductStock ? product.stockQty || 0 : 0,
          reorderLevel: product.reorderLevel || 0
        }
      });
    }
  }
}

router.get('/', requirePermission('branch:read'), async (req, res, next) => {
  try {
    await ensureBootstrap(req.user.tenantId);
    const branches = await prisma.branch.findMany({
      where: { tenantId: req.user.tenantId },
      include: { warehouses: { orderBy: { createdAt: 'asc' } } },
      orderBy: [{ isMain: 'desc' }, { createdAt: 'asc' }]
    });
    res.json(branches);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('branch:create'), limitGuard('branches'), async (req, res, next) => {
  try {
    const data = branchSchema.parse(req.body);

    const branch = await prisma.$transaction(async (tx) => {
      if (data.isMain) await tx.branch.updateMany({ where: { tenantId: req.user.tenantId }, data: { isMain: false } });
      return tx.branch.create({ data: { ...data, tenantId: req.user.tenantId } });
    });
    await audit(req, 'CREATE', 'Branch', branch.id, null, branch);
    res.status(201).json(branch);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('branch:update'), async (req, res, next) => {
  try {
    const before = await prisma.branch.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Branch not found' });
    const data = branchSchema.partial().parse(req.body);
    const branch = await prisma.$transaction(async (tx) => {
      if (data.isMain) await tx.branch.updateMany({ where: { tenantId: req.user.tenantId }, data: { isMain: false } });
      return tx.branch.update({ where: { id: before.id }, data });
    });
    await audit(req, 'UPDATE', 'Branch', branch.id, before, branch);
    res.json(branch);
  } catch (e) { next(e); }
});

router.get('/warehouses', requirePermission('branch:read'), async (req, res, next) => {
  try {
    await ensureBootstrap(req.user.tenantId);
    const warehouses = await prisma.warehouse.findMany({
      where: { tenantId: req.user.tenantId, isActive: true },
      include: { branch: true, _count: { select: { stocks: true } } },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }]
    });
    res.json(warehouses);
  } catch (e) { next(e); }
});

router.post('/warehouses', requirePermission('branch:create'), limitGuard('warehouses'), async (req, res, next) => {
  try {
    const data = warehouseSchema.parse(req.body);

    const warehouse = await prisma.$transaction(async (tx) => {
      if (data.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: data.branchId, tenantId: req.user.tenantId } });
        if (!branch) throw Object.assign(new Error('Branch not found'), { status: 404 });
      }
      if (data.isDefault) await tx.warehouse.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      const created = await tx.warehouse.create({ data: { ...data, tenantId: req.user.tenantId } });
      await syncExistingProductsToWarehouse(tx, req.user.tenantId, created.id, false);
      return created;
    });
    await audit(req, 'CREATE', 'Warehouse', warehouse.id, null, warehouse);
    res.status(201).json(warehouse);
  } catch (e) { next(e); }
});

router.put('/warehouses/:id', requirePermission('branch:update'), async (req, res, next) => {
  try {
    const before = await prisma.warehouse.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Warehouse not found' });
    const data = warehouseSchema.partial().parse(req.body);
    const warehouse = await prisma.$transaction(async (tx) => {
      if (data.branchId) {
        const branch = await tx.branch.findFirst({ where: { id: data.branchId, tenantId: req.user.tenantId } });
        if (!branch) throw Object.assign(new Error('Branch not found'), { status: 404 });
      }
      if (data.isDefault) await tx.warehouse.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.warehouse.update({ where: { id: before.id }, data });
    });
    await audit(req, 'UPDATE', 'Warehouse', warehouse.id, before, warehouse);
    res.json(warehouse);
  } catch (e) { next(e); }
});

router.get('/stocks', requirePermission('branch:read'), async (req, res, next) => {
  try {
    await ensureBootstrap(req.user.tenantId);
    const warehouseId = req.query.warehouseId?.toString();
    const q = req.query.q?.toString();
    const stocks = await prisma.productStock.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(warehouseId ? { warehouseId } : {}),
        ...(q ? { product: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { contains: q } }] } } : {})
      },
      include: { product: true, warehouse: { include: { branch: true } } },
      orderBy: { updatedAt: 'desc' },
      take: 300
    });
    res.json(stocks);
  } catch (e) { next(e); }
});

router.get('/transfers', requirePermission('branch:read'), async (req, res, next) => {
  try {
    const transfers = await prisma.stockTransfer.findMany({
      where: { tenantId: req.user.tenantId },
      include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(transfers);
  } catch (e) { next(e); }
});

router.post('/transfers', requirePermission('branch:create'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    if (data.fromWarehouseId === data.toWarehouseId) {
      return res.status(400).json({ message: 'From and To warehouses cannot be the same' });
    }

    const result = await prisma.$transaction(async (tx) => {
      const fromWarehouse = await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.fromWarehouseId });
      const toWarehouse = await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.toWarehouseId });

      const productMap = new Map();
      for (const item of data.items) {
        const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: req.user.tenantId, isActive: true } });
        if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
        productMap.set(item.productId, product);
        await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: fromWarehouse.id });
        await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: toWarehouse.id });
        const fromStock = await tx.productStock.findUnique({
          where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: fromWarehouse.id } }
        });
        if (Number(fromStock?.quantity || 0) < Number(item.qty)) {
          throw Object.assign(new Error(`Not enough stock in ${fromWarehouse.name} for ${product.name}`), { status: 400 });
        }
      }

      const transfer = await tx.stockTransfer.create({
        data: {
          tenantId: req.user.tenantId,
          transferNo: await nextTransferNo(tx, req.user.tenantId),
          fromWarehouseId: fromWarehouse.id,
          toWarehouseId: toWarehouse.id,
          status: 'POSTED',
          transferDate: data.transferDate || new Date(),
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId,
              qty: item.qty,
              unitCost: productMap.get(item.productId)?.costPrice || 0
            }))
          }
        },
        include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: true } } }
      });

      for (const item of data.items) {
        const product = productMap.get(item.productId);
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: fromWarehouse.id, quantity: -Number(item.qty) });
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: toWarehouse.id, quantity: Number(item.qty) });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: item.productId,
            fromWarehouseId: fromWarehouse.id,
            toWarehouseId: toWarehouse.id,
            type: 'TRANSFER',
            quantity: item.qty,
            unitCost: product.costPrice || 0,
            refType: 'StockTransfer',
            refId: transfer.id,
            notes: `${transfer.transferNo}: ${fromWarehouse.name} to ${toWarehouse.name}`
          }
        });
      }

      return transfer;
    });

    await audit(req, 'CREATE', 'StockTransfer', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
