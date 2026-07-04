-- CreateTable
CREATE TABLE "ProductSerial" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "serialNo" TEXT NOT NULL,
    "imei1" TEXT,
    "imei2" TEXT,
    "batchNo" TEXT,
    "warrantyStartAt" TIMESTAMP(3),
    "warrantyEndAt" TIMESTAMP(3),
    "purchaseRefType" TEXT,
    "purchaseRefId" TEXT,
    "saleRefType" TEXT,
    "saleRefId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSerialEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serialId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "fromWarehouseId" TEXT,
    "toWarehouseId" TEXT,
    "customerId" TEXT,
    "supplierId" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "notes" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductSerialEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WarrantyClaim" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "serialId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "customerId" TEXT,
    "claimNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "issueDescription" TEXT NOT NULL,
    "resolution" TEXT,
    "serviceCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WarrantyClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_productId_idx" ON "ProductSerial"("tenantId", "productId");

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_warehouseId_idx" ON "ProductSerial"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_customerId_idx" ON "ProductSerial"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_supplierId_idx" ON "ProductSerial"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_status_idx" ON "ProductSerial"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProductSerial_tenantId_warrantyEndAt_idx" ON "ProductSerial"("tenantId", "warrantyEndAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSerial_tenantId_serialNo_key" ON "ProductSerial"("tenantId", "serialNo");

-- CreateIndex
CREATE INDEX "ProductSerialEvent_tenantId_action_idx" ON "ProductSerialEvent"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ProductSerialEvent_tenantId_eventDate_idx" ON "ProductSerialEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "ProductSerialEvent_serialId_idx" ON "ProductSerialEvent"("serialId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_tenantId_status_idx" ON "WarrantyClaim"("tenantId", "status");

-- CreateIndex
CREATE INDEX "WarrantyClaim_tenantId_receivedAt_idx" ON "WarrantyClaim"("tenantId", "receivedAt");

-- CreateIndex
CREATE INDEX "WarrantyClaim_tenantId_customerId_idx" ON "WarrantyClaim"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "WarrantyClaim_serialId_idx" ON "WarrantyClaim"("serialId");

-- CreateIndex
CREATE UNIQUE INDEX "WarrantyClaim_tenantId_claimNo_key" ON "WarrantyClaim"("tenantId", "claimNo");

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerial" ADD CONSTRAINT "ProductSerial_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerialEvent" ADD CONSTRAINT "ProductSerialEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSerialEvent" ADD CONSTRAINT "ProductSerialEvent_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ProductSerial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_serialId_fkey" FOREIGN KEY ("serialId") REFERENCES "ProductSerial"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WarrantyClaim" ADD CONSTRAINT "WarrantyClaim_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
