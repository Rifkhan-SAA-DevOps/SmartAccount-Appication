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

const presignSchema = z.object({
  folder: z.string().default('documents'),
  filename: z.string().min(1),
  contentType: z.string().min(3),
  sizeBytes: z.coerce.number().positive(),
  purpose: z.enum(['LOGO', 'INVOICE_ATTACHMENT', 'EXPENSE_RECEIPT', 'DOCUMENT', 'PRODUCT_IMAGE']).default('DOCUMENT'),
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
  purpose: z.enum(['LOGO', 'INVOICE_ATTACHMENT', 'EXPENSE_RECEIPT', 'DOCUMENT', 'PRODUCT_IMAGE']).default('DOCUMENT'),
  entityType: z.string().optional().nullable(),
  entityId: z.string().optional().nullable()
});

router.get('/config', requirePermission('document:read'), (req, res) => {
  res.json(getUploadConfig());
});

router.get('/', requirePermission('document:read'), async (req, res, next) => {
  try {
    const where = {
      tenantId: req.user.tenantId,
      status: { not: 'DELETED' }
    };
    if (req.query.purpose) where.purpose = String(req.query.purpose);
    if (req.query.entityType) where.entityType = String(req.query.entityType);
    if (req.query.entityId) where.entityId = String(req.query.entityId);

    const documents = await prisma.businessDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Number(req.query.limit || 100)
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
