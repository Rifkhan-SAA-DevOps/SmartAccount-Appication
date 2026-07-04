import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const plans = [
    {
      name: 'Free Trial', code: 'FREE_TRIAL', monthlyPrice: 0,
      maxUsers: 1, maxProducts: 20, maxInvoicesPerMonth: 30, maxBranches: 1,
      allowPos: false, allowInventory: true, allowReports: true, allowAdvancedReports: false, allowApprovals: false, allowManufacturing: false, allowBatchTracking: false, allowServiceJobs: false, allowCrm: false, allowQuotations: false, allowHrPayroll: false, allowProjects: false, allowInstallments: false, allowBankReconciliation: false, allowFixedAssets: false, allowMultiCurrency: false, allowLoyalty: false, allowDelivery: false, allowBudgeting: false, allowCampaigns: false, allowDashboardBuilder: false
    },
    {
      name: 'Shop', code: 'SHOP', monthlyPrice: 2500,
      maxUsers: 3, maxProducts: 1000, maxInvoicesPerMonth: 2000, maxBranches: 1,
      allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: false, allowApprovals: false, allowManufacturing: false, allowBatchTracking: true, allowServiceJobs: true, allowCrm: true, allowQuotations: true, allowHrPayroll: true, allowProjects: true, allowInstallments: true, allowBankReconciliation: true, allowFixedAssets: true, allowMultiCurrency: true, allowLoyalty: true, allowDelivery: true, allowBudgeting: true, allowCampaigns: true, allowDashboardBuilder: true
    },
    {
      name: 'Business', code: 'BUSINESS', monthlyPrice: 6000,
      maxUsers: 10, maxProducts: 10000, maxInvoicesPerMonth: 20000, maxBranches: 5,
      allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: true, allowMultiWarehouse: true, allowApprovals: true, allowManufacturing: true, allowBatchTracking: true, allowServiceJobs: true, allowCrm: true, allowQuotations: true, allowHrPayroll: true, allowProjects: true, allowInstallments: true, allowBankReconciliation: true, allowFixedAssets: true, allowMultiCurrency: true, allowLoyalty: true, allowDelivery: true, allowBudgeting: true, allowCampaigns: true, allowDashboardBuilder: true
    }
  ];

  for (const plan of plans) {
    await prisma.subscriptionPlan.upsert({
      where: { code: plan.code },
      update: plan,
      create: plan
    });
  }

  const freePlan = await prisma.subscriptionPlan.findUnique({ where: { code: 'BUSINESS' } });

  const tenant = await prisma.tenant.upsert({
    where: { code: 'DEMO' },
    update: {},
    create: {
      name: 'Demo Smart Shop',
      code: 'DEMO',
      businessType: 'shop',
      email: 'owner@demo.com',
      phone: '0710000000',
      status: 'TRIAL'
    }
  });

  await prisma.tenantSubscription.upsert({
    where: { tenantId: tenant.id },
    update: { planId: freePlan.id },
    create: {
      tenantId: tenant.id,
      planId: freePlan.id,
      status: 'trial',
      trialEndsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000)
    }
  });


  const loyaltyTiers = [
    { name: 'Bronze', minPoints: 0, discountPercent: 0, pointsMultiplier: 1, priority: 10 },
    { name: 'Silver', minPoints: 500, discountPercent: 2, pointsMultiplier: 1.25, priority: 20 },
    { name: 'Gold', minPoints: 1500, discountPercent: 5, pointsMultiplier: 1.5, priority: 30 },
    { name: 'VIP', minPoints: 5000, discountPercent: 10, pointsMultiplier: 2, priority: 40 }
  ];
  for (const tier of loyaltyTiers) {
    await prisma.loyaltyTier.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: tier.name } },
      update: { ...tier, isActive: true },
      create: { tenantId: tenant.id, ...tier, isActive: true }
    });
  }

  await prisma.loyaltyRule.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'Default Loyalty Rule' } },
    update: { earnAmountStep: 100, earnPoints: 1, redemptionValue: 1, minRedeemPoints: 100, isDefault: true, isActive: true },
    create: { tenantId: tenant.id, name: 'Default Loyalty Rule', earnAmountStep: 100, earnPoints: 1, redemptionValue: 1, minRedeemPoints: 100, isDefault: true, isActive: true }
  });

  const defaultCurrencies = [
    { code: 'LKR', name: 'Sri Lankan Rupee', symbol: 'Rs', isBase: true },
    { code: 'USD', name: 'US Dollar', symbol: '$', isBase: false },
    { code: 'EUR', name: 'Euro', symbol: '€', isBase: false },
    { code: 'GBP', name: 'British Pound', symbol: '£', isBase: false },
    { code: 'INR', name: 'Indian Rupee', symbol: '₹', isBase: false }
  ];
  for (const currency of defaultCurrencies) {
    await prisma.currency.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: currency.code } },
      update: { ...currency, isActive: true },
      create: { tenantId: tenant.id, ...currency, isActive: true }
    });
  }

  const sampleRates = [
    { fromCurrency: 'USD', toCurrency: 'LKR', rate: 305, source: 'Seed' },
    { fromCurrency: 'EUR', toCurrency: 'LKR', rate: 330, source: 'Seed' },
    { fromCurrency: 'GBP', toCurrency: 'LKR', rate: 390, source: 'Seed' },
    { fromCurrency: 'INR', toCurrency: 'LKR', rate: 3.65, source: 'Seed' }
  ];
  for (const rate of sampleRates) {
    await prisma.exchangeRate.create({ data: { tenantId: tenant.id, ...rate, rateDate: new Date() } }).catch(() => null);
  }

  const defaultStages = [
    { name: 'New', sortOrder: 10, probability: 10 },
    { name: 'Contacted', sortOrder: 20, probability: 25 },
    { name: 'Quoted', sortOrder: 30, probability: 50 },
    { name: 'Negotiation', sortOrder: 40, probability: 75 },
    { name: 'Won', sortOrder: 90, probability: 100, isWon: true },
    { name: 'Lost', sortOrder: 99, probability: 0, isLost: true }
  ];
  for (const stage of defaultStages) {
    await prisma.crmPipelineStage.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: stage.name } },
      update: stage,
      create: { tenantId: tenant.id, ...stage }
    });
  }

  const branch = await prisma.branch.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Main Branch', code: 'MAIN', isMain: true }
  });

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'MAIN-WH' } },
    update: { isDefault: true, isActive: true },
    create: { tenantId: tenant.id, branchId: branch.id, name: 'Main Warehouse', code: 'MAIN-WH', isDefault: true, isActive: true }
  });

  await prisma.unit.upsert({
    where: { tenantId_symbol: { tenantId: tenant.id, symbol: 'pcs' } },
    update: {},
    create: { tenantId: tenant.id, name: 'Pieces', symbol: 'pcs' }
  });

  const category = await prisma.productCategory.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'General' } },
    update: {},
    create: { tenantId: tenant.id, name: 'General' }
  });

  const unit = await prisma.unit.findFirst({ where: { tenantId: tenant.id, symbol: 'pcs' } });

  await prisma.tenantSetting.upsert({
    where: { tenantId: tenant.id },
    update: { legalName: 'Demo Smart Shop', address: 'Main Street, Colombo', taxNumber: 'VAT-DEMO-001', invoicePrefix: 'INV', receiptPrefix: 'REC', invoiceAccentColor: '#7c3aed' },
    create: { tenantId: tenant.id, legalName: 'Demo Smart Shop', address: 'Main Street, Colombo', taxNumber: 'VAT-DEMO-001', invoicePrefix: 'INV', receiptPrefix: 'REC', invoiceAccentColor: '#7c3aed' }
  });

  await prisma.taxRate.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'No Tax' } },
    update: { rate: 0, isDefault: false, isActive: true },
    create: { tenantId: tenant.id, name: 'No Tax', rate: 0, isDefault: false, isActive: true }
  });

  await prisma.taxRate.upsert({
    where: { tenantId_name: { tenantId: tenant.id, name: 'VAT 18%' } },
    update: { rate: 18, isDefault: true, isActive: true },
    create: { tenantId: tenant.id, name: 'VAT 18%', rate: 18, isDefault: true, isActive: true }
  });

  await prisma.user.upsert({
    where: { email: 'owner@demo.com' },
    update: {},
    create: {
      tenantId: tenant.id,
      name: 'Demo Owner',
      email: 'owner@demo.com',
      passwordHash: await bcrypt.hash('Demo@12345', 10),
      role: 'OWNER'
    }
  });

  await prisma.customer.createMany({
    data: [
      { tenantId: tenant.id, name: 'Walk-in Customer', phone: '0000000000' },
      { tenantId: tenant.id, name: 'Mohamed Ameen', phone: '0771234567', creditLimit: 50000 }
    ],
    skipDuplicates: true
  });

  await prisma.supplier.createMany({
    data: [
      { tenantId: tenant.id, name: 'Main Supplier', phone: '0751112233' }
    ],
    skipDuplicates: true
  });


  const defaultAccounts = [
    { code: '1000', name: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1010', name: 'Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1200', name: 'Inventory Asset', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2100', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '3000', name: 'Owner Capital', type: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '3100', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '4000', name: 'Sales Revenue', type: 'INCOME', normalBalance: 'CREDIT' },
    { code: '4010', name: 'Sales Returns and Allowances', type: 'INCOME', normalBalance: 'DEBIT' },
    { code: '5000', name: 'Cost of Goods Sold', type: 'COST_OF_GOODS_SOLD', normalBalance: 'DEBIT' },
    { code: '6000', name: 'Operating Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6010', name: 'Rent Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6020', name: 'Salary Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6030', name: 'Utility Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6040', name: 'Transport Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '6050', name: 'Inventory Adjustment Expense', type: 'EXPENSE', normalBalance: 'DEBIT' }
  ];

  for (const account of defaultAccounts) {
    await prisma.ledgerAccount.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: account.code } },
      update: { name: account.name, type: account.type, normalBalance: account.normalBalance, isSystem: true, isActive: true },
      create: { tenantId: tenant.id, ...account, isSystem: true }
    });
  }


  const defaultApprovalRules = [
    { name: 'Expense approval over 5,000', type: 'EXPENSE', minAmount: 5000, approverRoles: 'OWNER,ADMIN' },
    { name: 'Purchase order approval over 25,000', type: 'PURCHASE_ORDER', minAmount: 25000, approverRoles: 'OWNER,ADMIN' },
    { name: 'Stock adjustment approval', type: 'STOCK_ADJUSTMENT', minAmount: 0, approverRoles: 'OWNER,ADMIN,INVENTORY_MANAGER' },
    { name: 'Invoice cancel/delete approval', type: 'INVOICE_CANCEL', minAmount: 0, approverRoles: 'OWNER,ADMIN,ACCOUNTANT' },
    { name: 'Manual approval fallback', type: 'GENERAL', minAmount: 0, approverRoles: 'OWNER,ADMIN' }
  ];

  for (const rule of defaultApprovalRules) {
    await prisma.approvalRule.upsert({
      where: { tenantId_name: { tenantId: tenant.id, name: rule.name } },
      update: { type: rule.type, minAmount: rule.minAmount, approverRoles: rule.approverRoles, isActive: true },
      create: { tenantId: tenant.id, ...rule }
    });
  }



  await prisma.reminderSetting.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      lowStockEnabled: true,
      customerCreditEnabled: true,
      supplierPaymentEnabled: true,
      approvalEnabled: true,
      subscriptionEnabled: true,
      emailEnabled: false,
      whatsappEnabled: true,
      whatsappDefaultPhone: '94770000000',
      dailySummaryEmail: 'owner@demo.com'
    }
  });

  const welcomeNotification = await prisma.notification.findFirst({
    where: { tenantId: tenant.id, title: 'Welcome to SmartLedger notifications' }
  });
  if (!welcomeNotification) {
    await prisma.notification.create({
      data: {
        tenantId: tenant.id,
        type: 'INFO',
        title: 'Welcome to SmartLedger notifications',
        message: 'Use Generate alerts to create low stock, credit, payable, approval and subscription reminders.',
        priority: 'NORMAL',
        actionUrl: '/notifications'
      }
    });
  }

  await prisma.product.createMany({
    data: [
      { tenantId: tenant.id, categoryId: category.id, unitId: unit.id, sku: 'P001', barcode: '10001', name: 'Sample Product A', costPrice: 250, salePrice: 350, stockQty: 50, reorderLevel: 10 },
      { tenantId: tenant.id, categoryId: category.id, unitId: unit.id, sku: 'P002', barcode: '10002', name: 'Sample Product B', costPrice: 500, salePrice: 750, stockQty: 20, reorderLevel: 5 }
    ],
    skipDuplicates: true
  });

  const products = await prisma.product.findMany({ where: { tenantId: tenant.id } });
  for (const product of products) {
    await prisma.productStock.upsert({
      where: { tenantId_productId_warehouseId: { tenantId: tenant.id, productId: product.id, warehouseId: mainWarehouse.id } },
      update: { quantity: product.stockQty, reorderLevel: product.reorderLevel },
      create: { tenantId: tenant.id, productId: product.id, warehouseId: mainWarehouse.id, quantity: product.stockQty, reorderLevel: product.reorderLevel }
    });
  }


  const defaultServices = [
    { code: 'SVC-INSTALL', category: 'Installation', name: 'Basic Installation', unitPrice: 2500, costPrice: 800, estimatedMinutes: 90 },
    { code: 'SVC-REPAIR', category: 'Repair', name: 'General Repair / Service', unitPrice: 3500, costPrice: 1200, estimatedMinutes: 120 },
    { code: 'SVC-CONSULT', category: 'Consulting', name: 'Technical Consultation', unitPrice: 1500, costPrice: 300, estimatedMinutes: 45 }
  ];

  for (const service of defaultServices) {
    await prisma.serviceCatalogItem.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: service.code } },
      update: { ...service, isActive: true },
      create: { tenantId: tenant.id, ...service, isActive: true }
    });
  }

  console.log('Seed completed. Login: owner@demo.com / Demo@12345');
}

main().finally(async () => prisma.$disconnect());
