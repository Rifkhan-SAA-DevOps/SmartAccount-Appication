import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function byDate(a, b) {
  const da = new Date(a.date).getTime();
  const db = new Date(b.date).getTime();
  if (da !== db) return da - db;
  return (a.order || 0) - (b.order || 0);
}

function summarizeCustomerEntries(entries) {
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const withBalance = entries.sort(byDate).map((entry) => {
    const debit = money(entry.debit || 0);
    const credit = money(entry.credit || 0);
    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
    balance = money(balance + debit - credit);
    return { ...entry, debit, credit, balance };
  });

  return { entries: withBalance.reverse(), totalDebit, totalCredit, calculatedBalance: balance };
}

function summarizeSupplierEntries(entries) {
  let balance = 0;
  let totalDebit = 0;
  let totalCredit = 0;

  const withBalance = entries.sort(byDate).map((entry) => {
    const debit = money(entry.debit || 0);
    const credit = money(entry.credit || 0);
    totalDebit = money(totalDebit + debit);
    totalCredit = money(totalCredit + credit);
    balance = money(balance + credit - debit);
    return { ...entry, debit, credit, balance };
  });

  return { entries: withBalance.reverse(), totalDebit, totalCredit, calculatedBalance: balance };
}

router.get('/customers/:id', requirePermission('ledger:read'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        invoices: { orderBy: { issueDate: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        salesReturns: { orderBy: { returnDate: 'asc' } }
      }
    });

    if (!customer) return res.status(404).json({ message: 'Customer not found' });

    const entries = [];

    customer.invoices.forEach((invoice, index) => {
      entries.push({
        id: `invoice-${invoice.id}`,
        order: index,
        date: invoice.issueDate,
        type: 'INVOICE',
        ref: invoice.invoiceNo,
        description: `Invoice ${invoice.invoiceNo}`,
        debit: Number(invoice.total || 0),
        credit: 0
      });
    });

    customer.salesReturns.forEach((ret, index) => {
      entries.push({
        id: `sales-return-${ret.id}`,
        order: 2000 + index,
        date: ret.returnDate,
        type: 'SALES_RETURN',
        ref: ret.returnNo,
        description: ret.reason ? `Sales return - ${ret.reason}` : `Sales return ${ret.returnNo}`,
        debit: 0,
        credit: Number(ret.total || 0)
      });
    });

    customer.payments.forEach((payment, index) => {
      const direction = payment.direction;
      entries.push({
        id: `payment-${payment.id}`,
        order: 4000 + index,
        date: payment.paidAt,
        type: direction === 'IN' ? 'PAYMENT_RECEIVED' : 'REFUND_PAID',
        ref: payment.receiptNo || payment.reference || 'PAYMENT',
        description: payment.notes || (direction === 'IN' ? 'Payment received' : 'Refund paid'),
        method: payment.method,
        debit: direction === 'OUT' ? Number(payment.amount || 0) : 0,
        credit: direction === 'IN' ? Number(payment.amount || 0) : 0
      });
    });

    const summary = summarizeCustomerEntries(entries);
    const openInvoices = customer.invoices
      .filter((invoice) => Number(invoice.balance || 0) > 0)
      .map((invoice) => ({ id: invoice.id, invoiceNo: invoice.invoiceNo, balance: invoice.balance, total: invoice.total }));

    res.json({
      customer,
      openInvoices,
      storedBalance: customer.balance,
      ...summary
    });
  } catch (e) { next(e); }
});

router.get('/suppliers/:id', requirePermission('ledger:read'), async (req, res, next) => {
  try {
    const supplier = await prisma.supplier.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: {
        grns: { orderBy: { receivedDate: 'asc' } },
        payments: { orderBy: { paidAt: 'asc' } },
        purchaseReturns: { orderBy: { returnDate: 'asc' } }
      }
    });

    if (!supplier) return res.status(404).json({ message: 'Supplier not found' });

    const entries = [];

    supplier.grns.forEach((grn, index) => {
      entries.push({
        id: `grn-${grn.id}`,
        order: index,
        date: grn.receivedDate,
        type: 'GRN',
        ref: grn.grnNo,
        description: `Goods received ${grn.grnNo}`,
        debit: 0,
        credit: Number(grn.total || 0)
      });
    });

    supplier.purchaseReturns.forEach((ret, index) => {
      entries.push({
        id: `purchase-return-${ret.id}`,
        order: 2000 + index,
        date: ret.returnDate,
        type: 'PURCHASE_RETURN',
        ref: ret.returnNo,
        description: ret.reason ? `Purchase return - ${ret.reason}` : `Purchase return ${ret.returnNo}`,
        debit: Number(ret.total || 0),
        credit: 0
      });
    });

    supplier.payments.forEach((payment, index) => {
      const isSupplierRefund = payment.direction === 'IN';
      entries.push({
        id: `payment-${payment.id}`,
        order: 4000 + index,
        date: payment.paidAt,
        type: isSupplierRefund ? 'SUPPLIER_REFUND' : 'SUPPLIER_PAYMENT',
        ref: payment.receiptNo || payment.reference || 'PAYMENT',
        description: payment.notes || (isSupplierRefund ? 'Supplier refund received' : 'Supplier payment'),
        method: payment.method,
        debit: isSupplierRefund ? 0 : Number(payment.amount || 0),
        credit: isSupplierRefund ? Number(payment.amount || 0) : 0
      });
    });

    const summary = summarizeSupplierEntries(entries);
    const openGrns = supplier.grns
      .filter((grn) => Number(grn.balance || 0) > 0)
      .map((grn) => ({ id: grn.id, grnNo: grn.grnNo, balance: grn.balance, total: grn.total }));

    res.json({
      supplier,
      openGrns,
      storedBalance: supplier.balance,
      ...summary
    });
  } catch (e) { next(e); }
});

export default router;
