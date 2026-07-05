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

if (schema.includes('model TradeOffer') && schema.includes('model ShopPriceList')) {
  console.log('v6.4 trade offer / price list schema already exists. No schema change needed.');
  process.exit(0);
}

const additions = `
// ------------------------------
// v6.4 Trade Offers / Free Items / Shop Price Lists
// ------------------------------
model ShopPriceList {
  id             String   @id @default(uuid())
  tenantId       String
  priceNo        String
  productId      String
  shopId         String?
  customerId     String?
  routeId        String?
  priceType      String   @default("SHOP_SPECIAL")
  unitPrice      Decimal  @db.Decimal(12, 2)
  minQty         Decimal  @default(0) @db.Decimal(12, 3)
  validFrom      DateTime @default(now())
  validTo        DateTime?
  isActive       Boolean  @default(true)
  priority       Int      @default(10)
  notes          String?
  createdById    String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([tenantId, priceNo])
  @@index([tenantId, productId])
  @@index([tenantId, shopId])
  @@index([tenantId, customerId])
  @@index([tenantId, routeId])
  @@index([tenantId, priceType])
  @@index([tenantId, isActive])
  @@index([tenantId, validFrom])
}

model TradeOffer {
  id              String   @id @default(uuid())
  tenantId        String
  offerNo         String
  name            String
  offerType       String   @default("BUY_X_GET_Y")
  status          String   @default("ACTIVE")
  appliesTo       String   @default("ALL_SHOPS")
  priority        Int      @default(10)
  productId       String?
  freeProductId   String?
  shopId          String?
  customerId      String?
  routeId         String?
  customerGroup   String?
  minQty          Decimal  @default(0) @db.Decimal(12, 3)
  minAmount       Decimal  @default(0) @db.Decimal(12, 2)
  buyQty          Decimal  @default(0) @db.Decimal(12, 3)
  freeQty         Decimal  @default(0) @db.Decimal(12, 3)
  discountType    String   @default("NONE")
  discountValue   Decimal  @default(0) @db.Decimal(12, 2)
  startDate       DateTime @default(now())
  endDate         DateTime?
  usageLimit      Int?
  usedCount       Int      @default(0)
  notes           String?
  createdById     String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  redemptions     TradeOfferRedemption[]

  @@unique([tenantId, offerNo])
  @@index([tenantId, offerType])
  @@index([tenantId, status])
  @@index([tenantId, appliesTo])
  @@index([tenantId, productId])
  @@index([tenantId, freeProductId])
  @@index([tenantId, shopId])
  @@index([tenantId, customerId])
  @@index([tenantId, routeId])
  @@index([tenantId, startDate])
}

model TradeOfferRedemption {
  id              String   @id @default(uuid())
  tenantId        String
  tradeOfferId    String
  shopId          String?
  customerId      String?
  routeId         String?
  supplyInvoiceId String?
  redeemedAt      DateTime @default(now())
  appliedQty      Decimal  @default(0) @db.Decimal(12, 3)
  freeQty         Decimal  @default(0) @db.Decimal(12, 3)
  discountAmount  Decimal  @default(0) @db.Decimal(12, 2)
  notes           String?

  offer           TradeOffer @relation(fields: [tradeOfferId], references: [id], onDelete: Cascade)

  @@index([tenantId, tradeOfferId])
  @@index([tenantId, shopId])
  @@index([tenantId, routeId])
  @@index([tenantId, supplyInvoiceId])
  @@index([tenantId, redeemedAt])
}
`;

const marker = '\nmodel TenantSetting';
if (schema.includes(marker)) {
  schema = schema.replace(marker, `${additions}${marker}`);
} else {
  schema += `\n${additions}\n`;
}

fs.writeFileSync(schemaPath, schema);
console.log('Added v6.4 trade offer and shop price list models to prisma/schema.prisma');
console.log('Next: npx prisma format && npx prisma validate && npx prisma migrate dev --name add_trade_offers_price_lists');
