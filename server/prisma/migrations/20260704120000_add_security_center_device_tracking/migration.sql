-- v5.4 Security Center / Login History / Device Tracking
CREATE TABLE "LoginHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUCCESS',
    "reason" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "deviceHash" TEXT,
    "deviceName" TEXT,
    "location" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LoginHistory_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceHash" TEXT NOT NULL,
    "deviceName" TEXT,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "isTrusted" BOOLEAN NOT NULL DEFAULT false,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SecurityEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoginHistory_tenantId_createdAt_idx" ON "LoginHistory"("tenantId", "createdAt");
CREATE INDEX "LoginHistory_tenantId_status_idx" ON "LoginHistory"("tenantId", "status");
CREATE INDEX "LoginHistory_tenantId_userId_idx" ON "LoginHistory"("tenantId", "userId");
CREATE INDEX "LoginHistory_tenantId_deviceHash_idx" ON "LoginHistory"("tenantId", "deviceHash");

CREATE UNIQUE INDEX "TrustedDevice_tenantId_userId_deviceHash_key" ON "TrustedDevice"("tenantId", "userId", "deviceHash");
CREATE INDEX "TrustedDevice_tenantId_lastSeenAt_idx" ON "TrustedDevice"("tenantId", "lastSeenAt");
CREATE INDEX "TrustedDevice_tenantId_isTrusted_idx" ON "TrustedDevice"("tenantId", "isTrusted");

CREATE INDEX "SecurityEvent_tenantId_createdAt_idx" ON "SecurityEvent"("tenantId", "createdAt");
CREATE INDEX "SecurityEvent_tenantId_severity_idx" ON "SecurityEvent"("tenantId", "severity");
CREATE INDEX "SecurityEvent_tenantId_type_idx" ON "SecurityEvent"("tenantId", "type");
CREATE INDEX "SecurityEvent_tenantId_userId_idx" ON "SecurityEvent"("tenantId", "userId");

ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "LoginHistory" ADD CONSTRAINT "LoginHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SecurityEvent" ADD CONSTRAINT "SecurityEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
