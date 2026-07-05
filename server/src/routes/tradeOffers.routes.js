import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { can } from '../lib/permissions.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';

const router = Router();
router.use(authRequired);

function allowTradeOffers(action = 'read') {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ message: 'Authentication required' });
    const role = req.user.role;
    const direct = [`tradeOffers:${action}`, 'tradeOffers:*'];
    const fallbackRead = ['distribution:read', 'shopSupply:read', 'product:read', 'customer:read'];
    const fallbackWrite = ['distribution:update', 'shopSupply:update', 'product:update', 'campaign:update'];
    const allowed = can(role, '*')
      || direct.some((permission) => can(role, permission))
      || (action === 'read' ? fallbackRead : fallbackWrite).some((permission) => can(role, permission));
    if (!allowed) return res.status(403).json({ message: `Permission denied: tradeOffers:${action}` });
    next();
  };
}

const priceListSchema = z.object({
  productId: z.string().uuid(),
  shopId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  priceType: z.enum(['SHOP_SPECIAL', 'ROUTE_PRICE', 'CUSTOMER_GROUP_PRICE', 'DEALER_PRICE', 'WHOLESALE_PRICE']).optional().default('SHOP_SPECIAL'),
  unitPrice: z.coerce.number().positive(),
  minQty: z.coerce.number().nonnegative().optional().default(0),
  validFrom: z.coerce.date().optional(),
  validTo: z.coerce.date().optional().nullable(),
  isActive: z.coerce.boolean().optional().default(true),
  priority: z.coerce.number().int().optional().default(10),
  notes: z.string().trim().max(800).optional().nullable()
});

const offerSchema = z.object({
  name: z.string().trim().min(2).max(160),
  offerType: z.enum(['BUY_X_GET_Y', 'PERCENT_DISCOUNT', 'AMOUNT_DISCOUNT', 'BULK_PRICE']).optional().default('BUY_X_GET_Y'),
  status: z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT']).optional().default('ACTIVE'),
  appliesTo: z.enum(['ALL_SHOPS', 'ROUTE', 'SHOP', 'CUSTOMER', 'CUSTOMER_GROUP', 'PRODUCT']).optional().default('ALL_SHOPS'),
  priority: z.coerce.number().int().optional().default(10),
  productId: z.string().uuid().optional().nullable(),
  freeProductId: z.string().uuid().optional().nullable(),
  shopId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  customerGroup: z.string().trim().max(80).optional().nullable(),
  minQty: z.coerce.number().nonnegative().optional().default(0),
  minAmount: z.coerce.number().nonnegative().optional().default(0),
  buyQty: z.coerce.number().nonnegative().optional().default(0),
  freeQty: z.coerce.number().nonnegative().optional().default(0),
  discountType: z.enum(['NONE', 'PERCENT', 'AMOUNT', 'PRICE_OVERRIDE']).optional().default('NONE'),
  discountValue: z.coerce.number().nonnegative().optional().default(0),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional().nullable(),
  usageLimit: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable()
}).refine((data) => {
  if (data.offerType === 'BUY_X_GET_Y') return Number(data.buyQty || 0) > 0 && Number(data.freeQty || 0) > 0;
  if (data.offerType === 'PERCENT_DISCOUNT') return Number(data.discountValue || 0) > 0 && Number(data.discountValue || 0) <= 100;
  if (data.offerType === 'AMOUNT_DISCOUNT') return Number(data.discountValue || 0) > 0;
  if (data.offerType === 'BULK_PRICE') return Number(data.discountValue || 0) > 0;
  return true;
}, { message: 'Offer values are not valid for selected offer type' });

const calculateSchema = z.object({
  shopId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  routeId: z.string().uuid().optional().nullable(),
  items: z.array(z.object({
    productId: z.string().uuid(),
    qty: z.coerce.number().positive(),
    unitPrice: z.coerce.number().nonnegative().optional().nullable()
  })).min(1)
});

function asMoney(value) { return money(Number(value || 0)); }
function asQty(value) { return Number(Number(value || 0).toFixed(3)); }
function isLiveDate(row, now = new Date()) {
  const start = row.startDate || row.validFrom || new Date(0);
  const end = row.endDate || row.validTo;
  return new Date(start) <= now && (!end || new Date(end) >= now);
}

async function nextNo(tx, model, tenantId, field, prefix, start = 1001) {
  const count = await tx[model].count({ where: { tenantId } });
  return `${prefix}${String(count + start).padStart(4, '0')}`;
}

async function mapRows(model, tenantId, ids, select) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length || !prisma[model]) return new Map();
  const rows = await prisma[model].findMany({ where: { tenantId, id: { in: unique } }, select });
  return new Map(rows.map((row) => [row.id, row]));
}

function offerMatchesContext(offer, context = {}, productId = null) {
  if (!isLiveDate(offer)) return false;
  if (offer.status !== 'ACTIVE') return false;
  if (offer.usageLimit && Number(offer.usedCount || 0) >= Number(offer.usageLimit)) return false;
  if (offer.productId && productId && offer.productId !== productId) return false;
  if (offer.appliesTo === 'SHOP') return offer.shopId && offer.shopId === context.shopId;
  if (offer.appliesTo === 'CUSTOMER') return offer.customerId && offer.customerId === context.customerId;
  if (offer.appliesTo === 'ROUTE') return offer.routeId && offer.routeId === context.routeId;
  if (offer.appliesTo === 'PRODUCT') return !offer.productId || offer.productId === productId;
  if (offer.appliesTo === 'CUSTOMER_GROUP') return offer.customerGroup && offer.customerGroup === context.customerGroup;
  return true;
}

function priceMatchesContext(price, context = {}, productId) {
  if (!price.isActive || price.productId !== productId || !isLiveDate(price)) return false;
  if (price.shopId && price.shopId !== context.shopId) return false;
  if (price.customerId && price.customerId !== context.customerId) return false;
  if (price.routeId && price.routeId !== context.routeId) return false;
  return true;
}

function normalizePrice(row, maps = {}) {
  return {
    ...row,
    unitPrice: asMoney(row.unitPrice),
    minQty: asQty(row.minQty),
    productName: maps.products?.get(row.productId)?.name || null,
    productSku: maps.products?.get(row.productId)?.sku || null,
    shopName: maps.shops?.get(row.shopId)?.shopName || null,
    routeName: maps.routes?.get(row.routeId)?.name || null,
    customerName: maps.customers?.get(row.customerId)?.name || null
  };
}

function normalizeOffer(row, maps = {}) {
  return {
    ...row,
    minQty: asQty(row.minQty),
    minAmount: asMoney(row.minAmount),
    buyQty: asQty(row.buyQty),
    freeQty: asQty(row.freeQty),
    discountValue: asMoney(row.discountValue),
    productName: maps.products?.get(row.productId)?.name || null,
    freeProductName: maps.products?.get(row.freeProductId)?.name || null,
    shopName: maps.shops?.get(row.shopId)?.shopName || null,
    routeName: maps.routes?.get(row.routeId)?.name || null,
    customerName: maps.customers?.get(row.customerId)?.name || null
  };
}

async function buildMaps(rows, tenantId) {
  const productIds = rows.flatMap((r) => [r.productId, r.freeProductId]).filter(Boolean);
  return {
    products: await mapRows('product', tenantId, productIds, { id: true, name: true, sku: true, salePrice: true }),
    shops: await mapRows('shopProfile', tenantId, rows.map((r) => r.shopId), { id: true, shopName: true, shopCode: true }),
    routes: await mapRows('distributionRoute', tenantId, rows.map((r) => r.routeId), { id: true, routeNo: true, name: true }),
    customers: await mapRows('customer', tenantId, rows.map((r) => r.customerId), { id: true, name: true, groupName: true })
  };
}

router.get('/summary', allowTradeOffers('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const [activeOffers, pausedOffers, activePrices, redemptions, priceRules] = await Promise.all([
      prisma.tradeOffer.count({ where: { tenantId, status: 'ACTIVE', startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] } }),
      prisma.tradeOffer.count({ where: { tenantId, status: 'PAUSED' } }),
      prisma.shopPriceList.count({ where: { tenantId, isActive: true, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] } }),
      prisma.tradeOfferRedemption.aggregate({ where: { tenantId }, _sum: { discountAmount: true, freeQty: true }, _count: true }),
      prisma.shopPriceList.groupBy({ by: ['priceType'], where: { tenantId, isActive: true }, _count: true }).catch(() => [])
    ]);

    res.json({
      activeOffers,
      pausedOffers,
      activePrices,
      redemptionCount: redemptions._count,
      discountGiven: asMoney(redemptions._sum.discountAmount),
      freeQtyGiven: asQty(redemptions._sum.freeQty),
      priceRuleBreakdown: priceRules.map((row) => ({ priceType: row.priceType, count: row._count }))
    });
  } catch (e) { next(e); }
});

router.get('/master-data', allowTradeOffers('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const [products, shops, routes, customers] = await Promise.all([
      prisma.product.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 700 }),
      prisma.shopProfile.findMany({ where: { tenantId, isActive: true }, orderBy: { shopName: 'asc' }, take: 500 }),
      prisma.distributionRoute.findMany({ where: { tenantId, isActive: true }, orderBy: { routeNo: 'asc' }, take: 200 }),
      prisma.customer.findMany({ where: { tenantId, isActive: true }, orderBy: { name: 'asc' }, take: 500 })
    ]);
    res.json({
      products,
      shops,
      routes,
      customers,
      offerTypes: ['BUY_X_GET_Y', 'PERCENT_DISCOUNT', 'AMOUNT_DISCOUNT', 'BULK_PRICE'],
      appliesTo: ['ALL_SHOPS', 'ROUTE', 'SHOP', 'CUSTOMER', 'CUSTOMER_GROUP', 'PRODUCT'],
      priceTypes: ['SHOP_SPECIAL', 'ROUTE_PRICE', 'CUSTOMER_GROUP_PRICE', 'DEALER_PRICE', 'WHOLESALE_PRICE']
    });
  } catch (e) { next(e); }
});

router.get('/price-list', allowTradeOffers('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, productId, shopId, routeId, priceType, active } = req.query;
    const where = { tenantId };
    if (productId) where.productId = String(productId);
    if (shopId) where.shopId = String(shopId);
    if (routeId) where.routeId = String(routeId);
    if (priceType) where.priceType = String(priceType);
    if (active === 'true') where.isActive = true;
    if (active === 'false') where.isActive = false;
    if (q) where.OR = [{ priceNo: { contains: String(q), mode: 'insensitive' } }, { notes: { contains: String(q), mode: 'insensitive' } }];
    const rows = await prisma.shopPriceList.findMany({ where, orderBy: [{ isActive: 'desc' }, { priority: 'asc' }, { updatedAt: 'desc' }], take: 200 });
    const maps = await buildMaps(rows, tenantId);
    res.json(rows.map((row) => normalizePrice(row, maps)));
  } catch (e) { next(e); }
});

router.post('/price-list', allowTradeOffers('create'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const data = priceListSchema.parse(req.body);
    const product = await prisma.product.findFirst({ where: { id: data.productId, tenantId } });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const row = await prisma.$transaction(async (tx) => tx.shopPriceList.create({
      data: {
        tenantId,
        priceNo: await nextNo(tx, 'shopPriceList', tenantId, 'priceNo', 'PL'),
        ...data,
        validFrom: data.validFrom || new Date(),
        createdById: req.user.id
      }
    }));
    await audit(req, 'CREATE', 'ShopPriceList', row.id, null, row).catch(() => {});
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/price-list/:id', allowTradeOffers('update'), async (req, res, next) => {
  try {
    const existing = await prisma.shopPriceList.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!existing) return res.status(404).json({ message: 'Price list rule not found' });
    const data = priceListSchema.partial().parse(req.body);
    const row = await prisma.shopPriceList.update({ where: { id: existing.id }, data });
    await audit(req, 'UPDATE', 'ShopPriceList', row.id, existing, row).catch(() => {});
    res.json(row);
  } catch (e) { next(e); }
});

router.get('/offers', allowTradeOffers('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const { q, status, offerType, appliesTo, productId } = req.query;
    const where = { tenantId };
    if (status) where.status = String(status);
    if (offerType) where.offerType = String(offerType);
    if (appliesTo) where.appliesTo = String(appliesTo);
    if (productId) where.productId = String(productId);
    if (q) where.OR = [
      { offerNo: { contains: String(q), mode: 'insensitive' } },
      { name: { contains: String(q), mode: 'insensitive' } },
      { notes: { contains: String(q), mode: 'insensitive' } }
    ];
    const rows = await prisma.tradeOffer.findMany({ where, orderBy: [{ status: 'asc' }, { priority: 'asc' }, { updatedAt: 'desc' }], take: 200 });
    const maps = await buildMaps(rows, tenantId);
    res.json(rows.map((row) => normalizeOffer(row, maps)));
  } catch (e) { next(e); }
});

router.post('/offers', allowTradeOffers('create'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const data = offerSchema.parse(req.body);
    if (data.productId) {
      const product = await prisma.product.findFirst({ where: { id: data.productId, tenantId } });
      if (!product) return res.status(404).json({ message: 'Offer product not found' });
    }
    if (data.freeProductId) {
      const freeProduct = await prisma.product.findFirst({ where: { id: data.freeProductId, tenantId } });
      if (!freeProduct) return res.status(404).json({ message: 'Free product not found' });
    }
    const row = await prisma.$transaction(async (tx) => tx.tradeOffer.create({
      data: {
        tenantId,
        offerNo: await nextNo(tx, 'tradeOffer', tenantId, 'offerNo', 'OFR'),
        ...data,
        startDate: data.startDate || new Date(),
        createdById: req.user.id
      }
    }));
    await audit(req, 'CREATE', 'TradeOffer', row.id, null, row).catch(() => {});
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/offers/:id/status', allowTradeOffers('update'), async (req, res, next) => {
  try {
    const status = z.enum(['ACTIVE', 'PAUSED', 'EXPIRED', 'DRAFT']).parse(req.body.status);
    const existing = await prisma.tradeOffer.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!existing) return res.status(404).json({ message: 'Trade offer not found' });
    const row = await prisma.tradeOffer.update({ where: { id: existing.id }, data: { status } });
    await audit(req, 'UPDATE_STATUS', 'TradeOffer', row.id, existing, row).catch(() => {});
    res.json(row);
  } catch (e) { next(e); }
});

router.post('/calculate', allowTradeOffers('read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const data = calculateSchema.parse(req.body);
    const now = new Date();
    const productIds = data.items.map((item) => item.productId);
    const [products, priceRows, offerRows, shop, customer] = await Promise.all([
      prisma.product.findMany({ where: { tenantId, id: { in: productIds } } }),
      prisma.shopPriceList.findMany({ where: { tenantId, isActive: true, productId: { in: productIds }, validFrom: { lte: now }, OR: [{ validTo: null }, { validTo: { gte: now } }] }, orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }] }),
      prisma.tradeOffer.findMany({ where: { tenantId, status: 'ACTIVE', startDate: { lte: now }, OR: [{ endDate: null }, { endDate: { gte: now } }] }, orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }] }),
      data.shopId ? prisma.shopProfile.findFirst({ where: { tenantId, id: data.shopId } }) : null,
      data.customerId ? prisma.customer.findFirst({ where: { tenantId, id: data.customerId } }) : null
    ]);
    const productMap = new Map(products.map((product) => [product.id, product]));
    const context = { ...data, customerGroup: customer?.groupName || shop?.shopCategory || null };

    const lines = data.items.map((item) => {
      const product = productMap.get(item.productId);
      const qty = Number(item.qty || 0);
      const priceRule = priceRows.find((price) => priceMatchesContext(price, context, item.productId) && qty >= Number(price.minQty || 0));
      const basePrice = Number(item.unitPrice ?? priceRule?.unitPrice ?? product?.salePrice ?? 0);
      let unitPrice = basePrice;
      let discount = 0;
      const freeItems = [];
      const appliedOffers = [];

      for (const offer of offerRows) {
        if (!offerMatchesContext(offer, context, item.productId)) continue;
        const lineAmount = qty * unitPrice;
        if (Number(offer.minQty || 0) > 0 && qty < Number(offer.minQty || 0)) continue;
        if (Number(offer.minAmount || 0) > 0 && lineAmount < Number(offer.minAmount || 0)) continue;

        if (offer.offerType === 'BUY_X_GET_Y') {
          const buyQty = Number(offer.buyQty || 0);
          const freeQty = Number(offer.freeQty || 0);
          if (buyQty > 0 && freeQty > 0) {
            const earned = Math.floor(qty / buyQty) * freeQty;
            if (earned > 0) {
              freeItems.push({ offerId: offer.id, productId: offer.freeProductId || item.productId, qty: earned, offerName: offer.name });
              appliedOffers.push({ id: offer.id, name: offer.name, offerType: offer.offerType, value: earned });
            }
          }
        }

        if (offer.offerType === 'PERCENT_DISCOUNT') {
          const amount = asMoney(lineAmount * (Number(offer.discountValue || 0) / 100));
          discount += amount;
          appliedOffers.push({ id: offer.id, name: offer.name, offerType: offer.offerType, value: amount });
        }

        if (offer.offerType === 'AMOUNT_DISCOUNT') {
          const amount = Math.min(lineAmount, Number(offer.discountValue || 0));
          discount += amount;
          appliedOffers.push({ id: offer.id, name: offer.name, offerType: offer.offerType, value: amount });
        }

        if (offer.offerType === 'BULK_PRICE') {
          unitPrice = Number(offer.discountValue || unitPrice);
          appliedOffers.push({ id: offer.id, name: offer.name, offerType: offer.offerType, value: unitPrice });
        }
      }

      const gross = asMoney(qty * unitPrice);
      const net = asMoney(Math.max(gross - discount, 0));
      return { productId: item.productId, productName: product?.name || 'Unknown product', qty, unitPrice: asMoney(unitPrice), gross, discount: asMoney(discount), net, priceRule: priceRule ? normalizePrice(priceRule) : null, appliedOffers, freeItems };
    });

    const freeItems = lines.flatMap((line) => line.freeItems);
    res.json({
      shopId: data.shopId || null,
      routeId: data.routeId || null,
      subtotal: asMoney(lines.reduce((sum, line) => sum + line.gross, 0)),
      discount: asMoney(lines.reduce((sum, line) => sum + line.discount, 0)),
      total: asMoney(lines.reduce((sum, line) => sum + line.net, 0)),
      freeItems,
      lines
    });
  } catch (e) { next(e); }
});

export default router;
