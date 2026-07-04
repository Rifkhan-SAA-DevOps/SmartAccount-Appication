import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postSalesReturnJournal, postPurchaseReturnJournal } from '../utils/accountingPost.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowInventory'));

const salesItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().optional().default(0)
});

const purchaseItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().nonnegative(),
  discount: z.coerce.number().optional().default(0)
});

const salesReturnSchema = z.object({
  invoiceId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  returnDate: z.coerce.date().optional(),
  refundAmount: z.coerce.number().optional().default(0),
  refundMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE']).optional().default('CASH'),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(salesItemSchema).min(1)
});

const purchaseReturnSchema = z.object({
  grnId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  returnDate: z.coerce.date().optional(),
  refundReceived: z.coerce.number().optional().default(0),
  refundMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE']).optional().default('CASH'),
  reason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(purchaseItemSchema).min(1)
});

async function nextSalesReturnNo(tenantId) {
  const count = await prisma.salesReturn.count({ where: { tenantId } });
  return `SR${String(count + 1001).padStart(4, '0')}`;
}

async function nextPurchaseReturnNo(tenantId) {
  const count = await prisma.purchaseReturn.count({ where: { tenantId } });
  return `PR${String(count + 1001).padStart(4, '0')}`;
}

function salesTotals(items) {
  const subtotal = money(items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitPrice) - Number(item.discount || 0)), 0));
  return { subtotal, total: subtotal };
}

function purchaseTotals(items) {
  const subtotal = money(items.reduce((sum, item) => sum + (Number(item.qty) * Number(item.unitCost) - Number(item.discount || 0)), 0));
  return { subtotal, total: subtotal };
}

async function verifyProducts(tx, tenantId, items, checkStock = false) {
  const productMap = new Map();
  for (const item of items) {
    if (!item.productId) continue;
    const product = await tx.product.findFirst({ where: { id: item.productId, tenantId, isActive: true } });
    if (!product) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 404 });
    if (checkStock && Number(product.stockQty) < Number(item.qty)) {
      throw Object.assign(new Error(`Not enough stock to return ${product.name}`), { status: 400 });
    }
    productMap.set(item.productId, product);
  }
  return productMap;
}

router.get('/sales', requirePermission('return:read'), async (req, res, next) => {
  try {
    const returns = await prisma.salesReturn.findMany({
      where: { tenantId: req.user.tenantId },
      include: { customer: true, invoice: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(returns);
  } catch (e) { next(e); }
});

router.post('/sales', requirePermission('return:create'), async (req, res, next) => {
  try {
    const data = salesReturnSchema.parse(req.body);
    const returnNo = await nextSalesReturnNo(req.user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const productMap = await verifyProducts(tx, req.user.tenantId, data.items);
      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);

      let invoice = null;
      if (data.invoiceId) {
        invoice = await tx.invoice.findFirst({
          where: { id: data.invoiceId, tenantId: req.user.tenantId },
          include: { customer: true, items: true }
        });
        if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      }

      const customerId = data.customerId || invoice?.customerId || null;
      let customer = null;
      if (customerId) {
        customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: req.user.tenantId } });
        if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      }

      const { subtotal, total } = salesTotals(data.items);
      const refundAmount = money(data.refundAmount || 0);
      if (refundAmount > total) throw Object.assign(new Error('Refund amount cannot be greater than sales return total'), { status: 400 });

      const salesReturn = await tx.salesReturn.create({
        data: {
          tenantId: req.user.tenantId,
          invoiceId: data.invoiceId || null,
          customerId,
          returnNo,
          status: 'POSTED',
          returnDate: data.returnDate || new Date(),
          subtotal,
          total,
          refundAmount,
          reason: data.reason || null,
          notes: data.notes || null,
          createdById: req.user.id,
          items: {
            create: data.items.map((item) => ({
              productId: item.productId || null,
              description: item.description,
              qty: item.qty,
              unitPrice: item.unitPrice,
              discount: item.discount || 0,
              total: money(Number(item.qty) * Number(item.unitPrice) - Number(item.discount || 0))
            }))
          }
        },
        include: { customer: true, invoice: true, items: true }
      });

      for (const item of data.items) {
        if (!item.productId) continue;
        const product = productMap.get(item.productId);
        await tx.product.update({ where: { id: item.productId }, data: { stockQty: { increment: item.qty } } });
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: item.qty });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: item.productId,
            warehouseId: warehouse.id,
            type: 'SALES_RETURN',
            quantity: item.qty,
            unitCost: product.costPrice,
            refType: 'SalesReturn',
            refId: salesReturn.id,
            notes: `Sales return ${returnNo} into ${warehouse.name}`
          }
        });
      }

      const creditToApply = money(total - refundAmount);
      if (invoice && creditToApply > 0) {
        const invoiceBalance = Number(invoice.balance || 0);
        const appliedCredit = money(Math.min(invoiceBalance, creditToApply));
        const newBalance = money(Math.max(0, invoiceBalance - appliedCredit));
        const newStatus = newBalance <= 0 ? 'PAID' : 'PARTIAL';
        if (appliedCredit > 0) {
          await tx.invoice.update({ where: { id: invoice.id }, data: { balance: newBalance, status: newStatus } });
        }
      }

      if (customer && creditToApply > 0) {
        const appliedCustomerCredit = money(Math.min(Number(customer.balance || 0), creditToApply));
        if (appliedCustomerCredit > 0) {
          await tx.customer.update({ where: { id: customer.id }, data: { balance: { decrement: appliedCustomerCredit } } });
        }
      }

      const salesReturnForJournal = await tx.salesReturn.findUnique({
        where: { id: salesReturn.id },
        include: { items: { include: { product: true } } }
      });
      await postSalesReturnJournal(tx, { tenantId: req.user.tenantId, salesReturn: salesReturnForJournal, createdById: req.user.id });

      if (refundAmount > 0) {
        await tx.payment.create({
          data: {
            tenantId: req.user.tenantId,
            customerId,
            receiptNo: await nextReceiptNo(tx, req.user.tenantId),
            direction: 'OUT',
            method: data.refundMethod,
            amount: refundAmount,
            notes: `Refund for sales return ${returnNo}`
          }
        });
      }

      return salesReturn;
    });

    await audit(req, 'CREATE', 'SalesReturn', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.get('/purchases', requirePermission('return:read'), async (req, res, next) => {
  try {
    const returns = await prisma.purchaseReturn.findMany({
      where: { tenantId: req.user.tenantId },
      include: { supplier: true, grn: true, items: { include: { product: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(returns);
  } catch (e) { next(e); }
});

router.post('/purchases', requirePermission('return:create'), async (req, res, next) => {
  try {
    const data = purchaseReturnSchema.parse(req.body);
    const returnNo = await nextPurchaseReturnNo(req.user.tenantId);

    const result = await prisma.$transaction(async (tx) => {
      const productMap = await verifyProducts(tx, req.user.tenantId, data.items, false);
      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);

      for (const item of data.items) {
        if (!item.productId) continue;
        const product = productMap.get(item.productId);
        const stock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id } } });
        const available = Number(stock?.quantity ?? product.stockQty ?? 0);
        if (available < Number(item.qty)) throw Object.assign(new Error(`Not enough stock in ${warehouse.name} to return ${product.name}`), { status: 400 });
      }

      let grn = null;
      if (data.grnId) {
        grn = await tx.goodsReceivedNote.findFirst({
          where: { id: data.grnId, tenantId: req.user.tenantId },
          include: { supplier: true, items: true }
        });
        if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
      }

      const supplierId = data.supplierId || grn?.supplierId || null;
      let supplier = null;
      if (supplierId) {
        supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: req.user.tenantId } });
        if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
      }

      const { subtotal, total } = purchaseTotals(data.items);
      const refundReceived = money(data.refundReceived || 0);
      if (refundReceived > total) throw Object.assign(new Error('Refund received cannot be greater than purchase return total'), { status: 400 });

      const purchaseReturn = await tx.purchaseReturn.create({
        data: {
          tenantId: req.user.tenantId,
          grnId: data.grnId || null,
          supplierId,
          returnNo,
          status: 'POSTED',
          returnDate: data.returnDate || new Date(),
          subtotal,
          total,
          refundReceived,
          reason: data.reason || null,
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
        include: { supplier: true, grn: true, items: true }
      });

      for (const item of data.items) {
        if (!item.productId) continue;
        const product = productMap.get(item.productId);
        await tx.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: item.qty } } });
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: -Number(item.qty) });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: item.productId,
            warehouseId: warehouse.id,
            type: 'PURCHASE_RETURN',
            quantity: -item.qty,
            unitCost: item.unitCost || product.costPrice,
            refType: 'PurchaseReturn',
            refId: purchaseReturn.id,
            notes: `Purchase return ${returnNo} from ${warehouse.name}`
          }
        });
      }

      const creditReduction = money(total - refundReceived);
      if (supplier && creditReduction > 0) {
        const appliedSupplierCredit = money(Math.min(Number(supplier.balance || 0), creditReduction));
        if (appliedSupplierCredit > 0) {
          await tx.supplier.update({ where: { id: supplier.id }, data: { balance: { decrement: appliedSupplierCredit } } });
        }
      }

      await postPurchaseReturnJournal(tx, { tenantId: req.user.tenantId, purchaseReturn, createdById: req.user.id });

      if (refundReceived > 0) {
        await tx.payment.create({
          data: {
            tenantId: req.user.tenantId,
            supplierId,
            receiptNo: await nextReceiptNo(tx, req.user.tenantId),
            direction: 'IN',
            method: data.refundMethod,
            amount: refundReceived,
            notes: `Supplier refund for purchase return ${returnNo}`
          }
        });
      }

      return purchaseReturn;
    });

    await audit(req, 'CREATE', 'PurchaseReturn', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
