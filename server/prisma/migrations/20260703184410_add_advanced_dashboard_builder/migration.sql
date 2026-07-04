-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowDashboardBuilder" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DashboardLayout" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'ALL_ROLES',
    "refreshInterval" INTEGER NOT NULL DEFAULT 300,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardWidget" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "widgetKey" TEXT,
    "title" TEXT NOT NULL,
    "widgetType" TEXT NOT NULL DEFAULT 'KPI',
    "dataSource" TEXT NOT NULL DEFAULT 'MONTH_SALES',
    "chartType" TEXT,
    "gridX" INTEGER NOT NULL DEFAULT 0,
    "gridY" INTEGER NOT NULL DEFAULT 0,
    "gridW" INTEGER NOT NULL DEFAULT 3,
    "gridH" INTEGER NOT NULL DEFAULT 2,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "lastValue" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "lastPayload" JSONB,
    "lastRefreshedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardWidget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardShortcut" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardShortcut_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DashboardLayout_tenantId_isDefault_idx" ON "DashboardLayout"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "DashboardLayout_tenantId_visibility_idx" ON "DashboardLayout"("tenantId", "visibility");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardLayout_tenantId_name_key" ON "DashboardLayout"("tenantId", "name");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_layoutId_idx" ON "DashboardWidget"("tenantId", "layoutId");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_widgetType_idx" ON "DashboardWidget"("tenantId", "widgetType");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_dataSource_idx" ON "DashboardWidget"("tenantId", "dataSource");

-- CreateIndex
CREATE INDEX "DashboardWidget_tenantId_isVisible_idx" ON "DashboardWidget"("tenantId", "isVisible");

-- CreateIndex
CREATE INDEX "DashboardShortcut_tenantId_layoutId_idx" ON "DashboardShortcut"("tenantId", "layoutId");

-- CreateIndex
CREATE INDEX "DashboardShortcut_tenantId_isActive_idx" ON "DashboardShortcut"("tenantId", "isActive");

-- AddForeignKey
ALTER TABLE "DashboardLayout" ADD CONSTRAINT "DashboardLayout_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardWidget" ADD CONSTRAINT "DashboardWidget_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "DashboardLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShortcut" ADD CONSTRAINT "DashboardShortcut_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShortcut" ADD CONSTRAINT "DashboardShortcut_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "DashboardLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;
