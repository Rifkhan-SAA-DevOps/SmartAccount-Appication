import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);

const schema = z.object({
  name: z.string().min(2),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal('')),
  address: z.string().optional().nullable()
});

router.get('/', requirePermission('supplier:read'), async (req, res, next) => {
  try {
    const suppliers = await prisma.supplier.findMany({ where: { tenantId: req.user.tenantId }, orderBy: { createdAt: 'desc' }, take: 100 });
    res.json(suppliers);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('supplier:create'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const supplier = await prisma.supplier.create({ data: { ...data, email: data.email || null, tenantId: req.user.tenantId } });
    await audit(req, 'CREATE', 'Supplier', supplier.id, null, supplier);
    res.status(201).json(supplier);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('supplier:update'), async (req, res, next) => {
  try {
    const before = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Supplier not found' });
    const data = schema.partial().parse(req.body);
    const supplier = await prisma.supplier.update({ where: { id: req.params.id }, data: { ...data, email: data.email || undefined } });
    await audit(req, 'UPDATE', 'Supplier', supplier.id, before, supplier);
    res.json(supplier);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('supplier:delete'), async (req, res, next) => {
  try {
    const before = await prisma.supplier.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Supplier not found' });
    await prisma.supplier.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit(req, 'DISABLE', 'Supplier', req.params.id, before, null);
    res.json({ message: 'Supplier disabled' });
  } catch (e) { next(e); }
});

export default router;
