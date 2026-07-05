import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

function dec(value) { return Number(Number(value || 0).toFixed(2)); }
function qty(value) { return Number(Number(value || 0).toFixed(3)); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } }) || await prisma.tenant.findFirst();
  if (!tenant) throw new Error('No tenant found. Run your base seed first.');

  if (!prisma.shopReturn) throw new Error('ShopReturn model not found. Run v6.3 migration first.');

  const shops = await prisma.shopProfile.findMany({ where: { tenantId: tenant.id }, take: 10 });
  const products = await prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const routes = await prisma.distributionRoute.findMany({ where: { tenantId: tenant.id }, take: 10 });
  const vans = await prisma.distributionVan.findMany({ where: { tenantId: tenant.id }, take: 10 });
  const warehouses = prisma.warehouse ? await prisma.warehouse.findMany({ where: { tenantId: tenant.id }, take: 3 }) : [];
  const supplies = prisma.shopSupplyInvoice ? await prisma.shopSupplyInvoice.findMany({ where: { tenantId: tenant.id }, take: 10 }) : [];

  if (!shops.length || !products.length) throw new Error('Need v5.9 shops and products before seeding shop returns.');

  const types = ['DAMAGED', 'EXPIRED', 'SALEABLE', 'UNSOLD', 'WRONG_DELIVERY', 'MIXED'];
  const actions = ['HOLD', 'SCRAP', 'RETURN_TO_WAREHOUSE', 'RETURN_TO_WAREHOUSE', 'RETURN_TO_WAREHOUSE', 'HOLD'];

  for (let i = 0; i < 10; i++) {
    const shop = shops[i % shops.length];
    const product = products[i % products.length];
    const type = types[i % types.length];
    const action = actions[i % actions.length];
    const returnNo = `SRN${String(7001 + i).padStart(4, '0')}`;
    const qtyValue = qty((i % 4) + 1);
    const unitPrice = dec(product.salePrice || 100 + i * 15);
    const total = dec(qtyValue * unitPrice);

    await prisma.shopReturn.upsert({
      where: { tenantId_returnNo: { tenantId: tenant.id, returnNo } },
      update: {},
      create: {
        tenantId: tenant.id,
        returnNo,
        shopId: shop.id,
        customerId: shop.customerId || null,
        routeId: shop.routeId || routes[i % routes.length]?.id || null,
        vanId: vans[i % vans.length]?.id || null,
        warehouseId: warehouses[i % warehouses.length]?.id || null,
        supplyInvoiceId: supplies[i % supplies.length]?.id || null,
        returnType: type,
        stockAction: action,
        status: i < 7 ? 'POSTED' : 'DRAFT',
        returnDate: new Date(Date.now() - i * 86400000),
        subtotal: total,
        total,
        creditAmount: total,
        reason: `${type.replaceAll('_', ' ')} product returned by shop`,
        notes: 'Demo distribution shop return',
        postedAt: i < 7 ? new Date(Date.now() - i * 86400000) : null,
        items: {
          create: [{
            productId: product.id,
            description: product.name,
            qty: qtyValue,
            unitPrice,
            total,
            condition: type === 'MIXED' ? 'DAMAGED' : type,
            batchNo: `BATCH-${String(i + 1).padStart(2, '0')}`,
            notes: 'Demo returned item'
          }]
        }
      }
    });
  }

  console.log('Seeded 10 shop return records for v6.3.');
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(async () => prisma.$disconnect());
