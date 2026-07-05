import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
function money(value) { return Number(Number(value || 0).toFixed(2)); }
function qty(value) { return Number(Number(value || 0).toFixed(3)); }

async function main() {
  const tenant = await prisma.tenant.findFirst({ where: { code: 'DEMO' } });
  if (!tenant) throw new Error('DEMO tenant not found. Run your main demo seed first.');

  const user = await prisma.user.findFirst({ where: { tenantId: tenant.id } });
  const shops = await prisma.shopProfile.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const products = await prisma.product.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 12 });
  const warehouse = await prisma.warehouse.findFirst({ where: { tenantId: tenant.id, isActive: true }, orderBy: { createdAt: 'asc' } });
  const routes = await prisma.distributionRoute.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const vans = await prisma.distributionVan.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 });
  const employees = await prisma.employee.findMany({ where: { tenantId: tenant.id, isActive: true }, take: 10 }).catch(() => []);

  if (!shops.length || !products.length || !warehouse) {
    console.log('Need v5.9 shops, products and at least one warehouse before seeding shop supply invoices. Skipped.');
    return;
  }

  for (let i = 0; i < 10; i += 1) {
    const shop = shops[i % shops.length];
    const route = routes[i % Math.max(routes.length, 1)] || null;
    const van = vans[i % Math.max(vans.length, 1)] || null;
    const employee = employees[i % Math.max(employees.length, 1)] || null;
    const productA = products[i % products.length];
    const productB = products[(i + 3) % products.length];
    const lineAQty = qty(4 + i);
    const lineBQty = qty(2 + (i % 4));
    const lineAFree = i % 3 === 0 ? 1 : 0;
    const lines = [
      { product: productA, qty: lineAQty, freeQty: lineAFree, unitPrice: money(productA.salePrice || 100), discount: i % 2 === 0 ? 50 : 0 },
      { product: productB, qty: lineBQty, freeQty: 0, unitPrice: money(productB.salePrice || 100), discount: 0 }
    ];
    const subtotal = money(lines.reduce((sum, line) => sum + (line.qty * line.unitPrice - line.discount), 0));
    const discount = i % 4 === 0 ? 100 : 0;
    const tax = money((subtotal - discount) * 0.02);
    const total = money(subtotal - discount + tax);
    const paid = i % 2 === 0 ? money(total * 0.4) : 0;
    const balance = money(total - paid);
    const status = i < 7 ? 'POSTED' : 'DRAFT';
    const supplyNo = `SSI${String(2001 + i).padStart(4, '0')}`;

    const existing = await prisma.shopSupplyInvoice.findUnique({ where: { tenantId_supplyNo: { tenantId: tenant.id, supplyNo } } }).catch(() => null);
    if (existing) continue;

    const created = await prisma.shopSupplyInvoice.create({
      data: {
        tenantId: tenant.id,
        supplyNo,
        shopId: shop.id,
        customerId: shop.customerId || null,
        routeId: route?.id || shop.routeId || null,
        employeeId: employee?.id || shop.assignedEmployeeId || null,
        vanId: van?.id || null,
        warehouseId: warehouse.id,
        status,
        supplyDate: new Date(Date.now() - i * 86400000),
        dueDate: new Date(Date.now() + (7 + i) * 86400000),
        subtotal,
        discount,
        tax,
        total,
        paid,
        balance,
        paymentMethod: paid > 0 ? 'CASH' : 'CREDIT',
        createDelivery: i % 2 === 0,
        notes: `Demo shop supply invoice ${i + 1}`,
        createdById: user?.id || null,
        items: {
          create: lines.map((line) => ({
            productId: line.product.id,
            description: line.product.name,
            qty: line.qty,
            freeQty: line.freeQty,
            unitPrice: line.unitPrice,
            discount: line.discount,
            total: money(line.qty * line.unitPrice - line.discount)
          }))
        }
      },
      include: { items: true }
    });

    if (status === 'POSTED') {
      await prisma.shopProfile.update({ where: { id: shop.id }, data: { currentOutstanding: { increment: balance } } });
      if (shop.customerId) await prisma.customer.update({ where: { id: shop.customerId }, data: { balance: { increment: balance } } }).catch(() => null);
      if (paid > 0) {
        await prisma.shopCollection.create({
          data: {
            tenantId: tenant.id,
            collectionNo: `COL${String(3001 + i).padStart(4, '0')}`,
            shopId: shop.id,
            customerId: shop.customerId || null,
            routeId: route?.id || shop.routeId || null,
            employeeId: employee?.id || shop.assignedEmployeeId || null,
            amount: paid,
            method: 'CASH',
            reference: supplyNo,
            notes: `Demo payment for ${supplyNo}`,
            createdById: user?.id || null
          }
        }).catch(() => null);
      }
      for (const item of created.items) {
        const outQty = Number(item.qty || 0) + Number(item.freeQty || 0);
        await prisma.product.update({ where: { id: item.productId }, data: { stockQty: { decrement: outQty } } }).catch(() => null);
        await prisma.stockMovement.create({
          data: { tenantId: tenant.id, productId: item.productId, warehouseId: warehouse.id, type: 'SALE', quantity: -outQty, unitCost: 0, refType: 'ShopSupplyInvoice', refId: created.id, notes: `Demo shop supply ${supplyNo}` }
        }).catch(() => null);
      }
    }
  }

  console.log('Seeded v6.0 shop supply demo data.');
}

main().catch((error) => { console.error(error); process.exit(1); }).finally(() => prisma.$disconnect());
