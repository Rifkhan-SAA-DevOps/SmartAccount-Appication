import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowDelivery', 'delivery / dispatch management'));

const DELIVERY_STATUSES = ['PENDING', 'PACKED', 'DISPATCHED', 'DELIVERED', 'RETURNED', 'CANCELLED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const itemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(240),
  qty: z.coerce.number().positive(),
  deliveredQty: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(500).optional().nullable()
});

const deliverySchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  invoiceId: z.string().uuid().optional().nullable(),
  salesOrderId: z.string().uuid().optional().nullable(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  status: z.enum(DELIVERY_STATUSES).optional().default('PENDING'),
  priority: z.enum(PRIORITIES).optional().default('NORMAL'),
  scheduledDate: z.coerce.date().optional().nullable(),
  contactName: z.string().trim().max(160).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
  deliveryFee: z.coerce.number().nonnegative().optional().default(0),
  codAmount: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(1500).optional().nullable(),
  items: z.array(itemSchema).min(1)
});

const statusSchema = z.object({
  status: z.enum(DELIVERY_STATUSES),
  notes: z.string().trim().max(1000).optional().nullable(),
  proofName: z.string().trim().max(160).optional().nullable(),
  proofNote: z.string().trim().max(1000).optional().nullable(),
  gpsLink: z.string().trim().max(500).optional().nullable(),
  collectedAmount: z.coerce.number().nonnegative().optional().default(0)
});

function includeDelivery() {
  return {
    customer: true,
    invoice: true,
    salesOrder: true,
    assignedEmployee: true,
    items: { include: { product: true } },
    events: { orderBy: { eventDate: 'desc' }, take: 5 }
  };
}

function normalize(row) {
  return {
    ...row,
    customerName: row.customer?.name || row.contactName || 'Walk-in / not selected',
    employeeName: row.assignedEmployee?.name || 'Unassigned',
    invoiceNo: row.invoice?.invoiceNo || '-',
    salesOrderNo: row.salesOrder?.orderNo || '-',
    itemCount: row.items?.length || 0,
    totalQty: (row.items || []).reduce((sum, i) => sum + Number(i.qty || 0), 0),
    deliveryFee: money(row.deliveryFee),
    codAmount: money(row.codAmount),
    collectedAmount: money(row.collectedAmount),
    isOverdue: row.scheduledDate ? new Date(row.scheduledDate).getTime() < Date.now() && !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(row.status) : false
  };
}

async function nextDeliveryNo(tx, tenantId) {
  const count = await tx.deliveryOrder.count({ where: { tenantId } });
  return `DEL${String(count + 1001).padStart(4, '0')}`;
}

async function verifyRefs(tx, tenantId, data) {
  if (data.customerId) {
    const row = await tx.customer.findFirst({ where: { id: data.customerId, tenantId, isActive: true } });
    if (!row) throw Object.assign(new Error('Customer not found'), { status: 404 });
  }
  if (data.invoiceId) {
    const row = await tx.invoice.findFirst({ where: { id: data.invoiceId, tenantId } });
    if (!row) throw Object.assign(new Error('Invoice not found'), { status: 404 });
  }
  if (data.salesOrderId) {
    const row = await tx.salesOrder.findFirst({ where: { id: data.salesOrderId, tenantId } });
    if (!row) throw Object.assign(new Error('Sales order not found'), { status: 404 });
  }
  if (data.assignedEmployeeId) {
    const row = await tx.employee.findFirst({ where: { id: data.assignedEmployeeId, tenantId, status: 'ACTIVE' } });
    if (!row) throw Object.assign(new Error('Employee not found'), { status: 404 });
  }
}

async function createDeliveryFromData(tx, req, data) {
  await verifyRefs(tx, req.user.tenantId, data);
  const deliveryNo = await nextDeliveryNo(tx, req.user.tenantId);
  const delivery = await tx.deliveryOrder.create({
    data: {
      tenantId: req.user.tenantId,
      deliveryNo,
      createdById: req.user.id,
      customerId: data.customerId || null,
      invoiceId: data.invoiceId || null,
      salesOrderId: data.salesOrderId || null,
      assignedEmployeeId: data.assignedEmployeeId || null,
      status: data.status || 'PENDING',
      priority: data.priority || 'NORMAL',
      scheduledDate: data.scheduledDate || null,
      contactName: data.contactName || null,
      phone: data.phone || null,
      address: data.address || null,
      deliveryFee: money(data.deliveryFee || 0),
      codAmount: money(data.codAmount || 0),
      notes: data.notes || null,
      items: { create: data.items.map((item) => ({ productId: item.productId || null, description: item.description, qty: item.qty, deliveredQty: item.deliveredQty || 0, notes: item.notes || null })) },
      events: { create: { tenantId: req.user.tenantId, action: 'CREATED', status: data.status || 'PENDING', notes: data.notes || 'Delivery order created', createdById: req.user.id } }
    },
    include: includeDelivery()
  });
  return delivery;
}

router.get('/summary', requirePermission('delivery:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
    const [pending, packed, dispatched, delivered, returned, overdue, todayDeliveries, rows] = await Promise.all([
      prisma.deliveryOrder.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.deliveryOrder.count({ where: { tenantId, status: 'PACKED' } }),
      prisma.deliveryOrder.count({ where: { tenantId, status: 'DISPATCHED' } }),
      prisma.deliveryOrder.count({ where: { tenantId, status: 'DELIVERED' } }),
      prisma.deliveryOrder.count({ where: { tenantId, status: 'RETURNED' } }),
      prisma.deliveryOrder.count({ where: { tenantId, scheduledDate: { lt: new Date() }, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } } }),
      prisma.deliveryOrder.count({ where: { tenantId, scheduledDate: { gte: today, lt: tomorrow }, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } } }),
      prisma.deliveryOrder.findMany({ where: { tenantId }, include: includeDelivery(), orderBy: { createdAt: 'desc' }, take: 100 })
    ]);
    const codPending = rows.filter((r) => !['DELIVERED', 'RETURNED', 'CANCELLED'].includes(r.status)).reduce((sum, r) => sum + Number(r.codAmount || 0), 0);
    const collected = rows.reduce((sum, r) => sum + Number(r.collectedAmount || 0), 0);
    res.json({ pending, packed, dispatched, delivered, returned, overdue, todayDeliveries, codPending: money(codPending), collected: money(collected), recent: rows.slice(0, 8).map(normalize) });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('delivery:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    if (req.query.assignedEmployeeId) where.assignedEmployeeId = String(req.query.assignedEmployeeId);
    if (req.query.overdue === 'true') where.scheduledDate = { lt: new Date() };
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { deliveryNo: { contains: q, mode: 'insensitive' } },
      { contactName: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { address: { contains: q, mode: 'insensitive' } },
      { customer: { name: { contains: q, mode: 'insensitive' } } },
      { invoice: { invoiceNo: { contains: q, mode: 'insensitive' } } }
    ];
    const rows = await prisma.deliveryOrder.findMany({ where, include: includeDelivery(), orderBy: [{ scheduledDate: 'asc' }, { createdAt: 'desc' }], take: 300 });
    res.json(rows.map(normalize));
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('delivery:read'), async (req, res, next) => {
  try {
    const row = await prisma.deliveryOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { ...includeDelivery(), events: { orderBy: { eventDate: 'desc' }, take: 50 } } });
    if (!row) return res.status(404).json({ message: 'Delivery order not found' });
    res.json(normalize(row));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('delivery:create'), async (req, res, next) => {
  try {
    const data = deliverySchema.parse(req.body);
    const delivery = await prisma.$transaction((tx) => createDeliveryFromData(tx, req, data));
    if (['HIGH', 'URGENT'].includes(delivery.priority)) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'WARNING', title: 'High priority delivery', message: `${delivery.deliveryNo}: ${delivery.customerName || delivery.contactName || 'Delivery'} is ${delivery.priority}.`, priority: delivery.priority, entityType: 'DeliveryOrder', entityId: delivery.id, actionUrl: '/deliveries' });
    }
    await audit(req, 'CREATE', 'DeliveryOrder', delivery.id, null, delivery);
    res.status(201).json(normalize(delivery));
  } catch (e) { next(e); }
});

router.post('/from-invoice/:invoiceId', requirePermission('delivery:create'), async (req, res, next) => {
  try {
    const delivery = await prisma.$transaction(async (tx) => {
      const invoice = await tx.invoice.findFirst({ where: { id: req.params.invoiceId, tenantId: req.user.tenantId }, include: { customer: true, items: { include: { product: true } } } });
      if (!invoice) throw Object.assign(new Error('Invoice not found'), { status: 404 });
      return createDeliveryFromData(tx, req, {
        invoiceId: invoice.id,
        customerId: invoice.customerId,
        contactName: invoice.customer?.name || null,
        phone: invoice.customer?.phone || null,
        address: invoice.customer?.address || null,
        codAmount: Number(invoice.balance || 0),
        deliveryFee: Number(req.body?.deliveryFee || 0),
        scheduledDate: req.body?.scheduledDate ? new Date(req.body.scheduledDate) : null,
        priority: req.body?.priority || 'NORMAL',
        notes: `Created from invoice ${invoice.invoiceNo}`,
        items: invoice.items.map((item) => ({ productId: item.productId || null, description: item.description || item.product?.name || 'Item', qty: Number(item.qty || 0), deliveredQty: 0 }))
      });
    });
    await audit(req, 'CREATE_FROM_INVOICE', 'DeliveryOrder', delivery.id, null, delivery);
    res.status(201).json(normalize(delivery));
  } catch (e) { next(e); }
});

router.patch('/:id/status', requirePermission('delivery:update'), async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.deliveryOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeDelivery() });
      if (!before) throw Object.assign(new Error('Delivery order not found'), { status: 404 });
      const update = { status: data.status };
      if (data.status === 'DISPATCHED' && !before.dispatchedAt) update.dispatchedAt = new Date();
      if (data.status === 'DELIVERED') { update.deliveredAt = new Date(); update.collectedAmount = money(data.collectedAmount || before.collectedAmount || 0); update.proofName = data.proofName || before.proofName || null; update.proofNote = data.proofNote || before.proofNote || null; update.gpsLink = data.gpsLink || before.gpsLink || null; }
      if (data.status === 'RETURNED') update.returnedAt = new Date();
      const row = await tx.deliveryOrder.update({ where: { id: before.id }, data: update, include: includeDelivery() });
      if (data.status === 'DELIVERED') {
        await tx.deliveryOrderItem.updateMany({ where: { deliveryId: before.id }, data: { deliveredQty: { set: 0 } } });
        for (const item of before.items) await tx.deliveryOrderItem.update({ where: { id: item.id }, data: { deliveredQty: item.qty } });
      }
      await tx.deliveryEvent.create({ data: { tenantId: req.user.tenantId, deliveryId: before.id, action: 'STATUS_CHANGED', status: data.status, notes: data.notes || `Status changed to ${data.status}`, createdById: req.user.id } });
      return { before, row };
    });
    if (data.status === 'DELIVERED') {
      await createNotification({ tenantId: req.user.tenantId, type: 'SUCCESS', title: 'Delivery completed', message: `${result.row.deliveryNo} delivered successfully.`, priority: 'NORMAL', entityType: 'DeliveryOrder', entityId: result.row.id, actionUrl: '/deliveries' });
    }
    if (data.status === 'RETURNED') {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'WARNING', title: 'Delivery returned', message: `${result.row.deliveryNo} was returned.`, priority: 'HIGH', entityType: 'DeliveryOrder', entityId: result.row.id, actionUrl: '/deliveries' });
    }
    await audit(req, 'STATUS', 'DeliveryOrder', result.row.id, result.before, result.row);
    res.json(normalize(result.row));
  } catch (e) { next(e); }
});

router.post('/:id/events', requirePermission('delivery:update'), async (req, res, next) => {
  try {
    const data = z.object({ action: z.string().trim().min(2).max(80).default('NOTE'), notes: z.string().trim().min(1).max(1200), status: z.string().optional().nullable() }).parse(req.body);
    const delivery = await prisma.deliveryOrder.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!delivery) return res.status(404).json({ message: 'Delivery order not found' });
    const event = await prisma.deliveryEvent.create({ data: { tenantId: req.user.tenantId, deliveryId: delivery.id, action: data.action, status: data.status || delivery.status, notes: data.notes, createdById: req.user.id } });
    await audit(req, 'EVENT', 'DeliveryOrder', delivery.id, null, event);
    res.status(201).json(event);
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('delivery:read'), async (req, res, next) => {
  try {
    const rows = await prisma.deliveryOrder.findMany({ where: { tenantId: req.user.tenantId, scheduledDate: { lt: new Date() }, status: { notIn: ['DELIVERED', 'RETURNED', 'CANCELLED'] } }, include: includeDelivery(), take: 80 });
    let created = 0;
    for (const row of rows) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'DANGER', title: 'Overdue delivery', message: `${row.deliveryNo} is overdue for ${row.customer?.name || row.contactName || 'customer'}.`, priority: 'HIGH', entityType: 'DeliveryOrder', entityId: row.id, actionUrl: '/deliveries' });
      created += 1;
    }
    res.json({ created, overdue: rows.length });
  } catch (e) { next(e); }
});

export default router;
