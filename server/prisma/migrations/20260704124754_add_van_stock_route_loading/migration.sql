-- CreateTable
CREATE TABLE "VanStock" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VanStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanLoad" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "loadNo" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "routeId" TEXT,
    "warehouseId" TEXT,
    "employeeId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "loadDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VanLoad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanLoadItem" (
    "id" TEXT NOT NULL,
    "vanLoadId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "description" TEXT,
    "qtyLoaded" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qtyReturned" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qtyDamaged" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "qtyMissing" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "VanLoadItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanStockMovement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "loadId" TEXT,
    "routeId" TEXT,
    "warehouseId" TEXT,
    "type" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VanStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VanDailyClosing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "closingNo" TEXT NOT NULL,
    "vanId" TEXT NOT NULL,
    "routeId" TEXT,
    "employeeId" TEXT,
    "closingDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "loadedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "soldValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "returnedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "damagedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "missingValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "cashCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "chequeCollected" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "routeExpense" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VanDailyClosing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VanStock_tenantId_vanId_idx" ON "VanStock"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "VanStock_tenantId_productId_idx" ON "VanStock"("tenantId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "VanStock_tenantId_vanId_productId_key" ON "VanStock"("tenantId", "vanId", "productId");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_vanId_idx" ON "VanLoad"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_routeId_idx" ON "VanLoad"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_warehouseId_idx" ON "VanLoad"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_employeeId_idx" ON "VanLoad"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_status_idx" ON "VanLoad"("tenantId", "status");

-- CreateIndex
CREATE INDEX "VanLoad_tenantId_loadDate_idx" ON "VanLoad"("tenantId", "loadDate");

-- CreateIndex
CREATE UNIQUE INDEX "VanLoad_tenantId_loadNo_key" ON "VanLoad"("tenantId", "loadNo");

-- CreateIndex
CREATE INDEX "VanLoadItem_vanLoadId_idx" ON "VanLoadItem"("vanLoadId");

-- CreateIndex
CREATE INDEX "VanLoadItem_productId_idx" ON "VanLoadItem"("productId");

-- CreateIndex
CREATE INDEX "VanStockMovement_tenantId_vanId_idx" ON "VanStockMovement"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "VanStockMovement_tenantId_productId_idx" ON "VanStockMovement"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "VanStockMovement_tenantId_loadId_idx" ON "VanStockMovement"("tenantId", "loadId");

-- CreateIndex
CREATE INDEX "VanStockMovement_tenantId_type_idx" ON "VanStockMovement"("tenantId", "type");

-- CreateIndex
CREATE INDEX "VanStockMovement_tenantId_createdAt_idx" ON "VanStockMovement"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "VanDailyClosing_tenantId_vanId_idx" ON "VanDailyClosing"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "VanDailyClosing_tenantId_routeId_idx" ON "VanDailyClosing"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "VanDailyClosing_tenantId_employeeId_idx" ON "VanDailyClosing"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "VanDailyClosing_tenantId_closingDate_idx" ON "VanDailyClosing"("tenantId", "closingDate");

-- CreateIndex
CREATE INDEX "VanDailyClosing_tenantId_status_idx" ON "VanDailyClosing"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VanDailyClosing_tenantId_closingNo_key" ON "VanDailyClosing"("tenantId", "closingNo");

-- AddForeignKey
ALTER TABLE "VanLoadItem" ADD CONSTRAINT "VanLoadItem_vanLoadId_fkey" FOREIGN KEY ("vanLoadId") REFERENCES "VanLoad"("id") ON DELETE CASCADE ON UPDATE CASCADE;
