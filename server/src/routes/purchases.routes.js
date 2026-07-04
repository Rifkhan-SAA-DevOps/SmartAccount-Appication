import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postGrnJournal } from '../utils/accountingPost.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowInventory'));

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  discount: z.coerce.number().optional().default(0)
});

const purchaseOrderSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.coerce.date().optional().nullable(),
  discount: z.coerce.number().optional().default(0),
  tax: z.coerce.number().optional().default(0),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1)
});

const grnSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  purchaseOrderId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  receivedDate: z.coerce.date().optional(),
  discount: z.coerce.number().optional().default(0),
  tax: z.coerce.number().optional().default(0),
  paid: z.coerce.number().optional().default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE']).optional().default('CASH'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1)
});

async function nextPurchaseNo(tenantId) {
  const count = await prisma.purchaseOrder.count({ where: { tenantId } });
  return `PO${String(count + 1001).padStart(4, '0')}`;
}

async function nextGrnNo(tenantId) {
  const count = await prisma.goodsReceivedNote.count({ where: { tenantId } });
  return `GRN${String(count + 1001).padStart(4, '0')}`;
}

function totals(items, discount = 0, tax = 0) {
  const subtotal = money(items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitCost) - Number(item.discount || 0)), 0));
  const total = money(subtotal - Number(discount || 0) + Number(tax || 0));
  return { subtotal, total };
}

async function verifySupplier(tx, tenantId, supplierId) {
  if (!supplierId) return null;
  const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId, isActive: true } });
  if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
  return supplier;
}

async function verifyProducts(tx, tenantId, items) {
  const productMap = new Map();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await tx.product.findFirst({ where: { id: item.productId, tenantId, isActive: true } });
    if (!product) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 404 });
    productMap.set(item.productId, product);
  }
  return productMap;
}

router.get('/orders', requirePermission('purchase:read'), async (req, res, next) => {
  try {
    const orders = await prisma.purchaseOrder.findMany({
      where: { tenantId: req.user.tenantId },
      include: { supplier: true, items: { include: { product: true } }, grns: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(orders);
  } catch (e) { next(e); }
});

router.post('/orders', requirePermission('purchase:create'), async (req, res, next) => {
  try {
    const data = purchaseOrderSchema.parse(req.body);
    const purchaseNo = await nextPurchaseNo(req.user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      await verifySupplier(tx, req.user.tenantId, data.supplierId);
      await verifyProducts(tx, req.user.tenantId, data.items);
      const { subtotal, total } = totals(data.items, data.discount, data.tax);

      return tx.purchaseOrder.create({
        data: {
          tenantId: req.user.tenantId,
          supplierId: data.supplierId || null,
          purchaseNo,
          status: 'ORDERED',
          orderDate: data.orderDate || new Date(),
          expectedDate: data.expectedDate || null,
          subtotal,
          discount: data.discount,
          tax: data.tax,
          total,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId || null,
              description: item.description,
              qty: item.qty,
              unitCost: item.unitCost,
              discount: item.discount || 0,
              total: money(Number(item.qty) * Number(item.unitCost) - Number(item.discount || 0))
            }))
          }
        },
        include: { supplier: true, items: true }
      });
    });

    await audit(req, 'CREATE', 'PurchaseOrder', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/grns', requirePermission('purchase:read'), async (req, res, next) => {
  try {
    const grns = await prisma.goodsReceivedNote.findMany({
      where: { tenantId: req.user.tenantId },
      include: { supplier: true, purchaseOrder: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(grns);
  } catch (e) { next(e); }
});

router.post('/grns', requirePermission('purchase:create'), async (req, res, next) => {
  try {
    const data = grnSchema.parse(req.body);
    const grnNo = await nextGrnNo(req.user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      await verifySupplier(tx, req.user.tenantId, data.supplierId);
      const productMap = await verifyProducts(tx, req.user.tenantId, data.items);

      let purchaseOrder = null;
      if (data.purchaseOrderId) {
        purchaseOrder = await tx.purchaseOrder.findFirst({
          where: { id: data.purchaseOrderId, tenantId: req.user.tenantId },
          include: { items: true }
        });
        if (!purchaseOrder) throw Object.assign(new Error('Purchase order not found'), { status: 404 });
      }

      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);

      const { subtotal, total } = totals(data.items, data.discount, data.tax);
      const paid = money(data.paid || 0);
      if (paid > total) throw Object.assign(new Error('Paid amount cannot be greater than GRN total'), { status: 400 });
      const balance = money(total - paid);

      const grn = await tx.goodsReceivedNote.create({
        data: {
          tenantId: req.user.tenantId,
          supplierId: data.supplierId || purchaseOrder?.supplierId || null,
          purchaseOrderId: data.purchaseOrderId || null,
          grnNo,
          status: 'POSTED',
          receivedDate: data.receivedDate || new Date(),
          subtotal,
          discount: data.discount,
          tax: data.tax,
          total,
          paid,
          balance,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId || null,
              description: item.description,
              qty: item.qty,
              unitCost: item.unitCost,
              discount: item.discount || 0,
              total: money(Number(item.qty) * Number(item.unitCost) - Number(item.discount || 0))
            }))
          }
        },
        include: { supplier: true, purchaseOrder: true, items: true }
      });

      for (const item of data.items) {
        if (!item.productId) continue;
        const product = productMap.get(item.productId);
        await tx.product.update({
          where: { id: item.productId },
          data: { stockQty: { increment: item.qty }, costPrice: item.unitCost }
        });
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: item.qty });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: item.productId,
            warehouseId: warehouse.id,
            type: 'PURCHASE',
            quantity: item.qty,
            unitCost: item.unitCost || product.costPrice,
            refType: 'GRN',
            refId: grn.id,
            notes: `Stock received by ${grnNo} into ${warehouse.name}`
          }
        });
      }

      if ((data.supplierId || purchaseOrder?.supplierId) && balance > 0) {
        await tx.supplier.update({
          where: { id: data.supplierId || purchaseOrder.supplierId },
          data: { balance: { increment: balance } }
        });
      }

      if (paid > 0) {
        await tx.payment.create({
          data: {
            tenantId: req.user.tenantId,
            grnId: grn.id,
            supplierId: data.supplierId || purchaseOrder?.supplierId || null,
            receiptNo: await nextReceiptNo(tx, req.user.tenantId),
            direction: 'OUT',
            method: data.paymentMethod,
            amount: paid,
            reference: data.reference || null,
            notes: `Supplier payment for ${grnNo}`
          }
        });
      }

      await postGrnJournal(tx, { tenantId: req.user.tenantId, grn, createdById: req.user.id });

      if (purchaseOrder) {
        const receivedItems = await tx.goodsReceivedNoteItem.findMany({
          where: { grn: { purchaseOrderId: purchaseOrder.id, tenantId: req.user.tenantId, status: 'POSTED' } }
        });
        const receivedByProduct = new Map();
        for (const item of receivedItems) {
          if (!item.productId) continue;
          receivedByProduct.set(item.productId, Number(receivedByProduct.get(item.productId) || 0) + Number(item.qty));
        }
        const allReceived = purchaseOrder.items
          .filter((item) => item.productId)
          .every((item) => Number(receivedByProduct.get(item.productId) || 0) >= Number(item.qty));

        await tx.purchaseOrder.update({
          where: { id: purchaseOrder.id },
          data: { status: allReceived ? 'RECEIVED' : 'PARTIAL_RECEIVED' }
        });
      }

      return grn;
    });

    await audit(req, 'CREATE', 'GoodsReceivedNote', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
