-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowCampaigns" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CampaignTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketingCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT,
    "campaignNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "audienceType" TEXT NOT NULL DEFAULT 'ALL_CUSTOMERS',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "totalRecipients" INTEGER NOT NULL DEFAULT 0,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketingCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignRecipient" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "channel" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "clickedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignRecipient_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignTemplate_tenantId_channel_idx" ON "CampaignTemplate"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "CampaignTemplate_tenantId_isActive_idx" ON "CampaignTemplate"("tenantId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignTemplate_tenantId_name_key" ON "CampaignTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_channel_idx" ON "MarketingCampaign"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_status_idx" ON "MarketingCampaign"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_audienceType_idx" ON "MarketingCampaign"("tenantId", "audienceType");

-- CreateIndex
CREATE INDEX "MarketingCampaign_tenantId_scheduledAt_idx" ON "MarketingCampaign"("tenantId", "scheduledAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketingCampaign_tenantId_campaignNo_key" ON "MarketingCampaign"("tenantId", "campaignNo");

-- CreateIndex
CREATE INDEX "CampaignRecipient_tenantId_campaignId_idx" ON "CampaignRecipient"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_tenantId_customerId_idx" ON "CampaignRecipient"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CampaignRecipient_tenantId_status_idx" ON "CampaignRecipient"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CampaignRecipient_tenantId_channel_idx" ON "CampaignRecipient"("tenantId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignRecipient_campaignId_recipientAddress_key" ON "CampaignRecipient"("campaignId", "recipientAddress");

-- AddForeignKey
ALTER TABLE "CampaignTemplate" ADD CONSTRAINT "CampaignTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketingCampaign" ADD CONSTRAINT "MarketingCampaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "CampaignTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "MarketingCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignRecipient" ADD CONSTRAINT "CampaignRecipient_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
