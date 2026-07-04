-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowProjects" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "customerId" TEXT,
    "crmLeadId" TEXT,
    "serviceJobId" TEXT,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PLANNED',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "startDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "budget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "projectId" TEXT,
    "taskNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'TODO',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedUserId" TEXT,
    "assignedEmployeeId" TEXT,
    "customerId" TEXT,
    "crmLeadId" TEXT,
    "serviceJobId" TEXT,
    "quotationId" TEXT,
    "salesOrderId" TEXT,
    "startAt" TIMESTAMP(3),
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "estimatedHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "actualHours" DECIMAL(8,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProjectTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskComment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "comment" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTaskComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectTaskActivity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectTaskActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Project_tenantId_status_idx" ON "Project"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Project_tenantId_priority_idx" ON "Project"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "Project_tenantId_customerId_idx" ON "Project"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Project_tenantId_crmLeadId_idx" ON "Project"("tenantId", "crmLeadId");

-- CreateIndex
CREATE INDEX "Project_tenantId_dueDate_idx" ON "Project"("tenantId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "Project_tenantId_projectNo_key" ON "Project"("tenantId", "projectNo");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_status_idx" ON "ProjectTask"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_priority_idx" ON "ProjectTask"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_projectId_idx" ON "ProjectTask"("tenantId", "projectId");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_assignedUserId_idx" ON "ProjectTask"("tenantId", "assignedUserId");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_assignedEmployeeId_idx" ON "ProjectTask"("tenantId", "assignedEmployeeId");

-- CreateIndex
CREATE INDEX "ProjectTask_tenantId_dueAt_idx" ON "ProjectTask"("tenantId", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectTask_tenantId_taskNo_key" ON "ProjectTask"("tenantId", "taskNo");

-- CreateIndex
CREATE INDEX "ProjectTaskComment_tenantId_taskId_idx" ON "ProjectTaskComment"("tenantId", "taskId");

-- CreateIndex
CREATE INDEX "ProjectTaskComment_tenantId_createdAt_idx" ON "ProjectTaskComment"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTaskActivity_tenantId_action_idx" ON "ProjectTaskActivity"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ProjectTaskActivity_tenantId_createdAt_idx" ON "ProjectTaskActivity"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "ProjectTaskActivity_taskId_idx" ON "ProjectTaskActivity"("taskId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTask" ADD CONSTRAINT "ProjectTask_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskComment" ADD CONSTRAINT "ProjectTaskComment_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskActivity" ADD CONSTRAINT "ProjectTaskActivity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectTaskActivity" ADD CONSTRAINT "ProjectTaskActivity_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "ProjectTask"("id") ON DELETE CASCADE ON UPDATE CASCADE;
