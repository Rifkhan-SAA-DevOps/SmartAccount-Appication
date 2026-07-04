import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { nextReceiptNo } from '../utils/receipt.js';
import { postCustomerReceiptJournal, postSupplierPaymentJournal } from '../utils/accountingPost.js';

const router = Router();
router.use(authRequired);

const methodSchema = z.enum(['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE']);

const customerReceiptSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: methodSchema.default('CASH'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: z.coerce.date().optional()
});

const supplierPaymentSchema = z.object({
  supplierId: z.string().uuid().optional().nullable(),
  grnId: z.string().uuid().optional().nullable(),
  bankAccountId: z.string().uuid().optional().nullable(),
  amount: z.coerce.number().positive(),
  method: methodSchema.default('CASH'),
  reference: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  paidAt: z.coerce.date().optional()
});

function invoiceStatus(balance) {
  if (balance <= 0) return 'PAID';
  return 'PARTIAL';
}

async function findAccount(tx, tenantId, id) {
  if (!id) return null;
  const account = await tx.bankAccount.findFirst({ where: { id, tenantId, isActive: true } });
  if (!account) throw Object.assign(new Error('Cash/Bank account not found'), { status: 404 });
  return account;
}

router.get('/', requirePermission('payment:read'), async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: { tenantId: req.user.tenantId },
      include: {
        customer: true,
        supplier: true,
        invoice: { select: { id: true, invoiceNo: true, total: true, balance: true } },
        grn: { select: { id: true, grnNo: true, total: true, balance: true } },
        bankAccount: true
      },
      orderBy: { paidAt: 'desc' },
      take: 150
    });
    res.json(payments);
  } catch (e) { next(e); }
});

router.get('/:id/receipt', requirePermission('payment:read'), async (req, res, next) => {
  try {
    const payment = await prisma.payment.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        tenant: { select: { name: true, email: true, phone: true, currency: true } },
        customer: true,
        supplier: true,
        invoice: { select: { invoiceNo: true, total: true, paid: true, balance: true } },
        grn: { select: { grnNo: true, total: true, paid: true, balance: true } },
        bankAccount: true
      }
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json(payment);
  } catch (e) { next(e); }
});

router.post('/customer', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const data = customerReceiptSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      let invoice = null;
      if (data.invoiceId) {
        invoice = await tx.invoice.findFirst({ where: { id: data.invoiceId, tenantId: req.user.tenantId } });
        if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      }

      const customerId = data.customerId || invoice?.customerId || null;
      if (!customerId) throw Object.assign(new Error('Customer is required for a receipt'), { status: 400 });

      const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId: req.user.tenantId, isActive: true } });
      if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });

      const account = await findAccount(tx, req.user.tenantId, data.bankAccountId);
      const amount = money(data.amount);
      const maxPayable = invoice ? Number(invoice.balance || 0) : Number(customer.balance || 0);
      if (maxPayable <= 0) throw Object.assign(new Error('No outstanding balance to receive for this customer'), { status: 400 });
      if (amount > maxPayable) {
        throw Object.assign(new Error(`Amount cannot be greater than outstanding balance LKR ${maxPayable.toFixed(2)}`), { status: 400 });
      }

      let updatedInvoice = null;
      if (invoice) {
        const newPaid = money(Number(invoice.paid || 0) + amount);
        const newBalance = money(Math.max(0, Number(invoice.balance || 0) - amount));
        updatedInvoice = await tx.invoice.update({
          where: { id: invoice.id },
          data: { paid: newPaid, balance: newBalance, status: invoiceStatus(newBalance) }
        });
      }

      await tx.customer.update({ where: { id: customerId }, data: { balance: { decrement: amount } } });

      const payment = await tx.payment.create({
        data: {
          tenantId: req.user.tenantId,
          invoiceId: invoice?.id || null,
          customerId,
          bankAccountId: account?.id || null,
          receiptNo: await nextReceiptNo(tx, req.user.tenantId),
          direction: 'IN',
          method: data.method,
          amount,
          reference: data.reference || null,
          paidAt: data.paidAt || new Date(),
          notes: data.notes || (invoice ? `Receipt for invoice ${invoice.invoiceNo}` : 'Customer receipt')
        },
        include: { customer: true, invoice: true, bankAccount: true }
      });

      if (account) {
        await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { increment: amount } } });
        await tx.bankTransaction.create({
          data: {
            tenantId: req.user.tenantId,
            bankAccountId: account.id,
            type: 'CUSTOMER_RECEIPT',
            direction: 'IN',
            amount,
            refType: 'Payment',
            refId: payment.id,
            description: payment.notes || `Customer receipt ${payment.receiptNo}`,
            transactionDate: payment.paidAt
          }
        });
      }

      await postCustomerReceiptJournal(tx, { tenantId: req.user.tenantId, payment, bankAccount: account, createdById: req.user.id });

      return { payment, invoice: updatedInvoice };
    });

    await audit(req, 'RECEIPT', 'Payment', result.payment.id, null, result.payment);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.post('/supplier', requirePermission('payment:create'), async (req, res, next) => {
  try {
    const data = supplierPaymentSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      let grn = null;
      if (data.grnId) {
        grn = await tx.goodsReceivedNote.findFirst({ where: { id: data.grnId, tenantId: req.user.tenantId } });
        if (!grn) throw Object.assign(new Error('GRN not found'), { status: 404 });
      }

      const supplierId = data.supplierId || grn?.supplierId || null;
      if (!supplierId) throw Object.assign(new Error('Supplier is required for a payment'), { status: 400 });

      const supplier = await tx.supplier.findFirst({ where: { id: supplierId, tenantId: req.user.tenantId, isActive: true } });
      if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });

      const account = await findAccount(tx, req.user.tenantId, data.bankAccountId);
      const amount = money(data.amount);
      const maxPayable = grn ? Number(grn.balance || 0) : Number(supplier.balance || 0);
      if (maxPayable <= 0) throw Object.assign(new Error('No outstanding payable for this supplier'), { status: 400 });
      if (amount > maxPayable) {
        throw Object.assign(new Error(`Amount cannot be greater than outstanding payable LKR ${maxPayable.toFixed(2)}`), { status: 400 });
      }

      let updatedGrn = null;
      if (grn) {
        const newPaid = money(Number(grn.paid || 0) + amount);
        const newBalance = money(Math.max(0, Number(grn.balance || 0) - amount));
        updatedGrn = await tx.goodsReceivedNote.update({
          where: { id: grn.id },
          data: { paid: newPaid, balance: newBalance }
        });
      }

      await tx.supplier.update({ where: { id: supplierId }, data: { balance: { decrement: amount } } });

      const payment = await tx.payment.create({
        data: {
          tenantId: req.user.tenantId,
          grnId: grn?.id || null,
          supplierId,
          bankAccountId: account?.id || null,
          receiptNo: await nextReceiptNo(tx, req.user.tenantId),
          direction: 'OUT',
          method: data.method,
          amount,
          reference: data.reference || null,
          paidAt: data.paidAt || new Date(),
          notes: data.notes || (grn ? `Supplier payment for GRN ${grn.grnNo}` : 'Supplier payment')
        },
        include: { supplier: true, grn: true, bankAccount: true }
      });

      if (account) {
        if (Number(account.currentBalance) < amount) throw Object.assign(new Error(`Not enough balance in ${account.name}`), { status: 400 });
        await tx.bankAccount.update({ where: { id: account.id }, data: { currentBalance: { decrement: amount } } });
        await tx.bankTransaction.create({
          data: {
            tenantId: req.user.tenantId,
            bankAccountId: account.id,
            type: 'SUPPLIER_PAYMENT',
            direction: 'OUT',
            amount,
            refType: 'Payment',
            refId: payment.id,
            description: payment.notes || `Supplier payment ${payment.receiptNo}`,
            transactionDate: payment.paidAt
          }
        });
      }

      await postSupplierPaymentJournal(tx, { tenantId: req.user.tenantId, payment, bankAccount: account, createdById: req.user.id });

      return { payment, grn: updatedGrn };
    });

    await audit(req, 'PAYMENT', 'Payment', result.payment.id, null, result.payment);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

export default router;
