import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);

const SERIAL_STATUSES = ['IN_STOCK', 'SOLD', 'REPAIR', 'RETURNED', 'DAMAGED', 'LOST', 'EXPIRED'];
const CLAIM_STATUSES = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'REJECTED', 'REPLACED'];

const serialCreateSchema = z.object({
  productId: z.string().uuid(),
  warehouseId: z.string().uuid().optional().nullable(),
  supplierId: z.string().uuid().optional().nullable(),
  serialNumbers: z.union([z.array(z.string()), z.string()]),
  imei1: z.string().optional().nullable(),
  imei2: z.string().optional().nullable(),
  batchNo: z.string().optional().nullable(),
  warrantyStartAt: z.coerce.date().optional().nullable(),
  warrantyEndAt: z.coerce.date().optional().nullable(),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional().nullable(),
  purchaseRefType: z.string().optional().nullable(),
  purchaseRefId: z.string().optional().nullable(),
  notes: z.string().optional().nullable()
});

const serialUpdateSchema = z.object({
  serialNo: z.string().min(2).optional(),
  imei1: z.string().optional().nullable(),
  imei2: z.string().optional().nullable(),
  batchNo: z.string().optional().nullable(),
  warrantyStartAt: z.coerce.date().optional().nullable(),
  warrantyEndAt: z.coerce.date().optional().nullable(),
  notes: z.string().optional().nullable()
});

const sellSchema = z.object({
  customerId: z.string().uuid(),
  saleRefType: z.string().optional().nullable(),
  saleRefId: z.string().optional().nullable(),
  warrantyStartAt: z.coerce.date().optional().nullable(),
  warrantyEndAt: z.coerce.date().optional().nullable(),
  warrantyMonths: z.coerce.number().int().min(0).max(120).optional().nullable(),
  notes: z.string().optional().nullable()
});

const transferSchema = z.object({
  warehouseId: z.string().uuid(),
  notes: z.string().optional().nullable()
});

const statusSchema = z.object({
  status: z.enum(SERIAL_STATUSES),
  notes: z.string().optional().nullable()
});

const claimCreateSchema = z.object({
  serialId: z.string().uuid(),
  customerId: z.string().uuid().optional().nullable(),
  issueDescription: z.string().min(3),
  serviceCost: z.coerce.number().default(0),
  receivedAt: z.coerce.date().optional(),
  resolution: z.string().optional().nullable()
});

const claimStatusSchema = z.object({
  status: z.enum(CLAIM_STATUSES),
  resolution: z.string().optional().nullable(),
  serviceCost: z.coerce.number().optional(),
  completedAt: z.coerce.date().optional().nullable()
});

function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + Number(months || 0));
  return d;
}

function parseSerialNumbers(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,;]+/);
  return [...new Set(raw.map((v) => String(v || '').trim()).filter(Boolean))];
}

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function daysFromNow(days) {
  const d = todayStart();
  d.setDate(d.getDate() + days);
  d.setHours(23, 59, 59, 999);
  return d;
}

async function nextClaimNo(tx, tenantId) {
  const count = await tx.warrantyClaim.count({ where: { tenantId } });
  return `WAR-${String(count + 1).padStart(5, '0')}`;
}

async function createSerialEvent(tx, serial, action, data = {}, userId) {
  return tx.productSerialEvent.create({
    data: {
      tenantId: serial.tenantId,
      serialId: serial.id,
      action,
      status: data.status || serial.status,
      fromWarehouseId: data.fromWarehouseId || null,
      toWarehouseId: data.toWarehouseId || null,
      customerId: data.customerId || null,
      supplierId: data.supplierId || null,
      refType: data.refType || null,
      refId: data.refId || null,
      notes: data.notes || null,
      eventDate: data.eventDate || new Date(),
      createdById: userId || null
    }
  });
}

function includeSerial() {
  return {
    product: true,
    warehouse: true,
    customer: true,
    supplier: true,
    claims: { orderBy: { receivedAt: 'desc' }, take: 3 },
    events: { orderBy: { eventDate: 'desc' }, take: 5 }
  };
}

function normalizeSerial(row) {
  return {
    ...row,
    productName: row.product?.name || '-',
    warehouseName: row.warehouse?.name || '-',
    customerName: row.customer?.name || '-',
    supplierName: row.supplier?.name || '-',
    activeClaimCount: row.claims?.filter((c) => ['OPEN', 'IN_PROGRESS'].includes(c.status)).length || 0
  };
}

router.get('/summary', requirePermission('warranty:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = todayStart();
    const expiringEnd = daysFromNow(30);
    const [total, inStock, sold, repair, expiredWarranty, expiringWarranty, openClaims, recentClaims, expiringRows] = await Promise.all([
      prisma.productSerial.count({ where: { tenantId } }),
      prisma.productSerial.count({ where: { tenantId, status: 'IN_STOCK' } }),
      prisma.productSerial.count({ where: { tenantId, status: 'SOLD' } }),
      prisma.productSerial.count({ where: { tenantId, status: 'REPAIR' } }),
      prisma.productSerial.count({ where: { tenantId, warrantyEndAt: { lt: now } } }),
      prisma.productSerial.count({ where: { tenantId, warrantyEndAt: { gte: now, lte: expiringEnd } } }),
      prisma.warrantyClaim.count({ where: { tenantId, status: { in: ['OPEN', 'IN_PROGRESS'] } } }),
      prisma.warrantyClaim.findMany({
        where: { tenantId },
        include: { product: true, customer: true, serial: true },
        orderBy: { receivedAt: 'desc' },
        take: 6
      }),
      prisma.productSerial.findMany({
        where: { tenantId, warrantyEndAt: { gte: now, lte: expiringEnd } },
        include: { product: true, customer: true, warehouse: true },
        orderBy: { warrantyEndAt: 'asc' },
        take: 8
      })
    ]);
    res.json({ total, inStock, sold, repair, expiredWarranty, expiringWarranty, openClaims, recentClaims, expiringRows: expiringRows.map(normalizeSerial) });
  } catch (e) { next(e); }
});

router.get('/serials', requirePermission('warranty:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.productId) where.productId = String(req.query.productId);
    if (req.query.customerId) where.customerId = String(req.query.customerId);
    if (req.query.warehouseId) where.warehouseId = String(req.query.warehouseId);
    if (req.query.expiring === '30') where.warrantyEndAt = { gte: todayStart(), lte: daysFromNow(30) };
    if (req.query.expiring === 'expired') where.warrantyEndAt = { lt: todayStart() };

    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { serialNo: { contains: q, mode: 'insensitive' } },
        { imei1: { contains: q, mode: 'insensitive' } },
        { imei2: { contains: q, mode: 'insensitive' } },
        { batchNo: { contains: q, mode: 'insensitive' } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }

    const serials = await prisma.productSerial.findMany({ where, include: includeSerial(), orderBy: { createdAt: 'desc' }, take: 500 });
    res.json(serials.map(normalizeSerial));
  } catch (e) { next(e); }
});

router.get('/serials/:id', requirePermission('warranty:read'), async (req, res, next) => {
  try {
    const serial = await prisma.productSerial.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { product: true, warehouse: true, customer: true, supplier: true, claims: { orderBy: { receivedAt: 'desc' } }, events: { orderBy: { eventDate: 'desc' } } }
    });
    if (!serial) return res.status(404).json({ message: 'Serial/IMEI item not found' });
    res.json(normalizeSerial(serial));
  } catch (e) { next(e); }
});

router.post('/serials', requirePermission('warranty:create'), async (req, res, next) => {
  try {
    const data = serialCreateSchema.parse(req.body);
    const serialNumbers = parseSerialNumbers(data.serialNumbers);
    if (!serialNumbers.length) return res.status(400).json({ message: 'At least one serial/IMEI number is required' });

    const created = await prisma.$transaction(async (tx) => {
      const product = await tx.product.findFirst({ where: { id: data.productId, tenantId: req.user.tenantId, isActive: true } });
      if (!product) throw Object.assign(new Error('Product not found'), { status: 404 });
      if (data.warehouseId) {
        const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, tenantId: req.user.tenantId, isActive: true } });
        if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
      }
      if (data.supplierId) {
        const supplier = await tx.supplier.findFirst({ where: { id: data.supplierId, tenantId: req.user.tenantId, isActive: true } });
        if (!supplier) throw Object.assign(new Error('Supplier not found'), { status: 404 });
      }
      await tx.product.update({ where: { id: product.id }, data: { trackSerial: true } });
      const warrantyStartAt = data.warrantyStartAt || new Date();
      const warrantyEndAt = data.warrantyEndAt || (data.warrantyMonths ? addMonths(warrantyStartAt, data.warrantyMonths) : null);
      const rows = [];
      for (const serialNo of serialNumbers) {
        const row = await tx.productSerial.create({
          data: {
            tenantId: req.user.tenantId,
            productId: product.id,
            warehouseId: data.warehouseId || null,
            supplierId: data.supplierId || null,
            serialNo,
            imei1: data.imei1 || null,
            imei2: data.imei2 || null,
            batchNo: data.batchNo || null,
            warrantyStartAt,
            warrantyEndAt,
            purchaseRefType: data.purchaseRefType || null,
            purchaseRefId: data.purchaseRefId || null,
            status: 'IN_STOCK',
            notes: data.notes || null,
            createdById: req.user.id
          }
        });
        await createSerialEvent(tx, row, 'REGISTERED', { supplierId: data.supplierId, toWarehouseId: data.warehouseId, notes: 'Serial/IMEI registered' }, req.user.id);
        rows.push(row);
      }
      return rows;
    });

    await audit(req, 'CREATE', 'ProductSerial', null, null, { count: created.length, serialNumbers });
    res.status(201).json({ created: created.length, serials: created });
  } catch (e) { next(e); }
});

router.put('/serials/:id', requirePermission('warranty:update'), async (req, res, next) => {
  try {
    const before = await prisma.productSerial.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Serial/IMEI item not found' });
    const data = serialUpdateSchema.parse(req.body);
    const serial = await prisma.productSerial.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'ProductSerial', serial.id, before, serial);
    res.json(serial);
  } catch (e) { next(e); }
});

router.post('/serials/:id/sell', requirePermission('warranty:update'), async (req, res, next) => {
  try {
    const data = sellSchema.parse(req.body);
    const sold = await prisma.$transaction(async (tx) => {
      const serial = await tx.productSerial.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!serial) throw Object.assign(new Error('Serial/IMEI item not found'), { status: 404 });
      const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId: req.user.tenantId, isActive: true } });
      if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      const warrantyStartAt = data.warrantyStartAt || new Date();
      const warrantyEndAt = data.warrantyEndAt || (data.warrantyMonths ? addMonths(warrantyStartAt, data.warrantyMonths) : serial.warrantyEndAt);
      const updated = await tx.productSerial.update({
        where: { id: serial.id },
        data: {
          customerId: customer.id,
          status: 'SOLD',
          saleRefType: data.saleRefType || 'ManualSale',
          saleRefId: data.saleRefId || null,
          warrantyStartAt,
          warrantyEndAt,
          notes: data.notes ?? serial.notes
        },
        include: includeSerial()
      });
      await createSerialEvent(tx, updated, 'SOLD', { customerId: customer.id, refType: data.saleRefType || 'ManualSale', refId: data.saleRefId, notes: data.notes || 'Serial/IMEI sold to customer' }, req.user.id);
      return updated;
    });
    await audit(req, 'SELL', 'ProductSerial', sold.id, null, sold);
    res.json(normalizeSerial(sold));
  } catch (e) { next(e); }
});

router.post('/serials/:id/transfer', requirePermission('warranty:update'), async (req, res, next) => {
  try {
    const data = transferSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      const serial = await tx.productSerial.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!serial) throw Object.assign(new Error('Serial/IMEI item not found'), { status: 404 });
      const warehouse = await tx.warehouse.findFirst({ where: { id: data.warehouseId, tenantId: req.user.tenantId, isActive: true } });
      if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
      const nextSerial = await tx.productSerial.update({ where: { id: serial.id }, data: { warehouseId: warehouse.id }, include: includeSerial() });
      await createSerialEvent(tx, nextSerial, 'TRANSFERRED', { fromWarehouseId: serial.warehouseId, toWarehouseId: warehouse.id, notes: data.notes || `Transferred to ${warehouse.name}` }, req.user.id);
      return nextSerial;
    });
    await audit(req, 'TRANSFER', 'ProductSerial', updated.id, null, updated);
    res.json(normalizeSerial(updated));
  } catch (e) { next(e); }
});

router.patch('/serials/:id/status', requirePermission('warranty:update'), async (req, res, next) => {
  try {
    const data = statusSchema.parse(req.body);
    const updated = await prisma.$transaction(async (tx) => {
      const serial = await tx.productSerial.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!serial) throw Object.assign(new Error('Serial/IMEI item not found'), { status: 404 });
      const nextSerial = await tx.productSerial.update({ where: { id: serial.id }, data: { status: data.status, notes: data.notes ?? serial.notes }, include: includeSerial() });
      await createSerialEvent(tx, nextSerial, 'STATUS_CHANGED', { status: data.status, notes: data.notes || `Status changed to ${data.status}` }, req.user.id);
      return nextSerial;
    });
    await audit(req, 'STATUS_CHANGE', 'ProductSerial', updated.id, null, updated);
    res.json(normalizeSerial(updated));
  } catch (e) { next(e); }
});

router.get('/claims', requirePermission('warranty:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { claimNo: { contains: q, mode: 'insensitive' } },
        { issueDescription: { contains: q, mode: 'insensitive' } },
        { serial: { serialNo: { contains: q, mode: 'insensitive' } } },
        { product: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }
    const claims = await prisma.warrantyClaim.findMany({ where, include: { serial: true, product: true, customer: true }, orderBy: { receivedAt: 'desc' }, take: 300 });
    res.json(claims.map((c) => ({ ...c, serviceCost: Number(c.serviceCost || 0), serialNo: c.serial?.serialNo, productName: c.product?.name, customerName: c.customer?.name || '-' })));
  } catch (e) { next(e); }
});

router.post('/claims', requirePermission('warranty:create'), async (req, res, next) => {
  try {
    const data = claimCreateSchema.parse(req.body);
    const claim = await prisma.$transaction(async (tx) => {
      const serial = await tx.productSerial.findFirst({ where: { id: data.serialId, tenantId: req.user.tenantId }, include: { product: true } });
      if (!serial) throw Object.assign(new Error('Serial/IMEI item not found'), { status: 404 });
      if (data.customerId) {
        const customer = await tx.customer.findFirst({ where: { id: data.customerId, tenantId: req.user.tenantId, isActive: true } });
        if (!customer) throw Object.assign(new Error('Customer not found'), { status: 404 });
      }
      const claimNo = await nextClaimNo(tx, req.user.tenantId);
      const created = await tx.warrantyClaim.create({
        data: {
          tenantId: req.user.tenantId,
          claimNo,
          serialId: serial.id,
          productId: serial.productId,
          customerId: data.customerId || serial.customerId || null,
          issueDescription: data.issueDescription,
          resolution: data.resolution || null,
          serviceCost: money(data.serviceCost),
          receivedAt: data.receivedAt || new Date(),
          status: 'OPEN',
          createdById: req.user.id
        },
        include: { serial: true, product: true, customer: true }
      });
      await tx.productSerial.update({ where: { id: serial.id }, data: { status: 'REPAIR' } });
      await createSerialEvent(tx, serial, 'WARRANTY_CLAIM_OPENED', { status: 'REPAIR', customerId: created.customerId, refType: 'WarrantyClaim', refId: created.id, notes: data.issueDescription }, req.user.id);
      return created;
    });

    await notifyTenantRoles({
      tenantId: req.user.tenantId,
      roles: ['OWNER', 'ADMIN', 'INVENTORY_MANAGER'],
      title: 'Warranty claim opened',
      message: `${claim.claimNo} • ${claim.product?.name || ''} • ${claim.serial?.serialNo || ''}`,
      type: 'WARRANTY',
      priority: 'NORMAL',
      entityType: 'WarrantyClaim',
      entityId: claim.id,
      actionUrl: '/warranty'
    }).catch(() => null);
    await audit(req, 'CREATE', 'WarrantyClaim', claim.id, null, claim);
    res.status(201).json(claim);
  } catch (e) { next(e); }
});

router.patch('/claims/:id/status', requirePermission('warranty:update'), async (req, res, next) => {
  try {
    const data = claimStatusSchema.parse(req.body);
    const claim = await prisma.$transaction(async (tx) => {
      const before = await tx.warrantyClaim.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { serial: true, product: true, customer: true } });
      if (!before) throw Object.assign(new Error('Warranty claim not found'), { status: 404 });
      const finalStatus = ['COMPLETED', 'REJECTED', 'REPLACED'].includes(data.status);
      const updated = await tx.warrantyClaim.update({
        where: { id: before.id },
        data: {
          status: data.status,
          resolution: data.resolution ?? before.resolution,
          serviceCost: data.serviceCost !== undefined ? money(data.serviceCost) : before.serviceCost,
          completedAt: finalStatus ? (data.completedAt || new Date()) : data.completedAt ?? before.completedAt
        },
        include: { serial: true, product: true, customer: true }
      });
      if (finalStatus) {
        const serialStatus = before.serial.customerId ? 'SOLD' : 'IN_STOCK';
        await tx.productSerial.update({ where: { id: before.serialId }, data: { status: data.status === 'REPLACED' ? 'RETURNED' : serialStatus } });
      }
      await createSerialEvent(tx, before.serial, 'WARRANTY_CLAIM_STATUS', { status: data.status, refType: 'WarrantyClaim', refId: before.id, notes: data.resolution || `Claim marked ${data.status}` }, req.user.id);
      return updated;
    });

    if (['COMPLETED', 'REJECTED', 'REPLACED'].includes(claim.status) && claim.customerId) {
      await createNotification({
        tenantId: req.user.tenantId,
        title: 'Warranty claim updated',
        message: `${claim.claimNo} marked as ${claim.status.toLowerCase()}`,
        type: 'WARRANTY',
        priority: 'NORMAL',
        entityType: 'WarrantyClaim',
        entityId: claim.id,
        actionUrl: '/warranty'
      }).catch(() => null);
    }
    await audit(req, 'UPDATE_STATUS', 'WarrantyClaim', claim.id, null, claim);
    res.json(claim);
  } catch (e) { next(e); }
});

router.post('/alerts/warranty-expiry', requirePermission('warranty:create'), async (req, res, next) => {
  try {
    const expiring = await prisma.productSerial.findMany({
      where: { tenantId: req.user.tenantId, status: 'SOLD', warrantyEndAt: { gte: todayStart(), lte: daysFromNow(30) } },
      include: { product: true, customer: true },
      orderBy: { warrantyEndAt: 'asc' },
      take: 100
    });

    let created = 0;
    for (const serial of expiring) {
      await createNotification({
        tenantId: req.user.tenantId,
        title: 'Warranty expiring soon',
        message: `${serial.product?.name || 'Product'} ${serial.serialNo} warranty ends on ${serial.warrantyEndAt?.toISOString().slice(0, 10)}`,
        type: 'WARRANTY',
        priority: 'NORMAL',
        entityType: 'ProductSerial',
        entityId: serial.id,
        actionUrl: '/warranty'
      }).catch(() => null);
      created += 1;
    }
    await audit(req, 'CREATE_ALERTS', 'WarrantyExpiry', null, null, { total: expiring.length, created });
    res.json({ total: expiring.length, created });
  } catch (e) { next(e); }
});

export default router;
