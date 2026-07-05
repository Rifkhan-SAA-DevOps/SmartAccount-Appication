import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve('prisma/schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('Cannot find prisma/schema.prisma. Run this from the server folder.');
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, 'utf8');

if (!schema.includes('model ShopProfile')) {
  console.error('v5.9 distribution foundation models are missing. Apply v5.9 first, then run this script again.');
  process.exit(1);
}

if (schema.includes('model ShopSupplyInvoice')) {
  console.log('v6.0 shop supply schema already exists. No schema change needed.');
  process.exit(0);
}

const additions = `
// ------------------------------
// v6.0 Shop Supply Invoice
// ------------------------------
model ShopSupplyInvoice {
  id              String        @id @default(uuid())
  tenantId        String
  supplyNo        String
  shopId          String
  customerId      String?
  routeId         String?
  employeeId      String?
  vanId           String?
  warehouseId     String?
  invoiceId       String?
  deliveryOrderId String?
  status          String        @default("DRAFT")
  supplyDate      DateTime      @default(now())
  dueDate         DateTime?
  subtotal        Decimal       @default(0) @db.Decimal(12, 2)
  discount        Decimal       @default(0) @db.Decimal(12, 2)
  tax             Decimal       @default(0) @db.Decimal(12, 2)
  total           Decimal       @default(0) @db.Decimal(12, 2)
  paid            Decimal       @default(0) @db.Decimal(12, 2)
  balance         Decimal       @default(0) @db.Decimal(12, 2)
  paymentMethod   PaymentMethod @default(CREDIT)
  createDelivery  Boolean       @default(false)
  notes           String?
  createdById     String?
  createdAt       DateTime      @default(now())
  updatedAt       DateTime      @updatedAt

  items           ShopSupplyInvoiceItem[]

  @@unique([tenantId, supplyNo])
  @@index([tenantId, shopId])
  @@index([tenantId, routeId])
  @@index([tenantId, employeeId])
  @@index([tenantId, vanId])
  @@index([tenantId, warehouseId])
  @@index([tenantId, status])
  @@index([tenantId, supplyDate])
  @@index([tenantId, deliveryOrderId])
}

model ShopSupplyInvoiceItem {
  id              String  @id @default(uuid())
  supplyInvoiceId String
  productId       String?
  description     String
  qty             Decimal @db.Decimal(12, 3)
  freeQty         Decimal @default(0) @db.Decimal(12, 3)
  unitPrice       Decimal @default(0) @db.Decimal(12, 2)
  discount        Decimal @default(0) @db.Decimal(12, 2)
  total           Decimal @default(0) @db.Decimal(12, 2)

  supplyInvoice ShopSupplyInvoice @relation(fields: [supplyInvoiceId], references: [id], onDelete: Cascade)

  @@index([supplyInvoiceId])
  @@index([productId])
}
`;

const marker = '\nmodel TenantSetting';
if (schema.includes(marker)) {
  schema = schema.replace(marker, `${additions}${marker}`);
} else if (schema.includes('\n// ------------------------------\n// v5.9 Wholesale Distribution')) {
  schema += `\n${additions}\n`;
} else {
  schema += `\n${additions}\n`;
}

fs.writeFileSync(schemaPath, schema);
console.log('Added v6.0 shop supply invoice models to prisma/schema.prisma');
console.log('Next: npx prisma format && npx prisma validate && npx prisma migrate dev --name add_shop_supply_invoice');
