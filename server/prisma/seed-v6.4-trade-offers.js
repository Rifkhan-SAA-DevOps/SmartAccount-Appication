import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function money(n) { return Number(Number(n || 0).toFixed(2)); }
function qty(n) { return Number(Number(n || 0).toFixed(3)); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } }) || await prisma.tenant.findFirst();
  if (!tenant) throw new Error('No tenant found. Run the main/demo seed first.');

  if (!prisma.tradeOffer || !prisma.shopPriceList) {
    console.log('v6.4 models are not available yet. Run migration and prisma generate first.');
    return;
  }

  const products = await prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 12 });
  const shops = await prisma.shopProfile.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const routes = await prisma.distributionRoute.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 5 });
  if (!products.length || !shops.length) {
    console.log('Need products and shop profiles before seeding v6.4. Run v5.9/v6.0 demo seeds first.');
    return;
  }

  const priceCount = await prisma.shopPriceList.count({ where: { tenantId: tenant.id } });
  if (priceCount < 10) {
    for (let i = 0; i < 10; i++) {
      const product = products[i % products.length];
      const shop = shops[i % shops.length];
      const route = routes[i % Math.max(routes.length, 1)];
      const base = Number(product.salePrice || 1000);
      await prisma.shopPriceList.create({
        data: {
          tenantId: tenant.id,
          priceNo: `PL-DEMO-${String(i + 1).padStart(3, '0')}`,
          productId: product.id,
          shopId: i % 2 === 0 ? shop.id : null,
          routeId: i % 2 === 1 && route ? route.id : null,
          priceType: i % 2 === 0 ? 'SHOP_SPECIAL' : 'ROUTE_PRICE',
          unitPrice: money(base * (0.85 + (i * 0.01))),
          minQty: qty(i % 3 === 0 ? 10 : 0),
          priority: 5 + i,
          notes: i % 2 === 0 ? `Special price for ${shop.shopName}` : 'Route wholesale price'
        }
      });
    }
  }

  const offerCount = await prisma.tradeOffer.count({ where: { tenantId: tenant.id } });
  if (offerCount < 10) {
    const offerTypes = ['BUY_X_GET_Y', 'PERCENT_DISCOUNT', 'AMOUNT_DISCOUNT', 'BULK_PRICE'];
    for (let i = 0; i < 10; i++) {
      const product = products[i % products.length];
      const freeProduct = products[(i + 1) % products.length];
      const shop = shops[i % shops.length];
      const route = routes[i % Math.max(routes.length, 1)];
      const offerType = offerTypes[i % offerTypes.length];
      await prisma.tradeOffer.create({
        data: {
          tenantId: tenant.id,
          offerNo: `OFR-DEMO-${String(i + 1).padStart(3, '0')}`,
          name: offerType === 'BUY_X_GET_Y' ? `Buy ${10 + i} ${product.name} get ${1 + (i % 2)} free` : `${product.name} distributor offer ${i + 1}`,
          offerType,
          status: 'ACTIVE',
          appliesTo: i % 3 === 0 ? 'SHOP' : i % 3 === 1 ? 'ROUTE' : 'ALL_SHOPS',
          productId: product.id,
          freeProductId: offerType === 'BUY_X_GET_Y' ? freeProduct.id : null,
          shopId: i % 3 === 0 ? shop.id : null,
          routeId: i % 3 === 1 && route ? route.id : null,
          minQty: qty(i % 2 === 0 ? 5 : 0),
          minAmount: money(i % 2 === 1 ? 5000 : 0),
          buyQty: qty(offerType === 'BUY_X_GET_Y' ? 10 + i : 0),
          freeQty: qty(offerType === 'BUY_X_GET_Y' ? 1 + (i % 2) : 0),
          discountType: offerType === 'PERCENT_DISCOUNT' ? 'PERCENT' : offerType === 'AMOUNT_DISCOUNT' ? 'AMOUNT' : offerType === 'BULK_PRICE' ? 'PRICE_OVERRIDE' : 'NONE',
          discountValue: money(offerType === 'PERCENT_DISCOUNT' ? 5 + i : offerType === 'AMOUNT_DISCOUNT' ? 250 + (i * 50) : offerType === 'BULK_PRICE' ? Number(product.salePrice || 1000) * 0.9 : 0),
          priority: 5 + i,
          notes: 'Demo distributor trade scheme'
        }
      });
    }
  }

  console.log('v6.4 trade offers and shop price list demo data ready.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
