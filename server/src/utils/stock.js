export async function getOrCreateMainBranch(tx, tenantId) {
  const existing = await tx.branch.findFirst({ where: { tenantId, isMain: true } });
  if (existing) return existing;

  const fallback = await tx.branch.findFirst({ where: { tenantId }, orderBy: { createdAt: 'asc' } });
  if (fallback) return fallback;

  return tx.branch.create({
    data: {
      tenantId,
      name: 'Main Branch',
      code: 'MAIN',
      isMain: true
    }
  });
}

export async function getOrCreateDefaultWarehouse(tx, tenantId, branchId = null) {
  const existing = await tx.warehouse.findFirst({
    where: { tenantId, isDefault: true, isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  if (existing) return existing;

  const branch = branchId
    ? await tx.branch.findFirst({ where: { id: branchId, tenantId } })
    : await getOrCreateMainBranch(tx, tenantId);

  const fallback = await tx.warehouse.findFirst({
    where: { tenantId, isActive: true },
    orderBy: { createdAt: 'asc' }
  });
  if (fallback) {
    return tx.warehouse.update({ where: { id: fallback.id }, data: { isDefault: true } });
  }

  return tx.warehouse.create({
    data: {
      tenantId,
      branchId: branch?.id || null,
      name: 'Main Warehouse',
      code: 'MAIN-WH',
      isDefault: true,
      isActive: true
    }
  });
}

export async function addWarehouseStock(tx, { tenantId, productId, warehouseId, quantity, reorderLevel = 0 }) {
  const existing = await tx.productStock.findUnique({
    where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } }
  });

  if (existing) {
    return tx.productStock.update({
      where: { id: existing.id },
      data: { quantity: { increment: quantity } }
    });
  }

  return tx.productStock.create({
    data: { tenantId, productId, warehouseId, quantity, reorderLevel }
  });
}

export async function ensureProductStock(tx, { tenantId, productId, warehouseId }) {
  return tx.productStock.upsert({
    where: { tenantId_productId_warehouseId: { tenantId, productId, warehouseId } },
    update: {},
    create: { tenantId, productId, warehouseId, quantity: 0 }
  });
}

export async function assertWarehouseBelongsToTenant(tx, { tenantId, warehouseId }) {
  const warehouse = await tx.warehouse.findFirst({ where: { id: warehouseId, tenantId, isActive: true } });
  if (!warehouse) throw Object.assign(new Error('Warehouse not found'), { status: 404 });
  return warehouse;
}
