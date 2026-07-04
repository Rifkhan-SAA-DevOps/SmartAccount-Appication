-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowServiceJobs" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ServiceCatalogItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "estimatedMinutes" INTEGER NOT NULL DEFAULT 0,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceCatalogItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceAppointment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "appointmentNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "appointmentAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "location" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "appointmentId" TEXT,
    "warehouseId" TEXT,
    "jobNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "scheduledAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "laborCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "materialCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "chargeAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "invoiceId" TEXT,
    "materialsPosted" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobLine" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "lineType" TEXT NOT NULL DEFAULT 'SERVICE',
    "serviceItemId" TEXT,
    "productId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "costPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unitPrice" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ServiceJobLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceJobEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT,
    "notes" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ServiceJobEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_tenantId_category_idx" ON "ServiceCatalogItem"("tenantId", "category");

-- CreateIndex
CREATE INDEX "ServiceCatalogItem_tenantId_isActive_idx" ON "ServiceCatalogItem"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceCatalogItem_tenantId_code_key" ON "ServiceCatalogItem"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ServiceAppointment_tenantId_appointmentAt_idx" ON "ServiceAppointment"("tenantId", "appointmentAt");

-- CreateIndex
CREATE INDEX "ServiceAppointment_tenantId_status_idx" ON "ServiceAppointment"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ServiceAppointment_tenantId_customerId_idx" ON "ServiceAppointment"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceAppointment_tenantId_appointmentNo_key" ON "ServiceAppointment"("tenantId", "appointmentNo");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_status_idx" ON "ServiceJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_priority_idx" ON "ServiceJob"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_customerId_idx" ON "ServiceJob"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_scheduledAt_idx" ON "ServiceJob"("tenantId", "scheduledAt");

-- CreateIndex
CREATE INDEX "ServiceJob_tenantId_dueAt_idx" ON "ServiceJob"("tenantId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceJob_tenantId_jobNo_key" ON "ServiceJob"("tenantId", "jobNo");

-- CreateIndex
CREATE INDEX "ServiceJobLine_jobId_idx" ON "ServiceJobLine"("jobId");

-- CreateIndex
CREATE INDEX "ServiceJobLine_serviceItemId_idx" ON "ServiceJobLine"("serviceItemId");

-- CreateIndex
CREATE INDEX "ServiceJobLine_productId_idx" ON "ServiceJobLine"("productId");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_tenantId_action_idx" ON "ServiceJobEvent"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_tenantId_eventDate_idx" ON "ServiceJobEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "ServiceJobEvent_jobId_idx" ON "ServiceJobEvent"("jobId");

-- AddForeignKey
ALTER TABLE "ServiceCatalogItem" ADD CONSTRAINT "ServiceCatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceAppointment" ADD CONSTRAINT "ServiceAppointment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJob" ADD CONSTRAINT "ServiceJob_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "ServiceAppointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_serviceItemId_fkey" FOREIGN KEY ("serviceItemId") REFERENCES "ServiceCatalogItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobLine" ADD CONSTRAINT "ServiceJobLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobEvent" ADD CONSTRAINT "ServiceJobEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceJobEvent" ADD CONSTRAINT "ServiceJobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ServiceJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;
