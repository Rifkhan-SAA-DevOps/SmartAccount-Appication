import { Router } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { signToken } from '../lib/jwt.js';
import { authRequired } from '../middleware/auth.js';

const router = Router();

const registerSchema = z.object({
  companyName: z.string().min(2),
  businessType: z.string().default('shop'),
  ownerName: z.string().min(2),
  email: z.string().email(),
  phone: z.string().optional(),
  password: z.string().min(8)
});

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || req.socket?.remoteAddress || null;
}

function getUserAgent(req) {
  return req.headers['user-agent'] || 'Unknown device';
}

function deviceNameFromAgent(agent = '') {
  const text = String(agent || 'Unknown device');
  const browser = text.includes('Edg/') ? 'Edge' : text.includes('Chrome/') ? 'Chrome' : text.includes('Firefox/') ? 'Firefox' : text.includes('Safari/') ? 'Safari' : 'Browser';
  const os = text.includes('Windows') ? 'Windows' : text.includes('Mac OS') ? 'macOS' : text.includes('Android') ? 'Android' : text.includes('iPhone') ? 'iPhone' : text.includes('Linux') ? 'Linux' : 'Device';
  return `${browser} on ${os}`;
}

function deviceHashFromRequest(req) {
  const source = `${getUserAgent(req)}|${getClientIp(req) || ''}`;
  return crypto.createHash('sha256').update(source).digest('hex').slice(0, 48);
}

async function recordLoginAttempt(req, { user, email, status, reason }) {
  if (!user?.tenantId) return;
  const ip = getClientIp(req);
  const userAgent = getUserAgent(req);
  const deviceHash = deviceHashFromRequest(req);
  const deviceName = deviceNameFromAgent(userAgent);

  await prisma.$transaction(async (tx) => {
    await tx.loginHistory.create({
      data: {
        tenantId: user.tenantId,
        userId: user.id,
        email: email || user.email,
        status,
        reason: reason || null,
        ip,
        userAgent,
        deviceHash,
        deviceName
      }
    });

    if (status === 'SUCCESS') {
      await tx.trustedDevice.upsert({
        where: { tenantId_userId_deviceHash: { tenantId: user.tenantId, userId: user.id, deviceHash } },
        update: { lastSeenAt: new Date(), ipAddress: ip, userAgent, deviceName, revokedAt: null },
        create: { tenantId: user.tenantId, userId: user.id, deviceHash, deviceName, userAgent, ipAddress: ip }
      });
    }

    if (status !== 'SUCCESS') {
      await tx.securityEvent.create({
        data: {
          tenantId: user.tenantId,
          userId: user.id,
          severity: reason === 'DISABLED_USER' ? 'HIGH' : 'MEDIUM',
          type: 'LOGIN_FAILED',
          title: 'Failed login attempt',
          description: `${email || user.email} failed to log in. Reason: ${reason || 'UNKNOWN'}`,
          ip,
          userAgent,
          metadata: { email: email || user.email, reason, deviceName }
        }
      });
    }
  }).catch(() => null);
}

router.post('/register-company', async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const plan = await prisma.subscriptionPlan.findUnique({ where: { code: 'FREE_TRIAL' } });
    if (!plan) return res.status(500).json({ message: 'FREE_TRIAL plan missing. Run seed.' });

    const codeBase = data.companyName.replace(/[^a-zA-Z0-9]/g, '').slice(0, 8).toUpperCase() || 'BIZ';
    const code = `${codeBase}-${Math.floor(1000 + Math.random() * 9000)}`;

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: {
          name: data.companyName,
          code,
          businessType: data.businessType,
          email: data.email,
          phone: data.phone,
          status: 'TRIAL'
        }
      });

      await tx.tenantSubscription.create({
        data: {
          tenantId: tenant.id,
          planId: plan.id,
          status: 'trial',
          trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
        }
      });

      const branch = await tx.branch.create({ data: { tenantId: tenant.id, name: 'Main Branch', code: 'MAIN', isMain: true } });
      await tx.warehouse.create({ data: { tenantId: tenant.id, branchId: branch.id, name: 'Main Warehouse', code: 'MAIN-WH' } });
      await tx.unit.create({ data: { tenantId: tenant.id, name: 'Pieces', symbol: 'pcs' } });
      await tx.productCategory.create({ data: { tenantId: tenant.id, name: 'General' } });
      await tx.tenantSetting.create({ data: { tenantId: tenant.id, legalName: data.companyName, invoicePrefix: 'INV', receiptPrefix: 'REC' } });
      await tx.taxRate.create({ data: { tenantId: tenant.id, name: 'No Tax', rate: 0, isDefault: true } });

      const user = await tx.user.create({
        data: {
          tenantId: tenant.id,
          name: data.ownerName,
          email: data.email,
          passwordHash: await bcrypt.hash(data.password, 10),
          role: 'OWNER'
        }
      });
      return { tenant, user };
    });

    const token = signToken({ userId: result.user.id, tenantId: result.tenant.id, role: result.user.role });
    res.status(201).json({ token, user: { id: result.user.id, name: result.user.name, email: result.user.email, role: result.user.role }, tenant: result.tenant });
  } catch (error) {
    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
    const user = await prisma.user.findUnique({ where: { email }, include: { tenant: true } });
    if (!user) return res.status(401).json({ message: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      await recordLoginAttempt(req, { user, email, status: 'FAILED', reason: 'BAD_PASSWORD' });
      return res.status(401).json({ message: 'Invalid email or password' });
    }
    if (!user.isActive) {
      await recordLoginAttempt(req, { user, email, status: 'FAILED', reason: 'DISABLED_USER' });
      return res.status(403).json({ message: 'User account disabled' });
    }

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    await recordLoginAttempt(req, { user, email, status: 'SUCCESS', reason: null });
    const token = signToken({ userId: user.id, tenantId: user.tenantId, role: user.role });
    res.json({ token, user: { id: user.id, name: user.name, email: user.email, role: user.role }, tenant: user.tenant });
  } catch (error) {
    next(error);
  }
});

router.get('/me', authRequired, async (req, res) => {
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role }, tenant: req.user.tenant });
});

export default router;
