-- CreateTable
CREATE TABLE "Cheque" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partyType" TEXT NOT NULL DEFAULT 'CUSTOMER',
    "direction" TEXT NOT NULL DEFAULT 'IN',
    "customerId" TEXT,
    "supplierId" TEXT,
    "bankAccountId" TEXT,
    "paymentId" TEXT,
    "chequeNo" TEXT NOT NULL,
    "bankName" TEXT,
    "branchName" TEXT,
    "accountName" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "issueDate" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "receivedDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "depositedAt" TIMESTAMP(3),
    "clearedAt" TIMESTAMP(3),
    "bouncedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cheque_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChequeEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chequeId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "eventDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChequeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Cheque_tenantId_status_idx" ON "Cheque"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_direction_idx" ON "Cheque"("tenantId", "direction");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_partyType_idx" ON "Cheque"("tenantId", "partyType");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_dueDate_idx" ON "Cheque"("tenantId", "dueDate");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_customerId_idx" ON "Cheque"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Cheque_tenantId_supplierId_idx" ON "Cheque"("tenantId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "Cheque_tenantId_chequeNo_key" ON "Cheque"("tenantId", "chequeNo");

-- CreateIndex
CREATE INDEX "ChequeEvent_tenantId_action_idx" ON "ChequeEvent"("tenantId", "action");

-- CreateIndex
CREATE INDEX "ChequeEvent_tenantId_eventDate_idx" ON "ChequeEvent"("tenantId", "eventDate");

-- CreateIndex
CREATE INDEX "ChequeEvent_chequeId_idx" ON "ChequeEvent"("chequeId");

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cheque" ADD CONSTRAINT "Cheque_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeEvent" ADD CONSTRAINT "ChequeEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChequeEvent" ADD CONSTRAINT "ChequeEvent_chequeId_fkey" FOREIGN KEY ("chequeId") REFERENCES "Cheque"("id") ON DELETE CASCADE ON UPDATE CASCADE;
