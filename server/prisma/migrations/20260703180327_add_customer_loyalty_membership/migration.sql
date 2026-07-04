-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowLoyalty" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "LoyaltyTier" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "minPoints" INTEGER NOT NULL DEFAULT 0,
    "discountPercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "pointsMultiplier" DECIMAL(8,3) NOT NULL DEFAULT 1,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyRule" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "earnAmountStep" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "earnPoints" INTEGER NOT NULL DEFAULT 1,
    "redemptionValue" DECIMAL(12,2) NOT NULL DEFAULT 1,
    "minRedeemPoints" INTEGER NOT NULL DEFAULT 100,
    "expiryDays" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyAccount" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "tierId" TEXT,
    "memberNo" TEXT NOT NULL,
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "lifetimeEarned" INTEGER NOT NULL DEFAULT 0,
    "lifetimeRedeemed" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastActivityAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LoyaltyAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoyaltyTransaction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "voucherId" TEXT,
    "type" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "balanceAfter" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "refType" TEXT,
    "refId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoyaltyTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RewardVoucher" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "invoiceId" TEXT,
    "voucherNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "pointsCost" INTEGER NOT NULL,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RewardVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoyaltyTier_tenantId_minPoints_idx" ON "LoyaltyTier"("tenantId", "minPoints");

-- CreateIndex
CREATE INDEX "LoyaltyTier_tenantId_isActive_idx" ON "LoyaltyTier"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyTier_tenantId_name_key" ON "LoyaltyTier"("tenantId", "name");

-- CreateIndex
CREATE INDEX "LoyaltyRule_tenantId_isActive_idx" ON "LoyaltyRule"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "LoyaltyRule_tenantId_isDefault_idx" ON "LoyaltyRule"("tenantId", "isDefault");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyRule_tenantId_name_key" ON "LoyaltyRule"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_customerId_key" ON "LoyaltyAccount"("customerId");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_tenantId_status_idx" ON "LoyaltyAccount"("tenantId", "status");

-- CreateIndex
CREATE INDEX "LoyaltyAccount_tenantId_tierId_idx" ON "LoyaltyAccount"("tenantId", "tierId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_tenantId_customerId_key" ON "LoyaltyAccount"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "LoyaltyAccount_tenantId_memberNo_key" ON "LoyaltyAccount"("tenantId", "memberNo");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_customerId_idx" ON "LoyaltyTransaction"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_accountId_idx" ON "LoyaltyTransaction"("tenantId", "accountId");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_type_idx" ON "LoyaltyTransaction"("tenantId", "type");

-- CreateIndex
CREATE INDEX "LoyaltyTransaction_tenantId_createdAt_idx" ON "LoyaltyTransaction"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "RewardVoucher_tenantId_customerId_idx" ON "RewardVoucher"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "RewardVoucher_tenantId_status_idx" ON "RewardVoucher"("tenantId", "status");

-- CreateIndex
CREATE INDEX "RewardVoucher_tenantId_expiresAt_idx" ON "RewardVoucher"("tenantId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "RewardVoucher_tenantId_voucherNo_key" ON "RewardVoucher"("tenantId", "voucherNo");

-- AddForeignKey
ALTER TABLE "LoyaltyTier" ADD CONSTRAINT "LoyaltyTier_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyRule" ADD CONSTRAINT "LoyaltyRule_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyAccount" ADD CONSTRAINT "LoyaltyAccount_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "LoyaltyTier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoyaltyTransaction" ADD CONSTRAINT "LoyaltyTransaction_voucherId_fkey" FOREIGN KEY ("voucherId") REFERENCES "RewardVoucher"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardVoucher" ADD CONSTRAINT "RewardVoucher_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardVoucher" ADD CONSTRAINT "RewardVoucher_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "LoyaltyAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardVoucher" ADD CONSTRAINT "RewardVoucher_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RewardVoucher" ADD CONSTRAINT "RewardVoucher_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
