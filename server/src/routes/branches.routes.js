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


router.get('/transfer-dashboard', requirePermission('branch:read'), async (req, res, next) => {
  try {
    await ensureBootstrap(req.user.tenantId);
    const [warehouses, stocks, transfers, movements] = await Promise.all([
      prisma.warehouse.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, include: { branch: true }, orderBy: { name: 'asc' } }),
      prisma.productStock.findMany({ where: { tenantId: req.user.tenantId }, include: { product: true, warehouse: { include: { branch: true } } }, take: 1000 }),
      prisma.stockTransfer.findMany({ where: { tenantId: req.user.tenantId }, include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: true } } }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.stockMovement.findMany({ where: { tenantId: req.user.tenantId, type: 'TRANSFER' }, orderBy: { createdAt: 'desc' }, take: 20 })
    ]);

    const warehouseCards = warehouses.map((warehouse) => {
      const warehouseStocks = stocks.filter((stock) => stock.warehouseId === warehouse.id);
      const totalQty = warehouseStocks.reduce((total, stock) => total + Number(stock.quantity || 0), 0);
      const stockValue = warehouseStocks.reduce((total, stock) => total + Number(stock.quantity || 0) * Number(stock.product?.costPrice || 0), 0);
      const lowStockCount = warehouseStocks.filter((stock) => Number(stock.reorderLevel || 0) > 0 && Number(stock.quantity || 0) <= Number(stock.reorderLevel || 0)).length;
      return {
        id: warehouse.id,
        name: warehouse.name,
        code: warehouse.code,
        branch: warehouse.branch?.name || 'No branch',
        totalQty,
        stockValue,
        productCount: warehouseStocks.length,
        lowStockCount
      };
    });

    const postedTransfers = transfers.filter((transfer) => transfer.status === 'POSTED');
    const cancelledTransfers = transfers.filter((transfer) => transfer.status === 'CANCELLED');
    const transferValue = postedTransfers.reduce((total, transfer) => total + transfer.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitCost || item.product?.costPrice || 0), 0), 0);

    res.json({
      warehouses: warehouseCards,
      totals: {
        warehouses: warehouses.length,
        stockRows: stocks.length,
        totalQty: warehouseCards.reduce((total, card) => total + card.totalQty, 0),
        stockValue: warehouseCards.reduce((total, card) => total + card.stockValue, 0),
        transfers: transfers.length,
        postedTransfers: postedTransfers.length,
        cancelledTransfers: cancelledTransfers.length,
        transferValue
      },
      lowStock: stocks
        .filter((stock) => Number(stock.reorderLevel || 0) > 0 && Number(stock.quantity || 0) <= Number(stock.reorderLevel || 0))
        .map((stock) => ({
          id: stock.id,
          productId: stock.productId,
          product: stock.product?.name,
          sku: stock.product?.sku,
          warehouse: stock.warehouse?.name,
          branch: stock.warehouse?.branch?.name,
          quantity: Number(stock.quantity || 0),
          reorderLevel: Number(stock.reorderLevel || 0)
        }))
        .slice(0, 25),
      recentTransfers: transfers,
      recentMovements: movements
    });
  } catch (e) { next(e); }
});

router.post('/transfers/preview', requirePermission('branch:create'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    if (data.fromWarehouseId === data.toWarehouseId) {
      return res.status(400).json({ message: 'From and To warehouses cannot be the same' });
    }

    const [fromWarehouse, toWarehouse] = await Promise.all([
      assertWarehouseBelongsToTenant(prisma, { tenantId: req.user.tenantId, warehouseId: data.fromWarehouseId }),
      assertWarehouseBelongsToTenant(prisma, { tenantId: req.user.tenantId, warehouseId: data.toWarehouseId })
    ]);

    const rows = [];
    for (const item of data.items) {
      const [product, fromStock, toStock] = await Promise.all([
        prisma.product.findFirst({ where: { id: item.productId, tenantId: req.user.tenantId, isActive: true } }),
        prisma.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: fromWarehouse.id } } }),
        prisma.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: toWarehouse.id } } })
      ]);
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      const available = Number(fromStock?.quantity || 0);
      const qty = Number(item.qty || 0);
      rows.push({
        productId: product.id,
        product: product.name,
        sku: product.sku,
        requestedQty: qty,
        fromAvailable: available,
        toCurrentQty: Number(toStock?.quantity || 0),
        unitCost: Number(product.costPrice || 0),
        lineValue: qty * Number(product.costPrice || 0),
        ok: available >= qty,
        message: available >= qty ? 'Ready' : `Only ${available} available in ${fromWarehouse.name}`
      });
    }

    res.json({
      fromWarehouse,
      toWarehouse,
      totalQty: rows.reduce((total, row) => total + row.requestedQty, 0),
      totalValue: rows.reduce((total, row) => total + row.lineValue, 0),
      canPost: rows.every((row) => row.ok),
      rows
    });
  } catch (e) { next(e); }
});

router.post('/transfers/:id/cancel', requirePermission('branch:update'), async (req, res, next) => {
  try {
    const before = await prisma.stockTransfer.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: true } } }
    });
    if (!before) return res.status(404).json({ message: 'Transfer not found' });
    if (before.status === 'CANCELLED') return res.status(400).json({ message: 'Transfer is already cancelled' });
    if (before.status !== 'POSTED') return res.status(400).json({ message: 'Only posted transfers can be cancelled' });

    const result = await prisma.$transaction(async (tx) => {
      for (const item of before.items) {
        await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: before.toWarehouseId });
        await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: before.fromWarehouseId });
        const toStock = await tx.productStock.findUnique({
          where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: before.toWarehouseId } }
        });
        if (Number(toStock?.quantity || 0) < Number(item.qty || 0)) {
          throw Object.assign(new Error(`Cannot cancel. ${before.toWarehouse.name} no longer has enough ${item.product.name}.`), { status: 400 });
        }
      }

      for (const item of before.items) {
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: before.toWarehouseId, quantity: -Number(item.qty) });
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: before.fromWarehouseId, quantity: Number(item.qty) });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: item.productId,
            fromWarehouseId: before.toWarehouseId,
            toWarehouseId: before.fromWarehouseId,
            type: 'TRANSFER',
            quantity: item.qty,
            unitCost: item.unitCost || item.product?.costPrice || 0,
            refType: 'StockTransferCancel',
            refId: before.id,
            notes: `Cancellation of ${before.transferNo}: ${before.toWarehouse.name} back to ${before.fromWarehouse.name}`
          }
        });
      }

      return tx.stockTransfer.update({
        where: { id: before.id },
        data: { status: 'CANCELLED', notes: `${before.notes || ''}\nCancelled: ${new Date().toISOString()}`.trim() },
        include: { fromWarehouse: true, toWarehouse: true, items: { include: { product: true } } }
      });
    });

    await audit(req, 'CANCEL', 'StockTransfer', result.id, before, result);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
