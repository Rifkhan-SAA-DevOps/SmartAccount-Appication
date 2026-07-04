-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "channel" TEXT NOT NULL DEFAULT 'IN_APP',
    "entityType" TEXT,
    "entityId" TEXT,
    "actionUrl" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReminderSetting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lowStockEnabled" BOOLEAN NOT NULL DEFAULT true,
    "customerCreditEnabled" BOOLEAN NOT NULL DEFAULT true,
    "supplierPaymentEnabled" BOOLEAN NOT NULL DEFAULT true,
    "approvalEnabled" BOOLEAN NOT NULL DEFAULT true,
    "subscriptionEnabled" BOOLEAN NOT NULL DEFAULT true,
    "emailEnabled" BOOLEAN NOT NULL DEFAULT false,
    "whatsappEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reminderDaysBeforeDue" INTEGER NOT NULL DEFAULT 3,
    "whatsappDefaultPhone" TEXT,
    "dailySummaryEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReminderSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommunicationLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT,
    "message" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'LOGGED',
    "provider" TEXT,
    "providerRef" TEXT,
    "error" TEXT,
    "entityType" TEXT,
    "entityId" TEXT,
    "createdById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommunicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_tenantId_isRead_idx" ON "Notification"("tenantId", "isRead");

-- CreateIndex
CREATE INDEX "Notification_tenantId_priority_idx" ON "Notification"("tenantId", "priority");

-- CreateIndex
CREATE INDEX "Notification_tenantId_entityType_entityId_idx" ON "Notification"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "Notification_tenantId_createdAt_idx" ON "Notification"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");

-- CreateIndex
CREATE UNIQUE INDEX "ReminderSetting_tenantId_key" ON "ReminderSetting"("tenantId");

-- CreateIndex
CREATE INDEX "CommunicationLog_tenantId_channel_idx" ON "CommunicationLog"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "CommunicationLog_tenantId_status_idx" ON "CommunicationLog"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CommunicationLog_tenantId_entityType_entityId_idx" ON "CommunicationLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "CommunicationLog_tenantId_createdAt_idx" ON "CommunicationLog"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReminderSetting" ADD CONSTRAINT "ReminderSetting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationLog" ADD CONSTRAINT "CommunicationLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
