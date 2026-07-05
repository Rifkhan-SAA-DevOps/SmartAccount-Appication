-- CreateTable
CREATE TABLE "ShopReturn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "returnNo" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "routeId" TEXT,
    "employeeId" TEXT,
    "vanId" TEXT,
    "warehouseId" TEXT,
    "supplyInvoiceId" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "returnType" TEXT NOT NULL DEFAULT 'DAMAGED',
    "stockAction" TEXT NOT NULL DEFAULT 'HOLD',
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "creditAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "reason" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "postedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopReturnItem" (
    "id" TEXT NOT NULL,
    "shopReturnId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "condition" TEXT NOT NULL DEFAULT 'DAMAGED',
    "batchNo" TEXT,
    "expiryDate" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "ShopReturnItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_shopId_idx" ON "ShopReturn"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_customerId_idx" ON "ShopReturn"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_routeId_idx" ON "ShopReturn"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_employeeId_idx" ON "ShopReturn"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_vanId_idx" ON "ShopReturn"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_warehouseId_idx" ON "ShopReturn"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_supplyInvoiceId_idx" ON "ShopReturn"("tenantId", "supplyInvoiceId");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_returnDate_idx" ON "ShopReturn"("tenantId", "returnDate");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_status_idx" ON "ShopReturn"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ShopReturn_tenantId_returnType_idx" ON "ShopReturn"("tenantId", "returnType");

-- CreateIndex
CREATE UNIQUE INDEX "ShopReturn_tenantId_returnNo_key" ON "ShopReturn"("tenantId", "returnNo");

-- CreateIndex
CREATE INDEX "ShopReturnItem_shopReturnId_idx" ON "ShopReturnItem"("shopReturnId");

-- CreateIndex
CREATE INDEX "ShopReturnItem_productId_idx" ON "ShopReturnItem"("productId");

-- CreateIndex
CREATE INDEX "ShopReturnItem_condition_idx" ON "ShopReturnItem"("condition");

-- AddForeignKey
ALTER TABLE "ShopReturnItem" ADD CONSTRAINT "ShopReturnItem_shopReturnId_fkey" FOREIGN KEY ("shopReturnId") REFERENCES "ShopReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;
