import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();
router.use(authRequired);

router.get('/profile', async (req, res) => {
  res.json(req.user.tenant);
});

router.put('/profile', async (req, res, next) => {
  try {
    if (!['OWNER', 'ADMIN'].includes(req.user.role)) return res.status(403).json({ message: 'Only owner/admin can update company settings' });
    const data = z.object({ name: z.string().min(2).optional(), phone: z.string().optional(), email: z.string().email().optional(), currency: z.string().optional(), timezone: z.string().optional() }).parse(req.body);
    const tenant = await prisma.tenant.update({ where: { id: req.user.tenantId }, data });
    res.json(tenant);
  } catch (e) { next(e); }
});

export default router;
