import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { audit } from '../utils/audit.js';

const router = Router();
router.use(authRequired);

const companySchema = z.object({
  name: z.string().min(2).optional(),
  businessType: z.string().min(2).optional(),
  email: z.preprocess((v) => v === '' ? null : v, z.string().email().nullable().optional()),
  phone: z.string().optional().nullable(),
  logoUrl: z.preprocess((v) => v === '' ? null : v, z.string().url().nullable().optional()),
  currency: z.string().min(2).max(10).optional(),
  timezone: z.string().min(2).optional(),
  legalName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  taxNumber: z.string().optional().nullable(),
  website: z.string().optional().nullable(),
  invoicePrefix: z.string().min(1).max(12).optional(),
  receiptPrefix: z.string().min(1).max(12).optional(),
  invoiceTemplate: z.string().optional(),
  invoiceAccentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  invoiceFooter: z.string().optional().nullable(),
  invoiceTerms: z.string().optional().nullable(),
  showLogo: z.boolean().optional(),
  showTaxNumber: z.boolean().optional()
});

const taxSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(2),
  rate: z.coerce.number().min(0).max(100),
  isDefault: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true)
});

router.get('/', requirePermission('settings:read'), async (req, res, next) => {
  try {
    let settings = await prisma.tenantSetting.findUnique({ where: { tenantId: req.user.tenantId } });
    if (!settings) {
      settings = await prisma.tenantSetting.create({ data: { tenantId: req.user.tenantId } });
    }
    const tenant = await prisma.tenant.findUnique({ where: { id: req.user.tenantId } });
    const taxRates = await prisma.taxRate.findMany({ where: { tenantId: req.user.tenantId }, orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] });
    res.json({ tenant, settings, taxRates });
  } catch (e) { next(e); }
});

router.put('/company', requirePermission('settings:update'), async (req, res, next) => {
  try {
    const data = companySchema.parse(req.body);
    const before = await prisma.tenant.findUnique({ where: { id: req.user.tenantId }, include: { settings: true } });
    const tenantData = {
      name: data.name,
      businessType: data.businessType,
      email: data.email,
      phone: data.phone,
      logoUrl: data.logoUrl === '' ? null : data.logoUrl,
      currency: data.currency,
      timezone: data.timezone
    };
    Object.keys(tenantData).forEach((key) => tenantData[key] === undefined && delete tenantData[key]);

    const settingData = {
      legalName: data.legalName,
      address: data.address,
      taxNumber: data.taxNumber,
      website: data.website,
      invoicePrefix: data.invoicePrefix,
      receiptPrefix: data.receiptPrefix,
      invoiceTemplate: data.invoiceTemplate,
      invoiceAccentColor: data.invoiceAccentColor,
      invoiceFooter: data.invoiceFooter,
      invoiceTerms: data.invoiceTerms,
      showLogo: data.showLogo,
      showTaxNumber: data.showTaxNumber
    };
    Object.keys(settingData).forEach((key) => settingData[key] === undefined && delete settingData[key]);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.update({ where: { id: req.user.tenantId }, data: tenantData });
      const settings = await tx.tenantSetting.upsert({
        where: { tenantId: req.user.tenantId },
        update: settingData,
        create: { tenantId: req.user.tenantId, ...settingData }
      });
      return { tenant, settings };
    });

    await audit(req, 'UPDATE', 'TenantSettings', req.user.tenantId, before, result);
    res.json(result);
  } catch (e) { next(e); }
});

router.post('/tax-rates', requirePermission('settings:update'), async (req, res, next) => {
  try {
    const data = taxSchema.parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      if (data.isDefault) {
        await tx.taxRate.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      }
      if (data.id) {
        const existing = await tx.taxRate.findFirst({ where: { id: data.id, tenantId: req.user.tenantId } });
        if (!existing) throw Object.assign(new Error('Tax rate not found'), { status: 404 });
        return tx.taxRate.update({ where: { id: data.id }, data: { name: data.name, rate: data.rate, isDefault: data.isDefault, isActive: data.isActive } });
      }
      return tx.taxRate.create({ data: { tenantId: req.user.tenantId, name: data.name, rate: data.rate, isDefault: data.isDefault, isActive: data.isActive } });
    });
    await audit(req, data.id ? 'UPDATE' : 'CREATE', 'TaxRate', result.id, null, result);
    res.status(data.id ? 200 : 201).json(result);
  } catch (e) { next(e); }
});

router.patch('/tax-rates/:id/default', requirePermission('settings:update'), async (req, res, next) => {
  try {
    const found = await prisma.taxRate.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!found) return res.status(404).json({ message: 'Tax rate not found' });
    const result = await prisma.$transaction(async (tx) => {
      await tx.taxRate.updateMany({ where: { tenantId: req.user.tenantId }, data: { isDefault: false } });
      return tx.taxRate.update({ where: { id: req.params.id }, data: { isDefault: true, isActive: true } });
    });
    await audit(req, 'SET_DEFAULT', 'TaxRate', result.id, found, result);
    res.json(result);
  } catch (e) { next(e); }
});

router.delete('/tax-rates/:id', requirePermission('settings:update'), async (req, res, next) => {
  try {
    const found = await prisma.taxRate.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!found) return res.status(404).json({ message: 'Tax rate not found' });
    const result = await prisma.taxRate.update({ where: { id: req.params.id }, data: { isActive: false, isDefault: false } });
    await audit(req, 'DISABLE', 'TaxRate', result.id, found, result);
    res.json(result);
  } catch (e) { next(e); }
});

export default router;
