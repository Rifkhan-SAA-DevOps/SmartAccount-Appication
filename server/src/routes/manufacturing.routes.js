import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { addWarehouseStock, assertWarehouseBelongsToTenant, ensureProductStock, getOrCreateDefaultWarehouse } from '../utils/stock.js';
import { postManufacturingJournal } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowManufacturing', 'manufacturing / recipe / assembly stock'));

const recipeItemSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  wastagePercent: z.coerce.number().min(0).max(100).optional().default(0),
  notes: z.string().optional().nullable()
});

const recipeSchema = z.object({
  name: z.string().min(2),
  type: z.string().optional().default('RECIPE'),
  outputProductId: z.string().uuid(),
  outputQty: z.coerce.number().positive().default(1),
  notes: z.string().optional().nullable(),
  isActive: z.boolean().optional().default(true),
  items: z.array(recipeItemSchema).min(1)
});

const orderInputSchema = z.object({
  productId: z.string().uuid(),
  qty: z.coerce.number().positive(),
  unitCost: z.coerce.number().min(0).optional().nullable()
});

const orderSchema = z.object({
  recipeId: z.string().uuid().optional().nullable(),
  warehouseId: z.string().uuid().optional().nullable(),
  outputProductId: z.string().uuid().optional().nullable(),
  outputQty: z.coerce.number().positive(),
  productionDate: z.coerce.date().optional(),
  additionalCost: z.coerce.number().min(0).optional().default(0),
  updateOutputCost: z.boolean().optional().default(true),
  notes: z.string().optional().nullable(),
  inputs: z.array(orderInputSchema).optional().default([])
});

async function nextRecipeNo(tx, tenantId) {
  const count = await tx.manufacturingRecipe.count({ where: { tenantId } });
  return `REC-${String(count + 1).padStart(5, '0')}`;
}

async function nextOrderNo(tx, tenantId) {
  const count = await tx.manufacturingOrder.count({ where: { tenantId } });
  return `MFG-${String(count + 1).padStart(5, '0')}`;
}

function includeRecipe() {
  return {
    outputProduct: true,
    items: { include: { product: true }, orderBy: { id: 'asc' } }
  };
}

function includeOrder() {
  return {
    recipe: true,
    warehouse: true,
    outputProduct: true,
    inputs: { include: { product: true, warehouse: true } },
    outputs: { include: { product: true, warehouse: true } }
  };
}

function normalizeRecipe(row) {
  return {
    ...row,
    outputProductName: row.outputProduct?.name || '-',
    inputCount: row.items?.length || 0,
    inputSummary: (row.items || []).map((i) => `${Number(i.qty)} x ${i.product?.name || 'Product'}`).join(', ')
  };
}

function normalizeOrder(row) {
  return {
    ...row,
    recipeName: row.recipe?.name || 'Manual production',
    warehouseName: row.warehouse?.name || '-',
    outputProductName: row.outputProduct?.name || '-',
    inputSummary: (row.inputs || []).map((i) => `${Number(i.qty)} x ${i.product?.name || 'Product'}`).join(', '),
    outputSummary: (row.outputs || []).map((i) => `${Number(i.qty)} x ${i.product?.name || 'Product'}`).join(', ')
  };
}

async function ensureProduct(tx, tenantId, productId, label = 'Product') {
  const product = await tx.product.findFirst({ where: { id: productId, tenantId, isActive: true } });
  if (!product) throw Object.assign(new Error(`${label} not found`), { status: 404 });
  return product;
}

router.get('/summary', requirePermission('manufacturing:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const monthStart = new Date();
    monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
    const [recipes, activeRecipes, orders, postedOrders, producedThisMonth, recentOrders] = await Promise.all([
      prisma.manufacturingRecipe.count({ where: { tenantId } }),
      prisma.manufacturingRecipe.count({ where: { tenantId, isActive: true } }),
      prisma.manufacturingOrder.count({ where: { tenantId } }),
      prisma.manufacturingOrder.count({ where: { tenantId, status: 'POSTED' } }),
      prisma.manufacturingOrder.aggregate({ where: { tenantId, productionDate: { gte: monthStart }, status: 'POSTED' }, _sum: { totalCost: true, outputQty: true } }),
      prisma.manufacturingOrder.findMany({ where: { tenantId }, include: includeOrder(), orderBy: { productionDate: 'desc' }, take: 6 })
    ]);
    res.json({
      recipes,
      activeRecipes,
      orders,
      postedOrders,
      monthlyProductionCost: producedThisMonth._sum.totalCost || 0,
      monthlyOutputQty: producedThisMonth._sum.outputQty || 0,
      recentOrders: recentOrders.map(normalizeOrder)
    });
  } catch (e) { next(e); }
});

router.get('/recipes', requirePermission('manufacturing:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.active === 'true') where.isActive = true;
    const q = String(req.query.q || '').trim();
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { recipeNo: { contains: q, mode: 'insensitive' } },
        { outputProduct: { name: { contains: q, mode: 'insensitive' } } }
      ];
    }
    const recipes = await prisma.manufacturingRecipe.findMany({ where, include: includeRecipe(), orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(recipes.map(normalizeRecipe));
  } catch (e) { next(e); }
});

router.post('/recipes', requirePermission('manufacturing:create'), async (req, res, next) => {
  try {
    const data = recipeSchema.parse(req.body);
    if (data.items.some((i) => i.productId === data.outputProductId)) {
      return res.status(400).json({ message: 'Output product cannot be used as raw material in the same recipe' });
    }

    const recipe = await prisma.$transaction(async (tx) => {
      await ensureProduct(tx, req.user.tenantId, data.outputProductId, 'Output product');
      for (const item of data.items) await ensureProduct(tx, req.user.tenantId, item.productId, 'Raw material');
      return tx.manufacturingRecipe.create({
        data: {
          tenantId: req.user.tenantId,
          recipeNo: await nextRecipeNo(tx, req.user.tenantId),
          name: data.name,
          type: data.type || 'RECIPE',
          outputProductId: data.outputProductId,
          outputQty: data.outputQty,
          notes: data.notes || null,
          isActive: data.isActive,
          createdById: req.user.id,
          items: { create: data.items.map((item) => ({ productId: item.productId, qty: item.qty, wastagePercent: item.wastagePercent || 0, notes: item.notes || null })) }
        },
        include: includeRecipe()
      });
    });
    await audit(req, 'CREATE', 'ManufacturingRecipe', recipe.id, null, recipe);
    res.status(201).json(normalizeRecipe(recipe));
  } catch (e) { next(e); }
});

router.put('/recipes/:id', requirePermission('manufacturing:update'), async (req, res, next) => {
  try {
    const before = await prisma.manufacturingRecipe.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: includeRecipe() });
    if (!before) return res.status(404).json({ message: 'Recipe not found' });
    const data = recipeSchema.partial().parse(req.body);
    if (data.items && data.outputProductId && data.items.some((i) => i.productId === data.outputProductId)) {
      return res.status(400).json({ message: 'Output product cannot be used as raw material in the same recipe' });
    }

    const recipe = await prisma.$transaction(async (tx) => {
      const outputProductId = data.outputProductId || before.outputProductId;
      await ensureProduct(tx, req.user.tenantId, outputProductId, 'Output product');
      if (data.items) {
        for (const item of data.items) await ensureProduct(tx, req.user.tenantId, item.productId, 'Raw material');
        await tx.manufacturingRecipeItem.deleteMany({ where: { recipeId: before.id } });
      }
      return tx.manufacturingRecipe.update({
        where: { id: before.id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.type !== undefined ? { type: data.type } : {}),
          ...(data.outputProductId !== undefined ? { outputProductId: data.outputProductId } : {}),
          ...(data.outputQty !== undefined ? { outputQty: data.outputQty } : {}),
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.items ? { items: { create: data.items.map((item) => ({ productId: item.productId, qty: item.qty, wastagePercent: item.wastagePercent || 0, notes: item.notes || null })) } } : {})
        },
        include: includeRecipe()
      });
    });
    await audit(req, 'UPDATE', 'ManufacturingRecipe', recipe.id, before, recipe);
    res.json(normalizeRecipe(recipe));
  } catch (e) { next(e); }
});

router.get('/orders', requirePermission('manufacturing:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.warehouseId) where.warehouseId = String(req.query.warehouseId);
    const orders = await prisma.manufacturingOrder.findMany({ where, include: includeOrder(), orderBy: { productionDate: 'desc' }, take: 300 });
    res.json(orders.map(normalizeOrder));
  } catch (e) { next(e); }
});

router.post('/orders', requirePermission('manufacturing:create'), async (req, res, next) => {
  try {
    const data = orderSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const warehouse = data.warehouseId
        ? await assertWarehouseBelongsToTenant(tx, { tenantId: req.user.tenantId, warehouseId: data.warehouseId })
        : await getOrCreateDefaultWarehouse(tx, req.user.tenantId);

      let recipe = null;
      let outputProductId = data.outputProductId;
      let inputs = data.inputs || [];

      if (data.recipeId) {
        recipe = await tx.manufacturingRecipe.findFirst({
          where: { id: data.recipeId, tenantId: req.user.tenantId, isActive: true },
          include: { items: { include: { product: true } }, outputProduct: true }
        });
        if (!recipe) throw Object.assign(new Error('Recipe not found or inactive'), { status: 404 });
        outputProductId = recipe.outputProductId;
        const scale = Number(data.outputQty) / Number(recipe.outputQty || 1);
        inputs = recipe.items.map((item) => ({
          productId: item.productId,
          qty: Number(item.qty) * scale * (1 + Number(item.wastagePercent || 0) / 100),
          unitCost: Number(item.product?.costPrice || 0)
        }));
      }

      if (!outputProductId) throw Object.assign(new Error('Output product is required for manual production'), { status: 400 });
      if (!inputs.length) throw Object.assign(new Error('At least one raw material/input product is required'), { status: 400 });

      const outputProduct = await ensureProduct(tx, req.user.tenantId, outputProductId, 'Output product');
      const inputRows = [];
      let inputCost = 0;

      for (const input of inputs) {
        const product = await ensureProduct(tx, req.user.tenantId, input.productId, 'Raw material');
        await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id });
        const stock = await tx.productStock.findUnique({ where: { tenantId_productId_warehouseId: { tenantId: req.user.tenantId, productId: product.id, warehouseId: warehouse.id } } });
        if (Number(stock?.quantity || 0) < Number(input.qty)) {
          throw Object.assign(new Error(`Not enough stock for raw material: ${product.name}. Available ${Number(stock?.quantity || 0)}, required ${Number(input.qty)}`), { status: 400 });
        }
        const unitCost = money(input.unitCost ?? product.costPrice ?? 0);
        const total = money(Number(input.qty) * unitCost);
        inputCost = money(inputCost + total);
        inputRows.push({ product, qty: Number(input.qty), unitCost, total });
      }

      await ensureProductStock(tx, { tenantId: req.user.tenantId, productId: outputProduct.id, warehouseId: warehouse.id });
      const totalCost = money(inputCost + Number(data.additionalCost || 0));
      const unitCost = money(totalCost / Number(data.outputQty || 1));

      const order = await tx.manufacturingOrder.create({
        data: {
          tenantId: req.user.tenantId,
          recipeId: recipe?.id || null,
          warehouseId: warehouse.id,
          outputProductId: outputProduct.id,
          orderNo: await nextOrderNo(tx, req.user.tenantId),
          status: 'POSTED',
          productionDate: data.productionDate || new Date(),
          outputQty: data.outputQty,
          inputCost,
          additionalCost: money(data.additionalCost || 0),
          totalCost,
          unitCost,
          notes: data.notes || null,
          createdById: req.user.id,
          inputs: { create: inputRows.map((row) => ({ productId: row.product.id, warehouseId: warehouse.id, qty: row.qty, unitCost: row.unitCost, total: row.total })) },
          outputs: { create: [{ productId: outputProduct.id, warehouseId: warehouse.id, qty: data.outputQty, unitCost, total: totalCost }] }
        },
        include: includeOrder()
      });

      for (const row of inputRows) {
        await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: row.product.id, warehouseId: warehouse.id, quantity: -row.qty });
        await tx.product.update({ where: { id: row.product.id }, data: { stockQty: { decrement: row.qty } } });
        await tx.stockMovement.create({
          data: {
            tenantId: req.user.tenantId,
            productId: row.product.id,
            warehouseId: warehouse.id,
            type: 'MANUFACTURING',
            quantity: -row.qty,
            unitCost: row.unitCost,
            refType: 'ManufacturingOrder',
            refId: order.id,
            notes: `${order.orderNo}: raw material consumed`
          }
        });
      }

      await addWarehouseStock(tx, { tenantId: req.user.tenantId, productId: outputProduct.id, warehouseId: warehouse.id, quantity: Number(data.outputQty) });
      await tx.product.update({
        where: { id: outputProduct.id },
        data: {
          stockQty: { increment: Number(data.outputQty) },
          ...(data.updateOutputCost ? { costPrice: unitCost } : {})
        }
      });
      await tx.stockMovement.create({
        data: {
          tenantId: req.user.tenantId,
          productId: outputProduct.id,
          warehouseId: warehouse.id,
          type: 'MANUFACTURING',
          quantity: data.outputQty,
          unitCost,
          refType: 'ManufacturingOrder',
          refId: order.id,
          notes: `${order.orderNo}: finished goods produced`
        }
      });

      await postManufacturingJournal(tx, { tenantId: req.user.tenantId, order, createdById: req.user.id });
      return order;
    });

    await audit(req, 'CREATE', 'ManufacturingOrder', result.id, null, result);
    await createNotification({
      tenantId: req.user.tenantId,
      userId: req.user.id,
      type: 'SUCCESS',
      title: 'Manufacturing order posted',
      message: `${result.orderNo} produced ${Number(result.outputQty)} ${result.outputProduct?.name || 'finished item'} in ${result.warehouse?.name || 'warehouse'}.`,
      priority: 'NORMAL',
      entityType: 'ManufacturingOrder',
      entityId: result.id,
      actionUrl: '/manufacturing'
    });
    if (Number(result.totalCost || 0) > 50000) {
      await notifyTenantRoles({
        tenantId: req.user.tenantId,
        roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
        type: 'INFO',
        title: 'High value production posted',
        message: `${result.orderNo} total production cost is LKR ${Number(result.totalCost || 0).toFixed(2)}.`,
        priority: 'NORMAL',
        entityType: 'ManufacturingOrder',
        entityId: result.id,
        actionUrl: '/manufacturing'
      });
    }
    res.status(201).json(normalizeOrder(result));
  } catch (e) { next(e); }
});

export default router;
