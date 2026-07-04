import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard, limitGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, getOrCreateDefaultWarehouse } from '../utils/stock.js';
import { postInvoiceJournal } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowServiceJobs', 'service jobs / appointments'));

const SERVICE_JOB_STATUSES = ['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'WAITING_PARTS', 'COMPLETED', 'INVOICED', 'CANCELLED'];
const APPOINTMENT_STATUSES = ['PENDING', 'CONFIRMED', 'ARRIVED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const LINE_TYPES = ['SERVICE', 'MATERIAL', 'CUSTOM'];

const catalogSchema = z.object({
  code: z.string().trim().min(1).max(40).optional().nullable(),
  category: z.string().trim().min(1).max(80).optional().default('General'),
  name: z.string().trim().min(2).max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  unitPrice: z.coerce.number().nonnegative().default(0),
  costPrice: z.coerce.number().nonnegative().default(0),
  estimatedMinutes: z.coerce.number().int().nonnegative().default(0),
  taxable: z.boolean().optional().default(true),
  isActive: z.boolean().optional().default(true)
});

const appointmentSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  appointmentAt: z.coerce.date(),
  endAt: z.coerce.date().optional().nullable(),
  status: z.enum(APPOINTMENT_STATUSES).optional().default('PENDING'),
  priority: z.enum(PRIORITIES).optional().default('NORMAL'),
  assignedToId: z.string().uuid().optional().nullable(),
  location: z.string().trim().max(220).optional().nullable(),
  notes: z.string().trim().max(1500).optional().nullable()
});

const jobLineSchema = z.object({
  lineType: z.enum(LINE_TYPES).default('SERVICE'),
  serviceItemId: z.string().uuid().optional().nullable(),
  productId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(240),
  qty: z.coerce.number().positive(),
  costPrice: z.coerce.number().nonnegative().default(0),
  unitPrice: z.coerce.number().nonnegative().default(0)
});

const jobSchema = z.object({
  customerId: z.string().uuid().optional().nullable(),
  appointmentId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(SERVICE_JOB_STATUSES).optional().default('OPEN'),
  priority: z.enum(PRIORITIES).optional().default('NORMAL'),
  scheduledAt: z.coerce.date().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  assignedToId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(jobLineSchema).optional().default([])
});

const statusSchema = z.object({
  status: z.enum(SERVICE_JOB_STATUSES),
  notes: z.string().trim().max(1200).optional().nullable(),
  consumeMaterials: z.boolean().optional().default(true)
});

const appointmentStatusSchema = z.object({
  status: z.enum(APPOINTMENT_STATUSES),
  notes: z.string().trim().max(1200).optional().nullable()
});

function dateRangeFromQuery(query, field = 'createdAt') {
  const where = {};
  if (query.from || query.to) {
    where[field] = {};
    if (query.from) where[field].gte = new Date(String(query.from));
    if (query.to) {
      const d = new Date(String(query.to));
      d.setHours(23, 59, 59, 999);
      where[field].lte = d;
    }
  }
  return where;
}

function normalizeCatalog(item) {
  return {
    ...item,
    unitPrice: money(item.unitPrice),
    costPrice: money(item.costPrice),
    grossMargin: money(Number(item.unitPrice || 0) - Number(item.costPrice || 0))
  };
}

function normalizeAppointment(row) {
  return {
    ...row,
    customerName: row.customer?.name || 'Walk-in / not selected',
    customerPhone: row.customer?.phone || '',
    appointmentDate: row.appointmentAt,
    isOverdue: row.appointmentAt ? new Date(row.appointmentAt).getTime() < Date.now() && !['COMPLETED', 'NO_SHOW', 'CANCELLED'].includes(row.status) : false
  };
}

function normalizeJob(row) {
  return {
    ...row,
    customerName: row.customer?.name || 'Walk-in / not selected',
    customerPhone: row.customer?.phone || '',
    lineCount: row.lines?.length || 0,
    laborCost: money(row.laborCost),
    materialCost: money(row.materialCost),
    totalCost: money(row.totalCost),
    chargeAmount: money(row.chargeAmount),
    profit: money(Number(row.chargeAmount || 0) - Number(row.totalCost || 0)),
    isOverdue: row.dueAt ? new Date(row.dueAt).getTime() < Date.now() && !['COMPLETED', 'INVOICED', 'CANCELLED'].includes(row.status) : false
  };
}

async function nextNo(tx, tenantId, model, prefix) {
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

async function resolveLines(tx, tenantId, lines) {
  const resolved = [];
  for (const line of lines || []) {
    let service = null;
    let product = null;
    if (line.serviceItemId) {
      service = await tx.serviceCatalogItem.findFirst({ where: { id: line.serviceItemId, tenantId, isActive: true } });
      if (!service) throw Object.assign(new Error('Service item not found'), { status: 404 });
    }
    if (line.productId) {
      product = await tx.product.findFirst({ where: { id: line.productId, tenantId, isActive: true } });
      if (!product) throw Object.assign(new Error('Product/material not found'), { status: 404 });
    }
    const costPrice = money(line.costPrice || product?.costPrice || service?.costPrice || 0);
    const unitPrice = money(line.unitPrice || product?.salePrice || service?.unitPrice || 0);
    const total = money(Number(line.qty || 0) * unitPrice);
    resolved.push({
      lineType: line.lineType || (line.productId ? 'MATERIAL' : 'SERVICE'),
      serviceItemId: line.serviceItemId || null,
      productId: line.productId || null,
      description: line.description || product?.name || service?.name,
      qty: line.qty,
      costPrice,
      unitPrice,
      total
    });
  }
  return resolved;
}

function calculateJobTotals(lines) {
  let laborCost = 0;
  let materialCost = 0;
  let chargeAmount = 0;
  for (const line of lines) {
    const cost = Number(line.costPrice || 0) * Number(line.qty || 0);
    if (line.lineType === 'MATERIAL') materialCost += cost;
    else laborCost += cost;
    chargeAmount += Number(line.total || 0);
  }
  return { laborCost: money(laborCost), materialCost: money(materialCost), totalCost: money(laborCost + materialCost), chargeAmount: money(chargeAmount) };
}

async function consumeJobMaterials(tx, tenantId, job, userId) {
  if (job.materialsPosted) return job;
  const materialLines = job.lines?.filter((line) => line.lineType === 'MATERIAL' && line.productId) || [];
  if (!materialLines.length) {
    return tx.serviceJob.update({ where: { id: job.id }, data: { materialsPosted: true } });
  }
  const warehouse = job.warehouseId
    ? await assertWarehouseBelongsToTenant(tx, { tenantId, warehouseId: job.warehouseId })
    : await getOrCreateDefaultWarehouse(tx, tenantId);

  for (const line of materialLines) {
    const stock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId, productId: line.productId, warehouseId: warehouse.id } } });
    if (!stock || Number(stock.quantity || 0) < Number(line.qty || 0)) {
      throw Object.assign(new Error(`Not enough stock for material: ${line.description}`), { status: 400 });
    }
  }

  for (const line of materialLines) {
    await tx.product.update({ where: { id: line.productId }, data: { stockQty: { decrement: line.qty } } });
    await addWarehouseStock(tx, { tenantId, productId: line.productId, warehouseId: warehouse.id, quantity: -Number(line.qty) });
    await tx.stockMovement.create({ data: { tenantId, productId: line.productId, warehouseId: warehouse.id, type: 'ADJUSTMENT', quantity: -Number(line.qty), unitCost: line.costPrice, refType: 'ServiceJob', refId: job.id, notes: `Material used for ${job.jobNo}` } });
  }

  await tx.serviceJobEvent.create({ data: { tenantId, jobId: job.id, action: 'MATERIALS_CONSUMED', status: job.status, notes: `Materials consumed from ${warehouse.name}`, createdById: userId } });
  return tx.serviceJob.update({ where: { id: job.id }, data: { materialsPosted: true } });
}

router.get('/summary', requirePermission('service:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [openJobs, inProgress, completed, overdueJobs, todaysAppointments, pendingAppointments, rows] = await Promise.all([
      prisma.serviceJob.count({ where: { tenantId, status: { in: ['OPEN', 'SCHEDULED'] } } }),
      prisma.serviceJob.count({ where: { tenantId, status: { in: ['IN_PROGRESS', 'WAITING_PARTS'] } } }),
      prisma.serviceJob.count({ where: { tenantId, status: { in: ['COMPLETED', 'INVOICED'] } } }),
      prisma.serviceJob.count({ where: { tenantId, dueAt: { lt: new Date() }, status: { notIn: ['COMPLETED', 'INVOICED', 'CANCELLED'] } } }),
      prisma.serviceAppointment.count({ where: { tenantId, appointmentAt: { gte: today, lt: tomorrow }, status: { notIn: ['COMPLETED', 'NO_SHOW', 'CANCELLED'] } } }),
      prisma.serviceAppointment.count({ where: { tenantId, status: { in: ['PENDING', 'CONFIRMED'] } } }),
      prisma.serviceJob.findMany({ where: { tenantId }, include: { customer: true, lines: true }, orderBy: { createdAt: 'desc' }, take: 100 })
    ]);
    const revenue = rows.reduce((sum, row) => sum + Number(row.chargeAmount || 0), 0);
    const profit = rows.reduce((sum, row) => sum + Number(row.chargeAmount || 0) - Number(row.totalCost || 0), 0);
    res.json({ openJobs, inProgress, completed, overdueJobs, todaysAppointments, pendingAppointments, revenue: money(revenue), profit: money(profit), recentJobs: rows.slice(0, 8).map(normalizeJob) });
  } catch (e) { next(e); }
});

router.get('/catalog', requirePermission('service:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.active === 'true') where.isActive = true;
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }, { category: { contains: q, mode: 'insensitive' } }];
    const items = await prisma.serviceCatalogItem.findMany({ where, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 300 });
    res.json(items.map(normalizeCatalog));
  } catch (e) { next(e); }
});

router.post('/catalog', requirePermission('service:create'), async (req, res, next) => {
  try {
    const data = catalogSchema.parse(req.body);
    const item = await prisma.$transaction(async (tx) => {
      const code = data.code || await nextNo(tx, req.user.tenantId, 'serviceCatalogItem', 'SVC');
      return tx.serviceCatalogItem.create({ data: { tenantId: req.user.tenantId, ...data, code, category: data.category || 'General' } });
    });
    await audit(req, 'CREATE', 'ServiceCatalogItem', item.id, null, item);
    res.status(201).json(normalizeCatalog(item));
  } catch (e) { next(e); }
});

router.patch('/catalog/:id', requirePermission('service:update'), async (req, res, next) => {
  try {
    const before = await prisma.serviceCatalogItem.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Service item not found' });
    const data = catalogSchema.partial().parse(req.body);
    const item = await prisma.serviceCatalogItem.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'ServiceCatalogItem', item.id, before, item);
    res.json(normalizeCatalog(item));
  } catch (e) { next(e); }
});

router.get('/appointments', requirePermission('service:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId, ...dateRangeFromQuery(req.query, 'appointmentAt') };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    const rows = await prisma.serviceAppointment.findMany({ where, include: { customer: true, jobs: { select: { id: true, jobNo: true, status: true } } }, orderBy: { appointmentAt: 'asc' }, take: 300 });
    res.json(rows.map(normalizeAppointment));
  } catch (e) { next(e); }
});

router.post('/appointments', requirePermission('service:create'), async (req, res, next) => {
  try {
    const data = appointmentSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await verifyCustomer(tx, req.user.tenantId, data.customerId);
      const appointmentNo = await nextNo(tx, req.user.tenantId, 'serviceAppointment', 'APT');
      const appointment = await tx.serviceAppointment.create({ data: { tenantId: req.user.tenantId, appointmentNo, createdById: req.user.id, ...data } });
      if (['HIGH', 'URGENT'].includes(appointment.priority)) {
        await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'WARNING', title: 'High priority appointment', message: `${appointment.appointmentNo}: ${appointment.title}`, priority: appointment.priority, entityType: 'ServiceAppointment', entityId: appointment.id, actionUrl: '/service-jobs' });
      }
      return appointment;
    });
    await audit(req, 'CREATE', 'ServiceAppointment', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.patch('/appointments/:id/status', requirePermission('service:update'), async (req, res, next) => {
  try {
    const data = appointmentStatusSchema.parse(req.body);
    const before = await prisma.serviceAppointment.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Appointment not found' });
    const appointment = await prisma.serviceAppointment.update({ where: { id: before.id }, data: { status: data.status, notes: [before.notes, data.notes].filter(Boolean).join('\n') || null } });
    await audit(req, 'STATUS', 'ServiceAppointment', appointment.id, before, appointment);
    res.json(appointment);
  } catch (e) { next(e); }
});

router.post('/appointments/:id/job', requirePermission('service:create'), async (req, res, next) => {
  try {
    const appointment = await prisma.serviceAppointment.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!appointment) return res.status(404).json({ message: 'Appointment not found' });
    const payload = jobSchema.parse({
      ...req.body,
      appointmentId: appointment.id,
      customerId: req.body.customerId || appointment.customerId,
      title: req.body.title || appointment.title,
      scheduledAt: req.body.scheduledAt || appointment.appointmentAt,
      assignedToId: req.body.assignedToId || appointment.assignedToId,
      priority: req.body.priority || appointment.priority,
      status: req.body.status || 'SCHEDULED',
      notes: req.body.notes || appointment.notes
    });
    req.body = payload;
    return createJobHandler(req, res, next);
  } catch (e) { next(e); }
});

router.get('/jobs', requirePermission('service:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.priority) where.priority = String(req.query.priority).toUpperCase();
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    if (req.query.overdue === 'true') where.dueAt = { lt: new Date() };
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ jobNo: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }, { customer: { name: { contains: q, mode: 'insensitive' } } }];
    const rows = await prisma.serviceJob.findMany({ where, include: { customer: true, appointment: true, lines: { include: { serviceItem: true, product: true } }, events: { orderBy: { eventDate: 'desc' }, take: 3 } }, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(rows.map(normalizeJob));
  } catch (e) { next(e); }
});

router.get('/jobs/:id', requirePermission('service:read'), async (req, res, next) => {
  try {
    const job = await prisma.serviceJob.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { customer: true, appointment: true, lines: { include: { serviceItem: true, product: true } }, events: { orderBy: { eventDate: 'desc' }, take: 50 } } });
    if (!job) return res.status(404).json({ message: 'Service job not found' });
    res.json(normalizeJob(job));
  } catch (e) { next(e); }
});

async function createJobHandler(req, res, next) {
  try {
    const data = jobSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      await verifyCustomer(tx, req.user.tenantId, data.customerId);
      if (data.appointmentId) {
        const appointment = await tx.serviceAppointment.findFirst({ where: { id: data.appointmentId, tenantId: req.user.tenantId } });
        if (!appointment) throw Object.assign(new Error('Appointment not found'), { status: 404 });
      }
      if (data.warehouseId) await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId });
      const lines = await resolveLines(tx, req.user.tenantId, data.lines || []);
      const totals = calculateJobTotals(lines);
      const jobNo = await nextNo(tx, req.user.tenantId, 'serviceJob', 'JOB');
      const job = await tx.serviceJob.create({
        data: {
          tenantId: req.user.tenantId,
          customerId: data.customerId || null,
          appointmentId: data.appointmentId || null,
          warehouseId: data.warehouseId || null,
          jobNo,
          title: data.title,
          description: data.description || null,
          status: data.status,
          priority: data.priority,
          scheduledAt: data.scheduledAt || null,
          dueAt: data.dueAt || null,
          assignedToId: data.assignedToId || null,
          notes: data.notes || null,
          createdById: req.user.id,
          ...totals,
          lines: { create: lines },
          events: { create: { tenantId: req.user.tenantId, action: 'CREATED', status: data.status, notes: data.notes || 'Service job created', createdById: req.user.id } }
        },
        include: { customer: true, appointment: true, lines: { include: { serviceItem: true, product: true } }, events: true }
      });
      if (data.appointmentId) await tx.serviceAppointment.update({ where: { id: data.appointmentId }, data: { status: 'CONFIRMED' } });
      return job;
    });
    await audit(req, 'CREATE', 'ServiceJob', result.id, null, result);
    res.status(201).json(normalizeJob(result));
  } catch (e) { next(e); }
}

router.post('/jobs', requirePermission('service:create'), createJobHandler);

router.patch('/jobs/:id/status', requirePermission('service:update'), async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.serviceJob.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { lines: true } });
      if (!before) throw Object.assign(new Error('Service job not found'), { status: 404 });
      let updateData = { status: data.status };
      if (data.status === 'IN_PROGRESS' && !before.startedAt) updateData.startedAt = new Date();
      if (data.status === 'COMPLETED') updateData.completedAt = new Date();
      let job = await tx.serviceJob.update({ where: { id: before.id }, data: updateData, include: { customer: true, appointment: true, lines: { include: { serviceItem: true, product: true } }, events: true } });
      if (data.status === 'COMPLETED' && data.consumeMaterials) {
        await consumeJobMaterials(tx, req.user.tenantId, { ...job, lines: before.lines }, req.user.id);
        job = await tx.serviceJob.findUnique({ where: { id: before.id }, include: { customer: true, appointment: true, lines: { include: { serviceItem: true, product: true } }, events: true } });
      }
      await tx.serviceJobEvent.create({ data: { tenantId: req.user.tenantId, jobId: before.id, action: 'STATUS_CHANGED', status: data.status, notes: data.notes || `Status changed to ${data.status}`, createdById: req.user.id } });
      if (data.status === 'COMPLETED') {
        await createNotification({ tenantId: req.user.tenantId, type: 'SUCCESS', title: 'Service job completed', message: `${job.jobNo} completed. You can create invoice from the job.`, priority: 'NORMAL', entityType: 'ServiceJob', entityId: job.id, actionUrl: '/service-jobs' });
      }
      return { before, job };
    });
    await audit(req, 'STATUS', 'ServiceJob', result.job.id, result.before, result.job);
    res.json(normalizeJob(result.job));
  } catch (e) { next(e); }
});

router.post('/jobs/:id/events', requirePermission('service:update'), async (req, res, next) => {
  try {
    const data = z.object({ action: z.string().trim().min(2).max(80).default('NOTE'), notes: z.string().trim().min(1).max(1500), status: z.string().optional().nullable() }).parse(req.body);
    const job = await prisma.serviceJob.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!job) return res.status(404).json({ message: 'Service job not found' });
    const event = await prisma.serviceJobEvent.create({ data: { tenantId: req.user.tenantId, jobId: job.id, action: data.action, status: data.status || job.status, notes: data.notes, createdById: req.user.id } });
    await audit(req, 'EVENT', 'ServiceJob', job.id, null, event);
    res.status(201).json(event);
  } catch (e) { next(e); }
});

router.post('/jobs/:id/invoice', requirePermission('service:invoice'), limitGuard('invoices'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const job = await tx.serviceJob.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { customer: true, lines: true } });
      if (!job) throw Object.assign(new Error('Service job not found'), { status: 404 });
      if (job.invoiceId) {
        const existing = await tx.invoice.findFirst({ where: { id: job.invoiceId, tenantId: req.user.tenantId }, include: { items: true, customer: true } });
        if (existing) return { job, invoice: existing, existing: true };
      }
      const invoiceNo = await nextInvoiceNo(tx, req.user.tenantId);
      const subtotal = money(job.lines.reduce((sum, line) => sum + Number(line.total || 0), 0));
      const total = subtotal;
      const paid = 0;
      const balance = total;
      const invoice = await tx.invoice.create({
        data: {
          tenantId: req.user.tenantId,
          customerId: job.customerId || null,
          createdById: req.user.id,
          invoiceNo,
          issueDate: new Date(),
          subtotal,
          discount: 0,
          tax: 0,
          total,
          paid,
          balance,
          status: balance > 0 ? 'UNPAID' : 'PAID',
          notes: `Generated from service job ${job.jobNo}`,
          items: { create: job.lines.map((line) => ({ productId: null, description: line.description, qty: line.qty, costPrice: 0, unitPrice: line.unitPrice, discount: 0, total: line.total })) }
        },
        include: { items: true, customer: true }
      });
      if (job.customerId && balance > 0) await tx.customer.update({ where: { id: job.customerId }, data: { balance: { increment: balance } } });
      await postInvoiceJournal(tx, { tenantId: req.user.tenantId, invoice, createdById: req.user.id });
      const updatedJob = await tx.serviceJob.update({ where: { id: job.id }, data: { status: 'INVOICED', invoiceId: invoice.id }, include: { customer: true, lines: true, events: true } });
      await tx.serviceJobEvent.create({ data: { tenantId: req.user.tenantId, jobId: job.id, action: 'INVOICE_CREATED', status: 'INVOICED', notes: `Invoice ${invoiceNo} created`, createdById: req.user.id } });
      return { job: updatedJob, invoice, existing: false };
    });
    await audit(req, 'INVOICE', 'ServiceJob', result.job.id, null, { invoiceId: result.invoice.id });
    res.status(result.existing ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('service:read'), async (req, res, next) => {
  try {
    const now = new Date();
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const [overdueJobs, todayAppointments] = await Promise.all([
      prisma.serviceJob.findMany({ where: { tenantId: req.user.tenantId, dueAt: { lt: now }, status: { notIn: ['COMPLETED', 'INVOICED', 'CANCELLED'] } }, include: { customer: true }, take: 50 }),
      prisma.serviceAppointment.findMany({ where: { tenantId: req.user.tenantId, appointmentAt: { gte: now, lte: tomorrow }, status: { in: ['PENDING', 'CONFIRMED'] } }, include: { customer: true }, take: 50 })
    ]);
    let created = 0;
    for (const job of overdueJobs) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'DANGER', title: 'Overdue service job', message: `${job.jobNo} is overdue: ${job.title}`, priority: 'HIGH', entityType: 'ServiceJob', entityId: job.id, actionUrl: '/service-jobs' });
      created += 1;
    }
    for (const appt of todayAppointments) {
      await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'SALES_STAFF'], type: 'INFO', title: 'Upcoming service appointment', message: `${appt.appointmentNo} today: ${appt.title}`, priority: 'NORMAL', entityType: 'ServiceAppointment', entityId: appt.id, actionUrl: '/service-jobs' });
      created += 1;
    }
    res.json({ created, overdueJobs: overdueJobs.length, todayAppointments: todayAppointments.length });
  } catch (e) { next(e); }
});

export default router;
