import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard, limitGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { postOpeningStockJournal, postStockAdjustmentJournal } from '../utils/accountingPost.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  name: z.string().min(2),
  sku: z.string().optional().nullable(),
  barcode: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  costPrice: z.coerce.number().default(0),
  salePrice: z.coerce.number().default(0),
  stockQty: z.coerce.number().default(0),
  reorderLevel: z.coerce.number().default(0),
  trackSerial: z.boolean().optional().default(false),
  trackExpiry: z.boolean().optional().default(false)
});

router.get('/', requirePermission('product:read'), async (req, res, next) => {
  try {
    const q = req.query.q?.toString();
    const products = await prisma.product.findMany({
      where: {
        tenantId: req.user.tenantId,
        isActive: true,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { sku: { contains: q, mode: 'insensitive' } }, { barcode: { contains: q } }] } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 200
    });
    res.json(products);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('product:create'), planFeatureGuard('allowInventory'), limitGuard('products'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const product = await prisma.$transaction(async (tx) => {
      const created = await tx.product.create({ data: { ...data, sku: data.sku || null, barcode: data.barcode || null, tenantId: req.user.tenantId } });
      const warehouse = await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: created.id, warehouseId: warehouse.id, quantity: data.stockQty || 0, reorderLevel: data.reorderLevel || 0 });
      if (Number(data.stockQty) > 0) {
        await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: created.id, warehouseId: warehouse.id, type: 'OPENING', quantity: data.stockQty, unitCost: data.costPrice, refType: 'Product', refId: created.id, notes: `Opening stock in ${warehouse.name}` } });
        await postOpeningStockJournal(tx, { tenantId: req.user.tenantId, product: created, createdById: req.user.id });
      }
      return created;
    });
    await audit(req, 'CREATE', 'Product', product.id, null, product);
    res.status(201).json(product);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('product:update'), async (req, res, next) => {
  try {
    const before = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Product not found' });
    const data = schema.partial().parse(req.body);
    const product = await prisma.product.update({ where: { id: req.params.id }, data: { ...data, sku: data.sku === '' ? null : data.sku, barcode: data.barcode === '' ? null : data.barcode } });
    await audit(req, 'UPDATE', 'Product', product.id, before, product);
    res.json(product);
  } catch (e) { next(e); }
});

router.post('/:id/adjust-stock', requirePermission('product:update'), async (req, res, next) => {
  try {
    const { quantity, notes, warehouseId } = z.object({ quantity: z.coerce.number(), notes: z.string().optional(), warehouseId: z.string().uuid().optional().nullable() }).parse(req.body);
    const product = await prisma.product.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });

    const updated = await prisma.$transaction(async (tx) => {
      const warehouse = warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id, quantity });
      await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id, type: 'ADJUSTMENT', quantity, unitCost: product.costPrice, refType: 'ManualAdjustment', notes: notes || `Manual adjustment in ${warehouse.name}` } });
      const updatedProduct = await tx.product.update({ where: { id: product.id }, data: { stockQty: { increment: quantity } } });
      await postStockAdjustmentJournal(tx, { tenantId: req.user.tenantId, product, quantity, createdById: req.user.id });
      return updatedProduct;
    });

    await audit(req, 'ADJUST_STOCK', 'Product', product.id, product, updated);
    res.json(updated);
  } catch (e) { next(e); }
});

export default router;
