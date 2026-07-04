import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);
router.use(requirePermission('report:read'));
router.use(planFeatureGuard('allowReports'));

function num(value) {
  return Number(value || 0);
}

function money(value) {
  return Math.round(num(value) * 100) / 100;
}

function qty(value) {
  return Math.round(num(value) * 1000) / 1000;
}

function parseRange(query) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  defaultFrom.setHours(0, 0, 0, 0);

  const from = query.from ? new Date(query.from) : defaultFrom;
  const to = query.to ? new Date(query.to) : new Date();
  if (query.from) from.setHours(0, 0, 0, 0);
  if (query.to) to.setHours(23, 59, 59, 999);
  return { from, to };
}

function dayKey(date) {
  return new Date(date).toISOString().slice(0, 10);
}

function groupAdd(map, key, patch) {
  const current = map.get(key) || {};
  map.set(key, { ...current, ...patch });
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\n\r]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
  return str;
}

function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => csvEscape(c.value ? c.value(row) : row[c.key])).join(',')).join('\n');
  return `${header}\n${body}`;
}

function sendCsv(res, filename, rows, columns) {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(toCsv(rows, columns));
}

async function loadReportBase(tenantId, from, to) {
  return Promise.all([
    prisma.invoice.findMany({
      where: { tenantId, issueDate: { gte: from, lte: to } },
      include: { customer: true, branch: true, items: { include: { product: true } } },
      orderBy: { issueDate: 'desc' }
    }),
    prisma.goodsReceivedNote.findMany({
      where: { tenantId, receivedDate: { gte: from, lte: to } },
      include: { supplier: true, items: { include: { product: true } } },
      orderBy: { receivedDate: 'desc' }
    }),
    prisma.salesReturn.findMany({
      where: { tenantId, returnDate: { gte: from, lte: to } },
      include: { customer: true, invoice: true, items: { include: { product: true } } },
      orderBy: { returnDate: 'desc' }
    }),
    prisma.purchaseReturn.findMany({
      where: { tenantId, returnDate: { gte: from, lte: to } },
      include: { supplier: true, grn: true, items: { include: { product: true } } },
      orderBy: { returnDate: 'desc' }
    }),
    prisma.expense.findMany({
      where: { tenantId, spentAt: { gte: from, lte: to } },
      include: { bankAccount: true },
      orderBy: { spentAt: 'desc' }
    }),
    prisma.payment.findMany({
      where: { tenantId, paidAt: { gte: from, lte: to } },
      include: { customer: true, supplier: true, bankAccount: true, invoice: true, grn: true },
      orderBy: { paidAt: 'desc' }
    })
  ]);
}

router.get('/overview', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseRange(req.query);

    const [invoices, grns, salesReturns, purchaseReturns, expenses, payments] = await loadReportBase(tenantId, from, to);
    const [customers, suppliers, products, productStocks, bankAccounts] = await Promise.all([
      prisma.customer.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' } }),
      prisma.supplier.findMany({ where: { tenantId, isActive: true }, orderBy: { balance: 'desc' } }),
      prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.productStock.findMany({ where: { tenantId }, include: { product: true, warehouse: true } }),
      prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } })
    ]);

    const salesTotal = money(invoices.reduce((s, i) => s + num(i.total), 0));
    const salesPaid = money(invoices.reduce((s, i) => s + num(i.paid), 0));
    const salesBalance = money(invoices.reduce((s, i) => s + num(i.balance), 0));
    const salesTax = money(invoices.reduce((s, i) => s + num(i.tax), 0));
    const cogs = money(invoices.flatMap((i) => i.items).reduce((s, item) => s + num(item.qty) * num(item.costPrice), 0));
    const purchaseTotal = money(grns.reduce((s, g) => s + num(g.total), 0));
    const purchaseTax = money(grns.reduce((s, g) => s + num(g.tax), 0));
    const expenseTotal = money(expenses.reduce((s, e) => s + num(e.amount), 0));
    const salesReturnTotal = money(salesReturns.reduce((s, r) => s + num(r.total), 0));
    const purchaseReturnTotal = money(purchaseReturns.reduce((s, r) => s + num(r.total), 0));
    const paymentIn = money(payments.filter((p) => p.direction === 'IN').reduce((s, p) => s + num(p.amount), 0));
    const paymentOut = money(payments.filter((p) => p.direction === 'OUT').reduce((s, p) => s + num(p.amount), 0));
    const stockValue = money(productStocks.reduce((s, ps) => s + num(ps.quantity) * num(ps.product?.costPrice), 0));
    const productStockValue = money(products.reduce((s, p) => s + num(p.stockQty) * num(p.costPrice), 0));
    const lowStockCount = products.filter((p) => num(p.reorderLevel) > 0 && num(p.stockQty) <= num(p.reorderLevel)).length;
    const customerOutstanding = money(customers.reduce((s, c) => s + num(c.balance), 0));
    const supplierOutstanding = money(suppliers.reduce((s, supplier) => s + num(supplier.balance), 0));
    const bankBalance = money(bankAccounts.reduce((s, b) => s + num(b.currentBalance), 0));
    const grossProfit = money(salesTotal - salesReturnTotal - cogs);
    const netProfit = money(grossProfit - expenseTotal);

    const dailyMap = new Map();
    invoices.forEach((invoice) => {
      const key = dayKey(invoice.issueDate);
      const current = dailyMap.get(key) || { date: key, sales: 0, invoices: 0, paid: 0, balance: 0 };
      current.sales = money(current.sales + num(invoice.total));
      current.paid = money(current.paid + num(invoice.paid));
      current.balance = money(current.balance + num(invoice.balance));
      current.invoices += 1;
      dailyMap.set(key, current);
    });

    res.json({
      from,
      to,
      kpis: {
        salesTotal,
        salesPaid,
        salesBalance,
        salesTax,
        cogs,
        grossProfit,
        expenseTotal,
        netProfit,
        purchaseTotal,
        purchaseTax,
        paymentIn,
        paymentOut,
        salesReturnTotal,
        purchaseReturnTotal,
        customerOutstanding,
        supplierOutstanding,
        stockValue: stockValue || productStockValue,
        lowStockCount,
        bankBalance,
        invoiceCount: invoices.length,
        purchaseCount: grns.length
      },
      dailySales: Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      topCustomers: customers.slice(0, 8).map((c) => ({ id: c.id, name: c.name, phone: c.phone, balance: num(c.balance) })),
      topSuppliers: suppliers.slice(0, 8).map((s) => ({ id: s.id, name: s.name, phone: s.phone, balance: num(s.balance) })),
      lowStock: products.filter((p) => num(p.reorderLevel) > 0 && num(p.stockQty) <= num(p.reorderLevel)).slice(0, 8)
    });
  } catch (e) { next(e); }
});

router.get('/sales-advanced', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseRange(req.query);
    const [invoices, , salesReturns, , , payments] = await loadReportBase(tenantId, from, to);

    const productMap = new Map();
    invoices.forEach((invoice) => {
      invoice.items.forEach((item) => {
        const key = item.productId || item.description;
        const current = productMap.get(key) || { productId: item.productId, product: item.product?.name || item.description, sku: item.product?.sku || '-', qty: 0, sales: 0, cogs: 0, profit: 0 };
        current.qty = qty(current.qty + num(item.qty));
        current.sales = money(current.sales + num(item.total));
        current.cogs = money(current.cogs + num(item.qty) * num(item.costPrice));
        current.profit = money(current.sales - current.cogs);
        productMap.set(key, current);
      });
    });

    const customerMap = new Map();
    invoices.forEach((invoice) => {
      const key = invoice.customerId || 'walk-in';
      const current = customerMap.get(key) || { customerId: invoice.customerId, customer: invoice.customer?.name || 'Walk-in Customer', phone: invoice.customer?.phone || '-', invoices: 0, sales: 0, paid: 0, balance: 0 };
      current.invoices += 1;
      current.sales = money(current.sales + num(invoice.total));
      current.paid = money(current.paid + num(invoice.paid));
      current.balance = money(current.balance + num(invoice.balance));
      customerMap.set(key, current);
    });

    const branchMap = new Map();
    invoices.forEach((invoice) => {
      const key = invoice.branchId || 'no-branch';
      const current = branchMap.get(key) || { branchId: invoice.branchId, branch: invoice.branch?.name || 'No Branch', invoices: 0, sales: 0, paid: 0 };
      current.invoices += 1;
      current.sales = money(current.sales + num(invoice.total));
      current.paid = money(current.paid + num(invoice.paid));
      branchMap.set(key, current);
    });

    const paymentMap = new Map();
    payments.filter((p) => p.direction === 'IN').forEach((payment) => {
      const key = payment.method || 'CASH';
      const current = paymentMap.get(key) || { method: key, count: 0, amount: 0 };
      current.count += 1;
      current.amount = money(current.amount + num(payment.amount));
      paymentMap.set(key, current);
    });

    const tax = {
      salesTax: money(invoices.reduce((s, i) => s + num(i.tax), 0)),
      salesDiscount: money(invoices.reduce((s, i) => s + num(i.discount), 0)),
      salesReturnTax: money(salesReturns.reduce((s, r) => s + num(r.tax), 0)),
      netSalesTax: 0
    };
    tax.netSalesTax = money(tax.salesTax - tax.salesReturnTax);

    res.json({
      from,
      to,
      invoices,
      productWise: Array.from(productMap.values()).sort((a, b) => b.sales - a.sales),
      customerWise: Array.from(customerMap.values()).sort((a, b) => b.sales - a.sales),
      branchWise: Array.from(branchMap.values()).sort((a, b) => b.sales - a.sales),
      paymentMethods: Array.from(paymentMap.values()).sort((a, b) => b.amount - a.amount),
      tax
    });
  } catch (e) { next(e); }
});

router.get('/inventory-advanced', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseRange(req.query);

    const [products, productStocks, movements, invoices] = await Promise.all([
      prisma.product.findMany({ where: { tenantId, isActive: true }, include: { category: true, unit: true }, orderBy: { name: 'asc' } }),
      prisma.productStock.findMany({ where: { tenantId }, include: { product: true, warehouse: { include: { branch: true } } }, orderBy: { updatedAt: 'desc' } }),
      prisma.stockMovement.findMany({ where: { tenantId, createdAt: { gte: from, lte: to } }, include: { product: true }, orderBy: { createdAt: 'desc' }, take: 150 }),
      prisma.invoice.findMany({ where: { tenantId, issueDate: { gte: from, lte: to } }, include: { items: { include: { product: true } } } })
    ]);

    const warehouseMap = new Map();
    productStocks.forEach((stock) => {
      const key = stock.warehouseId;
      const current = warehouseMap.get(key) || { warehouseId: key, warehouse: stock.warehouse?.name || '-', branch: stock.warehouse?.branch?.name || '-', products: 0, quantity: 0, value: 0 };
      current.products += 1;
      current.quantity = qty(current.quantity + num(stock.quantity));
      current.value = money(current.value + num(stock.quantity) * num(stock.product?.costPrice));
      warehouseMap.set(key, current);
    });

    const fastMap = new Map();
    invoices.forEach((invoice) => invoice.items.forEach((item) => {
      const key = item.productId || item.description;
      const current = fastMap.get(key) || { productId: item.productId, product: item.product?.name || item.description, sku: item.product?.sku || '-', qtySold: 0, sales: 0 };
      current.qtySold = qty(current.qtySold + num(item.qty));
      current.sales = money(current.sales + num(item.total));
      fastMap.set(key, current);
    }));

    const stockValue = money(productStocks.reduce((s, stock) => s + num(stock.quantity) * num(stock.product?.costPrice), 0));
    const productStockValue = money(products.reduce((s, p) => s + num(p.stockQty) * num(p.costPrice), 0));

    res.json({
      from,
      to,
      summary: {
        products: products.length,
        stockValue: stockValue || productStockValue,
        lowStock: products.filter((p) => num(p.reorderLevel) > 0 && num(p.stockQty) <= num(p.reorderLevel)).length,
        outOfStock: products.filter((p) => num(p.stockQty) <= 0).length,
        movements: movements.length
      },
      products: products.map((p) => ({
        ...p,
        stockValue: money(num(p.stockQty) * num(p.costPrice)),
        margin: money(num(p.salePrice) - num(p.costPrice))
      })),
      warehouseWise: Array.from(warehouseMap.values()).sort((a, b) => b.value - a.value),
      fastMoving: Array.from(fastMap.values()).sort((a, b) => b.qtySold - a.qtySold).slice(0, 25),
      lowStock: products.filter((p) => num(p.reorderLevel) > 0 && num(p.stockQty) <= num(p.reorderLevel)),
      movements
    });
  } catch (e) { next(e); }
});

router.get('/finance-advanced', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseRange(req.query);
    const [invoices, grns, salesReturns, purchaseReturns, expenses, payments] = await loadReportBase(tenantId, from, to);
    const [bankAccounts, openInvoices, customers, suppliers] = await Promise.all([
      prisma.bankAccount.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' } }),
      prisma.invoice.findMany({ where: { tenantId, balance: { gt: 0 } }, include: { customer: true }, orderBy: { dueDate: 'asc' } }),
      prisma.customer.findMany({ where: { tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } }),
      prisma.supplier.findMany({ where: { tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } })
    ]);

    const expenseMap = new Map();
    expenses.forEach((expense) => {
      const key = expense.category || 'Uncategorized';
      const current = expenseMap.get(key) || { category: key, count: 0, amount: 0 };
      current.count += 1;
      current.amount = money(current.amount + num(expense.amount));
      expenseMap.set(key, current);
    });

    const aging = { current: 0, days1to30: 0, days31to60: 0, days60plus: 0 };
    const today = new Date();
    openInvoices.forEach((invoice) => {
      const dueDate = invoice.dueDate || invoice.issueDate;
      const days = Math.floor((today - new Date(dueDate)) / (1000 * 60 * 60 * 24));
      const amount = num(invoice.balance);
      if (days <= 0) aging.current += amount;
      else if (days <= 30) aging.days1to30 += amount;
      else if (days <= 60) aging.days31to60 += amount;
      else aging.days60plus += amount;
    });
    Object.keys(aging).forEach((key) => { aging[key] = money(aging[key]); });

    const salesTotal = money(invoices.reduce((s, i) => s + num(i.total), 0));
    const salesReturnTotal = money(salesReturns.reduce((s, r) => s + num(r.total), 0));
    const cogs = money(invoices.flatMap((i) => i.items).reduce((s, item) => s + num(item.qty) * num(item.costPrice), 0));
    const expenseTotal = money(expenses.reduce((s, e) => s + num(e.amount), 0));
    const grossProfit = money(salesTotal - salesReturnTotal - cogs);
    const netProfit = money(grossProfit - expenseTotal);
    const purchaseTotal = money(grns.reduce((s, g) => s + num(g.total), 0));
    const purchaseReturnTotal = money(purchaseReturns.reduce((s, r) => s + num(r.total), 0));

    res.json({
      from,
      to,
      profitLoss: {
        salesTotal,
        salesReturnTotal,
        netSales: money(salesTotal - salesReturnTotal),
        cogs,
        grossProfit,
        expenseTotal,
        netProfit,
        purchaseTotal,
        purchaseReturnTotal
      },
      tax: {
        salesTax: money(invoices.reduce((s, i) => s + num(i.tax), 0)),
        purchaseTax: money(grns.reduce((s, g) => s + num(g.tax), 0)),
        salesReturnTax: money(salesReturns.reduce((s, r) => s + num(r.tax), 0)),
        purchaseReturnTax: money(purchaseReturns.reduce((s, r) => s + num(r.tax), 0))
      },
      expenseByCategory: Array.from(expenseMap.values()).sort((a, b) => b.amount - a.amount),
      bankAccounts,
      receivableAging: aging,
      customerOutstanding: { total: money(customers.reduce((s, c) => s + num(c.balance), 0)), customers },
      supplierOutstanding: { total: money(suppliers.reduce((s, supplier) => s + num(supplier.balance), 0)), suppliers },
      payments
    });
  } catch (e) { next(e); }
});

// Backward compatible endpoints from earlier versions
router.get('/sales-summary', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const invoices = await prisma.invoice.findMany({
      where: { tenantId: req.user.tenantId, issueDate: { gte: from, lte: to } },
      include: { customer: true, items: true },
      orderBy: { issueDate: 'desc' }
    });
    const total = money(invoices.reduce((s, i) => s + num(i.total), 0));
    const paid = money(invoices.reduce((s, i) => s + num(i.paid), 0));
    const balance = money(invoices.reduce((s, i) => s + num(i.balance), 0));
    res.json({ from, to, count: invoices.length, total, paid, balance, invoices });
  } catch (e) { next(e); }
});

router.get('/stock', async (req, res, next) => {
  try {
    const products = await prisma.product.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, orderBy: { name: 'asc' } });
    const stockValue = money(products.reduce((s, p) => s + num(p.stockQty) * num(p.costPrice), 0));
    res.json({ count: products.length, stockValue, products });
  } catch (e) { next(e); }
});

router.get('/customer-outstanding', async (req, res, next) => {
  try {
    const customers = await prisma.customer.findMany({ where: { tenantId: req.user.tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } });
    const total = money(customers.reduce((s, c) => s + num(c.balance), 0));
    res.json({ total, customers });
  } catch (e) { next(e); }
});

router.get('/supplier-outstanding', async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { tenantId: req.user.tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } });
    const total = money(suppliers.reduce((s, supplier) => s + num(supplier.balance), 0));
    res.json({ total, suppliers });
  } catch (e) { next(e); }
});

router.get('/returns-summary', async (req, res, next) => {
  try {
    const { from, to } = parseRange(req.query);
    const [salesReturns, purchaseReturns] = await Promise.all([
      prisma.salesReturn.findMany({ where: { tenantId: req.user.tenantId, returnDate: { gte: from, lte: to } }, include: { customer: true, invoice: true }, orderBy: { returnDate: 'desc' } }),
      prisma.purchaseReturn.findMany({ where: { tenantId: req.user.tenantId, returnDate: { gte: from, lte: to } }, include: { supplier: true, grn: true }, orderBy: { returnDate: 'desc' } })
    ]);
    const salesReturnTotal = money(salesReturns.reduce((sum, item) => sum + num(item.total), 0));
    const salesRefundTotal = money(salesReturns.reduce((sum, item) => sum + num(item.refundAmount), 0));
    const purchaseReturnTotal = money(purchaseReturns.reduce((sum, item) => sum + num(item.total), 0));
    const supplierRefundTotal = money(purchaseReturns.reduce((sum, item) => sum + num(item.refundReceived), 0));
    res.json({ from, to, salesReturnTotal, salesRefundTotal, purchaseReturnTotal, supplierRefundTotal, salesReturns, purchaseReturns });
  } catch (e) { next(e); }
});

router.get('/export/:type', async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { from, to } = parseRange(req.query);
    const type = req.params.type;
    let rows = [];
    let columns = [];

    if (type === 'sales') {
      rows = await prisma.invoice.findMany({ where: { tenantId, issueDate: { gte: from, lte: to } }, include: { customer: true, branch: true }, orderBy: { issueDate: 'desc' } });
      columns = [
        { label: 'Invoice No', value: (r) => r.invoiceNo },
        { label: 'Date', value: (r) => dayKey(r.issueDate) },
        { label: 'Customer', value: (r) => r.customer?.name || 'Walk-in' },
        { label: 'Branch', value: (r) => r.branch?.name || '-' },
        { label: 'Status', value: (r) => r.status },
        { label: 'Subtotal', value: (r) => num(r.subtotal) },
        { label: 'Discount', value: (r) => num(r.discount) },
        { label: 'Tax', value: (r) => num(r.tax) },
        { label: 'Total', value: (r) => num(r.total) },
        { label: 'Paid', value: (r) => num(r.paid) },
        { label: 'Balance', value: (r) => num(r.balance) }
      ];
    } else if (type === 'sales-items') {
      const invoices = await prisma.invoice.findMany({ where: { tenantId, issueDate: { gte: from, lte: to } }, include: { customer: true, items: { include: { product: true } } }, orderBy: { issueDate: 'desc' } });
      rows = invoices.flatMap((invoice) => invoice.items.map((item) => ({ invoice, item })));
      columns = [
        { label: 'Invoice No', value: (r) => r.invoice.invoiceNo },
        { label: 'Date', value: (r) => dayKey(r.invoice.issueDate) },
        { label: 'Customer', value: (r) => r.invoice.customer?.name || 'Walk-in' },
        { label: 'Product', value: (r) => r.item.product?.name || r.item.description },
        { label: 'SKU', value: (r) => r.item.product?.sku || '-' },
        { label: 'Quantity', value: (r) => num(r.item.qty) },
        { label: 'Cost Price', value: (r) => num(r.item.costPrice) },
        { label: 'Unit Price', value: (r) => num(r.item.unitPrice) },
        { label: 'Line Total', value: (r) => num(r.item.total) },
        { label: 'Line Profit', value: (r) => money(num(r.item.total) - num(r.item.qty) * num(r.item.costPrice)) }
      ];
    } else if (type === 'stock') {
      rows = await prisma.product.findMany({ where: { tenantId, isActive: true }, include: { category: true, unit: true }, orderBy: { name: 'asc' } });
      columns = [
        { label: 'Name', value: (r) => r.name },
        { label: 'SKU', value: (r) => r.sku || '-' },
        { label: 'Barcode', value: (r) => r.barcode || '-' },
        { label: 'Category', value: (r) => r.category?.name || '-' },
        { label: 'Unit', value: (r) => r.unit?.symbol || '-' },
        { label: 'Stock Qty', value: (r) => num(r.stockQty) },
        { label: 'Reorder Level', value: (r) => num(r.reorderLevel) },
        { label: 'Cost Price', value: (r) => num(r.costPrice) },
        { label: 'Sale Price', value: (r) => num(r.salePrice) },
        { label: 'Stock Value', value: (r) => money(num(r.stockQty) * num(r.costPrice)) }
      ];
    } else if (type === 'warehouse-stock') {
      rows = await prisma.productStock.findMany({ where: { tenantId }, include: { product: true, warehouse: { include: { branch: true } } }, orderBy: { updatedAt: 'desc' } });
      columns = [
        { label: 'Warehouse', value: (r) => r.warehouse?.name || '-' },
        { label: 'Branch', value: (r) => r.warehouse?.branch?.name || '-' },
        { label: 'Product', value: (r) => r.product?.name || '-' },
        { label: 'SKU', value: (r) => r.product?.sku || '-' },
        { label: 'Quantity', value: (r) => num(r.quantity) },
        { label: 'Cost Price', value: (r) => num(r.product?.costPrice) },
        { label: 'Value', value: (r) => money(num(r.quantity) * num(r.product?.costPrice)) }
      ];
    } else if (type === 'customers-outstanding') {
      rows = await prisma.customer.findMany({ where: { tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } });
      columns = [
        { label: 'Customer', value: (r) => r.name },
        { label: 'Phone', value: (r) => r.phone || '-' },
        { label: 'Email', value: (r) => r.email || '-' },
        { label: 'Group', value: (r) => r.groupName || '-' },
        { label: 'Credit Limit', value: (r) => num(r.creditLimit) },
        { label: 'Outstanding', value: (r) => num(r.balance) }
      ];
    } else if (type === 'suppliers-outstanding') {
      rows = await prisma.supplier.findMany({ where: { tenantId, balance: { gt: 0 } }, orderBy: { balance: 'desc' } });
      columns = [
        { label: 'Supplier', value: (r) => r.name },
        { label: 'Phone', value: (r) => r.phone || '-' },
        { label: 'Email', value: (r) => r.email || '-' },
        { label: 'Outstanding', value: (r) => num(r.balance) }
      ];
    } else if (type === 'expenses') {
      rows = await prisma.expense.findMany({ where: { tenantId, spentAt: { gte: from, lte: to } }, include: { bankAccount: true }, orderBy: { spentAt: 'desc' } });
      columns = [
        { label: 'Expense No', value: (r) => r.expenseNo || '-' },
        { label: 'Date', value: (r) => dayKey(r.spentAt) },
        { label: 'Title', value: (r) => r.title },
        { label: 'Category', value: (r) => r.category || '-' },
        { label: 'Method', value: (r) => r.method },
        { label: 'Bank/Cash Account', value: (r) => r.bankAccount?.name || '-' },
        { label: 'Amount', value: (r) => num(r.amount) },
        { label: 'Reference', value: (r) => r.reference || '-' }
      ];
    } else if (type === 'payments') {
      rows = await prisma.payment.findMany({ where: { tenantId, paidAt: { gte: from, lte: to } }, include: { customer: true, supplier: true, invoice: true, grn: true, bankAccount: true }, orderBy: { paidAt: 'desc' } });
      columns = [
        { label: 'Receipt No', value: (r) => r.receiptNo || '-' },
        { label: 'Date', value: (r) => dayKey(r.paidAt) },
        { label: 'Direction', value: (r) => r.direction },
        { label: 'Method', value: (r) => r.method },
        { label: 'Customer', value: (r) => r.customer?.name || '-' },
        { label: 'Supplier', value: (r) => r.supplier?.name || '-' },
        { label: 'Invoice', value: (r) => r.invoice?.invoiceNo || '-' },
        { label: 'GRN', value: (r) => r.grn?.grnNo || '-' },
        { label: 'Bank/Cash Account', value: (r) => r.bankAccount?.name || '-' },
        { label: 'Amount', value: (r) => num(r.amount) },
        { label: 'Reference', value: (r) => r.reference || '-' }
      ];
    } else if (type === 'returns') {
      const [salesReturns, purchaseReturns] = await Promise.all([
        prisma.salesReturn.findMany({ where: { tenantId, returnDate: { gte: from, lte: to } }, include: { customer: true, invoice: true }, orderBy: { returnDate: 'desc' } }),
        prisma.purchaseReturn.findMany({ where: { tenantId, returnDate: { gte: from, lte: to } }, include: { supplier: true, grn: true }, orderBy: { returnDate: 'desc' } })
      ]);
      rows = [
        ...salesReturns.map((r) => ({ type: 'SALES_RETURN', date: r.returnDate, no: r.returnNo, party: r.customer?.name || 'Walk-in', ref: r.invoice?.invoiceNo || '-', total: r.total, refund: r.refundAmount })),
        ...purchaseReturns.map((r) => ({ type: 'PURCHASE_RETURN', date: r.returnDate, no: r.returnNo, party: r.supplier?.name || '-', ref: r.grn?.grnNo || '-', total: r.total, refund: r.refundReceived }))
      ];
      columns = [
        { label: 'Type', value: (r) => r.type },
        { label: 'Date', value: (r) => dayKey(r.date) },
        { label: 'Return No', value: (r) => r.no },
        { label: 'Party', value: (r) => r.party },
        { label: 'Reference', value: (r) => r.ref },
        { label: 'Total', value: (r) => num(r.total) },
        { label: 'Refund', value: (r) => num(r.refund) }
      ];
    } else if (type === 'profit-loss') {
      const [invoices, , salesReturns, , expenses] = await loadReportBase(tenantId, from, to);
      const sales = money(invoices.reduce((s, i) => s + num(i.total), 0));
      const returns = money(salesReturns.reduce((s, r) => s + num(r.total), 0));
      const cogs = money(invoices.flatMap((i) => i.items).reduce((s, item) => s + num(item.qty) * num(item.costPrice), 0));
      const expense = money(expenses.reduce((s, e) => s + num(e.amount), 0));
      rows = [
        { line: 'Sales', amount: sales },
        { line: 'Less: Sales Returns', amount: -returns },
        { line: 'Net Sales', amount: money(sales - returns) },
        { line: 'Less: Cost of Goods Sold', amount: -cogs },
        { line: 'Gross Profit', amount: money(sales - returns - cogs) },
        { line: 'Less: Expenses', amount: -expense },
        { line: 'Net Profit', amount: money(sales - returns - cogs - expense) }
      ];
      columns = [{ label: 'Line', value: (r) => r.line }, { label: 'Amount', value: (r) => r.amount }];
    } else if (type === 'tax') {
      const [invoices, grns, salesReturns, purchaseReturns] = await loadReportBase(tenantId, from, to);
      rows = [
        { line: 'Sales Tax', amount: money(invoices.reduce((s, i) => s + num(i.tax), 0)) },
        { line: 'Purchase Tax', amount: money(grns.reduce((s, g) => s + num(g.tax), 0)) },
        { line: 'Sales Return Tax', amount: money(salesReturns.reduce((s, r) => s + num(r.tax), 0)) },
        { line: 'Purchase Return Tax', amount: money(purchaseReturns.reduce((s, r) => s + num(r.tax), 0)) }
      ];
      rows.push({ line: 'Estimated Net Tax Payable', amount: money(rows[0].amount - rows[2].amount - rows[1].amount + rows[3].amount) });
      columns = [{ label: 'Line', value: (r) => r.line }, { label: 'Amount', value: (r) => r.amount }];
    } else {
      return res.status(400).json({ message: 'Unknown export type.' });
    }

    await audit(req, 'REPORT_EXPORTED', 'Report', type, null, { type, from, to, rows: rows.length });
    return sendCsv(res, `smartledger-${type}-${dayKey(new Date())}.csv`, rows, columns);
  } catch (e) { next(e); }
});

export default router;
