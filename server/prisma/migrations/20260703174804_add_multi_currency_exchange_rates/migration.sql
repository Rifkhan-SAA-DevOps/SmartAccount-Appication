-- AlterTable
ALTER TABLE "BankAccount" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "GoodsReceivedNote" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "foreignTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "foreignTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignAmount" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Quotation" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SalesOrder" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignTotal" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowMultiCurrency" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN     "currencyCode" TEXT NOT NULL DEFAULT 'LKR',
ADD COLUMN     "exchangeRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Currency" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT,
    "decimalPlaces" INTEGER NOT NULL DEFAULT 2,
    "isBase" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Currency_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromCurrency" TEXT NOT NULL,
    "toCurrency" TEXT NOT NULL,
    "rate" DECIMAL(18,6) NOT NULL,
    "rateDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurrencyRevaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "entityName" TEXT,
    "currencyCode" TEXT NOT NULL,
    "foreignBalance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "oldRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "newRate" DECIMAL(18,6) NOT NULL DEFAULT 1,
    "baseBefore" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "baseAfter" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "gainLoss" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "posted" BOOLEAN NOT NULL DEFAULT false,
    "journalEntryId" TEXT,
    "revaluedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CurrencyRevaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Currency_tenantId_isActive_idx" ON "Currency"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "Currency_tenantId_isBase_idx" ON "Currency"("tenantId", "isBase");

-- CreateIndex
CREATE UNIQUE INDEX "Currency_tenantId_code_key" ON "Currency"("tenantId", "code");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_fromCurrency_toCurrency_idx" ON "ExchangeRate"("tenantId", "fromCurrency", "toCurrency");

-- CreateIndex
CREATE INDEX "ExchangeRate_tenantId_rateDate_idx" ON "ExchangeRate"("tenantId", "rateDate");

-- CreateIndex
CREATE UNIQUE INDEX "ExchangeRate_tenantId_fromCurrency_toCurrency_rateDate_key" ON "ExchangeRate"("tenantId", "fromCurrency", "toCurrency", "rateDate");

-- CreateIndex
CREATE INDEX "CurrencyRevaluation_tenantId_entityType_entityId_idx" ON "CurrencyRevaluation"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CurrencyRevaluation_tenantId_currencyCode_idx" ON "CurrencyRevaluation"("tenantId", "currencyCode");

-- CreateIndex
CREATE INDEX "CurrencyRevaluation_tenantId_revaluedAt_idx" ON "CurrencyRevaluation"("tenantId", "revaluedAt");

-- AddForeignKey
ALTER TABLE "Currency" ADD CONSTRAINT "Currency_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurrencyRevaluation" ADD CONSTRAINT "CurrencyRevaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
