import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard, limitGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { postInvoiceJournal } from '../utils/accountingPost.js';
import { buildQuotationHtml } from '../utils/quotationHtml.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowQuotations', 'quotation / estimate / sales order'));

const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED', 'CANCELLED'];
const ORDER_STATUSES = ['DRAFT', 'CONFIRMED', 'PARTIAL', 'DELIVERED', 'INVOICED', 'CANCELLED'];

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1),
  qty: z.coerce.number().positive(),
  unitPrice: z.coerce.number().nonnegative(),
  discount: z.coerce.number().nonnegative().optional().default(0)
});

const quotationSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  crmLeadId: z.string().uuid().optional().nullable(),
  title: z.string().trim().max(180).optional().nullable(),
  status: z.enum(QUOTATION_STATUSES).optional().default('DRAFT'),
  issueDate: z.coerce.date().optional(),
  validUntil: z.coerce.date().optional().nullable(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  tax: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  terms: z.string().trim().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1)
});

const quotationStatusSchema = z.object({
  status: z.enum(QUOTATION_STATUSES),
  notes: z.string().trim().max(1000).optional().nullable()
});

const salesOrderSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  crmLeadId: z.string().uuid().optional().nullable(),
  quotationId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  status: z.enum(ORDER_STATUSES).optional().default('DRAFT'),
  orderDate: z.coerce.date().optional(),
  expectedDate: z.coerce.date().optional().nullable(),
  discount: z.coerce.number().nonnegative().optional().default(0),
  tax: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(2000).optional().nullable(),
  terms: z.string().trim().max(2000).optional().nullable(),
  items: z.array(itemSchema).min(1)
});

const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  notes: z.string().trim().max(1000).optional().nullable()
});

function includeQuotation() {
  return { customer: true, crmLead: true, items: { include: { product: true } } };
}

function includeOrder() {
  return { customer: true, crmLead: true, quotation: true, items: { include: { product: true } } };
}

function normalizeDoc(row) {
  return {
    ...row,
    customerName: row.customer?.name || 'Walk-in / not selected',
    customerPhone: row.customer?.phone || '',
    leadTitle: row.crmLead?.title || '',
    subtotal: money(row.subtotal),
    discount: money(row.discount),
    tax: money(row.tax),
    total: money(row.total),
    itemCount: row.items?.length || 0,
    isExpired: row.validUntil ? new Date(row.validUntil).getTime() < Date.now() && !['ACCEPTED', 'CONVERTED', 'REJECTED', 'CANCELLED'].includes(row.status) : false
  };
}

async function nextNo(tx, tenantId, model, field, prefix) {
  const count = await tx[model].count({ where: { tenantId } });
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function nextInvoiceNo(tx, tenantId) {
  const [count, settings] = await Promise.all([
    tx.invoice.count({ where: { tenantId } }),
    tx.tenantSetting.findUnique({ where: { tenantId } }).catch(() => null)
  ]);
  const prefix = settings?.invoicePrefix || 'INV';
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function verifyCustomer(tx, tenantId, customerId) {
  if (!customerId) return null;
  const customer = await tx.customer.findFirst({ where: { id: customerId, tenantId, isActive: true } });
  if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
  return customer;
}

async function verifyLead(tx, tenantId, crmLeadId) {
  if (!crmLeadId) return null;
  const lead = await tx.crmLead.findFirst({ where: { id: crmLeadId, tenantId } });
  if (!lead) throw Object.assign(new Error('CRM lead not found'), { status: 404 });
  return lead;
}

async function resolveItems(tx, tenantId, items) {
  const resolved = [];
  for (const item of items) {
    let product = null;
    if (item.productId) {
      product = await tx.product.findFirst({ where: { id: item.productId, tenantId, isActive: true } });
      if (!product) throw Object.assign(new Error(`Product not found: ${item.description}`), { status: 404 });
    }
    const costPrice = money(product?.costPrice || 0);
    const total = money(Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0));
    resolved.push({ productId: item.productId || null, description: item.description, qty: item.qty, costPrice, unitPrice: item.unitPrice, discount: item.discount || 0, total });
  }
  return resolved;
}

function totals(items, discount = 0, tax = 0) {
  const subtotal = money(items.reduce((sum, item) => sum + Number(item.total || 0), 0));
  const docDiscount = money(discount || 0);
  const taxable = money(Math.max(subtotal - docDiscount, 0));
  const docTax = money(tax || 0);
  const total = money(taxable + docTax);
  return { subtotal, discount: docDiscount, tax: docTax, total };
}

async function createSalesOrder(tx, req, data) {
  await verifyCustomer(tx, req.user.tenantId, data.customerId);
  await verifyLead(tx, req.user.tenantId, data.crmLeadId);
  if (data.warehouseId) await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId });
  const items = await resolveItems(tx, req.user.tenantId, data.items);
  const orderTotals = totals(items, data.discount, data.tax);
  return tx.salesOrder.create({
    data: {
      tenantId: req.user.tenantId,
      customerId: data.customerId || null,
      crmLeadId: data.crmLeadId || null,
      quotationId: data.quotationId || null,
      warehouseId: data.warehouseId || null,
      orderNo: await nextNo(tx, req.user.tenantId, 'salesOrder', 'orderNo', 'SO'),
      status: data.status || 'DRAFT',
      orderDate: data.orderDate || new Date(),
      expectedDate: data.expectedDate || null,
      ...orderTotals,
      notes: data.notes || null,
      terms: data.terms || null,
      confirmedAt: data.status === 'CONFIRMED' ? new Date() : null,
      createdById: req.user.id,
      items: { create: items }
    },
    include: includeOrder()
  });
}

router.get('/summary', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const [draftQuotes, sentQuotes, acceptedQuotes, expiredQuotes, openOrders, invoicedOrders, quotes, orders] = await Promise.all([
      prisma.quotation.count({ where: { tenantId, status: 'DRAFT' } }),
      prisma.quotation.count({ where: { tenantId, status: 'SENT' } }),
      prisma.quotation.count({ where: { tenantId, status: { in: ['ACCEPTED', 'CONVERTED'] } } }),
      prisma.quotation.count({ where: { tenantId, validUntil: { lt: now }, status: { notIn: ['ACCEPTED', 'CONVERTED', 'REJECTED', 'CANCELLED'] } } }),
      prisma.salesOrder.count({ where: { tenantId, status: { in: ['DRAFT', 'CONFIRMED', 'PARTIAL', 'DELIVERED'] } } }),
      prisma.salesOrder.count({ where: { tenantId, status: 'INVOICED' } }),
      prisma.quotation.findMany({ where: { tenantId }, include: includeQuotation(), orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.salesOrder.findMany({ where: { tenantId }, include: includeOrder(), orderBy: { createdAt: 'desc' }, take: 50 })
    ]);
    const quoteValue = quotes.reduce((sum, q) => sum + Number(q.total || 0), 0);
    const orderValue = orders.filter((o) => o.status !== 'CANCELLED').reduce((sum, o) => sum + Number(o.total || 0), 0);
    res.json({ draftQuotes, sentQuotes, acceptedQuotes, expiredQuotes, openOrders, invoicedOrders, quoteValue: money(quoteValue), orderValue: money(orderValue), recentQuotes: quotes.slice(0, 6).map(normalizeDoc), recentOrders: orders.slice(0, 6).map(normalizeDoc) });
  } catch (e) { next(e); }
});

router.get('/sales-orders', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ orderNo: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }, { crmLead: { title: { contains: q, mode: 'insensitive' } } }];
    const orders = await prisma.salesOrder.findMany({ where, include: includeOrder(), orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(orders.map(normalizeDoc));
  } catch (e) { next(e); }
});

router.post('/sales-orders', requirePermission('quotation:create'), async (req, res, next) => {
  try {
    const data = salesOrderSchema.parse(req.body);
    const order = await prisma.$transaction((tx) => createSalesOrder(tx, req, data));
    await audit(req, 'CREATE', 'SalesOrder', order.id, null, order);
    res.status(201).json(normalizeDoc(order));
  } catch (e) { next(e); }
});

router.patch('/sales-orders/:id/status', requirePermission('quotation:update'), async (req, res, next) => {
  try {
    const data = orderStatusSchema.parse(req.body);
    const before = await prisma.salesOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeOrder() });
    if (!before) return res.status(404).json({ message: 'Sales order not found' });
    const update = { status: data.status, notes: data.notes ? [before.notes, data.notes].filter(Boolean).join('\n') : before.notes };
    if (data.status === 'CONFIRMED') update.confirmedAt = new Date();
    if (data.status === 'CANCELLED') update.cancelledAt = new Date();
    const order = await prisma.salesOrder.update({ where: { id: before.id }, data: update, include: includeOrder() });
    await audit(req, 'STATUS', 'SalesOrder', order.id, before, order);
    res.json(normalizeDoc(order));
  } catch (e) { next(e); }
});

router.post('/sales-orders/:id/invoice', requirePermission('quotation:convert'), limitGuard('invoices'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { ...includeOrder(), items: { include: { product: true } } } });
      if (!order) throw Object.assign(new Error('Sales order not found'), { status: 404 });
      if (order.invoiceId) {
        const existing = await tx.invoice.findFirst({ where: { id: order.invoiceId, tenantId: req.user.tenantId }, include: { items: true, customer: true } });
        if (existing) return { order, invoice: existing, existing: true };
      }
      if (order.status === 'CANCELLED') throw Object.assign(new Error('Cancelled sales orders cannot be invoiced'), { status: 400 });
      const warehouse = order.warehouseId ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: order.warehouseId }) : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);
      const productMap = new Map();
      for (const item of order.items) {
        if (item.productId) {
          const product = await tx.product.findFirst({ where: { id: item.productId, tenantId: req.user.tenantId } });
          if (!product) throw Object.assign(new Error(`Product not found: ${item.description}`), { status: 404 });
          const stock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id } } });
          if (Number(stock?.quantity || 0) < Number(item.qty || 0)) throw Object.assign(new Error(`Not enough stock for ${product.name} in ${warehouse.name}`), { status: 400 });
          productMap.set(item.productId, product);
        }
      }
      const invoiceNo = await nextInvoiceNo(tx, req.user.tenantId);
      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.user.tenantId,
          customerId: order.customerId || null,
          createdById: req.user.id,
          invoiceNo,
          issueDate: new Date(),
          subtotal: order.subtotal,
          discount: order.discount,
          tax: order.tax,
          total: order.total,
          paid: 0,
          balance: order.total,
          status: 'UNPAID',
          notes: `Generated from sales order ${order.orderNo}`,
          items: { create: order.items.map((item) => ({ productId: item.productId || null, description: item.description, qty: item.qty, costPrice: item.productId ? productMap.get(item.productId)?.costPrice || 0 : 0, unitPrice: item.unitPrice, discount: item.discount, total: item.total })) }
        },
        include: { items: true, customer: true }
      });
      for (const item of order.items) {
        if (item.productId) {
          const product = productMap.get(item.productId);
          await tx.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: item.qty } } });
          await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, quantity: -Number(item.qty) });
          await tx.stockMovement.create({ data: { tenantId: req.user.tenantId, productId: item.productId, warehouseId: warehouse.id, type: 'SALE', quantity: -Number(item.qty), unitCost: product.costPrice, refType: 'SalesOrderInvoice', refId: invoice.id, notes: `Invoiced from ${order.orderNo}` } });
        }
      }
      if (order.customerId && Number(order.total || 0) > 0) await tx.customer.update({ where: { id: order.customerId }, data: { balance: { increment: order.total } } });
      await postInvoiceJournal(tx, { tenantId: req.user.tenantId, invoice, createdById: req.user.id });
      const updated = await tx.salesOrder.update({ where: { id: order.id }, data: { status: 'INVOICED', invoiceId: invoice.id, invoicedAt: new Date() }, include: includeOrder() });
      return { order: updated, invoice, existing: false };
    });
    await audit(req, 'INVOICE', 'SalesOrder', result.order.id, null, { invoiceId: result.invoice.id });
    res.status(result.existing ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

router.get('/sales-orders/:id', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const order = await prisma.salesOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeOrder() });
    if (!order) return res.status(404).json({ message: 'Sales order not found' });
    res.json(normalizeDoc(order));
  } catch (e) { next(e); }
});

router.get('/sales-orders/:id/print', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const order = await prisma.salesOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeOrder() });
    if (!order) return res.status(404).send('<h1>Sales order not found</h1>');
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    let settings = await prisma.tenantSetting.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!settings) settings = await prisma.tenantSetting.create({ data: { tenantId: req.user.tenantId } });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildQuotationHtml({ document: order, tenant, settings, type: 'sales-order' }));
  } catch (e) { next(e); }
});

router.get('/', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    if (req.query.crmLeadId) where.crmLeadId = String(req.query.crmLeadId);
    if (req.query.expired === 'true') where.validUntil = { lt: new Date() };
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ quoteNo: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }, { crmLead: { title: { contains: q, mode: 'insensitive' } } }];
    const quotes = await prisma.quotation.findMany({ where, include: includeQuotation(), orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(quotes.map(normalizeDoc));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('quotation:create'), async (req, res, next) => {
  try {
    const data = quotationSchema.parse(req.body);
    const quote = await prisma.$transaction(async (tx) => {
      await verifyCustomer(tx, req.user.tenantId, data.customerId);
      await verifyLead(tx, req.user.tenantId, data.crmLeadId);
      const items = await resolveItems(tx, req.user.tenantId, data.items);
      const quoteTotals = totals(items, data.discount, data.tax);
      const created = await tx.quotation.create({
        data: {
          tenantId: req.user.tenantId,
          customerId: data.customerId || null,
          crmLeadId: data.crmLeadId || null,
          quoteNo: await nextNo(tx, req.user.tenantId, 'quotation', 'quoteNo', 'QT'),
          title: data.title || null,
          status: data.status || 'DRAFT',
          issueDate: data.issueDate || new Date(),
          validUntil: data.validUntil || null,
          ...quoteTotals,
          notes: data.notes || null,
          terms: data.terms || null,
          createdById: req.user.id,
          items: { create: items }
        },
        include: includeQuotation()
      });
      if (data.crmLeadId) await tx.crmLead.update({ where: { id: data.crmLeadId }, data: { status: 'QUOTED' } }).catch(() => null);
      return created;
    });
    await audit(req, 'CREATE', 'Quotation', quote.id, null, quote);
    res.status(201).json(normalizeDoc(quote));
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const quote = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeQuotation() });
    if (!quote) return res.status(404).json({ message: 'Quotation not found' });
    res.json(normalizeDoc(quote));
  } catch (e) { next(e); }
});

router.get('/:id/print', requirePermission('quotation:read'), async (req, res, next) => {
  try {
    const quote = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeQuotation() });
    if (!quote) return res.status(404).send('<h1>Quotation not found</h1>');
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    let settings = await prisma.tenantSetting.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!settings) settings = await prisma.tenantSetting.create({ data: { tenantId: req.user.tenantId } });
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(buildQuotationHtml({ document: quote, tenant, settings, type: 'quotation' }));
  } catch (e) { next(e); }
});

router.patch('/:id/status', requirePermission('quotation:update'), async (req, res, next) => {
  try {
    const data = quotationStatusSchema.parse(req.body);
    const before = await prisma.quotation.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeQuotation() });
    if (!before) return res.status(404).json({ message: 'Quotation not found' });
    const update = { status: data.status, notes: data.notes ? [before.notes, data.notes].filter(Boolean).join('\n') : before.notes };
    if (data.status === 'ACCEPTED') update.acceptedAt = new Date();
    if (data.status === 'REJECTED') update.rejectedAt = new Date();
    const quote = await prisma.quotation.update({ where: { id: before.id }, data: update, include: includeQuotation() });
    await audit(req, 'STATUS', 'Quotation', quote.id, before, quote);
    res.json(normalizeDoc(quote));
  } catch (e) { next(e); }
});

router.post('/:id/sales-order', requirePermission('quotation:convert'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const quote = await tx.quotation.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeQuotation() });
      if (!quote) throw Object.assign(new Error('Quotation not found'), { status: 404 });
      if (quote.salesOrderId) {
        const existing = await tx.salesOrder.findFirst({ where: { id: quote.salesOrderId, tenantId: req.user.tenantId }, include: includeOrder() });
        if (existing) return { quote, order: existing, existing: true };
      }
      if (['REJECTED', 'CANCELLED'].includes(quote.status)) throw Object.assign(new Error('Rejected/cancelled quotations cannot be converted'), { status: 400 });
      const order = await createSalesOrder(tx, req, { customerId: quote.customerId, crmLeadId: quote.crmLeadId, quotationId: quote.id, warehouseId: req.body?.warehouseId || null, status: 'CONFIRMED', orderDate: new Date(), expectedDate: req.body?.expectedDate ? new Date(req.body.expectedDate) : null, discount: Number(quote.discount || 0), tax: Number(quote.tax || 0), notes: `Converted from quotation ${quote.quoteNo}`, terms: quote.terms, items: quote.items.map((item) => ({ productId: item.productId, description: item.description, qty: Number(item.qty), unitPrice: Number(item.unitPrice), discount: Number(item.discount || 0) })) });
      const updatedQuote = await tx.quotation.update({ where: { id: quote.id }, data: { status: 'CONVERTED', acceptedAt: quote.acceptedAt || new Date(), salesOrderId: order.id }, include: includeQuotation() });
      if (quote.crmLeadId) await tx.crmLead.update({ where: { id: quote.crmLeadId }, data: { status: 'QUOTED' } }).catch(() => null);
      return { quote: updatedQuote, order, existing: false };
    });
    await createNotification({ tenantId: req.user.tenantId, type: 'SUCCESS', title: 'Quotation converted', message: `${result.quote.quoteNo} converted to ${result.order.orderNo}`, priority: 'NORMAL', entityType: 'SalesOrder', entityId: result.order.id, actionUrl: '/quotations' }).catch(() => null);
    await audit(req, 'CONVERT', 'Quotation', result.quote.id, null, { salesOrderId: result.order.id });
    res.status(result.existing ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

export default router;
