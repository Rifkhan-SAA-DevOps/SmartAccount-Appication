import { prisma } from '../lib/prisma.js';

export async function audit(req, action, entity, entityId, before = null, after = null) {
  if (!req.user?.tenantId) return;
  await prisma.auditLog.create({
    data: {
      tenantId: req.user.tenantId,
      userId: req.user.id,
      action,
      entity,
      entityId,
      before,
      after,
      ip: req.ip
    }
  });
}
