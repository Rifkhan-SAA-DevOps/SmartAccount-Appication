import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve('prisma/schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('Cannot find prisma/schema.prisma. Run this from the server folder.');
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, 'utf8');

if (!schema.includes('model DistributionVan')) {
  console.error('v5.9 distribution foundation models are missing. Apply v5.9 first, then run this script again.');
  process.exit(1);
}

if (schema.includes('model VanStock')) {
  console.log('v6.2 van stock schema already exists. No schema change needed.');
  process.exit(0);
}

const additions = `
// ------------------------------
// v6.2 Van Stock / Route Stock Loading
// ------------------------------
model VanStock {
  id          String   @id @default(uuid())
  tenantId    String
  vanId       String
  productId   String
  quantity    Decimal  @default(0) @db.Decimal(12, 3)
  reservedQty Decimal  @default(0) @db.Decimal(12, 3)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, vanId, productId])
  @@index([tenantId, vanId])
  @@index([tenantId, productId])
}

model VanLoad {
  id          String   @id @default(uuid())
  tenantId    String
  loadNo      String
  vanId       String
  routeId     String?
  warehouseId String?
  employeeId  String?
  status      String   @default("DRAFT")
  loadDate    DateTime @default(now())
  postedAt    DateTime?
  closedAt    DateTime?
  notes       String?
  createdById String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items       VanLoadItem[]

  @@unique([tenantId, loadNo])
  @@index([tenantId, vanId])
  @@index([tenantId, routeId])
  @@index([tenantId, warehouseId])
  @@index([tenantId, employeeId])
  @@index([tenantId, status])
  @@index([tenantId, loadDate])
}

model VanLoadItem {
  id          String  @id @default(uuid())
  vanLoadId   String
  productId   String
  description String?
  qtyLoaded   Decimal @default(0) @db.Decimal(12, 3)
  qtyReturned Decimal @default(0) @db.Decimal(12, 3)
  qtyDamaged  Decimal @default(0) @db.Decimal(12, 3)
  qtyMissing  Decimal @default(0) @db.Decimal(12, 3)
  unitCost    Decimal @default(0) @db.Decimal(12, 2)
  notes       String?

  vanLoad VanLoad @relation(fields: [vanLoadId], references: [id], onDelete: Cascade)

  @@index([vanLoadId])
  @@index([productId])
}

model VanStockMovement {
  id          String   @id @default(uuid())
  tenantId    String
  vanId       String
  productId   String
  loadId      String?
  routeId     String?
  warehouseId String?
  type        String
  quantity    Decimal  @db.Decimal(12, 3)
  unitCost    Decimal  @default(0) @db.Decimal(12, 2)
  refType     String?
  refId       String?
  notes       String?
  createdAt   DateTime @default(now())

  @@index([tenantId, vanId])
  @@index([tenantId, productId])
  @@index([tenantId, loadId])
  @@index([tenantId, type])
  @@index([tenantId, createdAt])
}

model VanDailyClosing {
  id             String   @id @default(uuid())
  tenantId       String
  closingNo      String
  vanId          String
  routeId        String?
  employeeId     String?
  closingDate    DateTime @default(now())
  openingValue   Decimal  @default(0) @db.Decimal(12, 2)
  loadedValue    Decimal  @default(0) @db.Decimal(12, 2)
  soldValue      Decimal  @default(0) @db.Decimal(12, 2)
  returnedValue  Decimal  @default(0) @db.Decimal(12, 2)
  damagedValue   Decimal  @default(0) @db.Decimal(12, 2)
  missingValue   Decimal  @default(0) @db.Decimal(12, 2)
  cashCollected  Decimal  @default(0) @db.Decimal(12, 2)
  chequeCollected Decimal @default(0) @db.Decimal(12, 2)
  creditSales    Decimal  @default(0) @db.Decimal(12, 2)
  routeExpense   Decimal  @default(0) @db.Decimal(12, 2)
  status         String   @default("DRAFT")
  notes          String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([tenantId, closingNo])
  @@index([tenantId, vanId])
  @@index([tenantId, routeId])
  @@index([tenantId, employeeId])
  @@index([tenantId, closingDate])
  @@index([tenantId, status])
}
`;

const marker = '\nmodel TenantSetting';
if (schema.includes(marker)) {
  schema = schema.replace(marker, `${additions}${marker}`);
} else {
  schema += `\n${additions}\n`;
}

fs.writeFileSync(schemaPath, schema);
console.log('Added v6.2 van stock models to prisma/schema.prisma');
console.log('Next: npx prisma format && npx prisma validate && npx prisma migrate dev --name add_van_stock_route_loading');
