-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowCrm" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CrmPipelineStage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "probability" INTEGER NOT NULL DEFAULT 0,
    "color" TEXT,
    "isWon" BOOLEAN NOT NULL DEFAULT false,
    "isLost" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmPipelineStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLead" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stageId" TEXT,
    "customerId" TEXT,
    "leadNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "companyName" TEXT,
    "contactName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "source" TEXT NOT NULL DEFAULT 'Walk-in',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "probability" INTEGER NOT NULL DEFAULT 0,
    "expectedValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedCloseDate" TIMESTAMP(3),
    "nextFollowUpAt" TIMESTAMP(3),
    "assignedToId" TEXT,
    "notes" TEXT,
    "lostReason" TEXT,
    "wonAt" TIMESTAMP(3),
    "lostAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmLeadActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'NOTE',
    "subject" TEXT NOT NULL,
    "notes" TEXT,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "outcome" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CrmLeadActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CrmPipelineStage_tenantId_sortOrder_idx" ON "CrmPipelineStage"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "CrmPipelineStage_tenantId_isActive_idx" ON "CrmPipelineStage"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CrmPipelineStage_tenantId_name_key" ON "CrmPipelineStage"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_status_idx" ON "CrmLead"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_priority_idx" ON "CrmLead"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_stageId_idx" ON "CrmLead"("tenantId", "stageId");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_customerId_idx" ON "CrmLead"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_nextFollowUpAt_idx" ON "CrmLead"("tenantId", "nextFollowUpAt");

-- CreateIndex
CREATE INDEX "CrmLead_tenantId_expectedCloseDate_idx" ON "CrmLead"("tenantId", "expectedCloseDate");

-- CreateIndex
CREATE UNIQUE INDEX "CrmLead_tenantId_leadNo_key" ON "CrmLead"("tenantId", "leadNo");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_tenantId_type_idx" ON "CrmLeadActivity"("tenantId", "type");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_tenantId_dueAt_idx" ON "CrmLeadActivity"("tenantId", "dueAt");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_tenantId_completedAt_idx" ON "CrmLeadActivity"("tenantId", "completedAt");

-- CreateIndex
CREATE INDEX "CrmLeadActivity_leadId_idx" ON "CrmLeadActivity"("leadId");

-- AddForeignKey
ALTER TABLE "CrmPipelineStage" ADD CONSTRAINT "CrmPipelineStage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "CrmPipelineStage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLead" ADD CONSTRAINT "CrmLead_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadActivity" ADD CONSTRAINT "CrmLeadActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmLeadActivity" ADD CONSTRAINT "CrmLeadActivity_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "CrmLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
