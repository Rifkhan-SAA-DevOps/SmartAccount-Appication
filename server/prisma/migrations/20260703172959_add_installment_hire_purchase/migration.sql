-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowInstallments" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "InstallmentPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "planNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "principalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "downPayment" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "financedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interestRate" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "interestAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPayable" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "installmentCount" INTEGER NOT NULL DEFAULT 1,
    "frequency" TEXT NOT NULL DEFAULT 'MONTHLY',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "nextDueDate" TIMESTAMP(3),
    "penaltyRate" DECIMAL(8,3) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentSchedule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "installmentNo" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "interest" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penalty" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DUE',
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstallmentSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InstallmentPayment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "customerId" TEXT NOT NULL,
    "paymentId" TEXT,
    "bankAccountId" TEXT,
    "receiptNo" TEXT,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "penaltyPaid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL DEFAULT 'CASH',
    "reference" TEXT,
    "notes" TEXT,
    "paidAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InstallmentPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InstallmentPlan_tenantId_customerId_idx" ON "InstallmentPlan"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_tenantId_invoiceId_idx" ON "InstallmentPlan"("tenantId", "invoiceId");

-- CreateIndex
CREATE INDEX "InstallmentPlan_tenantId_status_idx" ON "InstallmentPlan"("tenantId", "status");

-- CreateIndex
CREATE INDEX "InstallmentPlan_tenantId_nextDueDate_idx" ON "InstallmentPlan"("tenantId", "nextDueDate");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentPlan_tenantId_planNo_key" ON "InstallmentPlan"("tenantId", "planNo");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_tenantId_dueDate_idx" ON "InstallmentSchedule"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "InstallmentSchedule_tenantId_status_idx" ON "InstallmentSchedule"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "InstallmentSchedule_planId_installmentNo_key" ON "InstallmentSchedule"("planId", "installmentNo");

-- CreateIndex
CREATE INDEX "InstallmentPayment_tenantId_planId_idx" ON "InstallmentPayment"("tenantId", "planId");

-- CreateIndex
CREATE INDEX "InstallmentPayment_tenantId_customerId_idx" ON "InstallmentPayment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "InstallmentPayment_tenantId_paidAt_idx" ON "InstallmentPayment"("tenantId", "paidAt");

-- CreateIndex
CREATE INDEX "InstallmentPayment_tenantId_scheduleId_idx" ON "InstallmentPayment"("tenantId", "scheduleId");

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPlan" ADD CONSTRAINT "InstallmentPlan_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedule" ADD CONSTRAINT "InstallmentSchedule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentSchedule" ADD CONSTRAINT "InstallmentSchedule_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_planId_fkey" FOREIGN KEY ("planId") REFERENCES "InstallmentPlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "InstallmentSchedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstallmentPayment" ADD CONSTRAINT "InstallmentPayment_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
