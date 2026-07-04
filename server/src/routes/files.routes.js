import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';
import {
  buildPublicUrl,
  buildS3Key,
  createPresignedPutUrl,
  deleteS3Object,
  getUploadConfig,
  validateUploadInput
} from '../utils/s3.js';

const router = Router();
router.use(authRequired);

const documentPurposes = ['LOGO', 'INVOICE_ATTACHMENT', 'EXPENSE_RECEIPT', 'DOCUMENT', 'PRODUCT_IMAGE'];

const presignSchema = z.object({
  folder: z.string().default('documents'),
  filename: z.string().min(1),
  contentType: z.string().min(3),
  sizeBytes: z.coerce.number().positive(),
  purpose: z.enum(documentPurposes).default('DOCUMENT'),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable()
});

const commitSchema = z.object({
  key: z.string().min(10),
  publicUrl: z.string().url().optional().nullable(),
  folder: z.string().default('documents'),
  filename: z.string().min(1),
  originalName: z.string().min(1),
  contentType: z.string().min(3),
  sizeBytes: z.coerce.number().positive(),
  purpose: z.enum(documentPurposes).default('DOCUMENT'),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable()
});

const updateDocumentSchema = z.object({
  purpose: z.enum(documentPurposes).optional(),
  folder: z.string().min(1).optional(),
  originalName: z.string().min(1).optional(),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable(),
  status: z.enum(['UPLOADED', 'ARCHIVED']).optional()
});

function buildDocumentWhere(req) {
  const where = {
    tenantId: req.user.tenantId,
    status: { not: 'DELETED' }
  };
  const q = req.query.q?.toString()?.trim();
  if (req.query.purpose) where.purpose = String(req.query.purpose);
  if (req.query.entityType) where.entityType = String(req.query.entityType);
  if (req.query.entityId) where.entityId = String(req.query.entityId);
  if (req.query.status) where.status = String(req.query.status);
  if (q) {
    where.OR = [
      { originalName: { contains: q, mode: 'insensitive' } },
      { fileName: { contains: q, mode: 'insensitive' } },
      { mimeType: { contains: q, mode: 'insensitive' } },
      { entityType: { contains: q, mode: 'insensitive' } },
      { entityId: { contains: q, mode: 'insensitive' } }
    ];
  }
  return where;
}

function bytesToMb(bytes) {
  return Number((Number(bytes || 0) / 1024 / 1024).toFixed(2));
}

router.get('/config', requirePermission('document:read'), (req, res) => {
  res.json(getUploadConfig());
});

router.get('/summary', requirePermission('document:read'), async (req, res, next) => {
  try {
    const where = buildDocumentWhere(req);
    const [documents, grouped, totalActive, archived, linked, unlinked] = await Promise.all([
      prisma.businessDocument.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 8
      }),
      prisma.businessDocument.groupBy({
        by: ['purpose'],
        where: { tenantId: req.user.tenantId, status: { not: 'DELETED' } },
        _count: { _all: true },
        _sum: { sizeBytes: true }
      }),
      prisma.businessDocument.count({ where: { tenantId: req.user.tenantId, status: { not: 'DELETED' } } }),
      prisma.businessDocument.count({ where: { tenantId: req.user.tenantId, status: 'ARCHIVED' } }),
      prisma.businessDocument.count({ where: { tenantId: req.user.tenantId, status: { not: 'DELETED' }, entityType: { not: null } } }),
      prisma.businessDocument.count({ where: { tenantId: req.user.tenantId, status: { not: 'DELETED' }, entityType: null } })
    ]);

    const totalBytes = grouped.reduce((total, row) => total + Number(row._sum.sizeBytes || 0), 0);
    res.json({
      totalActive,
      archived,
      linked,
      unlinked,
      totalSizeMb: bytesToMb(totalBytes),
      byPurpose: grouped.map((row) => ({ purpose: row.purpose, count: row._count._all, sizeMb: bytesToMb(row._sum.sizeBytes || 0) })),
      recent: documents
    });
  } catch (e) { next(e); }
});

router.get('/entities', requirePermission('document:read'), async (req, res, next) => {
  try {
    const [invoices, expenses, products, customers, suppliers, purchases, services, assets, approvals] = await Promise.all([
      prisma.invoice.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, invoiceNo: true, total: true, issueDate: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.expense.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, expenseNo: true, title: true, amount: true, spentAt: true }, orderBy: { createdAt: 'desc' }, take: 30 }),
      prisma.product.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, select: { id: true, name: true, sku: true, barcode: true }, orderBy: { name: 'asc' }, take: 100 }),
      prisma.customer.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' }, take: 80 }),
      prisma.supplier.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, select: { id: true, name: true, phone: true }, orderBy: { name: 'asc' }, take: 80 }),
      prisma.purchaseOrder.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, purchaseNo: true, total: true, orderDate: true }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
      prisma.serviceJob.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, jobNo: true, title: true, status: true }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
      prisma.fixedAsset.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, assetNo: true, name: true }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => []),
      prisma.approvalRequest.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, requestNo: true, title: true, status: true }, orderBy: { createdAt: 'desc' }, take: 30 }).catch(() => [])
    ]);

    res.json({
      Invoice: invoices.map((x) => ({ id: x.id, label: `${x.invoiceNo} • LKR ${Number(x.total || 0).toFixed(2)}`, meta: x.issueDate })),
      Expense: expenses.map((x) => ({ id: x.id, label: `${x.expenseNo} • ${x.title}`, meta: `LKR ${Number(x.amount || 0).toFixed(2)}` })),
      Product: products.map((x) => ({ id: x.id, label: x.name, meta: x.sku || x.barcode || '-' })),
      Customer: customers.map((x) => ({ id: x.id, label: x.name, meta: x.phone || '-' })),
      Supplier: suppliers.map((x) => ({ id: x.id, label: x.name, meta: x.phone || '-' })),
      PurchaseOrder: purchases.map((x) => ({ id: x.id, label: `${x.purchaseNo} • LKR ${Number(x.total || 0).toFixed(2)}`, meta: x.orderDate })),
      ServiceJob: services.map((x) => ({ id: x.id, label: `${x.jobNo} • ${x.title}`, meta: x.status })),
      FixedAsset: assets.map((x) => ({ id: x.id, label: `${x.assetNo} • ${x.name}`, meta: 'Asset' })),
      ApprovalRequest: approvals.map((x) => ({ id: x.id, label: `${x.requestNo} • ${x.title}`, meta: x.status }))
    });
  } catch (e) { next(e); }
});

router.get('/', requirePermission('document:read'), async (req, res, next) => {
  try {
    const documents = await prisma.businessDocument.findMany({
      where: buildDocumentWhere(req),
      orderBy: { createdAt: 'desc' },
      take: Math.min(Number(req.query.limit || 100), 500)
    });
    res.json(documents);
  } catch (e) { next(e); }
});

router.post('/presign', requirePermission('document:create'), async (req, res, next) => {
  try {
    const data = presignSchema.parse(req.body);
    const validated = validateUploadInput({
      folder: data.folder,
      filename: data.filename,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes
    });

    const key = buildS3Key({ tenantId: req.user.tenantId, folder: validated.folder, fileName: validated.fileName });
    const uploadUrl = await createPresignedPutUrl({ key, contentType: validated.contentType });
    const publicUrl = buildPublicUrl(key);

    res.json({
      method: 'PUT',
      uploadUrl,
      key,
      publicUrl,
      folder: validated.folder,
      fileName: validated.fileName,
      expiresInSeconds: Number(process.env.S3_SIGNED_URL_EXPIRES_SECONDS || 300),
      headers: { 'Content-Type': validated.contentType }
    });
  } catch (e) { next(e); }
});

router.post('/commit', requirePermission('document:create'), async (req, res, next) => {
  try {
    const data = commitSchema.parse(req.body);
    const validated = validateUploadInput({
      folder: data.folder,
      filename: data.filename,
      contentType: data.contentType,
      sizeBytes: data.sizeBytes
    });

    const tenantPrefix = `tenants/${req.user.tenantId}/`;
    if (!data.key.startsWith(tenantPrefix)) {
      return res.status(403).json({ message: 'Invalid file key for this tenant' });
    }

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.businessDocument.create({
        data: {
          tenantId: req.user.tenantId,
          purpose: data.purpose,
          folder: validated.folder,
          fileName: validated.fileName,
          originalName: data.originalName,
          mimeType: validated.contentType,
          sizeBytes: validated.sizeBytes,
          s3Key: data.key,
          publicUrl: data.publicUrl || buildPublicUrl(data.key),
          entityType: data.entityType || null,
          entityId: data.entityId || null,
          createdById: req.user.id
        }
      });

      if (data.purpose === 'LOGO') {
        await tx.tenant.update({
          where: { id: req.user.tenantId },
          data: { logoUrl: created.publicUrl }
        });
      }

      return created;
    });

    await audit(req, 'UPLOAD', 'BusinessDocument', document.id, null, document);
    res.status(201).json(document);
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('document:read'), async (req, res, next) => {
  try {
    const document = await prisma.businessDocument.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, status: { not: 'DELETED' } } });
    if (!document) return res.status(404).json({ message: 'Document not found' });
    res.json(document);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('document:update'), async (req, res, next) => {
  try {
    const before = await prisma.businessDocument.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId, status: { not: 'DELETED' } } });
    if (!before) return res.status(404).json({ message: 'Document not found' });
    const data = updateDocumentSchema.parse(req.body || {});
    const updated = await prisma.businessDocument.update({
      where: { id: before.id },
      data: {
        ...(data.purpose ? { purpose: data.purpose } : {}),
        ...(data.folder ? { folder: data.folder } : {}),
        ...(data.originalName ? { originalName: data.originalName } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'entityType') ? { entityType: data.entityType || null } : {}),
        ...(Object.prototype.hasOwnProperty.call(data, 'entityId') ? { entityId: data.entityId || null } : {}),
        ...(data.status ? { status: data.status } : {})
      }
    });
    await audit(req, 'UPDATE', 'BusinessDocument', updated.id, before, updated);
    res.json(updated);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('document:delete'), async (req, res, next) => {
  try {
    const found = await prisma.businessDocument.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!found || found.status === 'DELETED') return res.status(404).json({ message: 'Document not found' });

    const result = await prisma.businessDocument.update({ where: { id: found.id }, data: { status: 'DELETED' } });

    if (String(req.query.deleteObject || '').toLowerCase() === 'true') {
      await deleteS3Object(found.s3Key).catch(() => null);
    }

    await audit(req, 'DELETE', 'BusinessDocument', found.id, found, result);
    res.json({ message: 'Document removed from SmartLedger', document: result });
  } catch (e) { next(e); }
});

export default router;
