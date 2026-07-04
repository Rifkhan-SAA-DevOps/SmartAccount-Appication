import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';

const router = Router();
router.use(authRequired);

router.get('/summary', requirePermission('dashboard:read'), async (req, res, next) => {
  try {
    const startToday = new Date();
    startToday.setHours(0, 0, 0, 0);

    const [todayInvoices, customers, suppliers, products, stockProducts, customerCredit, paymentsToday, recentInvoices] = await Promise.all([
      prisma.invoice.aggregate({ where: { tenantId: req.user.tenantId, createdAt: { gte: startToday } }, _sum: { total: true }, _count: { _all: true } }),
      prisma.customer.count({ where: { tenantId: req.user.tenantId, isActive: true } }),
      prisma.supplier.count({ where: { tenantId: req.user.tenantId, isActive: true } }),
      prisma.product.count({ where: { tenantId: req.user.tenantId, isActive: true } }),
      prisma.product.findMany({ where: { tenantId: req.user.tenantId, isActive: true }, select: { stockQty: true, reorderLevel: true } }),
      prisma.customer.aggregate({ where: { tenantId: req.user.tenantId }, _sum: { balance: true } }),
      prisma.payment.aggregate({ where: { tenantId: req.user.tenantId, direction: 'IN', paidAt: { gte: startToday } }, _sum: { amount: true } }),
      prisma.invoice.findMany({ where: { tenantId: req.user.tenantId }, include: { customer: true }, orderBy: { createdAt: 'desc' }, take: 6 })
    ]);

    const lowStock = stockProducts.filter((p) => Number(p.stockQty) <= Number(p.reorderLevel)).length;

    res.json({
      cards: {
        todaySales: Number(todayInvoices._sum.total || 0),
        todayInvoiceCount: todayInvoices._count?._all || 0,
        todayPayments: Number(paymentsToday._sum.amount || 0),
        customers,
        suppliers,
        products,
        lowStock,
        customerCredit: Number(customerCredit._sum.balance || 0)
      },
      recentInvoices
    });
  } catch (e) { next(e); }
});

export default router;
