-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowBankReconciliation" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "allowFixedAssets" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "BankStatement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "importNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "statementDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "openingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalDebit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCredit" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankStatement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankStatementLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "transactionDate" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "reference" TEXT,
    "direction" "PaymentDirection" NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balanceAfter" DECIMAL(12,2),
    "isMatched" BOOLEAN NOT NULL DEFAULT false,
    "matchedAt" TIMESTAMP(3),
    "ignored" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankStatementLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliationMatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "statementLineId" TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'MANUAL',
    "amount" DECIMAL(12,2) NOT NULL,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "matchedById" TEXT,
    "matchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankReconciliationMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankReconciliation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "reconciliationNo" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "statementClosingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "systemClosingBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "matchedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unreconciledAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "difference" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankReconciliation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "supplierId" TEXT,
    "assetNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'General',
    "serialNo" TEXT,
    "location" TEXT,
    "custodianEmployeeId" TEXT,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "purchaseCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salvageValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "usefulLifeMonths" INTEGER NOT NULL DEFAULT 60,
    "depreciationMethod" TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    "accumulatedDepreciation" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bookValue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "warrantyUntil" TIMESTAMP(3),
    "nextMaintenanceDate" TIMESTAMP(3),
    "disposalDate" TIMESTAMP(3),
    "disposalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "disposalGainLoss" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetDepreciation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "depreciationDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "accumulatedAfter" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "bookValueAfter" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "journalEntryId" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FixedAssetDepreciation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FixedAssetMaintenance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "maintenanceDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vendor" TEXT,
    "description" TEXT NOT NULL,
    "cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "nextMaintenanceDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FixedAssetMaintenance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankStatement_tenantId_bankAccountId_idx" ON "BankStatement"("tenantId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankStatement_tenantId_statementDate_idx" ON "BankStatement"("tenantId", "statementDate");

-- CreateIndex
CREATE INDEX "BankStatement_tenantId_status_idx" ON "BankStatement"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "BankStatement_tenantId_importNo_key" ON "BankStatement"("tenantId", "importNo");

-- CreateIndex
CREATE INDEX "BankStatementLine_tenantId_statementId_idx" ON "BankStatementLine"("tenantId", "statementId");

-- CreateIndex
CREATE INDEX "BankStatementLine_tenantId_bankAccountId_idx" ON "BankStatementLine"("tenantId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankStatementLine_tenantId_transactionDate_idx" ON "BankStatementLine"("tenantId", "transactionDate");

-- CreateIndex
CREATE INDEX "BankStatementLine_tenantId_isMatched_idx" ON "BankStatementLine"("tenantId", "isMatched");

-- CreateIndex
CREATE INDEX "BankReconciliationMatch_tenantId_bankAccountId_idx" ON "BankReconciliationMatch"("tenantId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankReconciliationMatch_tenantId_matchedAt_idx" ON "BankReconciliationMatch"("tenantId", "matchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliationMatch_statementLineId_bankTransactionId_key" ON "BankReconciliationMatch"("statementLineId", "bankTransactionId");

-- CreateIndex
CREATE INDEX "BankReconciliation_tenantId_bankAccountId_idx" ON "BankReconciliation"("tenantId", "bankAccountId");

-- CreateIndex
CREATE INDEX "BankReconciliation_tenantId_status_idx" ON "BankReconciliation"("tenantId", "status");

-- CreateIndex
CREATE INDEX "BankReconciliation_tenantId_createdAt_idx" ON "BankReconciliation"("tenantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BankReconciliation_tenantId_reconciliationNo_key" ON "BankReconciliation"("tenantId", "reconciliationNo");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_status_idx" ON "FixedAsset"("tenantId", "status");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_category_idx" ON "FixedAsset"("tenantId", "category");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_supplierId_idx" ON "FixedAsset"("tenantId", "supplierId");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_purchaseDate_idx" ON "FixedAsset"("tenantId", "purchaseDate");

-- CreateIndex
CREATE INDEX "FixedAsset_tenantId_nextMaintenanceDate_idx" ON "FixedAsset"("tenantId", "nextMaintenanceDate");

-- CreateIndex
CREATE UNIQUE INDEX "FixedAsset_tenantId_assetNo_key" ON "FixedAsset"("tenantId", "assetNo");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_tenantId_depreciationDate_idx" ON "FixedAssetDepreciation"("tenantId", "depreciationDate");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_tenantId_periodStart_periodEnd_idx" ON "FixedAssetDepreciation"("tenantId", "periodStart", "periodEnd");

-- CreateIndex
CREATE INDEX "FixedAssetDepreciation_assetId_idx" ON "FixedAssetDepreciation"("assetId");

-- CreateIndex
CREATE INDEX "FixedAssetMaintenance_tenantId_maintenanceDate_idx" ON "FixedAssetMaintenance"("tenantId", "maintenanceDate");

-- CreateIndex
CREATE INDEX "FixedAssetMaintenance_tenantId_nextMaintenanceDate_idx" ON "FixedAssetMaintenance"("tenantId", "nextMaintenanceDate");

-- CreateIndex
CREATE INDEX "FixedAssetMaintenance_assetId_idx" ON "FixedAssetMaintenance"("assetId");

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatement" ADD CONSTRAINT "BankStatement_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "BankStatement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankStatementLine" ADD CONSTRAINT "BankStatementLine_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_statementLineId_fkey" FOREIGN KEY ("statementLineId") REFERENCES "BankStatementLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_bankTransactionId_fkey" FOREIGN KEY ("bankTransactionId") REFERENCES "BankTransaction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliationMatch" ADD CONSTRAINT "BankReconciliationMatch_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankReconciliation" ADD CONSTRAINT "BankReconciliation_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAsset" ADD CONSTRAINT "FixedAsset_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetDepreciation" ADD CONSTRAINT "FixedAssetDepreciation_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetMaintenance" ADD CONSTRAINT "FixedAssetMaintenance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FixedAssetMaintenance" ADD CONSTRAINT "FixedAssetMaintenance_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "FixedAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
