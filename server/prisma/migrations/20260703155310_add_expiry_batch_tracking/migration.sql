-- AlterTable
ALTER TABLE "GoodsReceivedNoteItem" ADD COLUMN     "batchNo" TEXT,
ADD COLUMN     "expiryDate" TIMESTAMP(3),
ADD COLUMN     "manufactureDate" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "batchId" TEXT;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowBatchTracking" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ProductBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "supplierId" TEXT,
    "grnId" TEXT,
    "batchNo" TEXT NOT NULL,
    "manufactureDate" TIMESTAMP(3),
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiryDate" TIMESTAMP(3),
    "qtyIn" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductBatchEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "quantity" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "refType" TEXT,
    "refId" TEXT,
    "notes" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductBatchEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_productId_idx" ON "ProductBatch"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_warehouseId_idx" ON "ProductBatch"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_supplierId_idx" ON "ProductBatch"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_grnId_idx" ON "ProductBatch"("tenantId", "grnId");

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_expiryDate_idx" ON "ProductBatch"("tenantId", "expiryDate");

-- CreateIndex
CREATE INDEX "ProductBatch_tenantId_status_idx" ON "ProductBatch"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProductBatch_tenantId_productId_warehouseId_batchNo_key" ON "ProductBatch"("tenantId", "productId", "warehouseId", "batchNo");

-- CreateIndex
CREATE INDEX "ProductBatchEvent_tenantId_action_idx" ON "ProductBatchEvent"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ProductBatchEvent_tenantId_eventDate_idx" ON "ProductBatchEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "ProductBatchEvent_batchId_idx" ON "ProductBatchEvent"("batchId");

-- CreateIndex
CREATE INDEX "StockMovement_tenantId_batchId_idx" ON "StockMovement"("tenantId", "batchId");

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatch" ADD CONSTRAINT "ProductBatch_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceivedNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatchEvent" ADD CONSTRAINT "ProductBatchEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductBatchEvent" ADD CONSTRAINT "ProductBatchEvent_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "ProductBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
