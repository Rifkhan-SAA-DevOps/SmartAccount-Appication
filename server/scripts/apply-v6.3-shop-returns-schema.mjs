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

if (schema.includes('model ShopReturn')) {
  console.log('v6.3 shop return schema already exists. No schema change needed.');
  process.exit(0);
}

const additions = `
// ------------------------------
// v6.3 Shop Returns / Damage / Expiry Return Handling
// ------------------------------
model ShopReturn {
  id              String   @id @default(uuid())
  tenantId        String
  returnNo        String
  shopId          String
  customerId      String?
  routeId         String?
  employeeId      String?
  vanId           String?
  warehouseId     String?
  supplyInvoiceId String?
  returnDate      DateTime @default(now())
  status          String   @default("DRAFT")
  returnType      String   @default("DAMAGED")
  stockAction     String   @default("HOLD")
  subtotal        Decimal  @default(0) @db.Decimal(12, 2)
  discount        Decimal  @default(0) @db.Decimal(12, 2)
  total           Decimal  @default(0) @db.Decimal(12, 2)
  creditAmount    Decimal  @default(0) @db.Decimal(12, 2)
  reason          String?
  notes           String?
  createdById     String?
  postedAt        DateTime?
  cancelledAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  items           ShopReturnItem[]

  @@unique([tenantId, returnNo])
  @@index([tenantId, shopId])
  @@index([tenantId, customerId])
  @@index([tenantId, routeId])
  @@index([tenantId, employeeId])
  @@index([tenantId, vanId])
  @@index([tenantId, warehouseId])
  @@index([tenantId, supplyInvoiceId])
  @@index([tenantId, returnDate])
  @@index([tenantId, status])
  @@index([tenantId, returnType])
}

model ShopReturnItem {
  id           String   @id @default(uuid())
  shopReturnId String
  productId    String?
  description  String
  qty          Decimal  @db.Decimal(12, 3)
  unitPrice    Decimal  @default(0) @db.Decimal(12, 2)
  discount     Decimal  @default(0) @db.Decimal(12, 2)
  total        Decimal  @default(0) @db.Decimal(12, 2)
  condition    String   @default("DAMAGED")
  batchNo      String?
  expiryDate   DateTime?
  notes        String?

  shopReturn ShopReturn @relation(fields: [shopReturnId], references: [id], onDelete: Cascade)

  @@index([shopReturnId])
  @@index([productId])
  @@index([condition])
}
`;

const marker = '\nmodel TenantSetting';
if (schema.includes(marker)) {
  schema = schema.replace(marker, `${additions}${marker}`);
} else {
  schema += `\n${additions}\n`;
}

fs.writeFileSync(schemaPath, schema);
console.log('Added v6.3 shop return models to prisma/schema.prisma');
console.log('Next: npx prisma format && npx prisma validate && npx prisma migrate dev --name add_shop_returns_damage_expiry');
