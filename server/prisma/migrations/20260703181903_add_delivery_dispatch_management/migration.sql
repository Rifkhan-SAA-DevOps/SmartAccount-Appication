-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowDelivery" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DeliveryOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "invoiceId" TEXT,
    "salesOrderId" TEXT,
    "assignedEmployeeId" TEXT,
    "deliveryNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledDate" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "contactName" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "deliveryFee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "codAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "collectedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "proofName" TEXT,
    "proofNote" TEXT,
    "gpsLink" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryOrderItem" (
    "id" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "deliveredQty" DECIMAL(12,3) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "DeliveryOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "notes" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_status_idx" ON "DeliveryOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_customerId_idx" ON "DeliveryOrder"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_invoiceId_idx" ON "DeliveryOrder"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_salesOrderId_idx" ON "DeliveryOrder"("tenantId", "salesOrderId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_assignedEmployeeId_idx" ON "DeliveryOrder"("tenantId", "assignedEmployeeId");

-- CreateIndex
CREATE INDEX "DeliveryOrder_tenantId_scheduledDate_idx" ON "DeliveryOrder"("tenantId", "scheduledDate");

-- CreateIndex
CREATE UNIQUE INDEX "DeliveryOrder_tenantId_deliveryNo_key" ON "DeliveryOrder"("tenantId", "deliveryNo");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_deliveryId_idx" ON "DeliveryOrderItem"("deliveryId");

-- CreateIndex
CREATE INDEX "DeliveryOrderItem_productId_idx" ON "DeliveryOrderItem"("productId");

-- CreateIndex
CREATE INDEX "DeliveryEvent_tenantId_action_idx" ON "DeliveryEvent"("tenantId", "action");

-- CreateIndex
CREATE INDEX "DeliveryEvent_tenantId_eventDate_idx" ON "DeliveryEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "DeliveryEvent_deliveryId_idx" ON "DeliveryEvent"("deliveryId");

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_salesOrderId_fkey" FOREIGN KEY ("salesOrderId") REFERENCES "SalesOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrder" ADD CONSTRAINT "DeliveryOrder_assignedEmployeeId_fkey" FOREIGN KEY ("assignedEmployeeId") REFERENCES "Employee"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryOrderItem" ADD CONSTRAINT "DeliveryOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryEvent" ADD CONSTRAINT "DeliveryEvent_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "DeliveryOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
