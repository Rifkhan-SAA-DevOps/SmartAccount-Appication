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
  address: z.string().optional().nullable(),
  groupName: z.string().optional().nullable(),
  creditLimit: z.coerce.number().optional().default(0)
});

router.get('/', requirePermission('customer:read'), async (req, res, next) => {
  try {
    const q = req.query.q?.toString();
    const customers = await prisma.customer.findMany({
      where: {
        tenantId: req.user.tenantId,
        ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }] } : {})
      },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(customers);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('customer:create'), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const customer = await prisma.customer.create({ data: { ...data, email: data.email || null, tenantId: req.user.tenantId } });
    await audit(req, 'CREATE', 'Customer', customer.id, null, customer);
    res.status(201).json(customer);
  } catch (e) { next(e); }
});

router.get('/:id', requirePermission('customer:read'), async (req, res, next) => {
  try {
    const customer = await prisma.customer.findFirst({
      where: { id: req.params.id, tenantId: req.user.tenantId },
      include: { invoices: { orderBy: { createdAt: 'desc' }, take: 20 }, payments: { orderBy: { paidAt: 'desc' }, take: 20 } }
    });
    if (!customer) return res.status(404).json({ message: 'Customer not found' });
    res.json(customer);
  } catch (e) { next(e); }
});

router.put('/:id', requirePermission('customer:update'), async (req, res, next) => {
  try {
    const before = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Customer not found' });
    const data = schema.partial().parse(req.body);
    const customer = await prisma.customer.update({ where: { id: req.params.id }, data: { ...data, email: data.email || undefined } });
    await audit(req, 'UPDATE', 'Customer', customer.id, before, customer);
    res.json(customer);
  } catch (e) { next(e); }
});

router.delete('/:id', requirePermission('customer:delete'), async (req, res, next) => {
  try {
    const before = await prisma.customer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Customer not found' });
    await prisma.customer.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit(req, 'DISABLE', 'Customer', req.params.id, before, null);
    res.json({ message: 'Customer disabled' });
  } catch (e) { next(e); }
});

export default router;
