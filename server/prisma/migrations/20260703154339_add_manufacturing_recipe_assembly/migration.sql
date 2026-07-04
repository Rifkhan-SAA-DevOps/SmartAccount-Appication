-- AlterTable
ALTER TABLE "SubscriptionPlan" ADD COLUMN     "allowManufacturing" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ManufacturingRecipe" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipeNo" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'RECIPE',
    "outputProductId" TEXT NOT NULL,
    "outputQty" DECIMAL(12,3) NOT NULL DEFAULT 1,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingRecipe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingRecipeItem" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "wastagePercent" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "notes" TEXT,

    CONSTRAINT "ManufacturingRecipeItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrder" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "recipeId" TEXT,
    "warehouseId" TEXT NOT NULL,
    "outputProductId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'POSTED',
    "productionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "outputQty" DECIMAL(12,3) NOT NULL,
    "inputCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "additionalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ManufacturingOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderInput" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ManufacturingOrderInput_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManufacturingOrderOutput" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "warehouseId" TEXT NOT NULL,
    "qty" DECIMAL(12,3) NOT NULL,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ManufacturingOrderOutput_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ManufacturingRecipe_tenantId_isActive_idx" ON "ManufacturingRecipe"("tenantId", "isActive");

-- CreateIndex
CREATE INDEX "ManufacturingRecipe_tenantId_outputProductId_idx" ON "ManufacturingRecipe"("tenantId", "outputProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingRecipe_tenantId_recipeNo_key" ON "ManufacturingRecipe"("tenantId", "recipeNo");

-- CreateIndex
CREATE INDEX "ManufacturingRecipeItem_recipeId_idx" ON "ManufacturingRecipeItem"("recipeId");

-- CreateIndex
CREATE INDEX "ManufacturingRecipeItem_productId_idx" ON "ManufacturingRecipeItem"("productId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_tenantId_productionDate_idx" ON "ManufacturingOrder"("tenantId", "productionDate");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_tenantId_status_idx" ON "ManufacturingOrder"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_tenantId_recipeId_idx" ON "ManufacturingOrder"("tenantId", "recipeId");

-- CreateIndex
CREATE INDEX "ManufacturingOrder_tenantId_outputProductId_idx" ON "ManufacturingOrder"("tenantId", "outputProductId");

-- CreateIndex
CREATE UNIQUE INDEX "ManufacturingOrder_tenantId_orderNo_key" ON "ManufacturingOrder"("tenantId", "orderNo");

-- CreateIndex
CREATE INDEX "ManufacturingOrderInput_orderId_idx" ON "ManufacturingOrderInput"("orderId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderInput_productId_idx" ON "ManufacturingOrderInput"("productId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderInput_warehouseId_idx" ON "ManufacturingOrderInput"("warehouseId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderOutput_orderId_idx" ON "ManufacturingOrderOutput"("orderId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderOutput_productId_idx" ON "ManufacturingOrderOutput"("productId");

-- CreateIndex
CREATE INDEX "ManufacturingOrderOutput_warehouseId_idx" ON "ManufacturingOrderOutput"("warehouseId");

-- AddForeignKey
ALTER TABLE "ManufacturingRecipe" ADD CONSTRAINT "ManufacturingRecipe_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRecipe" ADD CONSTRAINT "ManufacturingRecipe_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRecipeItem" ADD CONSTRAINT "ManufacturingRecipeItem_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ManufacturingRecipe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingRecipeItem" ADD CONSTRAINT "ManufacturingRecipeItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "ManufacturingRecipe"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrder" ADD CONSTRAINT "ManufacturingOrder_outputProductId_fkey" FOREIGN KEY ("outputProductId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderInput" ADD CONSTRAINT "ManufacturingOrderInput_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderInput" ADD CONSTRAINT "ManufacturingOrderInput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderInput" ADD CONSTRAINT "ManufacturingOrderInput_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderOutput" ADD CONSTRAINT "ManufacturingOrderOutput_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "ManufacturingOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderOutput" ADD CONSTRAINT "ManufacturingOrderOutput_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManufacturingOrderOutput" ADD CONSTRAINT "ManufacturingOrderOutput_warehouseId_fkey" FOREIGN KEY ("warehouseId") REFERENCES "Warehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
