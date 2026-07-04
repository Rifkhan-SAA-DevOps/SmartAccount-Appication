/*
  Warnings:

  - A unique constraint covering the columns `[tenantId,receiptNo]` on the table `Payment` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "grnId" TEXT,
ADD COLUMN     "receiptNo" TEXT;

-- CreateIndex
CREATE INDEX "Payment_tenantId_customerId_idx" ON "Payment"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Payment_tenantId_supplierId_idx" ON "Payment"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_tenantId_receiptNo_key" ON "Payment"("tenantId", "receiptNo");

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_grnId_fkey" FOREIGN KEY ("grnId") REFERENCES "GoodsReceivedNote"("id") ON DELETE SET NULL ON UPDATE CASCADE;
