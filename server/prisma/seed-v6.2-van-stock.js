import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
function money(value) { return Number(Number(value || 0).toFixed(2)); }
function qty(value) { return Number(Number(value || 0).toFixed(3)); }

async function nextNo(modelName, tenantId, prefix) {
  const count = await prisma[modelName].count({ where: { tenantId } });
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } });
  if (!tenant) throw new Error('DEMO tenant not found. Run your main demo seed first.');

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const vans = await prisma.distributionVan.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const routes = await prisma.distributionRoute.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const warehouses = await prisma.warehouse.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 5 }).catch(() => []);
  const products = await prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 20 });
  const employees = await prisma.employee.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 }).catch(() => []);

  if (!vans.length || !products.length) {
    console.log('Need v5.9 vans and products before seeding van stock. Skipped.');
    return;
  }

  for (let i = 0; i < 10; i += 1) {
    const van = vans[i % vans.length];
    const route = routes[i % Math.max(routes.length, 1)] || null;
    const warehouse = warehouses[i % Math.max(warehouses.length, 1)] || null;
    const employee = employees[i % Math.max(employees.length, 1)] || null;
    const productA = products[i % products.length];
    const productB = products[(i + 4) % products.length];
    const loadNo = `VL${String(6001 + i).padStart(4, '0')}`;

    const existing = await prisma.vanLoad.findUnique({ where: { tenantId_loadNo: { tenantId: tenant.id, loadNo } } }).catch(() => null);
    if (existing) continue;

    const lines = [
      { product: productA, qtyLoaded: qty(8 + i), unitCost: money(productA.costPrice || 50) },
      { product: productB, qtyLoaded: qty(5 + (i % 5)), unitCost: money(productB.costPrice || 40) }
    ];

    const status = i < 7 ? 'POSTED' : 'DRAFT';
    const load = await prisma.vanLoad.create({
      data: {
        tenantId: tenant.id,
        loadNo,
        vanId: van.id,
        routeId: route?.id || van.routeId || null,
        warehouseId: warehouse?.id || null,
        employeeId: employee?.id || van.driverEmployeeId || null,
        status,
        loadDate: new Date(Date.now() - i * 86400000),
        postedAt: status === 'POSTED' ? new Date(Date.now() - i * 86400000) : null,
        notes: 'Demo van load for route stock testing',
        createdById: user?.id || null,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            description: line.product.name,
            qtyLoaded: line.qtyLoaded,
            unitCost: line.unitCost,
            qtyReturned: i % 4 === 0 ? 1 : 0,
            qtyDamaged: i % 5 === 0 ? 0.5 : 0,
            qtyMissing: 0
          }))
        }
      },
      include: { items: true }
    });

    if (status === 'POSTED') {
      for (const item of load.items) {
        await prisma.vanStock.upsert({
          where: { tenantId_vanId_productId: { tenantId: tenant.id, vanId: van.id, productId: item.productId } },
          update: { quantity: { increment: item.qtyLoaded } },
          create: { tenantId: tenant.id, vanId: van.id, productId: item.productId, quantity: item.qtyLoaded }
        });
        await prisma.vanStockMovement.create({
          data: {
            tenantId: tenant.id,
            vanId: van.id,
            productId: item.productId,
            loadId: load.id,
            routeId: load.routeId,
            warehouseId: load.warehouseId,
            type: 'LOAD_OUT',
            quantity: item.qtyLoaded,
            unitCost: item.unitCost,
            refType: 'VanLoad',
            refId: load.id,
            notes: 'Demo van stock load'
          }
        });
      }
    }
  }

  const firstVan = vans[0];
  await prisma.vanDailyClosing.create({
    data: {
      tenantId: tenant.id,
      closingNo: await nextNo('vanDailyClosing', tenant.id, 'VCL'),
      vanId: firstVan.id,
      routeId: routes[0]?.id || firstVan.routeId || null,
      employeeId: employees[0]?.id || firstVan.driverEmployeeId || null,
      loadedValue: 65000,
      soldValue: 42000,
      returnedValue: 15000,
      damagedValue: 1200,
      missingValue: 500,
      cashCollected: 28000,
      chequeCollected: 7000,
      creditSales: 7000,
      routeExpense: 1500,
      status: 'POSTED',
      notes: 'Demo route closing summary'
    }
  }).catch(() => null);

  console.log('Seeded 10 van loads, van stock rows, movements, and one closing summary.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
