-- CreateTable
CREATE TABLE "ShopPriceList" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "priceNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "shopId" TEXT,
    "customerId" TEXT,
    "routeId" TEXT,
    "priceType" TEXT NOT NULL DEFAULT 'SHOP_SPECIAL',
    "unitPrice" DECIMAL(12,2) NOT NULL,
    "minQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validTo" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 10,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopPriceList_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOffer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "offerNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "offerType" TEXT NOT NULL DEFAULT 'BUY_X_GET_Y',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "appliesTo" TEXT NOT NULL DEFAULT 'ALL_SHOPS',
    "priority" INTEGER NOT NULL DEFAULT 10,
    "productId" TEXT,
    "freeProductId" TEXT,
    "shopId" TEXT,
    "customerId" TEXT,
    "routeId" TEXT,
    "customerGroup" TEXT,
    "minQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "minAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "buyQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "freeQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "discountType" TEXT NOT NULL DEFAULT 'NONE',
    "discountValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate" TIMESTAMP(3),
    "usageLimit" INTEGER,
    "usedCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeOfferRedemption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tradeOfferId" TEXT NOT NULL,
    "shopId" TEXT,
    "customerId" TEXT,
    "routeId" TEXT,
    "supplyInvoiceId" TEXT,
    "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "appliedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "freeQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "TradeOfferRedemption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_productId_idx" ON "ShopPriceList"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_shopId_idx" ON "ShopPriceList"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_customerId_idx" ON "ShopPriceList"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_routeId_idx" ON "ShopPriceList"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_priceType_idx" ON "ShopPriceList"("tenantId", "priceType");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_isActive_idx" ON "ShopPriceList"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ShopPriceList_tenantId_validFrom_idx" ON "ShopPriceList"("tenantId", "validFrom");

-- CreateIndex
CREATE UNIQUE INDEX "ShopPriceList_tenantId_priceNo_key" ON "ShopPriceList"("tenantId", "priceNo");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_offerType_idx" ON "TradeOffer"("tenantId", "offerType");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_status_idx" ON "TradeOffer"("tenantId", "status");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_appliesTo_idx" ON "TradeOffer"("tenantId", "appliesTo");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_productId_idx" ON "TradeOffer"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_freeProductId_idx" ON "TradeOffer"("tenantId", "freeProductId");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_shopId_idx" ON "TradeOffer"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_customerId_idx" ON "TradeOffer"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_routeId_idx" ON "TradeOffer"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "TradeOffer_tenantId_startDate_idx" ON "TradeOffer"("tenantId", "startDate");

-- CreateIndex
CREATE UNIQUE INDEX "TradeOffer_tenantId_offerNo_key" ON "TradeOffer"("tenantId", "offerNo");

-- CreateIndex
CREATE INDEX "TradeOfferRedemption_tenantId_tradeOfferId_idx" ON "TradeOfferRedemption"("tenantId", "tradeOfferId");

-- CreateIndex
CREATE INDEX "TradeOfferRedemption_tenantId_shopId_idx" ON "TradeOfferRedemption"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "TradeOfferRedemption_tenantId_routeId_idx" ON "TradeOfferRedemption"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "TradeOfferRedemption_tenantId_supplyInvoiceId_idx" ON "TradeOfferRedemption"("tenantId", "supplyInvoiceId");

-- CreateIndex
CREATE INDEX "TradeOfferRedemption_tenantId_redeemedAt_idx" ON "TradeOfferRedemption"("tenantId", "redeemedAt");

-- AddForeignKey
ALTER TABLE "TradeOfferRedemption" ADD CONSTRAINT "TradeOfferRedemption_tradeOfferId_fkey" FOREIGN KEY ("tradeOfferId") REFERENCES "TradeOffer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
