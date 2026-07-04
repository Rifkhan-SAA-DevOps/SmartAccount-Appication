/*
  Warnings:

  - The `status` column on the `JournalEntry` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `createdAt` on the `JournalEntryLine` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `JournalEntryLine` table. All the data in the column will be lost.
  - You are about to alter the column `debit` on the `JournalEntryLine` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(12,2)`.
  - You are about to alter the column `credit` on the `JournalEntryLine` table. The data in that column could be lost. The data in that column will be cast from `Decimal(18,2)` to `Decimal(12,2)`.

*/
-- CreateEnum
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- DropIndex
DROP INDEX "BankTransaction_tenantId_bankAccountId_idx";

-- DropIndex
DROP INDEX "Expense_tenantId_bankAccountId_idx";

-- DropIndex
DROP INDEX "JournalEntry_tenantId_idx";

-- DropIndex
DROP INDEX "LedgerAccount_tenantId_isActive_idx";

-- DropIndex
DROP INDEX "Payment_tenantId_bankAccountId_idx";

-- AlterTable
ALTER TABLE "JournalEntry" DROP COLUMN "status",
ADD COLUMN     "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED';

-- AlterTable
ALTER TABLE "JournalEntryLine" DROP COLUMN "createdAt",
DROP COLUMN "updatedAt",
ALTER COLUMN "debit" SET DATA TYPE DECIMAL(12,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(12,2);

-- CreateTable
CREATE TABLE "TenantSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "legalName" TEXT,
    "address" TEXT,
    "taxNumber" TEXT,
    "website" TEXT,
    "invoicePrefix" TEXT NOT NULL DEFAULT 'INV',
    "receiptPrefix" TEXT NOT NULL DEFAULT 'REC',
    "invoiceTemplate" TEXT NOT NULL DEFAULT 'modern',
    "invoiceAccentColor" TEXT NOT NULL DEFAULT '#7c3aed',
    "invoiceFooter" TEXT DEFAULT 'Thank you for your business.',
    "invoiceTerms" TEXT DEFAULT 'Payment is due according to the agreed terms.',
    "showLogo" BOOLEAN NOT NULL DEFAULT true,
    "showTaxNumber" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TaxRate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rate" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaxRate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TenantSetting_tenantId_key" ON "TenantSetting"("tenantId");

-- CreateIndex
CREATE INDEX "TaxRate_tenantId_isActive_idx" ON "TaxRate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "TaxRate_tenantId_name_key" ON "TaxRate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "JournalEntry_tenantId_status_idx" ON "JournalEntry"("tenantId", "status");

-- AddForeignKey
ALTER TABLE "TenantSetting" ADD CONSTRAINT "TenantSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TaxRate" ADD CONSTRAINT "TaxRate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerAccount" ADD CONSTRAINT "LedgerAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalEntry" ADD CONSTRAINT "JournalEntry_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
