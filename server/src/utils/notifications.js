import { prisma } from '../lib/prisma.js';

export const NOTIFICATION_TYPES = ['INFO', 'SUCCESS', 'WARNING', 'DANGER'];
export const NOTIFICATION_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export async function ensureReminderSetting(tenantId) {
  return prisma.reminderSetting.upsert({
    where: { tenantId },
    update: {},
    create: { tenantId }
  });
}

export async function createNotification({
  tenantId,
  userId = null,
  type = 'INFO',
  title,
  message,
  priority = 'NORMAL',
  channel = 'IN_APP',
  entityType = null,
  entityId = null,
  actionUrl = null,
  metadata = null,
  dedupe = true
}) {
  if (!tenantId || !title || !message) return null;

  if (dedupe) {
    const existing = await prisma.notification.findFirst({
      where: {
        tenantId,
        userId,
        title,
        entityType,
        entityId,
        isRead: false
      },
      orderBy: { createdAt: 'desc' }
    });
    if (existing) return existing;
  }

  return prisma.notification.create({
    data: {
      tenantId,
      userId,
      type,
      title,
      message,
      priority,
      channel,
      entityType,
      entityId,
      actionUrl,
      metadata
    }
  });
}

export async function notifyTenantRoles({ tenantId, roles = ['OWNER', 'ADMIN'], ...notification }) {
  const users = await prisma.user.findMany({
    where: { tenantId, role: { in: roles }, isActive: true },
    select: { id: true }
  });

  if (!users.length) {
    return [await createNotification({ tenantId, ...notification })];
  }

  const created = [];
  for (const user of users) {
    created.push(await createNotification({ tenantId, userId: user.id, ...notification }));
  }
  return created.filter(Boolean);
}

export async function createApprovalNotification(tenantId, request, action = 'CREATED') {
  const titleMap = {
    CREATED: 'New approval request',
    APPROVED: 'Approval request approved',
    REJECTED: 'Approval request rejected',
    CANCELLED: 'Approval request cancelled'
  };
  const typeMap = { CREATED: 'WARNING', APPROVED: 'SUCCESS', REJECTED: 'DANGER', CANCELLED: 'INFO' };
  const priority = request.priority === 'URGENT' || request.priority === 'HIGH' ? 'HIGH' : 'NORMAL';

  if (action === 'CREATED') {
    return notifyTenantRoles({
      tenantId,
      roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
      type: typeMap[action],
      title: titleMap[action],
      message: `${request.requestNo} needs approval: ${request.title}`,
      priority,
      entityType: 'ApprovalRequest',
      entityId: request.id,
      actionUrl: '/approvals',
      metadata: { status: request.status, amount: String(request.amount || 0), requestType: request.type }
    });
  }

  const userId = request.requestedById || null;
  return createNotification({
    tenantId,
    userId,
    type: typeMap[action] || 'INFO',
    title: titleMap[action] || 'Approval update',
    message: `${request.requestNo} ${String(action).toLowerCase()}: ${request.title}`,
    priority,
    entityType: 'ApprovalRequest',
    entityId: request.id,
    actionUrl: '/approvals',
    metadata: { status: request.status, decisionNote: request.decisionNote || null }
  });
}

export async function generateBusinessAlerts(tenantId) {
  const setting = await ensureReminderSetting(tenantId);
  const created = [];

  if (setting.lowStockEnabled) {
    const products = await prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        reorderLevel: { gt: 0 }
      },
      orderBy: { updatedAt: 'desc' },
      take: 300,
      include: { warehouseStocks: { include: { warehouse: true } } }
    });

    for (const product of products) {
      const productLevel = Number(product.reorderLevel || 0);
      const totalStock = product.warehouseStocks?.length
        ? product.warehouseStocks.reduce((sum, s) => sum + Number(s.quantity || 0), 0)
        : Number(product.stockQty || 0);
      if (totalStock <= productLevel) {
        created.push(await createNotification({
          tenantId,
          type: totalStock <= 0 ? 'DANGER' : 'WARNING',
          title: 'Low stock alert',
          message: `${product.name} stock is ${totalStock}. Reorder level is ${productLevel}.`,
          priority: totalStock <= 0 ? 'URGENT' : 'HIGH',
          entityType: 'Product',
          entityId: product.id,
          actionUrl: '/products',
          metadata: { sku: product.sku, stock: totalStock, reorderLevel: productLevel }
        }));
      }
    }
  }

  if (setting.customerCreditEnabled) {
    const customers = await prisma.customer.findMany({
      where: { tenantId, isActive: true, balance: { gt: 0 } },
      orderBy: { balance: 'desc' },
      take: 50
    });

    for (const customer of customers) {
      const balance = Number(customer.balance || 0);
      const limit = Number(customer.creditLimit || 0);
      if (limit > 0 && balance < limit) continue;
      created.push(await createNotification({
        tenantId,
        type: limit > 0 && balance >= limit ? 'DANGER' : 'WARNING',
        title: 'Customer credit reminder',
        message: `${customer.name} has pending balance LKR ${balance.toLocaleString()}.`,
        priority: limit > 0 && balance >= limit ? 'HIGH' : 'NORMAL',
        entityType: 'Customer',
        entityId: customer.id,
        actionUrl: '/ledgers',
        metadata: { balance, creditLimit: limit, phone: customer.phone }
      }));
    }
  }

  if (setting.supplierPaymentEnabled) {
    const suppliers = await prisma.supplier.findMany({
      where: { tenantId, isActive: true, balance: { gt: 0 } },
      orderBy: { balance: 'desc' },
      take: 50
    });

    for (const supplier of suppliers) {
      const balance = Number(supplier.balance || 0);
      created.push(await createNotification({
        tenantId,
        type: 'WARNING',
        title: 'Supplier payable reminder',
        message: `${supplier.name} payable balance is LKR ${balance.toLocaleString()}.`,
        priority: 'NORMAL',
        entityType: 'Supplier',
        entityId: supplier.id,
        actionUrl: '/ledgers',
        metadata: { balance, phone: supplier.phone }
      }));
    }
  }

  if (setting.approvalEnabled) {
    const pending = await prisma.approvalRequest.count({ where: { tenantId, status: 'PENDING' } }).catch(() => 0);
    if (pending > 0) {
      created.push(...await notifyTenantRoles({
        tenantId,
        roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
        type: pending > 5 ? 'DANGER' : 'WARNING',
        title: 'Pending approvals',
        message: `${pending} approval request${pending === 1 ? '' : 's'} waiting for decision.`,
        priority: pending > 5 ? 'HIGH' : 'NORMAL',
        entityType: 'ApprovalSummary',
        actionUrl: '/approvals',
        metadata: { pending }
      }));
    }
  }

  if (setting.subscriptionEnabled) {
    const tenant = await prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { subscription: { include: { plan: true } } }
    });
    const end = tenant?.subscription?.trialEndsAt || tenant?.subscription?.currentPeriodEndsAt;
    if (end) {
      const msLeft = new Date(end).getTime() - Date.now();
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24));
      if (daysLeft <= 7) {
        created.push(...await notifyTenantRoles({
          tenantId,
          roles: ['OWNER', 'ADMIN'],
          type: daysLeft <= 2 ? 'DANGER' : 'WARNING',
          title: 'Subscription reminder',
          message: daysLeft >= 0 ? `Your plan expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}.` : 'Your plan has expired.',
          priority: daysLeft <= 2 ? 'HIGH' : 'NORMAL',
          entityType: 'Subscription',
          entityId: tenant.subscription.id,
          actionUrl: '/subscription',
          metadata: { daysLeft, plan: tenant.subscription.plan?.code }
        }));
      }
    }
  }

  return created.filter(Boolean);
}
