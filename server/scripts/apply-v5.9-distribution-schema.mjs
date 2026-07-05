import fs from 'fs';
import path from 'path';

const schemaPath = path.resolve('prisma/schema.prisma');
if (!fs.existsSync(schemaPath)) {
  console.error('Cannot find prisma/schema.prisma. Run this from the server folder.');
  process.exit(1);
}

let schema = fs.readFileSync(schemaPath, 'utf8');
if (schema.includes('model DistributionRoute')) {
  console.log('v5.9 distribution schema already exists. No schema change needed.');
  process.exit(0);
}

const additions = `
// ------------------------------
// v5.9 Wholesale Distribution & Shop Supply Foundation
// ------------------------------
model DistributionRoute {
  id                 String   @id @default(uuid())
  tenantId           String
  routeNo            String
  name               String
  area               String?
  assignedEmployeeId String?
  targetDailySales   Decimal  @default(0) @db.Decimal(12, 2)
  notes              String?
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([tenantId, routeNo])
  @@index([tenantId, isActive])
  @@index([tenantId, assignedEmployeeId])
}

model ShopProfile {
  id                 String   @id @default(uuid())
  tenantId           String
  customerId         String?
  routeId            String?
  assignedEmployeeId String?
  shopCode           String
  shopName           String
  ownerName          String?
  phone              String?
  address            String?
  area               String?
  category           String   @default("Retail Shop")
  paymentTerms       String   @default("Credit")
  creditLimit        Decimal  @default(0) @db.Decimal(12, 2)
  currentOutstanding Decimal  @default(0) @db.Decimal(12, 2)
  creditDays         Int      @default(7)
  visitFrequency     String   @default("Weekly")
  mapUrl             String?
  isBlocked          Boolean  @default(false)
  isActive           Boolean  @default(true)
  createdAt          DateTime @default(now())
  updatedAt          DateTime @updatedAt

  @@unique([tenantId, shopCode])
  @@index([tenantId, customerId])
  @@index([tenantId, routeId])
  @@index([tenantId, assignedEmployeeId])
  @@index([tenantId, isBlocked])
  @@index([tenantId, area])
}

model ShopVisit {
  id                String   @id @default(uuid())
  tenantId          String
  visitNo           String
  shopId            String
  routeId           String?
  employeeId        String?
  plannedAt         DateTime @default(now())
  visitedAt         DateTime?
  status            String   @default("PLANNED")
  orderTaken        Boolean  @default(false)
  collectionPromise Decimal  @default(0) @db.Decimal(12, 2)
  nextFollowUpAt    DateTime?
  noOrderReason     String?
  notes             String?
  createdById       String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([tenantId, visitNo])
  @@index([tenantId, shopId])
  @@index([tenantId, routeId])
  @@index([tenantId, employeeId])
  @@index([tenantId, plannedAt])
  @@index([tenantId, status])
}

model ShopCollection {
  id           String        @id @default(uuid())
  tenantId     String
  collectionNo String
  shopId       String
  customerId   String?
  routeId      String?
  employeeId   String?
  amount       Decimal       @db.Decimal(12, 2)
  method       PaymentMethod @default(CASH)
  reference    String?
  notes        String?
  collectedAt  DateTime      @default(now())
  createdById  String?
  createdAt    DateTime      @default(now())

  @@unique([tenantId, collectionNo])
  @@index([tenantId, shopId])
  @@index([tenantId, customerId])
  @@index([tenantId, routeId])
  @@index([tenantId, employeeId])
  @@index([tenantId, collectedAt])
}

model DistributionVan {
  id               String   @id @default(uuid())
  tenantId         String
  vanNo            String
  name             String
  vehicleNo        String?
  driverEmployeeId String?
  routeId          String?
  capacityNotes    String?
  isActive         Boolean  @default(true)
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@unique([tenantId, vanNo])
  @@index([tenantId, vehicleNo])
  @@index([tenantId, driverEmployeeId])
  @@index([tenantId, routeId])
  @@index([tenantId, isActive])
}
`;

const marker = '\nmodel TenantSetting';
if (schema.includes(marker)) {
  schema = schema.replace(marker, `${additions}${marker}`);
} else {
  schema += `\n${additions}\n`;
}

fs.writeFileSync(schemaPath, schema);
console.log('Added v5.9 distribution models to prisma/schema.prisma');
console.log('Next: npx prisma format && npx prisma validate && npx prisma migrate dev --name add_distribution_foundation');
