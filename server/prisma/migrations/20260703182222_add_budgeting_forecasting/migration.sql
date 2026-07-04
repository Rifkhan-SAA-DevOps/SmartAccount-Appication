-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowBudgeting" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budgetNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fiscalYear" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'MONTHLY',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "totalIncomeBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalExpenseBudget" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "ledgerAccountId" TEXT,
    "lineType" TEXT NOT NULL,
    "periodMonth" INTEGER,
    "periodLabel" TEXT,
    "description" TEXT,
    "budgetAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "alertPercent" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ForecastScenario" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scenarioNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'CASH_FLOW',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "openingCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "growthRate" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "collectionDays" INTEGER NOT NULL DEFAULT 0,
    "paymentDays" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ForecastScenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashFlowForecastLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "periodLabel" TEXT NOT NULL,
    "expectedInflows" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "expectedOutflows" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netCashFlow" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "closingCash" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CashFlowForecastLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Budget_tenantId_fiscalYear_idx" ON "Budget"("tenantId", "fiscalYear");

-- CreateIndex
CREATE INDEX "Budget_tenantId_status_idx" ON "Budget"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Budget_tenantId_startDate_endDate_idx" ON "Budget"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_tenantId_budgetNo_key" ON "Budget"("tenantId", "budgetNo");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_budgetId_idx" ON "BudgetLine"("tenantId", "budgetId");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_ledgerAccountId_idx" ON "BudgetLine"("tenantId", "ledgerAccountId");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_lineType_idx" ON "BudgetLine"("tenantId", "lineType");

-- CreateIndex
CREATE INDEX "BudgetLine_tenantId_periodMonth_idx" ON "BudgetLine"("tenantId", "periodMonth");

-- CreateIndex
CREATE INDEX "ForecastScenario_tenantId_status_idx" ON "ForecastScenario"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ForecastScenario_tenantId_startDate_endDate_idx" ON "ForecastScenario"("tenantId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "ForecastScenario_tenantId_scenarioNo_key" ON "ForecastScenario"("tenantId", "scenarioNo");

-- CreateIndex
CREATE INDEX "CashFlowForecastLine_tenantId_scenarioId_idx" ON "CashFlowForecastLine"("tenantId", "scenarioId");

-- CreateIndex
CREATE INDEX "CashFlowForecastLine_tenantId_periodStart_idx" ON "CashFlowForecastLine"("tenantId", "periodStart");

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "Budget"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetLine" ADD CONSTRAINT "BudgetLine_ledgerAccountId_fkey" FOREIGN KEY ("ledgerAccountId") REFERENCES "LedgerAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ForecastScenario" ADD CONSTRAINT "ForecastScenario_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowForecastLine" ADD CONSTRAINT "CashFlowForecastLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashFlowForecastLine" ADD CONSTRAINT "CashFlowForecastLine_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "ForecastScenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
