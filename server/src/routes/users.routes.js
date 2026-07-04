import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { limitGuard } from '../middleware/planGuard.js';

const router = Router();
router.use(authRequired);

router.get('/', requirePermission('user:read'), async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({ where: { tenantId: req.user.tenantId }, select: { id: true, name: true, email: true, role: true, isActive: true, lastLoginAt: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    res.json(users);
  } catch (e) { next(e); }
});

router.post('/', requirePermission('user:create'), limitGuard('users'), async (req, res, next) => {
  try {
    const data = z.object({ name: z.string().min(2), email: z.string().email(), password: z.string().min(8), role: z.enum(['ADMIN','ACCOUNTANT','CASHIER','INVENTORY_MANAGER','SALES_STAFF','VIEWER','AUDITOR']) }).parse(req.body);
    const user = await prisma.user.create({ data: { tenantId: req.user.tenantId, name: data.name, email: data.email, passwordHash: await bcrypt.hash(data.password, 10), role: data.role }, select: { id: true, name: true, email: true, role: true, isActive: true } });
    res.status(201).json(user);
  } catch (e) { next(e); }
});

router.patch('/:id/status', requirePermission('user:update'), async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    const target = await prisma.user.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!target) return res.status(404).json({ message: 'User not found' });
    if (target.role === 'OWNER') return res.status(400).json({ message: 'Owner cannot be disabled' });
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive }, select: { id: true, name: true, email: true, role: true, isActive: true } });
    res.json(user);
  } catch (e) { next(e); }
});

export default router;
