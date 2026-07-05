-- CreateTable
CREATE TABLE "DistributionRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "routeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "area" TEXT,
    "assignedEmployeeId" TEXT,
    "targetDailySales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopProfile" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "routeId" TEXT,
    "assignedEmployeeId" TEXT,
    "shopCode" TEXT NOT NULL,
    "shopName" TEXT NOT NULL,
    "ownerName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "area" TEXT,
    "category" TEXT NOT NULL DEFAULT 'Retail Shop',
    "paymentTerms" TEXT NOT NULL DEFAULT 'Credit',
    "creditLimit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "currentOutstanding" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditDays" INTEGER NOT NULL DEFAULT 7,
    "visitFrequency" TEXT NOT NULL DEFAULT 'Weekly',
    "mapUrl" TEXT,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopVisit" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "visitNo" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "routeId" TEXT,
    "employeeId" TEXT,
    "plannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "visitedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "orderTaken" BOOLEAN NOT NULL DEFAULT false,
    "collectionPromise" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nextFollowUpAt" TIMESTAMP(3),
    "noOrderReason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopVisit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopCollection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collectionNo" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "routeId" TEXT,
    "employeeId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShopCollection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DistributionVan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vanNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vehicleNo" TEXT,
    "driverEmployeeId" TEXT,
    "routeId" TEXT,
    "capacityNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DistributionVan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DistributionRoute_tenantId_isActive_idx" ON "DistributionRoute"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "DistributionRoute_tenantId_assignedEmployeeId_idx" ON "DistributionRoute"("tenantId", "assignedEmployeeId");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionRoute_tenantId_routeNo_key" ON "DistributionRoute"("tenantId", "routeNo");

-- CreateIndex
CREATE INDEX "ShopProfile_tenantId_customerId_idx" ON "ShopProfile"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ShopProfile_tenantId_routeId_idx" ON "ShopProfile"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopProfile_tenantId_assignedEmployeeId_idx" ON "ShopProfile"("tenantId", "assignedEmployeeId");

-- CreateIndex
CREATE INDEX "ShopProfile_tenantId_isBlocked_idx" ON "ShopProfile"("tenantId", "isBlocked");

-- CreateIndex
CREATE INDEX "ShopProfile_tenantId_area_idx" ON "ShopProfile"("tenantId", "area");

-- CreateIndex
CREATE UNIQUE INDEX "ShopProfile_tenantId_shopCode_key" ON "ShopProfile"("tenantId", "shopCode");

-- CreateIndex
CREATE INDEX "ShopVisit_tenantId_shopId_idx" ON "ShopVisit"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "ShopVisit_tenantId_routeId_idx" ON "ShopVisit"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopVisit_tenantId_employeeId_idx" ON "ShopVisit"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ShopVisit_tenantId_plannedAt_idx" ON "ShopVisit"("tenantId", "plannedAt");

-- CreateIndex
CREATE INDEX "ShopVisit_tenantId_status_idx" ON "ShopVisit"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ShopVisit_tenantId_visitNo_key" ON "ShopVisit"("tenantId", "visitNo");

-- CreateIndex
CREATE INDEX "ShopCollection_tenantId_shopId_idx" ON "ShopCollection"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "ShopCollection_tenantId_customerId_idx" ON "ShopCollection"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ShopCollection_tenantId_routeId_idx" ON "ShopCollection"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopCollection_tenantId_employeeId_idx" ON "ShopCollection"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ShopCollection_tenantId_collectedAt_idx" ON "ShopCollection"("tenantId", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ShopCollection_tenantId_collectionNo_key" ON "ShopCollection"("tenantId", "collectionNo");

-- CreateIndex
CREATE INDEX "DistributionVan_tenantId_vehicleNo_idx" ON "DistributionVan"("tenantId", "vehicleNo");

-- CreateIndex
CREATE INDEX "DistributionVan_tenantId_driverEmployeeId_idx" ON "DistributionVan"("tenantId", "driverEmployeeId");

-- CreateIndex
CREATE INDEX "DistributionVan_tenantId_routeId_idx" ON "DistributionVan"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "DistributionVan_tenantId_isActive_idx" ON "DistributionVan"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "DistributionVan_tenantId_vanNo_key" ON "DistributionVan"("tenantId", "vanNo");
