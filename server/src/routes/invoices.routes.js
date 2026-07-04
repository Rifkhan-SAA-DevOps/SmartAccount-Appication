import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { limitGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postInvoiceJournal, postCustomerReceiptJournal } from '../utils/accountingPost.js';
import { buildInvoiceHtml } from '../utils/invoiceHtml.js';
import { buildThermalReceiptHtml } from '../utils/thermalReceiptHtml.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';

const router = Router();
router.use(authRequired);

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().optional().default(0)
});

const invoiceSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  branchId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  taxRateId: z.string().uuid().optional().nullable(),
  issueDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional().nullable(),
  discount: z.coerce.number().optional().default(0),
  tax: z.coerce.number().optional().default(0),
  paid: z.coerce.number().optional().default(0),
  paymentMethod: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE', 'CREDIT']).optional().default('CASH'),
  clientSaleId: z.string().max(120).optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(itemSchema).min(1)
});

function cleanOfflineId(value) {
  return String(value || '').replace(/[^a-zA-Z0-9_.:-]/g, '').slice(0, 120);
}

async function nextInvoiceNo(tenantId, tx = prisma) {
  const [count, settings] = await Promise.all([
    tx.invoice.count({ where: { tenantId } }),
    tx.tenantSetting.findUnique({ where: { tenantId } }).catch(() => null)
  ]);
  const prefix = settings?.invoicePrefix || 'INV';
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

router.get('/', requirePermission('invoice:read'), async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: req.user.tenantId },
      include: { customer: true, items: true, payments: true },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(invoices);
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('invoice:read'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { customer: true, items: { include: { product: true } }, payments: true, createdBy: { select: { name: true, email: true } } }
    });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });
    res.json(invoice);
  } catch (e) { next(e); }
});

router.get('/:id/print', requirePermission('invoice:read'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { customer: true, items: { include: { product: true } }, createdBy: { select: { name: true, email: true } } }
    });
    if (!invoice) return res.status(404).send('<h1>Invoice not found</h1>');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    let settings = await prisma.tenantSetting.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!settings) settings = await prisma.tenantSetting.create({ data: { tenantId: req.user.tenantId } });

    const html = buildInvoiceHtml({ invoice, tenant, settings });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
});


router.get('/:id/thermal-receipt', requirePermission('invoice:read'), async (req, res, next) => {
  try {
    const invoice = await prisma.invoice.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { customer: true, payments: true, items: { include: { product: true } }, createdBy: { select: { name: true, email: true } } }
    });
    if (!invoice) return res.status(404).send('<h1>Receipt not found</h1>');

    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    let settings = await prisma.tenantSetting.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!settings) settings = await prisma.tenantSetting.create({ data: { tenantId: req.user.tenantId } });

    const html = buildThermalReceiptHtml({ invoice, tenant, settings });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('invoice:create'), limitGuard('invoices'), async (req, res, next) => {
  try {
    const data = invoiceSchema.parse(req.body);
    const offlineId = cleanOfflineId(data.clientSaleId);

    if (offlineId) {
      const existing = await prisma.invoice.findFirst({
        where: { tenantId: req.user.tenantId, notes: { contains: `offlineSaleId:${offlineId}` } },
        include: { items: true, customer: true }
      });
      if (existing) return res.status(200).json(existing);
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoiceNo = await nextInvoiceNo(req.user.tenantId, tx);
      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      const productMap = new Map();
      for (const item of data.items) {
        if (item.productId) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: req.user.tenantId } });
          if (!product) throw Object.assign(new Error(`Product not found: ${item.productId}`), { status: 404 });
          const warehouseStock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id } } });
          const available = Number(warehouseStock?.quantity ?? product.stockQty ?? 0);
          if (available < item.qty) throw Object.assign(new Error(`Not enough stock for ${product.name} in ${warehouse.name}`), { status: 400 });
          productMap.set(item.productId, product);
        }
      }

      const subtotal = money(data.items.reduce((sum, item) => sum + (item.qty * item.unitPrice - (item.discount || 0)), 0));
      const discount = money(data.discount || 0);
      const taxableAmount = money(Math.max(subtotal - discount, 0));
      let tax = money(data.tax || 0);

      if (data.taxRateId) {
        const taxRate = await tx.taxRate.findFirst({ where: { id: data.taxRateId, tenantId: req.user.tenantId, isActive: true } });
        if (!taxRate) throw Object.assign(new Error('Tax rate not found'), { status: 404 });
        tax = money(taxableAmount * Number(taxRate.rate || 0) / 100);
      }

      const total = money(taxableAmount + tax);
      const paid = money(data.paid || 0);
      const balance = money(total - paid);
      const status = balance <= 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';

      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.user.tenantId,
          branchId: data.branchId || null,
          customerId: data.customerId || null,
          createdById: req.user.id,
          invoiceNo,
          issueDate: data.issueDate || new Date(),
          dueDate: data.dueDate || null,
          subtotal,
          discount,
          tax,
          total,
          paid,
          balance,
          status,
          notes: [data.notes, offlineId ? `offlineSaleId:${offlineId}` : null].filter(Boolean).join(' | ') || null,
          items: {
            create: data.items.map((item) => {
              const product = item.productId ? productMap.get(item.productId) : null;
              const lineTotal = money(item.qty * item.unitPrice - (item.discount || 0));
              return {
                productId: item.productId || null,
                description: item.description,
                qty: item.qty,
                costPrice: product?.costPrice || 0,
                unitPrice: item.unitPrice,
                discount: item.discount || 0,
                total: lineTotal
              };
            })
          }
        },
        include: { items: true, customer: true }
      });

      for (const item of data.items) {
        if (item.productId) {
          const product = productMap.get(item.productId);
          await tx.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: item.qty } } });
          await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: -Number(item.qty) });
          await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, type: 'SALE', quantity: -item.qty, unitCost: product.costPrice, refType: 'Invoice', refId: invoice.id, notes: `Sold from ${warehouse.name}` } });
        }
      }

      if (paid > 0) {
        await tx.payment.create({ data: { tenantId: req.user.tenantId, invoiceId: invoice.id, customerId: data.customerId || null, receiptNo: await nextReceiptNo(tx, req.user.tenantId), direction: 'IN', method: data.paymentMethod, amount: paid, notes: `Payment for ${invoiceNo}` } });
      }

      if (data.customerId && balance > 0) {
        await tx.customer.update({ where: { id: data.customerId }, data: { balance: { increment: balance } } });
      }

      await postInvoiceJournal(tx, { tenantId: req.user.tenantId, invoice, createdById: req.user.id });

      return invoice;
    });

    await audit(req, 'CREATE', 'Invoice', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/:id/payments', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const { amount, method, reference, notes } = z.object({
      amount: z.coerce.number().positive(),
      method: z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE']).default('CASH'),
      reference: z.string().optional(),
      notes: z.string().optional()
    }).parse(req.body);

    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!invoice) return res.status(404).json({ message: 'Invoice not found' });

    const result = await prisma.$transaction(async (tx) => {
      const newPaid = money(Number(invoice.paid) + amount);
      const newBalance = money(Number(invoice.total) - newPaid);
      const status = newBalance <= 0 ? 'PAID' : 'PARTIAL';

      const payment = await tx.payment.create({ data: { tenantId: req.user.tenantId, invoiceId: invoice.id, customerId: invoice.customerId, receiptNo: await nextReceiptNo(tx, req.user.tenantId), direction: 'IN', method, amount, reference, notes } });
      const updated = await tx.invoice.update({ where: { id: invoice.id }, data: { paid: newPaid, balance: newBalance < 0 ? 0 : newBalance, status } });

      if (invoice.customerId) {
        await tx.customer.update({ where: { id: invoice.customerId }, data: { balance: { decrement: amount } } });
      }

      await postCustomerReceiptJournal(tx, { tenantId: req.user.tenantId, payment, createdById: req.user.id });

      return { payment, invoice: updated };
    });

    await audit(req, 'PAYMENT', 'Invoice', invoice.id, invoice, result.invoice);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
