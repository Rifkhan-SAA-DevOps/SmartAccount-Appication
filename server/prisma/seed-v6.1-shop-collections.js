import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
function money(value) { return Number(Number(value || 0).toFixed(2)); }

async function nextNo(modelName, tenantId, prefix) {
  const count = await prisma[modelName].count({ where: { tenantId } });
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } });
  if (!tenant) throw new Error('DEMO tenant not found. Run your main demo seed first.');

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const shops = await prisma.shopProfile.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  if (!shops.length) {
    console.log('No shop profiles found. Run v5.9 seed first.');
    return;
  }

  for (let i = 0; i < 10; i += 1) {
    const shop = shops[i % shops.length];
    const amount = money(1500 + (i * 850));
    const currentOutstanding = money(shop.currentOutstanding);
    const newOutstanding = money(Math.max(0, currentOutstanding - amount));
    const collection = await prisma.shopCollection.create({
      data: {
        tenantId: tenant.id,
        collectionNo: await nextNo('shopCollection', tenant.id, 'COL'),
        shopId: shop.id,
        customerId: shop.customerId || null,
        routeId: shop.routeId || null,
        employeeId: shop.assignedEmployeeId || null,
        amount,
        method: ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'ONLINE'][i % 4],
        reference: `DEMO-COL-${i + 1}`,
        notes: 'Demo shop collection for route recovery testing',
        collectedAt: new Date(Date.now() - (i * 86400000)),
        createdById: user?.id || null
      }
    });
    await prisma.shopProfile.update({ where: { id: shop.id }, data: { currentOutstanding: newOutstanding } });

    await prisma.shopVisit.create({
      data: {
        tenantId: tenant.id,
        visitNo: await nextNo('shopVisit', tenant.id, 'VIS'),
        shopId: shop.id,
        routeId: shop.routeId || null,
        employeeId: shop.assignedEmployeeId || null,
        plannedAt: new Date(Date.now() + ((i + 1) * 86400000)),
        status: 'PLANNED',
        orderTaken: false,
        collectionPromise: money(2000 + (i * 400)),
        nextFollowUpAt: new Date(Date.now() + ((i + 1) * 86400000)),
        noOrderReason: 'Payment follow-up planned',
        notes: `Follow-up for ${collection.collectionNo}`,
        createdById: user?.id || null
      }
    });
  }

  console.log('Seeded 10 shop collections and 10 collection follow-up visits.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
