-- CreateTable
CREATE TABLE "ShopSupplyInvoice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplyNo" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "customerId" TEXT,
    "routeId" TEXT,
    "employeeId" TEXT,
    "vanId" TEXT,
    "warehouseId" TEXT,
    "invoiceId" TEXT,
    "deliveryOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "supplyDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueDate" TIMESTAMP(3),
    "subtotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "tax" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CREDIT',
    "createDelivery" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSupplyInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSupplyInvoiceItem" (
    "id" TEXT NOT NULL,
    "supplyInvoiceId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "freeQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ShopSupplyInvoiceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_shopId_idx" ON "ShopSupplyInvoice"("tenantId", "shopId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_routeId_idx" ON "ShopSupplyInvoice"("tenantId", "routeId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_employeeId_idx" ON "ShopSupplyInvoice"("tenantId", "employeeId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_vanId_idx" ON "ShopSupplyInvoice"("tenantId", "vanId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_warehouseId_idx" ON "ShopSupplyInvoice"("tenantId", "warehouseId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_status_idx" ON "ShopSupplyInvoice"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_supplyDate_idx" ON "ShopSupplyInvoice"("tenantId", "supplyDate");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoice_tenantId_deliveryOrderId_idx" ON "ShopSupplyInvoice"("tenantId", "deliveryOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "ShopSupplyInvoice_tenantId_supplyNo_key" ON "ShopSupplyInvoice"("tenantId", "supplyNo");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoiceItem_supplyInvoiceId_idx" ON "ShopSupplyInvoiceItem"("supplyInvoiceId");

-- CreateIndex
CREATE INDEX "ShopSupplyInvoiceItem_productId_idx" ON "ShopSupplyInvoiceItem"("productId");

-- AddForeignKey
ALTER TABLE "ShopSupplyInvoiceItem" ADD CONSTRAINT "ShopSupplyInvoiceItem_supplyInvoiceId_fkey" FOREIGN KEY ("supplyInvoiceId") REFERENCES "ShopSupplyInvoice"("id") ON DELETE CASCADE ON UPDATE CASCADE;
