import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const DEMO_PASSWORD = 'Demo@12345';
const now = new Date();

function day(offset) {
  const d = new Date(now);
  d.setDate(d.getDate() + offset);
  return d;
}

function monthStart(offset = 0) {
  return new Date(now.getFullYear(), now.getMonth() + offset, 1);
}

function monthEnd(offset = 0) {
  return new Date(now.getFullYear(), now.getMonth() + offset + 1, 0, 23, 59, 59, 999);
}

function money(value) {
  return Number(Number(value).toFixed(2));
}

async function firstOrCreate(delegate, where, data) {
  const existing = await delegate.findFirst({ where });
  if (existing) return existing;
  return delegate.create({ data });
}

async function upsertBy(delegate, where, create, update = {}) {
  return delegate.upsert({ where, update, create });
}

async function main() {
  console.log('🌱 Starting SmartLedger full demo seed...');

  // ---------------------------------------------------------------------------
  // 1) SaaS foundation: plans, tenant, settings, users
  // ---------------------------------------------------------------------------
  const plans = [
    { name: 'Free Trial', code: 'FREE_TRIAL', monthlyPrice: 0, maxUsers: 1, maxProducts: 20, maxInvoicesPerMonth: 30, maxBranches: 1, allowPos: false, allowInventory: true, allowReports: true, allowAdvancedReports: false },
    { name: 'Starter Shop', code: 'STARTER_SHOP', monthlyPrice: 1500, maxUsers: 2, maxProducts: 200, maxInvoicesPerMonth: 500, maxBranches: 1, allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: false },
    { name: 'Retail Pro', code: 'RETAIL_PRO', monthlyPrice: 3500, maxUsers: 5, maxProducts: 3000, maxInvoicesPerMonth: 5000, maxBranches: 3, allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: true, allowMultiWarehouse: true },
    { name: 'Business', code: 'BUSINESS', monthlyPrice: 6000, maxUsers: 10, maxProducts: 10000, maxInvoicesPerMonth: 20000, maxBranches: 5, allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: true, allowApi: true, allowMultiWarehouse: true, allowApprovals: true, allowManufacturing: true, allowBatchTracking: true, allowServiceJobs: true, allowCrm: true, allowQuotations: true, allowHrPayroll: true, allowProjects: true, allowInstallments: true, allowBankReconciliation: true, allowFixedAssets: true, allowMultiCurrency: true, allowLoyalty: true, allowDelivery: true, allowBudgeting: true, allowCampaigns: true, allowDashboardBuilder: true },
    { name: 'Enterprise', code: 'ENTERPRISE', monthlyPrice: 15000, maxUsers: 50, maxProducts: 100000, maxInvoicesPerMonth: 100000, maxBranches: 25, allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: true, allowApi: true, allowMultiWarehouse: true, allowApprovals: true, allowManufacturing: true, allowBatchTracking: true, allowServiceJobs: true, allowCrm: true, allowQuotations: true, allowHrPayroll: true, allowProjects: true, allowInstallments: true, allowBankReconciliation: true, allowFixedAssets: true, allowMultiCurrency: true, allowLoyalty: true, allowDelivery: true, allowBudgeting: true, allowCampaigns: true, allowDashboardBuilder: true }
  ];

  for (const plan of plans) {
    await upsertBy(prisma.subscriptionPlan, { code: plan.code }, plan, plan);
  }

  const businessPlan = await prisma.subscriptionPlan.findUnique({ where: { code: 'BUSINESS' } });
  const tenant = await upsertBy(
    prisma.tenant,
    { code: 'DEMO' },
    {
      name: 'Demo Smart Super Center',
      code: 'DEMO',
      businessType: 'retail + service + distribution',
      email: 'owner@demo.com',
      phone: '0710000000',
      status: 'TRIAL',
      currency: 'LKR',
      timezone: 'Asia/Colombo'
    },
    {
      name: 'Demo Smart Super Center',
      businessType: 'retail + service + distribution',
      status: 'TRIAL',
      currency: 'LKR',
      timezone: 'Asia/Colombo'
    }
  );

  await upsertBy(
    prisma.tenantSubscription,
    { tenantId: tenant.id },
    { tenantId: tenant.id, planId: businessPlan.id, status: 'trial', trialEndsAt: day(14), currentPeriodEndsAt: day(30) },
    { planId: businessPlan.id, status: 'trial', trialEndsAt: day(14), currentPeriodEndsAt: day(30) }
  );

  await upsertBy(
    prisma.tenantSetting,
    { tenantId: tenant.id },
    {
      tenantId: tenant.id,
      legalName: 'Demo Smart Super Center (Pvt) Ltd',
      address: 'No. 45, Main Street, Colombo 04, Sri Lanka',
      taxNumber: 'VAT-DEMO-001',
      website: 'https://demo.smartledger.local',
      invoicePrefix: 'INV',
      receiptPrefix: 'REC',
      invoiceTemplate: 'modern',
      invoiceAccentColor: '#7c3aed',
      invoiceFooter: 'Thank you for choosing Demo Smart Super Center.',
      invoiceTerms: 'Goods once sold can be returned only according to policy.'
    },
    {
      legalName: 'Demo Smart Super Center (Pvt) Ltd',
      address: 'No. 45, Main Street, Colombo 04, Sri Lanka',
      taxNumber: 'VAT-DEMO-001',
      website: 'https://demo.smartledger.local',
      invoiceTemplate: 'modern',
      invoiceAccentColor: '#7c3aed'
    }
  );

  const taxRates = [
    ['No Tax', 0, false], ['VAT 18%', 18, true], ['VAT 15%', 15, false], ['Service Tax 10%', 10, false], ['NBT 2%', 2, false],
    ['Import Duty 5%', 5, false], ['Luxury Tax 25%', 25, false], ['Eco Fee 1%', 1, false], ['Reduced VAT 8%', 8, false], ['Export Zero Rated', 0, false]
  ];
  for (const [name, rate, isDefault] of taxRates) {
    await upsertBy(prisma.taxRate, { tenantId_name: { tenantId: tenant.id, name } }, { tenantId: tenant.id, name, rate, isDefault, isActive: true }, { rate, isDefault, isActive: true });
  }

  const usersSeed = [
    ['Demo Owner', 'owner@demo.com', 'OWNER'],
    ['Admin Manager', 'admin@demo.com', 'ADMIN'],
    ['Accountant Nisha', 'accountant@demo.com', 'ACCOUNTANT'],
    ['Cashier Ahamed', 'cashier1@demo.com', 'CASHIER'],
    ['Cashier Fathima', 'cashier2@demo.com', 'CASHIER'],
    ['Inventory Ravi', 'inventory@demo.com', 'INVENTORY_MANAGER'],
    ['Sales Shan', 'sales1@demo.com', 'SALES_STAFF'],
    ['Sales Sara', 'sales2@demo.com', 'SALES_STAFF'],
    ['Auditor Perera', 'auditor@demo.com', 'AUDITOR'],
    ['Viewer Iqbal', 'viewer@demo.com', 'VIEWER']
  ];
  const users = [];
  for (const [name, email, role] of usersSeed) {
    users.push(await upsertBy(
      prisma.user,
      { email },
      { tenantId: tenant.id, name, email, passwordHash: await bcrypt.hash(DEMO_PASSWORD, 10), role, isActive: true, lastLoginAt: day(-1) },
      { name, role, isActive: true, lastLoginAt: day(-1) }
    ));
  }
  const owner = users[0];

  // ---------------------------------------------------------------------------
  // 2) Branches, warehouses, categories, units, customers, suppliers, products
  // ---------------------------------------------------------------------------
  const branchSeed = [
    ['Main Branch', 'MAIN', 'Colombo 04'], ['Kandy Branch', 'KDY', 'Kandy City Center'], ['Galle Branch', 'GLE', 'Galle Fort'], ['Jaffna Branch', 'JFN', 'Jaffna Town'], ['Negombo Branch', 'NEG', 'Negombo Road'],
    ['Kurunegala Branch', 'KUR', 'Kurunegala Town'], ['Batticaloa Branch', 'BAT', 'Batticaloa Main'], ['Matara Branch', 'MAT', 'Matara Main'], ['Warehouse Outlet', 'WHO', 'Colombo Warehouse Road'], ['Online Dispatch Hub', 'ODH', 'Colombo Logistics Park']
  ];
  const branches = [];
  for (let i = 0; i < branchSeed.length; i++) {
    const [name, code, address] = branchSeed[i];
    branches.push(await upsertBy(prisma.branch, { tenantId_code: { tenantId: tenant.id, code } }, { tenantId: tenant.id, name, code, address, phone: `01170000${String(i).padStart(2, '0')}`, isMain: i === 0 }, { name, address, isMain: i === 0 }));
  }

  const warehouses = [];
  for (let i = 0; i < branches.length; i++) {
    const code = `${branchSeed[i][1]}-WH`;
    warehouses.push(await upsertBy(prisma.warehouse, { tenantId_code: { tenantId: tenant.id, code } }, { tenantId: tenant.id, branchId: branches[i].id, name: `${branches[i].name} Warehouse`, code, isDefault: i === 0, isActive: true }, { branchId: branches[i].id, isDefault: i === 0, isActive: true }));
  }

  const categoriesSeed = ['Grocery', 'Beverages', 'Electronics', 'Mobile Accessories', 'Stationery', 'Cleaning', 'Bakery', 'Dairy', 'Cosmetics', 'Hardware'];
  const categories = [];
  for (const name of categoriesSeed) {
    categories.push(await upsertBy(prisma.productCategory, { tenantId_name: { tenantId: tenant.id, name } }, { tenantId: tenant.id, name }, { name }));
  }

  const unitsSeed = [['Pieces', 'pcs'], ['Kilogram', 'kg'], ['Gram', 'g'], ['Liter', 'l'], ['Milliliter', 'ml'], ['Packet', 'pkt'], ['Box', 'box'], ['Dozen', 'doz'], ['Meter', 'm'], ['Hour', 'hr']];
  const units = [];
  for (const [name, symbol] of unitsSeed) {
    units.push(await upsertBy(prisma.unit, { tenantId_symbol: { tenantId: tenant.id, symbol } }, { tenantId: tenant.id, name, symbol }, { name }));
  }

  const customersSeed = [
    ['Walk-in Customer', '0000000000', 'walkin@demo.com', 'Retail', 0, 0], ['Mohamed Ameen', '0771234567', 'ameen@example.com', 'Retail', 50000, 12500], ['Fathima Stores', '0772223344', 'fathima.stores@example.com', 'Wholesale', 150000, 42500], ['Nimal Perera', '0715678901', 'nimal@example.com', 'Retail', 30000, 5000], ['Sakura Enterprises', '0761112233', 'sakura@example.com', 'Corporate', 250000, 78000],
    ['Green Cafe', '0754445566', 'greencafe@example.com', 'Restaurant', 100000, 21500], ['Tech World', '0783332211', 'techworld@example.com', 'Dealer', 200000, 64000], ['City Pharmacy', '0729090909', 'pharmacy@example.com', 'Wholesale', 180000, 28000], ['Royal Bakery', '0748887776', 'bakery@example.com', 'Restaurant', 80000, 11250], ['Online Customer', '0791112223', 'online@example.com', 'Online', 20000, 0]
  ];
  const customers = [];
  for (const [name, phone, email, groupName, creditLimit, balance] of customersSeed) {
    customers.push(await firstOrCreate(prisma.customer, { tenantId: tenant.id, phone }, { tenantId: tenant.id, name, phone, email, groupName, creditLimit, balance, loyalty: Math.floor(Number(balance) / 1000), isActive: true }));
  }

  const suppliersSeed = [
    ['Ceylon Grocery Suppliers', '0751112233', 'grocery@supplier.lk', 86000], ['Lanka Beverage Distributors', '0751112234', 'beverage@supplier.lk', 42000], ['Tech Import Lanka', '0751112235', 'tech@supplier.lk', 125000], ['Stationery Hub', '0751112236', 'paper@supplier.lk', 18000], ['CleanPro Wholesale', '0751112237', 'clean@supplier.lk', 22000],
    ['Fresh Dairy Lanka', '0751112238', 'dairy@supplier.lk', 47000], ['BakeMart Supplies', '0751112239', 'bakery@supplier.lk', 39000], ['Cosmetic World', '0751112240', 'cosmetic@supplier.lk', 58000], ['Hardware Direct', '0751112241', 'hardware@supplier.lk', 91000], ['Packaging Plus', '0751112242', 'packaging@supplier.lk', 15000]
  ];
  const suppliers = [];
  for (const [name, phone, email, balance] of suppliersSeed) {
    suppliers.push(await firstOrCreate(prisma.supplier, { tenantId: tenant.id, phone }, { tenantId: tenant.id, name, phone, email, address: `${name} Warehouse, Colombo`, balance, isActive: true }));
  }

  const productsSeed = [
    ['GRC-RICE-5KG', '479100000001', 'Nadu Rice 5kg', 1450, 1720, 90, 20, 0, 1], ['GRC-SUGAR-1KG', '479100000002', 'White Sugar 1kg', 260, 325, 160, 30, 0, 1], ['BEV-TEA-400G', '479100000003', 'Ceylon Tea 400g', 780, 990, 55, 15, 1, 0], ['BEV-JUICE-1L', '479100000004', 'Mango Juice 1L', 340, 480, 25, 10, 1, 3], ['ELC-HEADSET', '479100000005', 'Bluetooth Headset', 1850, 2850, 18, 5, 2, 0],
    ['MOB-CABLE-C', '479100000006', 'USB-C Cable 1m', 380, 650, 75, 20, 3, 0], ['STA-NOTE-A4', '479100000007', 'A4 Notebook 200pg', 210, 350, 130, 25, 4, 0], ['CLN-LIQUID', '479100000008', 'Dishwash Liquid 500ml', 240, 390, 42, 12, 5, 4], ['BAK-BREAD', '479100000009', 'Fresh Bread Large', 130, 220, 35, 10, 6, 0], ['DAI-MILK-1L', '479100000010', 'Fresh Milk 1L', 310, 430, 28, 15, 7, 3],
    ['COS-SHAMPOO', '479100000011', 'Herbal Shampoo 180ml', 520, 790, 22, 8, 8, 4], ['HRD-NAILS', '479100000012', 'Steel Nails 1kg', 390, 610, 65, 15, 9, 1], ['GRC-DHAL-1KG', '479100000013', 'Red Dhal 1kg', 420, 560, 48, 18, 0, 1], ['BEV-WATER-1L', '479100000014', 'Mineral Water 1L', 65, 100, 200, 50, 1, 3], ['ELC-MOUSE', '479100000015', 'Wireless Mouse', 1350, 2150, 16, 6, 2, 0],
    ['MOB-CHARGER', '479100000016', 'Fast Charger 20W', 1450, 2350, 20, 7, 3, 0], ['STA-PEN-BLUE', '479100000017', 'Blue Pen Box', 450, 700, 70, 20, 4, 6], ['CLN-DETERGENT', '479100000018', 'Washing Powder 1kg', 580, 810, 33, 10, 5, 6], ['BAK-CAKE', '479100000019', 'Butter Cake 500g', 420, 650, 12, 8, 6, 6], ['DAI-YOGURT', '479100000020', 'Vanilla Yogurt Cup', 55, 90, 8, 25, 7, 3]
  ];
  const products = [];
  for (const [sku, barcode, name, costPrice, salePrice, stockQty, reorderLevel, catIndex, unitIndex] of productsSeed) {
    products.push(await upsertBy(
      prisma.product,
      { tenantId_sku: { tenantId: tenant.id, sku } },
      { tenantId: tenant.id, categoryId: categories[catIndex].id, unitId: units[unitIndex].id, sku, barcode, name, description: `${name} demo product`, costPrice, salePrice, stockQty, reorderLevel, trackSerial: sku.startsWith('ELC') || sku.startsWith('MOB'), trackExpiry: sku.startsWith('DAI') || sku.startsWith('BAK') || sku.startsWith('CLN'), isActive: true },
      { name, costPrice, salePrice, stockQty, reorderLevel, isActive: true }
    ));
  }

  for (let wi = 0; wi < warehouses.length; wi++) {
    for (let pi = 0; pi < products.length; pi++) {
      const quantity = Math.max(0, Number(products[pi].stockQty) - wi * 3 - (pi % 4));
      await upsertBy(
        prisma.productStock,
        { tenantId_productId_warehouseId: { tenantId: tenant.id, productId: products[pi].id, warehouseId: warehouses[wi].id } },
        { tenantId: tenant.id, productId: products[pi].id, warehouseId: warehouses[wi].id, quantity, reorderLevel: Number(products[pi].reorderLevel) || 5 },
        { quantity, reorderLevel: Number(products[pi].reorderLevel) || 5 }
      );
    }
  }

  // ---------------------------------------------------------------------------
  // 3) Bank/cash, expenses, sales invoices, purchases, returns, payments
  // ---------------------------------------------------------------------------
  const bankSeed = [
    ['Cash Drawer - Main', 'cash', null, null, 85000, true], ['BOC Current Account', 'bank', 'Bank of Ceylon', '701234567', 450000, false], ['Commercial Bank Account', 'bank', 'Commercial Bank', '881234567', 320000, false], ['People\'s Bank Account', 'bank', 'People\'s Bank', '991234567', 160000, false], ['Card Settlement Account', 'bank', 'Sampath Bank', '771234567', 95000, false],
    ['Online Payment Wallet', 'wallet', 'PayHere', 'PH-DEMO-01', 67000, false], ['Petty Cash', 'cash', null, null, 25000, true], ['USD Account', 'bank', 'Commercial Bank', 'USD-12345', 140000, false], ['Delivery Cash Bag', 'cash', null, null, 18000, true], ['Cheque Clearing Account', 'bank', 'HNB', 'HNB-98765', 72000, false]
  ];
  const bankAccounts = [];
  for (const [name, type, bankName, accountNumber, currentBalance, isCashAccount] of bankSeed) {
    bankAccounts.push(await upsertBy(prisma.bankAccount, { tenantId_name: { tenantId: tenant.id, name } }, { tenantId: tenant.id, name, type, bankName, accountNumber, openingBalance: currentBalance, currentBalance, isCashAccount, isActive: true }, { type, bankName, accountNumber, currentBalance, isCashAccount, isActive: true }));
  }

  const expensesSeed = ['Rent', 'Electricity Bill', 'Water Bill', 'Internet Bill', 'Delivery Fuel', 'Staff Tea', 'Cleaning Supplies', 'Marketing Boost', 'Minor Repairs', 'Stationery Purchase'];
  for (let i = 0; i < expensesSeed.length; i++) {
    await firstOrCreate(prisma.expense, { tenantId: tenant.id, expenseNo: `EXP-DEMO-${String(i + 1).padStart(3, '0')}` }, {
      tenantId: tenant.id,
      bankAccountId: bankAccounts[i % bankAccounts.length].id,
      expenseNo: `EXP-DEMO-${String(i + 1).padStart(3, '0')}`,
      title: expensesSeed[i],
      category: ['Rent', 'Utilities', 'Transport', 'Marketing', 'Office'][i % 5],
      amount: money(2500 + i * 1350),
      method: i % 3 === 0 ? 'BANK_TRANSFER' : 'CASH',
      paymentMode: i % 3 === 0 ? 'bank' : 'cash',
      reference: `EXP-REF-${i + 1}`,
      spentAt: day(-i - 1),
      notes: `Demo expense ${i + 1}`,
      createdById: owner.id
    });
  }

  const invoices = [];
  for (let i = 0; i < 10; i++) {
    const p1 = products[i % products.length];
    const p2 = products[(i + 4) % products.length];
    const qty1 = 2 + (i % 3);
    const qty2 = 1 + (i % 2);
    const subtotal = money(Number(p1.salePrice) * qty1 + Number(p2.salePrice) * qty2);
    const discount = i % 4 === 0 ? 250 : 0;
    const tax = money((subtotal - discount) * 0.18);
    const total = money(subtotal - discount + tax);
    const paid = i % 3 === 0 ? total : i % 3 === 1 ? money(total / 2) : 0;
    const balance = money(total - paid);
    const status = balance === 0 ? 'PAID' : paid > 0 ? 'PARTIAL' : 'UNPAID';
    const invoice = await upsertBy(
      prisma.invoice,
      { tenantId_invoiceNo: { tenantId: tenant.id, invoiceNo: `INV-DEMO-${String(i + 1).padStart(3, '0')}` } },
      { tenantId: tenant.id, branchId: branches[i % branches.length].id, customerId: customers[i % customers.length].id, createdById: owner.id, invoiceNo: `INV-DEMO-${String(i + 1).padStart(3, '0')}`, status, issueDate: day(-20 + i), dueDate: day(-5 + i), subtotal, discount, tax, total, paid, balance, notes: `Demo invoice ${i + 1}` },
      { status, subtotal, discount, tax, total, paid, balance }
    );
    invoices.push(invoice);
    await firstOrCreate(prisma.invoiceItem, { invoiceId: invoice.id, description: `${p1.name} demo sale` }, { invoiceId: invoice.id, productId: p1.id, description: `${p1.name} demo sale`, qty: qty1, costPrice: p1.costPrice, unitPrice: p1.salePrice, discount: 0, total: money(Number(p1.salePrice) * qty1) });
    await firstOrCreate(prisma.invoiceItem, { invoiceId: invoice.id, description: `${p2.name} demo sale` }, { invoiceId: invoice.id, productId: p2.id, description: `${p2.name} demo sale`, qty: qty2, costPrice: p2.costPrice, unitPrice: p2.salePrice, discount: 0, total: money(Number(p2.salePrice) * qty2) });
  }

  const purchases = [];
  for (let i = 0; i < 10; i++) {
    const p1 = products[(i + 2) % products.length];
    const p2 = products[(i + 7) % products.length];
    const qty1 = 10 + i;
    const qty2 = 5 + i;
    const subtotal = money(Number(p1.costPrice) * qty1 + Number(p2.costPrice) * qty2);
    const tax = money(subtotal * 0.05);
    const total = money(subtotal + tax);
    const po = await upsertBy(prisma.purchaseOrder, { tenantId_purchaseNo: { tenantId: tenant.id, purchaseNo: `PO-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, supplierId: suppliers[i % suppliers.length].id, purchaseNo: `PO-DEMO-${String(i + 1).padStart(3, '0')}`, status: i % 2 === 0 ? 'RECEIVED' : 'ORDERED', orderDate: day(-25 + i), expectedDate: day(-15 + i), subtotal, tax, total, notes: `Demo purchase order ${i + 1}`, createdById: owner.id }, { status: i % 2 === 0 ? 'RECEIVED' : 'ORDERED', subtotal, tax, total });
    purchases.push(po);
    await firstOrCreate(prisma.purchaseOrderItem, { purchaseOrderId: po.id, description: `${p1.name} purchase` }, { purchaseOrderId: po.id, productId: p1.id, description: `${p1.name} purchase`, qty: qty1, unitCost: p1.costPrice, total: money(Number(p1.costPrice) * qty1) });
    await firstOrCreate(prisma.purchaseOrderItem, { purchaseOrderId: po.id, description: `${p2.name} purchase` }, { purchaseOrderId: po.id, productId: p2.id, description: `${p2.name} purchase`, qty: qty2, unitCost: p2.costPrice, total: money(Number(p2.costPrice) * qty2) });
  }

  const grns = [];
  for (let i = 0; i < 10; i++) {
    const po = purchases[i];
    const product = products[(i + 3) % products.length];
    const qty = 8 + i;
    const total = money(Number(product.costPrice) * qty);
    const grn = await upsertBy(prisma.goodsReceivedNote, { tenantId_grnNo: { tenantId: tenant.id, grnNo: `GRN-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, supplierId: suppliers[i % suppliers.length].id, purchaseOrderId: po.id, grnNo: `GRN-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'POSTED', receivedDate: day(-10 + i), subtotal: total, total, paid: i % 2 === 0 ? total : 0, balance: i % 2 === 0 ? 0 : total, notes: `Demo GRN ${i + 1}`, createdById: owner.id }, { subtotal: total, total });
    grns.push(grn);
    await firstOrCreate(prisma.goodsReceivedNoteItem, { grnId: grn.id, description: `${product.name} received` }, { grnId: grn.id, productId: product.id, description: `${product.name} received`, qty, unitCost: product.costPrice, total, batchNo: `BATCH-${String(i + 1).padStart(3, '0')}`, manufactureDate: day(-70 + i), expiryDate: product.trackExpiry ? day(40 + i * 7) : null });
  }

  for (let i = 0; i < 10; i++) {
    const invoice = invoices[i];
    const product = products[i % products.length];
    const total = money(Number(product.salePrice));
    const sr = await upsertBy(prisma.salesReturn, { tenantId_returnNo: { tenantId: tenant.id, returnNo: `SR-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, invoiceId: invoice.id, customerId: invoice.customerId, returnNo: `SR-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'POSTED', returnDate: day(-8 + i), subtotal: total, total, refundAmount: i % 2 === 0 ? total : 0, reason: ['Damaged', 'Wrong item', 'Customer changed mind'][i % 3], createdById: owner.id }, { total, refundAmount: i % 2 === 0 ? total : 0 });
    await firstOrCreate(prisma.salesReturnItem, { salesReturnId: sr.id, description: `${product.name} returned` }, { salesReturnId: sr.id, productId: product.id, description: `${product.name} returned`, qty: 1, unitPrice: product.salePrice, total });

    const grn = grns[i];
    const p = products[(i + 5) % products.length];
    const prTotal = money(Number(p.costPrice));
    const pr = await upsertBy(prisma.purchaseReturn, { tenantId_returnNo: { tenantId: tenant.id, returnNo: `PR-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, grnId: grn.id, supplierId: grn.supplierId, returnNo: `PR-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'POSTED', returnDate: day(-7 + i), subtotal: prTotal, total: prTotal, refundReceived: i % 2 === 0 ? prTotal : 0, reason: ['Expired batch', 'Damaged carton', 'Short supply'][i % 3], createdById: owner.id }, { total: prTotal });
    await firstOrCreate(prisma.purchaseReturnItem, { purchaseReturnId: pr.id, description: `${p.name} supplier return` }, { purchaseReturnId: pr.id, productId: p.id, description: `${p.name} supplier return`, qty: 1, unitCost: p.costPrice, total: prTotal });
  }

  for (let i = 0; i < 10; i++) {
    await upsertBy(prisma.payment, { tenantId_receiptNo: { tenantId: tenant.id, receiptNo: `REC-DEMO-${String(i + 1).padStart(3, '0')}` } }, {
      tenantId: tenant.id,
      invoiceId: invoices[i].id,
      customerId: invoices[i].customerId,
      bankAccountId: bankAccounts[i % bankAccounts.length].id,
      receiptNo: `REC-DEMO-${String(i + 1).padStart(3, '0')}`,
      direction: 'IN',
      method: ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'][i % 5],
      amount: money(Math.min(Number(invoices[i].total), 1000 + i * 1500)),
      reference: `PAY-IN-${i + 1}`,
      notes: `Demo customer receipt ${i + 1}`,
      paidAt: day(-i),
    }, { amount: money(Math.min(Number(invoices[i].total), 1000 + i * 1500)) });
  }

  for (let i = 0; i < 10; i++) {
    await firstOrCreate(prisma.bankTransaction, { tenantId: tenant.id, refType: 'DEMO_SEED', refId: `BTX-${i + 1}` }, { tenantId: tenant.id, bankAccountId: bankAccounts[i % bankAccounts.length].id, type: i % 2 === 0 ? 'CUSTOMER_RECEIPT' : 'EXPENSE', direction: i % 2 === 0 ? 'IN' : 'OUT', amount: money(3500 + i * 900), refType: 'DEMO_SEED', refId: `BTX-${i + 1}`, description: `Demo bank transaction ${i + 1}`, transactionDate: day(-i) });
  }

  // ---------------------------------------------------------------------------
  // 4) Accounting, documents, approvals, notifications, communications
  // ---------------------------------------------------------------------------
  const accountSeed = [
    ['1000', 'Cash on Hand', 'ASSET', 'DEBIT'], ['1010', 'Bank Account', 'ASSET', 'DEBIT'], ['1100', 'Accounts Receivable', 'ASSET', 'DEBIT'], ['1200', 'Inventory Asset', 'ASSET', 'DEBIT'], ['1300', 'Prepaid Expenses', 'ASSET', 'DEBIT'],
    ['2000', 'Accounts Payable', 'LIABILITY', 'CREDIT'], ['2100', 'Sales Tax Payable', 'LIABILITY', 'CREDIT'], ['3000', 'Owner Capital', 'EQUITY', 'CREDIT'], ['4000', 'Sales Revenue', 'INCOME', 'CREDIT'], ['5000', 'Cost of Goods Sold', 'COST_OF_GOODS_SOLD', 'DEBIT'],
    ['6000', 'Operating Expenses', 'EXPENSE', 'DEBIT'], ['6010', 'Rent Expense', 'EXPENSE', 'DEBIT'], ['6020', 'Salary Expense', 'EXPENSE', 'DEBIT']
  ];
  const ledgerAccounts = [];
  for (const [code, name, type, normalBalance] of accountSeed) {
    ledgerAccounts.push(await upsertBy(prisma.ledgerAccount, { tenantId_code: { tenantId: tenant.id, code } }, { tenantId: tenant.id, code, name, type, normalBalance, isSystem: true, isActive: true }, { name, type, normalBalance, isSystem: true, isActive: true }));
  }

  for (let i = 0; i < 10; i++) {
    const debitAcc = ledgerAccounts[i % ledgerAccounts.length];
    const creditAcc = ledgerAccounts[(i + 5) % ledgerAccounts.length];
    const amount = money(2000 + i * 750);
    const je = await upsertBy(prisma.journalEntry, { tenantId_entryNo: { tenantId: tenant.id, entryNo: `JE-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, entryNo: `JE-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'POSTED', entryDate: day(-i), description: `Demo journal entry ${i + 1}`, reference: `JE-REF-${i + 1}`, createdById: owner.id }, { status: 'POSTED' });
    await firstOrCreate(prisma.journalEntryLine, { journalEntryId: je.id, ledgerAccountId: debitAcc.id, debit: amount }, { journalEntryId: je.id, ledgerAccountId: debitAcc.id, description: `Debit line ${i + 1}`, debit: amount, credit: 0 });
    await firstOrCreate(prisma.journalEntryLine, { journalEntryId: je.id, ledgerAccountId: creditAcc.id, credit: amount }, { journalEntryId: je.id, ledgerAccountId: creditAcc.id, description: `Credit line ${i + 1}`, debit: 0, credit: amount });
  }

  const docPurposes = ['INVOICE', 'EXPENSE', 'CUSTOMER_KYC', 'SUPPLIER_AGREEMENT', 'WARRANTY', 'DELIVERY_PROOF', 'ASSET_DOCUMENT', 'APPROVAL_EVIDENCE', 'BANK_STATEMENT', 'GENERAL_DOCUMENT'];
  for (let i = 0; i < 20; i++) {
    await firstOrCreate(prisma.businessDocument, { tenantId: tenant.id, s3Key: `demo-documents/document-${String(i + 1).padStart(3, '0')}.pdf` }, { tenantId: tenant.id, purpose: docPurposes[i % docPurposes.length], folder: 'demo-documents', fileName: `document-${String(i + 1).padStart(3, '0')}.pdf`, originalName: `${docPurposes[i % docPurposes.length]} Sample ${i + 1}.pdf`, mimeType: 'application/pdf', sizeBytes: 100000 + i * 3000, s3Key: `demo-documents/document-${String(i + 1).padStart(3, '0')}.pdf`, publicUrl: `https://example.com/demo/document-${i + 1}.pdf`, entityType: ['Invoice', 'Expense', 'Customer', 'Supplier', 'Product'][i % 5], entityId: [invoices[i % invoices.length].id, null, customers[i % customers.length].id, suppliers[i % suppliers.length].id, products[i % products.length].id][i % 5], status: i % 4 === 0 ? 'ARCHIVED' : 'UPLOADED', createdById: owner.id });
  }

  const approvalTypes = ['EXPENSE', 'PURCHASE_ORDER', 'STOCK_ADJUSTMENT', 'INVOICE_CANCEL', 'DISCOUNT', 'DELIVERY', 'ASSET_PURCHASE', 'PAYROLL', 'LEAVE', 'GENERAL'];
  for (let i = 0; i < 10; i++) {
    await upsertBy(prisma.approvalRule, { tenantId_name: { tenantId: tenant.id, name: `Demo ${approvalTypes[i]} Approval` } }, { tenantId: tenant.id, name: `Demo ${approvalTypes[i]} Approval`, type: approvalTypes[i], minAmount: i * 5000, approverRoles: 'OWNER,ADMIN,ACCOUNTANT', isActive: true }, { minAmount: i * 5000, isActive: true });
    await upsertBy(prisma.approvalRequest, { tenantId_requestNo: { tenantId: tenant.id, requestNo: `APR-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, requestNo: `APR-DEMO-${String(i + 1).padStart(3, '0')}`, type: approvalTypes[i], title: `Demo approval request ${i + 1}`, description: `Approval request for ${approvalTypes[i]}`, amount: money(1000 + i * 7000), entityType: approvalTypes[i], entityId: invoices[i % invoices.length].id, payload: { source: 'seed', index: i + 1 }, status: ['PENDING', 'APPROVED', 'REJECTED'][i % 3], priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'][i % 4], requestedById: users[(i + 1) % users.length].id, decidedById: i % 3 === 0 ? null : owner.id, requestedAt: day(-i), decidedAt: i % 3 === 0 ? null : day(-i + 1), decisionNote: i % 3 === 0 ? null : 'Demo decision note' }, { status: ['PENDING', 'APPROVED', 'REJECTED'][i % 3], priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'][i % 4] });
  }

  await upsertBy(prisma.reminderSetting, { tenantId: tenant.id }, { tenantId: tenant.id, lowStockEnabled: true, customerCreditEnabled: true, supplierPaymentEnabled: true, approvalEnabled: true, subscriptionEnabled: true, emailEnabled: false, whatsappEnabled: true, whatsappDefaultPhone: '94770000000', dailySummaryEmail: 'owner@demo.com' }, { lowStockEnabled: true, whatsappEnabled: true });

  for (let i = 0; i < 10; i++) {
    await firstOrCreate(prisma.notification, { tenantId: tenant.id, title: `Demo notification ${i + 1}` }, { tenantId: tenant.id, userId: users[i % users.length].id, type: ['INFO', 'WARNING', 'SUCCESS', 'ERROR'][i % 4], title: `Demo notification ${i + 1}`, message: `This is demo notification message ${i + 1}`, priority: ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'][i % 4], channel: 'IN_APP', entityType: ['Invoice', 'Product', 'Approval', 'Cheque'][i % 4], entityId: invoices[i % invoices.length].id, actionUrl: '/notifications', isRead: i % 2 === 0, readAt: i % 2 === 0 ? day(-i) : null, metadata: { demo: true, index: i + 1 } });
    await firstOrCreate(prisma.communicationLog, { tenantId: tenant.id, subject: `Demo communication ${i + 1}` }, { tenantId: tenant.id, channel: ['EMAIL', 'WHATSAPP', 'SMS'][i % 3], recipient: i % 2 === 0 ? customers[i % customers.length].email || 'customer@example.com' : customers[i % customers.length].phone || '0770000000', subject: `Demo communication ${i + 1}`, message: `Hello, this is demo campaign/reminder message ${i + 1}`, status: ['LOGGED', 'SENT', 'FAILED'][i % 3], provider: 'DEMO', entityType: 'Customer', entityId: customers[i % customers.length].id, createdById: owner.id, sentAt: i % 3 === 1 ? day(-i) : null });
  }

  // ---------------------------------------------------------------------------
  // 5) Cheques, batches, serial/IMEI, warranty, manufacturing, service jobs
  // ---------------------------------------------------------------------------
  const cheques = [];
  for (let i = 0; i < 10; i++) {
    const cheque = await upsertBy(prisma.cheque, { tenantId_chequeNo: { tenantId: tenant.id, chequeNo: `CHQ-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, partyType: i % 2 === 0 ? 'CUSTOMER' : 'SUPPLIER', direction: i % 2 === 0 ? 'IN' : 'OUT', customerId: i % 2 === 0 ? customers[i % customers.length].id : null, supplierId: i % 2 !== 0 ? suppliers[i % suppliers.length].id : null, bankAccountId: bankAccounts[i % bankAccounts.length].id, chequeNo: `CHQ-DEMO-${String(i + 1).padStart(3, '0')}`, bankName: ['BOC', 'Commercial Bank', 'HNB', 'Sampath'][i % 4], branchName: 'Colombo', accountName: i % 2 === 0 ? customers[i % customers.length].name : suppliers[i % suppliers.length].name, amount: money(5000 + i * 2500), issueDate: day(-15 + i), dueDate: day(5 + i), status: ['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED'][i % 4], reference: `CHQ-REF-${i + 1}`, createdById: owner.id }, { status: ['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED'][i % 4] });
    cheques.push(cheque);
    await firstOrCreate(prisma.chequeEvent, { chequeId: cheque.id, action: 'CREATED' }, { tenantId: tenant.id, chequeId: cheque.id, action: 'CREATED', status: cheque.status, amount: cheque.amount, notes: `Demo cheque event ${i + 1}`, createdById: owner.id });
  }

  const batches = [];
  const expiryProducts = products.filter((p) => p.trackExpiry).length ? products.filter((p) => p.trackExpiry) : products.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const p = expiryProducts[i % expiryProducts.length];
    const batch = await upsertBy(prisma.productBatch, { tenantId_productId_warehouseId_batchNo: { tenantId: tenant.id, productId: p.id, warehouseId: warehouses[i % warehouses.length].id, batchNo: `BATCH-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, productId: p.id, warehouseId: warehouses[i % warehouses.length].id, supplierId: suppliers[i % suppliers.length].id, grnId: grns[i % grns.length].id, batchNo: `BATCH-DEMO-${String(i + 1).padStart(3, '0')}`, manufactureDate: day(-90 + i), receivedDate: day(-30 + i), expiryDate: day(20 + i * 10), qtyIn: 50 + i * 5, quantity: 25 + i * 3, unitCost: p.costPrice, status: i === 0 ? 'NEAR_EXPIRY' : 'ACTIVE', notes: `Demo batch ${i + 1}`, createdById: owner.id }, { quantity: 25 + i * 3, status: i === 0 ? 'NEAR_EXPIRY' : 'ACTIVE' });
    batches.push(batch);
    await firstOrCreate(prisma.productBatchEvent, { batchId: batch.id, action: 'RECEIVED' }, { tenantId: tenant.id, batchId: batch.id, action: 'RECEIVED', quantity: batch.qtyIn, balanceAfter: batch.quantity, refType: 'GRN', refId: grns[i % grns.length].id, notes: `Demo batch event ${i + 1}`, createdById: owner.id });
  }

  const serialProducts = products.filter((p) => p.trackSerial).length ? products.filter((p) => p.trackSerial) : products.slice(0, 10);
  const serials = [];
  for (let i = 0; i < 10; i++) {
    const p = serialProducts[i % serialProducts.length];
    const serial = await upsertBy(prisma.productSerial, { tenantId_serialNo: { tenantId: tenant.id, serialNo: `SN-DEMO-${String(i + 1).padStart(4, '0')}` } }, { tenantId: tenant.id, productId: p.id, warehouseId: warehouses[i % warehouses.length].id, customerId: i % 3 === 0 ? customers[i % customers.length].id : null, supplierId: suppliers[i % suppliers.length].id, serialNo: `SN-DEMO-${String(i + 1).padStart(4, '0')}`, imei1: `35678901000${String(i).padStart(2, '0')}`, imei2: `35678902000${String(i).padStart(2, '0')}`, warrantyStartAt: day(-30 + i), warrantyEndAt: day(335 + i), purchaseRefType: 'GRN', purchaseRefId: grns[i % grns.length].id, status: i % 3 === 0 ? 'SOLD' : 'IN_STOCK', notes: `Demo serial ${i + 1}`, createdById: owner.id }, { status: i % 3 === 0 ? 'SOLD' : 'IN_STOCK' });
    serials.push(serial);
    await firstOrCreate(prisma.productSerialEvent, { serialId: serial.id, action: 'RECEIVED' }, { tenantId: tenant.id, serialId: serial.id, action: 'RECEIVED', status: 'IN_STOCK', toWarehouseId: warehouses[i % warehouses.length].id, supplierId: suppliers[i % suppliers.length].id, refType: 'GRN', refId: grns[i % grns.length].id, notes: `Demo serial received ${i + 1}`, createdById: owner.id });
  }

  for (let i = 0; i < 10; i++) {
    const s = serials[i % serials.length];
    await upsertBy(prisma.warrantyClaim, { tenantId_claimNo: { tenantId: tenant.id, claimNo: `WCL-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, serialId: s.id, productId: s.productId, customerId: customers[i % customers.length].id, claimNo: `WCL-DEMO-${String(i + 1).padStart(3, '0')}`, status: ['OPEN', 'INSPECTION', 'REPAIRED', 'REJECTED'][i % 4], issueDescription: `Demo warranty issue ${i + 1}`, resolution: i % 2 === 0 ? 'Repaired under warranty' : null, serviceCost: i % 2 === 0 ? 0 : 1500, receivedAt: day(-i), completedAt: i % 2 === 0 ? day(-i + 2) : null, createdById: owner.id }, { status: ['OPEN', 'INSPECTION', 'REPAIRED', 'REJECTED'][i % 4] });
  }

  const servicesSeed = [
    ['SVC-INSTALL', 'Installation', 'Basic Installation', 2500, 800, 90], ['SVC-REPAIR', 'Repair', 'General Repair / Service', 3500, 1200, 120], ['SVC-CONSULT', 'Consulting', 'Technical Consultation', 1500, 300, 45], ['SVC-DELIVERY', 'Delivery', 'Same Day Delivery', 800, 250, 30], ['SVC-CLEAN', 'Cleaning', 'Equipment Cleaning', 1200, 400, 60],
    ['SVC-WARRANTY', 'Warranty', 'Warranty Inspection', 1000, 350, 50], ['SVC-SETUP', 'Setup', 'Device Setup', 1800, 600, 75], ['SVC-PACK', 'Packing', 'Gift Packing', 300, 100, 15], ['SVC-PRINT', 'Printing', 'Label Printing', 50, 10, 5], ['SVC-MAINT', 'Maintenance', 'Monthly Maintenance', 5000, 1800, 180]
  ];
  const serviceItems = [];
  for (const [code, category, name, unitPrice, costPrice, estimatedMinutes] of servicesSeed) {
    serviceItems.push(await upsertBy(prisma.serviceCatalogItem, { tenantId_code: { tenantId: tenant.id, code } }, { tenantId: tenant.id, code, category, name, unitPrice, costPrice, estimatedMinutes, taxable: true, isActive: true }, { category, name, unitPrice, costPrice, estimatedMinutes, isActive: true }));
  }

  const appointments = [];
  for (let i = 0; i < 10; i++) {
    appointments.push(await upsertBy(prisma.serviceAppointment, { tenantId_appointmentNo: { tenantId: tenant.id, appointmentNo: `APT-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, appointmentNo: `APT-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo appointment ${i + 1}`, appointmentAt: day(i + 1), endAt: day(i + 1), status: ['PENDING', 'CONFIRMED', 'COMPLETED'][i % 3], priority: ['LOW', 'NORMAL', 'HIGH'][i % 3], assignedToId: users[i % users.length].id, location: branches[i % branches.length].address, notes: `Demo appointment notes ${i + 1}`, createdById: owner.id }, { status: ['PENDING', 'CONFIRMED', 'COMPLETED'][i % 3] }));
  }

  const serviceJobs = [];
  for (let i = 0; i < 10; i++) {
    const svc = serviceItems[i % serviceItems.length];
    const job = await upsertBy(prisma.serviceJob, { tenantId_jobNo: { tenantId: tenant.id, jobNo: `JOB-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, appointmentId: appointments[i].id, warehouseId: warehouses[i % warehouses.length].id, jobNo: `JOB-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo service job ${i + 1}`, description: `Service job for ${customers[i % customers.length].name}`, status: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'][i % 4], priority: ['LOW', 'NORMAL', 'HIGH', 'URGENT'][i % 4], scheduledAt: day(i), dueAt: day(i + 2), assignedToId: users[i % users.length].id, laborCost: svc.costPrice, materialCost: 500 + i * 100, totalCost: money(Number(svc.costPrice) + 500 + i * 100), chargeAmount: svc.unitPrice, createdById: owner.id }, { status: ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'ON_HOLD'][i % 4] });
    serviceJobs.push(job);
    await firstOrCreate(prisma.serviceJobLine, { jobId: job.id, description: svc.name }, { jobId: job.id, lineType: 'SERVICE', serviceItemId: svc.id, description: svc.name, qty: 1, costPrice: svc.costPrice, unitPrice: svc.unitPrice, total: svc.unitPrice });
    await firstOrCreate(prisma.serviceJobEvent, { jobId: job.id, action: 'CREATED' }, { tenantId: tenant.id, jobId: job.id, action: 'CREATED', status: job.status, notes: `Demo job event ${i + 1}`, createdById: owner.id });
  }

  const recipeProducts = products.slice(0, 10);
  for (let i = 0; i < 10; i++) {
    const output = recipeProducts[(i + 8) % recipeProducts.length];
    const input1 = recipeProducts[i % recipeProducts.length];
    const input2 = recipeProducts[(i + 1) % recipeProducts.length];
    const recipe = await upsertBy(prisma.manufacturingRecipe, { tenantId_recipeNo: { tenantId: tenant.id, recipeNo: `RCP-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, recipeNo: `RCP-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Demo recipe ${i + 1}`, type: 'RECIPE', outputProductId: output.id, outputQty: 10, notes: `Demo recipe ${i + 1}`, isActive: true, createdById: owner.id }, { name: `Demo recipe ${i + 1}`, isActive: true });
    await firstOrCreate(prisma.manufacturingRecipeItem, { recipeId: recipe.id, productId: input1.id }, { recipeId: recipe.id, productId: input1.id, qty: 2, wastagePercent: 1, notes: 'Main material' });
    await firstOrCreate(prisma.manufacturingRecipeItem, { recipeId: recipe.id, productId: input2.id }, { recipeId: recipe.id, productId: input2.id, qty: 1, wastagePercent: 0.5, notes: 'Secondary material' });
    const order = await upsertBy(prisma.manufacturingOrder, { tenantId_orderNo: { tenantId: tenant.id, orderNo: `MFG-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, recipeId: recipe.id, warehouseId: warehouses[i % warehouses.length].id, outputProductId: output.id, orderNo: `MFG-DEMO-${String(i + 1).padStart(3, '0')}`, status: 'POSTED', productionDate: day(-i), outputQty: 10, inputCost: 2500 + i * 500, additionalCost: 300, totalCost: 2800 + i * 500, unitCost: money((2800 + i * 500) / 10), notes: `Demo manufacturing order ${i + 1}`, createdById: owner.id }, { status: 'POSTED' });
    await firstOrCreate(prisma.manufacturingOrderInput, { orderId: order.id, productId: input1.id }, { orderId: order.id, productId: input1.id, warehouseId: warehouses[i % warehouses.length].id, qty: 2, unitCost: input1.costPrice, total: money(Number(input1.costPrice) * 2) });
    await firstOrCreate(prisma.manufacturingOrderOutput, { orderId: order.id, productId: output.id }, { orderId: order.id, productId: output.id, warehouseId: warehouses[i % warehouses.length].id, qty: 10, unitCost: money((2800 + i * 500) / 10), total: 2800 + i * 500 });
  }

  // ---------------------------------------------------------------------------
  // 6) CRM, quotations, sales orders, HR/payroll, projects, installments
  // ---------------------------------------------------------------------------
  const stageNames = ['New', 'Contacted', 'Qualified', 'Quoted', 'Negotiation', 'Won', 'Lost', 'Follow Up', 'Proposal Sent', 'On Hold'];
  const stages = [];
  for (let i = 0; i < stageNames.length; i++) {
    stages.push(await upsertBy(prisma.crmPipelineStage, { tenantId_name: { tenantId: tenant.id, name: stageNames[i] } }, { tenantId: tenant.id, name: stageNames[i], sortOrder: (i + 1) * 10, probability: i === 6 ? 0 : Math.min(100, i * 12), isWon: stageNames[i] === 'Won', isLost: stageNames[i] === 'Lost', color: ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'][i % 5], isActive: true }, { sortOrder: (i + 1) * 10, probability: i === 6 ? 0 : Math.min(100, i * 12), isActive: true }));
  }

  const leads = [];
  for (let i = 0; i < 10; i++) {
    const lead = await upsertBy(prisma.crmLead, { tenantId_leadNo: { tenantId: tenant.id, leadNo: `LEAD-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, stageId: stages[i % stages.length].id, customerId: customers[i % customers.length].id, leadNo: `LEAD-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo sales opportunity ${i + 1}`, companyName: customers[i % customers.length].name, contactName: customers[i % customers.length].name, phone: customers[i % customers.length].phone, email: customers[i % customers.length].email, source: ['Walk-in', 'Facebook', 'Website', 'Referral'][i % 4], status: i === 6 ? 'LOST' : i === 5 ? 'WON' : 'OPEN', priority: ['LOW', 'NORMAL', 'HIGH'][i % 3], probability: stages[i % stages.length].probability, expectedValue: money(15000 + i * 6500), expectedCloseDate: day(7 + i), nextFollowUpAt: day(i + 1), assignedToId: users[i % users.length].id, notes: `Demo CRM lead ${i + 1}`, createdById: owner.id }, { status: i === 6 ? 'LOST' : i === 5 ? 'WON' : 'OPEN' });
    leads.push(lead);
    await firstOrCreate(prisma.crmLeadActivity, { leadId: lead.id, subject: `Demo lead activity ${i + 1}` }, { tenantId: tenant.id, leadId: lead.id, type: ['CALL', 'EMAIL', 'NOTE', 'MEETING'][i % 4], subject: `Demo lead activity ${i + 1}`, notes: `Follow up with ${lead.contactName}`, dueAt: day(i + 1), completedAt: i % 2 === 0 ? day(-i) : null, outcome: i % 2 === 0 ? 'Positive response' : null, createdById: owner.id });
  }

  const quotations = [];
  const salesOrders = [];
  for (let i = 0; i < 10; i++) {
    const product = products[(i + 2) % products.length];
    const total = money(Number(product.salePrice) * (2 + i % 3));
    const quote = await upsertBy(prisma.quotation, { tenantId_quoteNo: { tenantId: tenant.id, quoteNo: `QUO-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, crmLeadId: leads[i].id, quoteNo: `QUO-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo quotation ${i + 1}`, status: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'][i % 4], issueDate: day(-i), validUntil: day(14 + i), subtotal: total, tax: money(total * 0.18), total: money(total * 1.18), notes: `Demo quotation notes ${i + 1}`, terms: 'Valid for 14 days.', createdById: owner.id }, { status: ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'][i % 4] });
    quotations.push(quote);
    await firstOrCreate(prisma.quotationItem, { quotationId: quote.id, description: `${product.name} quoted` }, { quotationId: quote.id, productId: product.id, description: `${product.name} quoted`, qty: 2 + i % 3, costPrice: product.costPrice, unitPrice: product.salePrice, total });

    const so = await upsertBy(prisma.salesOrder, { tenantId_orderNo: { tenantId: tenant.id, orderNo: `SO-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, crmLeadId: leads[i].id, quotationId: quote.id, warehouseId: warehouses[i % warehouses.length].id, orderNo: `SO-DEMO-${String(i + 1).padStart(3, '0')}`, status: ['DRAFT', 'CONFIRMED', 'PARTIAL', 'COMPLETED'][i % 4], orderDate: day(-i), expectedDate: day(5 + i), subtotal: total, tax: money(total * 0.18), total: money(total * 1.18), notes: `Demo sales order ${i + 1}`, terms: 'Standard order terms.', createdById: owner.id }, { status: ['DRAFT', 'CONFIRMED', 'PARTIAL', 'COMPLETED'][i % 4] });
    salesOrders.push(so);
    await firstOrCreate(prisma.salesOrderItem, { salesOrderId: so.id, description: `${product.name} ordered` }, { salesOrderId: so.id, productId: product.id, description: `${product.name} ordered`, qty: 2 + i % 3, deliveredQty: i % 2 === 0 ? 1 : 0, costPrice: product.costPrice, unitPrice: product.salePrice, total });
  }

  const employeeSeed = [
    ['EMP001', 'Kamal Silva', 'Operations Manager', 'Operations', 95000], ['EMP002', 'Nisha Fernando', 'Accountant', 'Finance', 85000], ['EMP003', 'Ahamed Rizwan', 'Cashier', 'Sales', 55000], ['EMP004', 'Fathima Zara', 'Cashier', 'Sales', 55000], ['EMP005', 'Ravi Kumar', 'Inventory Officer', 'Warehouse', 60000],
    ['EMP006', 'Sara Khan', 'Sales Executive', 'Sales', 65000], ['EMP007', 'Priyantha Perera', 'Delivery Rider', 'Delivery', 48000], ['EMP008', 'Lahiru Jay', 'Technician', 'Service', 70000], ['EMP009', 'Hana Mohamed', 'HR Officer', 'HR', 68000], ['EMP010', 'Dinesh Raj', 'Store Assistant', 'Warehouse', 50000]
  ];
  const employees = [];
  for (let i = 0; i < employeeSeed.length; i++) {
    const [employeeNo, name, designation, department, basicSalary] = employeeSeed[i];
    employees.push(await upsertBy(prisma.employee, { tenantId_employeeNo: { tenantId: tenant.id, employeeNo } }, { tenantId: tenant.id, employeeNo, name, email: `${employeeNo.toLowerCase()}@demo.com`, phone: `07055500${String(i).padStart(2, '0')}`, nic: `90${i}123456V`, designation, department, employmentType: 'FULL_TIME', joinDate: day(-365 + i * 20), basicSalary, hourlyRate: money(basicSalary / 160), overtimeRate: money(basicSalary / 160 * 1.5), bankName: 'BOC', bankAccountNo: `EMP-ACC-${i + 1}`, status: 'ACTIVE', createdById: owner.id }, { designation, department, basicSalary, status: 'ACTIVE' }));
    const attendanceDate = new Date(now.getFullYear(), now.getMonth(), Math.min(10, i + 1));
    await upsertBy(prisma.attendanceRecord, { tenantId_employeeId_date: { tenantId: tenant.id, employeeId: employees[i].id, date: attendanceDate } }, { tenantId: tenant.id, employeeId: employees[i].id, date: attendanceDate, checkIn: new Date(attendanceDate.getFullYear(), attendanceDate.getMonth(), attendanceDate.getDate(), 8, 30), checkOut: new Date(attendanceDate.getFullYear(), attendanceDate.getMonth(), attendanceDate.getDate(), 17, 30), status: i % 5 === 0 ? 'LATE' : 'PRESENT', regularHours: 8, overtimeHours: i % 3, notes: `Demo attendance ${i + 1}`, createdById: owner.id }, { status: i % 5 === 0 ? 'LATE' : 'PRESENT', regularHours: 8, overtimeHours: i % 3 });
    await firstOrCreate(prisma.salaryAdvance, { tenantId: tenant.id, employeeId: employees[i].id, notes: `Demo salary advance ${i + 1}` }, { tenantId: tenant.id, employeeId: employees[i].id, amount: money(2000 + i * 500), paidAt: day(-10 + i), status: i % 2 === 0 ? 'OPEN' : 'DEDUCTED', notes: `Demo salary advance ${i + 1}`, createdById: owner.id });
    await firstOrCreate(prisma.leaveRequest, { tenantId: tenant.id, employeeId: employees[i].id, reason: `Demo leave ${i + 1}` }, { tenantId: tenant.id, employeeId: employees[i].id, leaveType: ['ANNUAL', 'CASUAL', 'MEDICAL'][i % 3], startDate: day(i + 5), endDate: day(i + 5), days: 1, status: ['PENDING', 'APPROVED', 'REJECTED'][i % 3], reason: `Demo leave ${i + 1}`, createdById: owner.id });
  }

  const payroll = await upsertBy(prisma.payrollRun, { tenantId_runNo: { tenantId: tenant.id, runNo: `PAY-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } }, { tenantId: tenant.id, runNo: `PAY-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, periodStart: monthStart(0), periodEnd: monthEnd(0), status: 'DRAFT', grossTotal: 0, allowanceTotal: 0, deductionTotal: 0, advanceTotal: 0, netTotal: 0, createdById: owner.id }, { status: 'DRAFT' });
  for (let i = 0; i < employees.length; i++) {
    const gross = Number(employees[i].basicSalary) + 2500;
    await upsertBy(prisma.payrollItem, { payrollRunId_employeeId: { payrollRunId: payroll.id, employeeId: employees[i].id } }, { tenantId: tenant.id, payrollRunId: payroll.id, employeeId: employees[i].id, basicSalary: employees[i].basicSalary, workingDays: 22, presentDays: 20 + (i % 3), overtimeHours: i % 5, overtimePay: (i % 5) * 500, allowances: 2500, deductions: 1000, advances: i % 2 === 0 ? 2000 : 0, grossPay: gross, netPay: gross - 1000 - (i % 2 === 0 ? 2000 : 0), status: 'DRAFT', notes: `Demo payroll item ${i + 1}` }, { basicSalary: employees[i].basicSalary });
  }

  const projects = [];
  for (let i = 0; i < 10; i++) {
    const project = await upsertBy(prisma.project, { tenantId_projectNo: { tenantId: tenant.id, projectNo: `PRJ-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, projectNo: `PRJ-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Demo project ${i + 1}`, customerId: customers[i % customers.length].id, crmLeadId: leads[i].id, serviceJobId: serviceJobs[i].id, quotationId: quotations[i].id, salesOrderId: salesOrders[i].id, status: ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'][i % 4], priority: ['LOW', 'NORMAL', 'HIGH'][i % 3], startDate: day(-i), dueDate: day(20 + i), budget: money(50000 + i * 15000), progress: i * 10, notes: `Demo project ${i + 1}`, createdById: owner.id }, { status: ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED'][i % 4], progress: i * 10 });
    projects.push(project);
    const task = await upsertBy(prisma.projectTask, { tenantId_taskNo: { tenantId: tenant.id, taskNo: `TSK-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, projectId: project.id, taskNo: `TSK-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo project task ${i + 1}`, description: `Task for ${project.name}`, status: ['TODO', 'IN_PROGRESS', 'DONE'][i % 3], priority: ['LOW', 'NORMAL', 'HIGH'][i % 3], assignedUserId: users[i % users.length].id, assignedEmployeeId: employees[i % employees.length].id, customerId: customers[i % customers.length].id, crmLeadId: leads[i].id, serviceJobId: serviceJobs[i].id, quotationId: quotations[i].id, salesOrderId: salesOrders[i].id, startAt: day(-i), dueAt: day(5 + i), estimatedHours: 4 + i, actualHours: i % 2 === 0 ? 2 + i : 0, createdById: owner.id }, { status: ['TODO', 'IN_PROGRESS', 'DONE'][i % 3] });
    await firstOrCreate(prisma.projectTaskComment, { taskId: task.id, comment: `Demo comment ${i + 1}` }, { tenantId: tenant.id, taskId: task.id, comment: `Demo comment ${i + 1}`, createdById: owner.id });
    await firstOrCreate(prisma.projectTaskActivity, { taskId: task.id, action: 'CREATED' }, { tenantId: tenant.id, taskId: task.id, action: 'CREATED', fromStatus: null, toStatus: task.status, notes: `Demo task activity ${i + 1}`, createdById: owner.id });
  }

  for (let i = 0; i < 10; i++) {
    const invoice = invoices[i];
    const principal = money(Number(invoice.total) || 30000 + i * 5000);
    const down = money(principal * 0.2);
    const financed = money(principal - down);
    const interest = money(financed * 0.12);
    const totalPayable = money(financed + interest);
    const plan = await upsertBy(prisma.installmentPlan, { tenantId_planNo: { tenantId: tenant.id, planNo: `INS-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, invoiceId: invoice.id, planNo: `INS-DEMO-${String(i + 1).padStart(3, '0')}`, title: `Demo installment plan ${i + 1}`, status: ['ACTIVE', 'COMPLETED', 'OVERDUE'][i % 3], principalAmount: principal, downPayment: down, financedAmount: financed, interestRate: 12, interestAmount: interest, totalPayable, paidAmount: i % 2 === 0 ? money(totalPayable / 3) : 0, balance: i % 2 === 0 ? money(totalPayable - totalPayable / 3) : totalPayable, installmentCount: 6, frequency: 'MONTHLY', startDate: day(-30), nextDueDate: day(10 + i), penaltyRate: 2, notes: `Demo installment plan ${i + 1}`, createdById: owner.id }, { status: ['ACTIVE', 'COMPLETED', 'OVERDUE'][i % 3] });
    const scheduleAmount = money(totalPayable / 6);
    for (let n = 1; n <= 3; n++) {
      const schedule = await upsertBy(prisma.installmentSchedule, { planId_installmentNo: { planId: plan.id, installmentNo: n } }, { tenantId: tenant.id, planId: plan.id, installmentNo: n, dueDate: day(n * 30), principal: money(financed / 6), interest: money(interest / 6), amount: scheduleAmount, paidAmount: n === 1 && i % 2 === 0 ? scheduleAmount : 0, balance: n === 1 && i % 2 === 0 ? 0 : scheduleAmount, status: n === 1 && i % 2 === 0 ? 'PAID' : 'DUE', paidAt: n === 1 && i % 2 === 0 ? day(-5) : null }, { status: n === 1 && i % 2 === 0 ? 'PAID' : 'DUE' });
      if (n === 1) {
        await firstOrCreate(prisma.installmentPayment, { tenantId: tenant.id, planId: plan.id, scheduleId: schedule.id, receiptNo: `IPAY-DEMO-${String(i + 1).padStart(3, '0')}` }, { tenantId: tenant.id, planId: plan.id, scheduleId: schedule.id, customerId: plan.customerId, bankAccountId: bankAccounts[i % bankAccounts.length].id, receiptNo: `IPAY-DEMO-${String(i + 1).padStart(3, '0')}`, amount: i % 2 === 0 ? scheduleAmount : 0, method: 'CASH', reference: `IPAY-REF-${i + 1}`, notes: `Demo installment payment ${i + 1}`, paidAt: day(-5 + i), createdById: owner.id });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // 7) Bank reconciliation, fixed assets, multi-currency, loyalty, delivery
  // ---------------------------------------------------------------------------
  const statement = await upsertBy(prisma.bankStatement, { tenantId_importNo: { tenantId: tenant.id, importNo: `BST-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } }, { tenantId: tenant.id, bankAccountId: bankAccounts[1].id, importNo: `BST-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, name: 'Demo Monthly Bank Statement', statementDate: day(-1), periodFrom: monthStart(0), periodTo: monthEnd(0), openingBalance: 350000, closingBalance: 450000, totalDebit: 120000, totalCredit: 220000, status: 'IMPORTED', notes: 'Demo bank statement', createdById: owner.id }, { status: 'IMPORTED' });
  const statementLines = [];
  for (let i = 0; i < 10; i++) {
    const line = await firstOrCreate(prisma.bankStatementLine, { statementId: statement.id, reference: `BSL-DEMO-${i + 1}` }, { tenantId: tenant.id, statementId: statement.id, bankAccountId: bankAccounts[1].id, transactionDate: day(-i), description: `Demo statement line ${i + 1}`, reference: `BSL-DEMO-${i + 1}`, direction: i % 2 === 0 ? 'IN' : 'OUT', amount: money(2000 + i * 1000), balanceAfter: money(350000 + i * 5000), isMatched: i % 2 === 0 });
    statementLines.push(line);
  }
  const bankTxs = await prisma.bankTransaction.findMany({ where: { tenantId: tenant.id }, take: 10 });
  for (let i = 0; i < Math.min(10, bankTxs.length, statementLines.length); i++) {
    await firstOrCreate(prisma.bankReconciliationMatch, { statementLineId: statementLines[i].id, bankTransactionId: bankTxs[i].id }, { tenantId: tenant.id, statementLineId: statementLines[i].id, bankTransactionId: bankTxs[i].id, bankAccountId: bankAccounts[1].id, matchType: i % 2 === 0 ? 'AUTO' : 'MANUAL', amount: statementLines[i].amount, difference: 0, notes: `Demo reconciliation match ${i + 1}`, matchedById: owner.id });
  }
  await upsertBy(prisma.bankReconciliation, { tenantId_reconciliationNo: { tenantId: tenant.id, reconciliationNo: `REC-BANK-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}` } }, { tenantId: tenant.id, bankAccountId: bankAccounts[1].id, reconciliationNo: `REC-BANK-DEMO-${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, periodFrom: monthStart(0), periodTo: monthEnd(0), statementClosingBalance: 450000, systemClosingBalance: 448500, matchedAmount: 125000, unreconciledAmount: 1500, difference: 1500, status: 'OPEN', notes: 'Demo reconciliation', createdById: owner.id }, { status: 'OPEN' });

  const assetNames = ['Delivery Van', 'POS Counter', 'Barcode Scanner Set', 'CCTV System', 'Office Laptop', 'Display Freezer', 'Bakery Oven', 'Warehouse Rack', 'Generator', 'Air Conditioner'];
  for (let i = 0; i < 10; i++) {
    const cost = 45000 + i * 35000;
    const asset = await upsertBy(prisma.fixedAsset, { tenantId_assetNo: { tenantId: tenant.id, assetNo: `AST-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, supplierId: suppliers[i % suppliers.length].id, assetNo: `AST-DEMO-${String(i + 1).padStart(3, '0')}`, name: assetNames[i], category: ['Vehicle', 'Equipment', 'IT', 'Furniture'][i % 4], serialNo: `ASSET-SN-${i + 1}`, location: branches[i % branches.length].name, custodianEmployeeId: employees[i % employees.length].id, purchaseDate: day(-365 + i * 20), purchaseCost: cost, salvageValue: money(cost * 0.1), usefulLifeMonths: 60, depreciationMethod: 'STRAIGHT_LINE', accumulatedDepreciation: money(cost * 0.15), bookValue: money(cost * 0.85), status: 'ACTIVE', warrantyUntil: day(180 + i), nextMaintenanceDate: day(30 + i), notes: `Demo asset ${i + 1}`, createdById: owner.id }, { status: 'ACTIVE', bookValue: money(cost * 0.85) });
    await firstOrCreate(prisma.fixedAssetDepreciation, { assetId: asset.id, periodStart: monthStart(-1) }, { tenantId: tenant.id, assetId: asset.id, periodStart: monthStart(-1), periodEnd: monthEnd(-1), depreciationDate: monthEnd(-1), amount: money(cost / 60), accumulatedAfter: money(cost * 0.15), bookValueAfter: money(cost * 0.85), notes: `Demo depreciation ${i + 1}`, createdById: owner.id });
    await firstOrCreate(prisma.fixedAssetMaintenance, { assetId: asset.id, description: `Demo maintenance ${i + 1}` }, { tenantId: tenant.id, assetId: asset.id, maintenanceDate: day(-i), vendor: suppliers[i % suppliers.length].name, description: `Demo maintenance ${i + 1}`, cost: money(1000 + i * 500), nextMaintenanceDate: day(90 + i), status: 'COMPLETED', createdById: owner.id });
  }

  const currencySeed = [['LKR', 'Sri Lankan Rupee', 'Rs', true], ['USD', 'US Dollar', '$', false], ['EUR', 'Euro', '€', false], ['GBP', 'British Pound', '£', false], ['INR', 'Indian Rupee', '₹', false], ['AED', 'UAE Dirham', 'د.إ', false], ['AUD', 'Australian Dollar', 'A$', false], ['CAD', 'Canadian Dollar', 'C$', false], ['JPY', 'Japanese Yen', '¥', false], ['SGD', 'Singapore Dollar', 'S$', false]];
  for (const [code, name, symbol, isBase] of currencySeed) {
    await upsertBy(prisma.currency, { tenantId_code: { tenantId: tenant.id, code } }, { tenantId: tenant.id, code, name, symbol, isBase, isActive: true }, { name, symbol, isBase, isActive: true });
  }
  const rateSeed = [['USD', 305], ['EUR', 330], ['GBP', 390], ['INR', 3.65], ['AED', 83], ['AUD', 205], ['CAD', 225], ['JPY', 2.1], ['SGD', 228], ['LKR', 1]];
  const fixedRateDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < rateSeed.length; i++) {
    const [fromCurrency, rate] = rateSeed[i];
    await upsertBy(prisma.exchangeRate, { tenantId_fromCurrency_toCurrency_rateDate: { tenantId: tenant.id, fromCurrency, toCurrency: 'LKR', rateDate: fixedRateDate } }, { tenantId: tenant.id, fromCurrency, toCurrency: 'LKR', rate, rateDate: fixedRateDate, source: 'DEMO_SEED', notes: `Demo exchange rate ${i + 1}`, createdById: owner.id }, { rate, source: 'DEMO_SEED' });
    await firstOrCreate(prisma.currencyRevaluation, { tenantId: tenant.id, entityType: 'Customer', entityId: customers[i % customers.length].id, currencyCode: fromCurrency }, { tenantId: tenant.id, entityType: 'Customer', entityId: customers[i % customers.length].id, entityName: customers[i % customers.length].name, currencyCode: fromCurrency, foreignBalance: 100 + i * 50, oldRate: rate - 2, newRate: rate, baseBefore: money((100 + i * 50) * (rate - 2)), baseAfter: money((100 + i * 50) * rate), gainLoss: money((100 + i * 50) * 2), posted: false, revaluedAt: day(-i), notes: `Demo revaluation ${i + 1}`, createdById: owner.id });
  }

  const loyaltyTierNames = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond', 'VIP', 'Staff', 'Wholesale', 'Online', 'Corporate'];
  const loyaltyTiers = [];
  for (let i = 0; i < 10; i++) {
    loyaltyTiers.push(await upsertBy(prisma.loyaltyTier, { tenantId_name: { tenantId: tenant.id, name: loyaltyTierNames[i] } }, { tenantId: tenant.id, name: loyaltyTierNames[i], minPoints: i * 500, discountPercent: i, pointsMultiplier: money(1 + i * 0.1), priority: i + 1, isActive: true }, { minPoints: i * 500, discountPercent: i, isActive: true }));
    await upsertBy(prisma.loyaltyRule, { tenantId_name: { tenantId: tenant.id, name: `Demo Loyalty Rule ${i + 1}` } }, { tenantId: tenant.id, name: `Demo Loyalty Rule ${i + 1}`, earnAmountStep: 100 + i * 50, earnPoints: 1 + i, redemptionValue: 1, minRedeemPoints: 100 + i * 20, expiryDays: 365, isDefault: i === 0, isActive: true }, { isActive: true });
  }
  for (let i = 0; i < 10; i++) {
    const account = await upsertBy(prisma.loyaltyAccount, { tenantId_customerId: { tenantId: tenant.id, customerId: customers[i % customers.length].id } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, tierId: loyaltyTiers[i].id, memberNo: `MEM-DEMO-${String(i + 1).padStart(3, '0')}`, pointsBalance: 100 + i * 120, lifetimeEarned: 300 + i * 200, lifetimeRedeemed: 50 + i * 20, status: 'ACTIVE', joinedAt: day(-120 + i), lastActivityAt: day(-i), notes: `Demo loyalty account ${i + 1}` }, { tierId: loyaltyTiers[i].id, pointsBalance: 100 + i * 120, status: 'ACTIVE' });
    const voucher = await upsertBy(prisma.rewardVoucher, { tenantId_voucherNo: { tenantId: tenant.id, voucherNo: `VOU-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, accountId: account.id, customerId: account.customerId, invoiceId: invoices[i % invoices.length].id, voucherNo: `VOU-DEMO-${String(i + 1).padStart(3, '0')}`, status: i % 2 === 0 ? 'ACTIVE' : 'REDEEMED', pointsCost: 100 + i * 10, discountAmount: 500 + i * 100, issuedAt: day(-i), expiresAt: day(60 + i), redeemedAt: i % 2 === 0 ? null : day(-i + 1), notes: `Demo voucher ${i + 1}`, createdById: owner.id }, { status: i % 2 === 0 ? 'ACTIVE' : 'REDEEMED' });
    await firstOrCreate(prisma.loyaltyTransaction, { tenantId: tenant.id, accountId: account.id, type: 'EARN', description: `Demo loyalty transaction ${i + 1}` }, { tenantId: tenant.id, accountId: account.id, customerId: account.customerId, invoiceId: invoices[i % invoices.length].id, voucherId: voucher.id, type: i % 2 === 0 ? 'EARN' : 'REDEEM', points: i % 2 === 0 ? 100 + i * 10 : -(50 + i * 5), amount: 1000 + i * 100, balanceAfter: account.pointsBalance, description: `Demo loyalty transaction ${i + 1}`, refType: 'INVOICE', refId: invoices[i % invoices.length].id, createdById: owner.id });
  }

  const deliveries = [];
  for (let i = 0; i < 10; i++) {
    const delivery = await upsertBy(prisma.deliveryOrder, { tenantId_deliveryNo: { tenantId: tenant.id, deliveryNo: `DEL-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, customerId: customers[i % customers.length].id, invoiceId: invoices[i % invoices.length].id, salesOrderId: salesOrders[i].id, assignedEmployeeId: employees[i % employees.length].id, deliveryNo: `DEL-DEMO-${String(i + 1).padStart(3, '0')}`, status: ['PENDING', 'PACKED', 'DISPATCHED', 'DELIVERED'][i % 4], priority: ['LOW', 'NORMAL', 'HIGH'][i % 3], scheduledDate: day(i + 1), dispatchedAt: i % 4 >= 2 ? day(i) : null, deliveredAt: i % 4 === 3 ? day(i + 1) : null, contactName: customers[i % customers.length].name, phone: customers[i % customers.length].phone, address: customers[i % customers.length].address || 'Demo delivery address', deliveryFee: 350 + i * 50, codAmount: invoices[i % invoices.length].balance, collectedAmount: i % 4 === 3 ? invoices[i % invoices.length].balance : 0, proofName: i % 4 === 3 ? 'Customer signature' : null, notes: `Demo delivery ${i + 1}`, createdById: owner.id }, { status: ['PENDING', 'PACKED', 'DISPATCHED', 'DELIVERED'][i % 4] });
    deliveries.push(delivery);
    await firstOrCreate(prisma.deliveryOrderItem, { deliveryId: delivery.id, description: products[i % products.length].name }, { deliveryId: delivery.id, productId: products[i % products.length].id, description: products[i % products.length].name, qty: 2, deliveredQty: delivery.status === 'DELIVERED' ? 2 : 0, notes: `Demo delivery item ${i + 1}` });
    await firstOrCreate(prisma.deliveryEvent, { deliveryId: delivery.id, action: 'CREATED' }, { tenantId: tenant.id, deliveryId: delivery.id, action: 'CREATED', status: delivery.status, notes: `Demo delivery event ${i + 1}`, createdById: owner.id });
  }

  // ---------------------------------------------------------------------------
  // 8) Budgeting, campaigns, dashboard builder, stock transfers, audit/security
  // ---------------------------------------------------------------------------
  const budgets = [];
  for (let i = 0; i < 10; i++) {
    const budget = await upsertBy(prisma.budget, { tenantId_budgetNo: { tenantId: tenant.id, budgetNo: `BDG-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, budgetNo: `BDG-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Demo budget ${i + 1}`, fiscalYear: now.getFullYear(), periodType: 'MONTHLY', status: ['DRAFT', 'APPROVED', 'CLOSED'][i % 3], startDate: monthStart(i % 3), endDate: monthEnd(i % 3), totalIncomeBudget: 100000 + i * 15000, totalExpenseBudget: 70000 + i * 9000, notes: `Demo budget ${i + 1}`, createdById: owner.id, approvedById: i % 3 !== 0 ? owner.id : null, approvedAt: i % 3 !== 0 ? day(-i) : null }, { status: ['DRAFT', 'APPROVED', 'CLOSED'][i % 3] });
    budgets.push(budget);
    await firstOrCreate(prisma.budgetLine, { budgetId: budget.id, description: `Demo income budget line ${i + 1}` }, { tenantId: tenant.id, budgetId: budget.id, ledgerAccountId: ledgerAccounts[8].id, lineType: 'INCOME', periodMonth: now.getMonth() + 1, periodLabel: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, description: `Demo income budget line ${i + 1}`, budgetAmount: 100000 + i * 10000, alertPercent: 90 });
    await firstOrCreate(prisma.budgetLine, { budgetId: budget.id, description: `Demo expense budget line ${i + 1}` }, { tenantId: tenant.id, budgetId: budget.id, ledgerAccountId: ledgerAccounts[10].id, lineType: 'EXPENSE', periodMonth: now.getMonth() + 1, periodLabel: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, description: `Demo expense budget line ${i + 1}`, budgetAmount: 70000 + i * 7000, alertPercent: 95 });
  }

  for (let i = 0; i < 10; i++) {
    const scenario = await upsertBy(prisma.forecastScenario, { tenantId_scenarioNo: { tenantId: tenant.id, scenarioNo: `FC-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, scenarioNo: `FC-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Demo cash flow forecast ${i + 1}`, type: 'CASH_FLOW', status: ['DRAFT', 'ACTIVE', 'ARCHIVED'][i % 3], startDate: monthStart(0), endDate: monthEnd(2), openingCash: 100000 + i * 10000, growthRate: 5 + i, collectionDays: 15, paymentDays: 30, notes: `Demo forecast ${i + 1}`, createdById: owner.id }, { status: ['DRAFT', 'ACTIVE', 'ARCHIVED'][i % 3] });
    await firstOrCreate(prisma.cashFlowForecastLine, { scenarioId: scenario.id, periodLabel: `Month ${i + 1}` }, { tenantId: tenant.id, scenarioId: scenario.id, periodStart: monthStart(i % 3), periodEnd: monthEnd(i % 3), periodLabel: `Month ${i + 1}`, expectedInflows: 120000 + i * 10000, expectedOutflows: 90000 + i * 8000, netCashFlow: 30000 + i * 2000, closingCash: 130000 + i * 12000, notes: `Demo forecast line ${i + 1}` });
  }

  const channels = ['EMAIL', 'WHATSAPP'];
  const templates = [];
  for (let i = 0; i < 10; i++) {
    const template = await upsertBy(prisma.campaignTemplate, { tenantId_name: { tenantId: tenant.id, name: `Demo Campaign Template ${i + 1}` } }, { tenantId: tenant.id, name: `Demo Campaign Template ${i + 1}`, channel: channels[i % 2], subject: `Special offer ${i + 1}`, body: `Hello {{name}}, enjoy our demo offer ${i + 1}.`, isActive: true }, { channel: channels[i % 2], isActive: true });
    templates.push(template);
    const campaign = await upsertBy(prisma.marketingCampaign, { tenantId_campaignNo: { tenantId: tenant.id, campaignNo: `CMP-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, templateId: template.id, campaignNo: `CMP-DEMO-${String(i + 1).padStart(3, '0')}`, name: `Demo campaign ${i + 1}`, channel: template.channel, audienceType: ['ALL_CUSTOMERS', 'LOYALTY_MEMBERS', 'OVERDUE_CUSTOMERS'][i % 3], status: ['DRAFT', 'SCHEDULED', 'SENT'][i % 3], subject: template.subject, message: template.body, scheduledAt: day(i + 1), sentAt: i % 3 === 2 ? day(-i) : null, totalRecipients: 10, sentCount: i % 3 === 2 ? 10 : 0, failedCount: 0, notes: `Demo campaign ${i + 1}`, createdById: owner.id }, { status: ['DRAFT', 'SCHEDULED', 'SENT'][i % 3] });
    await upsertBy(prisma.campaignRecipient, { campaignId_recipientAddress: { campaignId: campaign.id, recipientAddress: customers[i % customers.length].email || customers[i % customers.length].phone || `customer${i}@example.com` } }, { tenantId: tenant.id, campaignId: campaign.id, customerId: customers[i % customers.length].id, name: customers[i % customers.length].name, phone: customers[i % customers.length].phone, email: customers[i % customers.length].email, channel: template.channel, recipientAddress: customers[i % customers.length].email || customers[i % customers.length].phone || `customer${i}@example.com`, status: campaign.status === 'SENT' ? 'SENT' : 'PENDING', sentAt: campaign.status === 'SENT' ? day(-i) : null }, { status: campaign.status === 'SENT' ? 'SENT' : 'PENDING' });
  }

  const layout = await upsertBy(prisma.dashboardLayout, { tenantId_name: { tenantId: tenant.id, name: 'Demo Owner Dashboard' } }, { tenantId: tenant.id, name: 'Demo Owner Dashboard', description: 'Full dummy dashboard with KPI, chart, table and shortcut widgets.', isDefault: true, visibility: 'ALL_ROLES', refreshInterval: 300, createdById: owner.id }, { isDefault: true });
  const widgetSources = ['MONTH_SALES', 'MONTH_EXPENSES', 'PROFIT', 'LOW_STOCK', 'RECEIVABLES', 'PAYABLES', 'CASH_BANK', 'ORDERS', 'SERVICE_JOBS', 'CRM_LEADS'];
  for (let i = 0; i < 10; i++) {
    await firstOrCreate(prisma.dashboardWidget, { tenantId: tenant.id, layoutId: layout.id, title: `Demo widget ${i + 1}` }, { tenantId: tenant.id, layoutId: layout.id, widgetKey: `demo-widget-${i + 1}`, title: `Demo widget ${i + 1}`, widgetType: ['KPI', 'CHART', 'TABLE'][i % 3], dataSource: widgetSources[i], chartType: ['bar', 'line', 'pie'][i % 3], gridX: (i % 4) * 3, gridY: Math.floor(i / 4) * 2, gridW: 3, gridH: 2, sortOrder: i + 1, config: { demo: true }, lastValue: 1000 + i * 500, lastPayload: { label: widgetSources[i], value: 1000 + i * 500 }, lastRefreshedAt: day(0) });
    await firstOrCreate(prisma.dashboardShortcut, { tenantId: tenant.id, layoutId: layout.id, title: `Demo shortcut ${i + 1}` }, { tenantId: tenant.id, layoutId: layout.id, title: `Demo shortcut ${i + 1}`, targetUrl: ['/pos', '/invoices', '/products', '/customers', '/reports'][i % 5], icon: ['shopping-cart', 'file-text', 'package', 'users', 'bar-chart'][i % 5], color: ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626'][i % 5], sortOrder: i + 1, isActive: true });
  }

  for (let i = 0; i < 10; i++) {
    const transfer = await upsertBy(prisma.stockTransfer, { tenantId_transferNo: { tenantId: tenant.id, transferNo: `TRF-DEMO-${String(i + 1).padStart(3, '0')}` } }, { tenantId: tenant.id, transferNo: `TRF-DEMO-${String(i + 1).padStart(3, '0')}`, fromWarehouseId: warehouses[i % warehouses.length].id, toWarehouseId: warehouses[(i + 1) % warehouses.length].id, status: ['DRAFT', 'POSTED', 'CANCELLED'][i % 3], transferDate: day(-i), notes: `Demo branch transfer ${i + 1}`, createdById: owner.id }, { status: ['DRAFT', 'POSTED', 'CANCELLED'][i % 3] });
    await firstOrCreate(prisma.stockTransferItem, { stockTransferId: transfer.id, productId: products[i % products.length].id }, { stockTransferId: transfer.id, productId: products[i % products.length].id, qty: 3 + i, unitCost: products[i % products.length].costPrice });
    await firstOrCreate(prisma.stockMovement, { tenantId: tenant.id, refType: 'StockTransfer', refId: transfer.id, productId: products[i % products.length].id }, { tenantId: tenant.id, productId: products[i % products.length].id, warehouseId: transfer.toWarehouseId, fromWarehouseId: transfer.fromWarehouseId, toWarehouseId: transfer.toWarehouseId, type: 'TRANSFER', quantity: 3 + i, unitCost: products[i % products.length].costPrice, refType: 'StockTransfer', refId: transfer.id, notes: `Demo transfer movement ${i + 1}` });
  }

  for (let i = 0; i < 10; i++) {
    await firstOrCreate(prisma.auditLog, { tenantId: tenant.id, action: `DEMO_ACTION_${i + 1}`, entity: 'DemoEntity' }, { tenantId: tenant.id, userId: users[i % users.length].id, action: `DEMO_ACTION_${i + 1}`, entity: ['Invoice', 'Product', 'Customer', 'Expense'][i % 4], entityId: invoices[i % invoices.length].id, before: { demo: true, value: i }, after: { demo: true, value: i + 1 }, ip: `192.168.1.${i + 10}` });
  }

  // v5.4 optional: only runs if you already applied the Security Center patch.
  if (prisma.loginHistory && prisma.trustedDevice && prisma.securityEvent) {
    for (let i = 0; i < 10; i++) {
      await firstOrCreate(prisma.loginHistory, { tenantId: tenant.id, email: users[i % users.length].email, deviceHash: `demo-device-${i + 1}` }, { tenantId: tenant.id, userId: users[i % users.length].id, email: users[i % users.length].email, status: i % 4 === 0 ? 'FAILED' : 'SUCCESS', reason: i % 4 === 0 ? 'Wrong password' : null, ip: `203.94.64.${i + 20}`, userAgent: `Demo Browser ${i + 1}`, deviceHash: `demo-device-${i + 1}`, deviceName: `Demo Device ${i + 1}`, location: ['Colombo', 'Kandy', 'Galle', 'Jaffna'][i % 4], createdAt: day(-i) });
      await upsertBy(prisma.trustedDevice, { tenantId_userId_deviceHash: { tenantId: tenant.id, userId: users[i % users.length].id, deviceHash: `demo-device-${i + 1}` } }, { tenantId: tenant.id, userId: users[i % users.length].id, deviceHash: `demo-device-${i + 1}`, deviceName: `Demo Device ${i + 1}`, userAgent: `Demo Browser ${i + 1}`, ipAddress: `203.94.64.${i + 20}`, isTrusted: i % 3 !== 0, firstSeenAt: day(-30 + i), lastSeenAt: day(-i), revokedAt: i % 3 === 0 ? day(-1) : null }, { isTrusted: i % 3 !== 0, lastSeenAt: day(-i), revokedAt: i % 3 === 0 ? day(-1) : null });
      await firstOrCreate(prisma.securityEvent, { tenantId: tenant.id, type: `DEMO_SECURITY_${i + 1}` }, { tenantId: tenant.id, userId: users[i % users.length].id, severity: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'][i % 5], type: `DEMO_SECURITY_${i + 1}`, title: `Demo security event ${i + 1}`, description: `Demo security event description ${i + 1}`, ip: `203.94.64.${i + 20}`, userAgent: `Demo Browser ${i + 1}`, metadata: { demo: true, device: `demo-device-${i + 1}` } });
    }
  } else {
    console.log('ℹ️ Security Center tables not detected. Skipped LoginHistory / TrustedDevice / SecurityEvent seed. Apply v5.4 patch first to enable them.');
  }

  // ---------------------------------------------------------------------------
  // Done
  // ---------------------------------------------------------------------------
  console.log('✅ Full demo seed completed.');
  console.log('Login accounts:');
  console.log('  owner@demo.com / Demo@12345');
  console.log('  admin@demo.com / Demo@12345');
  console.log('  accountant@demo.com / Demo@12345');
  console.log('  cashier1@demo.com / Demo@12345');
  console.log('  inventory@demo.com / Demo@12345');
}

main()
  .catch((error) => {
    console.error('❌ Demo seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
