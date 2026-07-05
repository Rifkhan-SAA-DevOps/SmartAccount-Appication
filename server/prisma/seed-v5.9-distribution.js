import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function money(value) { return Number(Number(value || 0).toFixed(2)); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } }) || await prisma.tenant.findFirst();
  if (!tenant) throw new Error('No tenant found. Create/register a company first.');
  const tenantId = tenant.id;

  const reps = [];
  for (let i = 1; i <= 5; i += 1) {
    reps.push(await prisma.employee.upsert({
      where: { tenantId_employeeNo: { tenantId, employeeNo: `DSR-${String(i).padStart(3, '0')}` } },
      update: { name: `Distribution Sales Rep ${i}`, department: 'Distribution', designation: 'Sales Representative', status: 'ACTIVE' },
      create: { tenantId, employeeNo: `DSR-${String(i).padStart(3, '0')}`, name: `Distribution Sales Rep ${i}`, phone: `07770010${i}`, department: 'Distribution', designation: 'Sales Representative', employmentType: 'FULL_TIME', status: 'ACTIVE', basicSalary: 55000 + (i * 2500) }
    }));
  }

  const routeAreas = ['Akkaraipattu', 'Kalmunai', 'Sammanthurai', 'Ampara', 'Oluvil', 'Nintavur', 'Addalaichenai', 'Pottuvil', 'Batticaloa', 'Kattankudy'];
  const routes = [];
  for (let i = 0; i < routeAreas.length; i += 1) {
    const routeNo = `RT${String(1001 + i).padStart(4, '0')}`;
    routes.push(await prisma.distributionRoute.upsert({
      where: { tenantId_routeNo: { tenantId, routeNo } },
      update: { name: `${routeAreas[i]} Route`, area: routeAreas[i], assignedEmployeeId: reps[i % reps.length].id, targetDailySales: money(45000 + (i * 5000)), isActive: true },
      create: { tenantId, routeNo, name: `${routeAreas[i]} Route`, area: routeAreas[i], assignedEmployeeId: reps[i % reps.length].id, targetDailySales: money(45000 + (i * 5000)), notes: 'Demo route for wholesale distribution', isActive: true }
    }));
  }

  const shops = [];
  for (let i = 1; i <= 12; i += 1) {
    const route = routes[(i - 1) % routes.length];
    const rep = reps[(i - 1) % reps.length];
    const shopCode = `SH${String(1000 + i).padStart(4, '0')}`;
    const customer = await prisma.customer.upsert({
      where: { id: `demo-shop-customer-${i}` },
      update: {},
      create: { id: `demo-shop-customer-${i}`, tenantId, name: `Demo Retail Shop ${i}`, phone: `07660020${String(i).padStart(2, '0')}`, address: `${route.area} Main Road`, groupName: 'Retail Shop', creditLimit: money(50000 + (i * 5000)), balance: money(8000 + (i * 1750)) }
    }).catch(async () => prisma.customer.create({ data: { tenantId, name: `Demo Retail Shop ${i}`, phone: `07660020${String(i).padStart(2, '0')}`, address: `${route.area} Main Road`, groupName: 'Retail Shop', creditLimit: money(50000 + (i * 5000)), balance: money(8000 + (i * 1750)) } }));

    shops.push(await prisma.shopProfile.upsert({
      where: { tenantId_shopCode: { tenantId, shopCode } },
      update: { shopName: `Demo Retail Shop ${i}`, routeId: route.id, assignedEmployeeId: rep.id, currentOutstanding: money(8000 + (i * 1750)), creditLimit: money(50000 + (i * 5000)), isActive: true },
      create: { tenantId, customerId: customer.id, routeId: route.id, assignedEmployeeId: rep.id, shopCode, shopName: `Demo Retail Shop ${i}`, ownerName: `Shop Owner ${i}`, phone: `07660020${String(i).padStart(2, '0')}`, address: `${route.area} Main Road`, area: route.area, category: i % 3 === 0 ? 'Mini Market' : 'Grocery', paymentTerms: 'Credit', creditLimit: money(50000 + (i * 5000)), currentOutstanding: money(8000 + (i * 1750)), creditDays: 7 + (i % 4), visitFrequency: i % 2 === 0 ? 'Twice a week' : 'Weekly', isBlocked: i === 10, isActive: true }
    }));
  }

  for (let i = 1; i <= 5; i += 1) {
    const vanNo = `VN${String(1000 + i).padStart(4, '0')}`;
    await prisma.distributionVan.upsert({
      where: { tenantId_vanNo: { tenantId, vanNo } },
      update: { name: `Distribution Van ${i}`, driverEmployeeId: reps[(i - 1) % reps.length].id, routeId: routes[(i - 1) % routes.length].id, isActive: true },
      create: { tenantId, vanNo, name: `Distribution Van ${i}`, vehicleNo: `EP-${7300 + i}`, driverEmployeeId: reps[(i - 1) % reps.length].id, routeId: routes[(i - 1) % routes.length].id, capacityNotes: 'Demo vehicle for route distribution', isActive: true }
    });
  }

  for (let i = 0; i < shops.length; i += 1) {
    const shop = shops[i];
    await prisma.shopVisit.upsert({
      where: { tenantId_visitNo: { tenantId, visitNo: `SV${String(1001 + i).padStart(4, '0')}` } },
      update: {},
      create: { tenantId, visitNo: `SV${String(1001 + i).padStart(4, '0')}`, shopId: shop.id, routeId: shop.routeId, employeeId: shop.assignedEmployeeId, plannedAt: new Date(Date.now() + (i * 86400000)), status: i % 4 === 0 ? 'PAYMENT_PROMISED' : i % 3 === 0 ? 'VISITED' : 'PLANNED', orderTaken: i % 3 === 0, collectionPromise: money(3000 + (i * 500)), notes: 'Demo shop visit plan', createdById: null }
    });
  }

  for (let i = 0; i < 10; i += 1) {
    const shop = shops[i];
    await prisma.shopCollection.upsert({
      where: { tenantId_collectionNo: { tenantId, collectionNo: `SC${String(1001 + i).padStart(4, '0')}` } },
      update: {},
      create: { tenantId, collectionNo: `SC${String(1001 + i).padStart(4, '0')}`, shopId: shop.id, customerId: shop.customerId, routeId: shop.routeId, employeeId: shop.assignedEmployeeId, amount: money(1500 + (i * 450)), method: i % 4 === 0 ? 'CHEQUE' : 'CASH', reference: `DEMO-COL-${i + 1}`, notes: 'Demo route collection', collectedAt: new Date(Date.now() - (i * 3600000)), createdById: null }
    });
  }

  console.log('✅ v5.9 distribution demo data created');
  console.log('Open: Distribution / Shop Supply page');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
