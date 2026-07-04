import { z } from 'zod';
import { signToken, verifyToken } from '../lib/jwt.js';

export const PLATFORM_ROLE = 'PLATFORM_OWNER';

export function platformLoginHandler(req, res) {
  const data = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const adminEmail = process.env.PLATFORM_ADMIN_EMAIL || 'owner@smartledger.local';
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD || 'ChangeMe@12345';

  if (data.email !== adminEmail || data.password !== adminPassword) {
    return res.status(401).json({ message: 'Invalid platform admin login' });
  }

  const token = signToken({ platformRole: PLATFORM_ROLE, email: adminEmail });
  res.json({
    token,
    admin: { email: adminEmail, role: PLATFORM_ROLE, name: 'SmartLedger SaaS Owner' }
  });
}

export function platformAdminRequired(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) return res.status(401).json({ message: 'Platform admin authentication required' });
    const payload = verifyToken(token);
    if (payload.platformRole !== PLATFORM_ROLE) return res.status(403).json({ message: 'Platform owner access required' });
    req.platformAdmin = { email: payload.email, role: payload.platformRole };
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid platform admin token' });
  }
}
