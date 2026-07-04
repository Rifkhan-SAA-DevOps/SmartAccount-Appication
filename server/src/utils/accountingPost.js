import { money } from './number.js';

export const ACCOUNT_CODES = {
  CASH: '1000',
  BANK: '1010',
  ACCOUNTS_RECEIVABLE: '1100',
  INVENTORY: '1200',
  ACCOUNTS_PAYABLE: '2000',
  SALES_TAX_PAYABLE: '2100',
  OWNER_CAPITAL: '3000',
  SALES_REVENUE: '4000',
  SALES_RETURNS: '4010',
  COST_OF_GOODS_SOLD: '5000',
  OPERATING_EXPENSES: '6000',
  INVENTORY_ADJUSTMENT: '6050',
  FIXED_ASSETS: '1300',
  ACCUMULATED_DEPRECIATION: '1350',
  DEPRECIATION_EXPENSE: '6100',
  ASSET_DISPOSAL_GAIN: '4100',
  ASSET_DISPOSAL_LOSS: '6150',
  FOREIGN_EXCHANGE_GAIN: '4200',
  FOREIGN_EXCHANGE_LOSS: '6200'
};

export const AUTO_ACCOUNTS = [
  { code: ACCOUNT_CODES.CASH, name: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.BANK, name: 'Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.INVENTORY, name: 'Inventory Asset', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.SALES_TAX_PAYABLE, name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.OWNER_CAPITAL, name: 'Owner Capital', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.SALES_REVENUE, name: 'Sales Revenue', type: 'INCOME', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.SALES_RETURNS, name: 'Sales Returns and Allowances', type: 'INCOME', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.COST_OF_GOODS_SOLD, name: 'Cost of Goods Sold', type: 'COST_OF_GOODS_SOLD', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.OPERATING_EXPENSES, name: 'Operating Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT, name: 'Inventory Adjustment Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.FIXED_ASSETS, name: 'Fixed Assets', type: 'ASSET', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.ACCUMULATED_DEPRECIATION, name: 'Accumulated Depreciation', type: 'ASSET', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.DEPRECIATION_EXPENSE, name: 'Depreciation Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.ASSET_DISPOSAL_GAIN, name: 'Gain on Asset Disposal', type: 'INCOME', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.ASSET_DISPOSAL_LOSS, name: 'Loss on Asset Disposal', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_GAIN, name: 'Foreign Exchange Gain', type: 'INCOME', normalBalance: 'CREDIT' },
  { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_LOSS, name: 'Foreign Exchange Loss', type: 'EXPENSE', normalBalance: 'DEBIT' }
];

export async function ensureDefaultAccounts(tx, tenantId) {
  const accounts = new Map();

  for (const account of AUTO_ACCOUNTS) {
    const saved = await tx.ledgerAccount.upsert({
      where: { tenantId_code: { tenantId, code: account.code } },
      update: {
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        isSystem: true,
        isActive: true
      },
      create: {
        tenantId,
        ...account,
        isSystem: true,
        isActive: true
      }
    });
    accounts.set(account.code, saved);
  }

  return accounts;
}

async function nextJournalEntryNo(tx, tenantId) {
  const count = await tx.journalEntry.count({ where: { tenantId } });
  return `JE${String(count + 1001).padStart(4, '0')}`;
}

function accountCodeForCashBank(bankAccount) {
  if (!bankAccount) return ACCOUNT_CODES.CASH;
  return bankAccount.isCashAccount ? ACCOUNT_CODES.CASH : ACCOUNT_CODES.BANK;
}

function cleanLines(lines = []) {
  return lines
    .map((line) => ({
      code: line.code,
      description: line.description || null,
      debit: money(line.debit || 0),
      credit: money(line.credit || 0)
    }))
    .filter((line) => line.code && (line.debit > 0 || line.credit > 0));
}

export async function createAutoJournalEntry(tx, {
  tenantId,
  entryDate = new Date(),
  description,
  reference,
  createdById = null,
  lines
}) {
  const cleaned = cleanLines(lines);
  if (cleaned.length < 2) return null;

  const totalDebit = money(cleaned.reduce((sum, line) => sum + line.debit, 0));
  const totalCredit = money(cleaned.reduce((sum, line) => sum + line.credit, 0));
  if (totalDebit <= 0 || totalDebit !== totalCredit) {
    throw Object.assign(new Error(`Auto journal is not balanced. Debit: ${totalDebit}, Credit: ${totalCredit}`), { status: 400 });
  }

  const safeReference = `AUTO:${reference}`;
  const existing = await tx.journalEntry.findFirst({ where: { tenantId, reference: safeReference } });
  if (existing) return existing;

  const accounts = await ensureDefaultAccounts(tx, tenantId);
  const missingCode = cleaned.find((line) => !accounts.has(line.code))?.code;
  if (missingCode) throw Object.assign(new Error(`Ledger account ${missingCode} was not found`), { status: 400 });

  return tx.journalEntry.create({
    data: {
      tenantId,
      entryNo: await nextJournalEntryNo(tx, tenantId),
      status: 'POSTED',
      entryDate,
      description,
      reference: safeReference,
      createdById,
      lines: {
        create: cleaned.map((line) => ({
          ledgerAccountId: accounts.get(line.code).id,
          description: line.description,
          debit: line.debit,
          credit: line.credit
        }))
      }
    },
    include: { lines: { include: { ledgerAccount: true } } }
  });
}

export async function postInvoiceJournal(tx, { tenantId, invoice, createdById }) {
  const paid = money(invoice.paid || 0);
  const balance = money(invoice.balance || 0);
  const tax = money(invoice.tax || 0);
  const revenue = money(Number(invoice.total || 0) - tax);
  const cogs = money((invoice.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.costPrice || 0), 0));

  const saleEntry = await createAutoJournalEntry(tx, {
    tenantId,
    entryDate: invoice.issueDate || new Date(),
    description: `Invoice ${invoice.invoiceNo} posted`,
    reference: `Invoice:${invoice.id}:sale`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.CASH, debit: paid, description: 'Amount received at invoice creation' },
      { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, debit: balance, description: 'Customer credit balance' },
      { code: ACCOUNT_CODES.SALES_REVENUE, credit: revenue, description: 'Sales revenue' },
      { code: ACCOUNT_CODES.SALES_TAX_PAYABLE, credit: tax, description: 'Tax charged' }
    ]
  });

  let cogsEntry = null;
  if (cogs > 0) {
    cogsEntry = await createAutoJournalEntry(tx, {
      tenantId,
      entryDate: invoice.issueDate || new Date(),
      description: `COGS for invoice ${invoice.invoiceNo}`,
      reference: `Invoice:${invoice.id}:cogs`,
      createdById,
      lines: [
        { code: ACCOUNT_CODES.COST_OF_GOODS_SOLD, debit: cogs, description: 'Cost of goods sold' },
        { code: ACCOUNT_CODES.INVENTORY, credit: cogs, description: 'Inventory reduced by sale' }
      ]
    });
  }

  return { saleEntry, cogsEntry };
}

export async function postCustomerReceiptJournal(tx, { tenantId, payment, bankAccount = null, createdById }) {
  const amount = money(payment.amount || 0);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: payment.paidAt || new Date(),
    description: `Customer receipt ${payment.receiptNo || payment.id}`,
    reference: `Payment:${payment.id}:customer-receipt`,
    createdById,
    lines: [
      { code: accountCodeForCashBank(bankAccount), debit: amount, description: 'Cash/bank received' },
      { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit: amount, description: 'Customer balance reduced' }
    ]
  });
}

export async function postSupplierPaymentJournal(tx, { tenantId, payment, bankAccount = null, createdById }) {
  const amount = money(payment.amount || 0);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: payment.paidAt || new Date(),
    description: `Supplier payment ${payment.receiptNo || payment.id}`,
    reference: `Payment:${payment.id}:supplier-payment`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, debit: amount, description: 'Supplier payable reduced' },
      { code: accountCodeForCashBank(bankAccount), credit: amount, description: 'Cash/bank paid' }
    ]
  });
}

export async function postGrnJournal(tx, { tenantId, grn, createdById }) {
  const paid = money(grn.paid || 0);
  const balance = money(grn.balance || 0);
  const total = money(grn.total || 0);

  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: grn.receivedDate || new Date(),
    description: `GRN ${grn.grnNo} posted`,
    reference: `GRN:${grn.id}:purchase`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.INVENTORY, debit: total, description: 'Inventory purchased' },
      { code: ACCOUNT_CODES.CASH, credit: paid, description: 'Amount paid at GRN creation' },
      { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, credit: balance, description: 'Supplier credit balance' }
    ]
  });
}

export async function postExpenseJournal(tx, { tenantId, expense, bankAccount = null, createdById }) {
  const amount = money(expense.amount || 0);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: expense.spentAt || new Date(),
    description: `Expense ${expense.expenseNo || expense.title}`,
    reference: `Expense:${expense.id}`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.OPERATING_EXPENSES, debit: amount, description: expense.category || expense.title || 'Operating expense' },
      { code: accountCodeForCashBank(bankAccount), credit: amount, description: 'Cash/bank paid' }
    ]
  });
}

export async function postSalesReturnJournal(tx, { tenantId, salesReturn, createdById }) {
  const total = money(salesReturn.total || 0);
  const refund = money(salesReturn.refundAmount || 0);
  const credit = money(total - refund);
  const cogsReversal = money((salesReturn.items || []).reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.product?.costPrice || 0), 0));

  const returnEntry = await createAutoJournalEntry(tx, {
    tenantId,
    entryDate: salesReturn.returnDate || new Date(),
    description: `Sales return ${salesReturn.returnNo} posted`,
    reference: `SalesReturn:${salesReturn.id}:return`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.SALES_RETURNS, debit: total, description: 'Sales return value' },
      { code: ACCOUNT_CODES.CASH, credit: refund, description: 'Customer refund paid' },
      { code: ACCOUNT_CODES.ACCOUNTS_RECEIVABLE, credit, description: 'Customer credit reduced' }
    ]
  });

  let inventoryEntry = null;
  if (cogsReversal > 0) {
    inventoryEntry = await createAutoJournalEntry(tx, {
      tenantId,
      entryDate: salesReturn.returnDate || new Date(),
      description: `Inventory reversal for sales return ${salesReturn.returnNo}`,
      reference: `SalesReturn:${salesReturn.id}:inventory`,
      createdById,
      lines: [
        { code: ACCOUNT_CODES.INVENTORY, debit: cogsReversal, description: 'Returned goods added back to inventory' },
        { code: ACCOUNT_CODES.COST_OF_GOODS_SOLD, credit: cogsReversal, description: 'COGS reversed' }
      ]
    });
  }

  return { returnEntry, inventoryEntry };
}

export async function postPurchaseReturnJournal(tx, { tenantId, purchaseReturn, createdById }) {
  const total = money(purchaseReturn.total || 0);
  const refund = money(purchaseReturn.refundReceived || 0);
  const payableReduction = money(total - refund);

  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: purchaseReturn.returnDate || new Date(),
    description: `Purchase return ${purchaseReturn.returnNo} posted`,
    reference: `PurchaseReturn:${purchaseReturn.id}:return`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.ACCOUNTS_PAYABLE, debit: payableReduction, description: 'Supplier payable reduced' },
      { code: ACCOUNT_CODES.CASH, debit: refund, description: 'Supplier refund received' },
      { code: ACCOUNT_CODES.INVENTORY, credit: total, description: 'Inventory returned to supplier' }
    ]
  });
}

export async function postBankOpeningJournal(tx, { tenantId, account, createdById }) {
  const openingBalance = money(account.openingBalance || 0);
  if (openingBalance === 0) return null;
  const accountCode = accountCodeForCashBank(account);
  const amount = Math.abs(openingBalance);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: account.createdAt || new Date(),
    description: `Opening balance for ${account.name}`,
    reference: `BankAccount:${account.id}:opening`,
    createdById,
    lines: openingBalance > 0
      ? [
          { code: accountCode, debit: amount, description: 'Opening cash/bank balance' },
          { code: ACCOUNT_CODES.OWNER_CAPITAL, credit: amount, description: 'Opening capital/source of funds' }
        ]
      : [
          { code: ACCOUNT_CODES.OWNER_CAPITAL, debit: amount, description: 'Opening deficit' },
          { code: accountCode, credit: amount, description: 'Negative opening cash/bank balance' }
        ]
  });
}

export async function postBankAdjustmentJournal(tx, { tenantId, account, transaction, createdById }) {
  const amount = money(transaction.amount || 0);
  const accountCode = accountCodeForCashBank(account);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: transaction.transactionDate || new Date(),
    description: transaction.description || `Adjustment for ${account.name}`,
    reference: `BankTransaction:${transaction.id}:adjustment`,
    createdById,
    lines: transaction.direction === 'IN'
      ? [
          { code: accountCode, debit: amount, description: 'Cash/bank increased' },
          { code: ACCOUNT_CODES.OWNER_CAPITAL, credit: amount, description: 'Adjustment source' }
        ]
      : [
          { code: ACCOUNT_CODES.OWNER_CAPITAL, debit: amount, description: 'Adjustment draw/loss' },
          { code: accountCode, credit: amount, description: 'Cash/bank decreased' }
        ]
  });
}

export async function postBankTransferJournal(tx, { tenantId, fromAccount, toAccount, amount, date, reference, createdById }) {
  const safeAmount = money(amount || 0);
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: date || new Date(),
    description: `Transfer from ${fromAccount.name} to ${toAccount.name}`,
    reference: `BankTransfer:${reference}`,
    createdById,
    lines: [
      { code: accountCodeForCashBank(toAccount), debit: safeAmount, description: `Transfer into ${toAccount.name}` },
      { code: accountCodeForCashBank(fromAccount), credit: safeAmount, description: `Transfer out of ${fromAccount.name}` }
    ]
  });
}

export async function postOpeningStockJournal(tx, { tenantId, product, createdById }) {
  const stockValue = money(Number(product.stockQty || 0) * Number(product.costPrice || 0));
  if (stockValue <= 0) return null;
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: product.createdAt || new Date(),
    description: `Opening stock for ${product.name}`,
    reference: `Product:${product.id}:opening-stock`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.INVENTORY, debit: stockValue, description: 'Opening inventory value' },
      { code: ACCOUNT_CODES.OWNER_CAPITAL, credit: stockValue, description: 'Owner capital/opening inventory source' }
    ]
  });
}

export async function postStockAdjustmentJournal(tx, { tenantId, product, quantity, createdById }) {
  const stockValue = money(Math.abs(Number(quantity || 0)) * Number(product.costPrice || 0));
  if (stockValue <= 0) return null;
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: new Date(),
    description: `Stock adjustment for ${product.name}`,
    reference: `Product:${product.id}:stock-adjustment:${Date.now()}`,
    createdById,
    lines: Number(quantity) > 0
      ? [
          { code: ACCOUNT_CODES.INVENTORY, debit: stockValue, description: 'Inventory increased by adjustment' },
          { code: ACCOUNT_CODES.OWNER_CAPITAL, credit: stockValue, description: 'Adjustment gain/source' }
        ]
      : [
          { code: ACCOUNT_CODES.INVENTORY_ADJUSTMENT, debit: stockValue, description: 'Inventory loss/adjustment expense' },
          { code: ACCOUNT_CODES.INVENTORY, credit: stockValue, description: 'Inventory decreased by adjustment' }
        ]
  });
}

export async function postManufacturingJournal(tx, { tenantId, order, createdById }) {
  const inputCost = money(order.inputCost || 0);
  const additionalCost = money(order.additionalCost || 0);
  const totalCost = money(order.totalCost || inputCost + additionalCost);
  if (totalCost <= 0) return null;

  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: order.productionDate || new Date(),
    description: `Manufacturing order ${order.orderNo} posted`,
    reference: `ManufacturingOrder:${order.id}:production`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.INVENTORY, debit: totalCost, description: 'Finished goods added to inventory' },
      { code: ACCOUNT_CODES.INVENTORY, credit: inputCost, description: 'Raw materials consumed from inventory' },
      { code: ACCOUNT_CODES.CASH, credit: additionalCost, description: 'Additional production cost paid' }
    ]
  });
}


export async function postAssetDepreciationJournal(tx, { tenantId, asset, depreciation, createdById }) {
  const amount = money(depreciation.amount || 0);
  if (amount <= 0) return null;
  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: depreciation.depreciationDate || new Date(),
    description: `Depreciation for asset ${asset.assetNo} - ${asset.name}`,
    reference: `FixedAssetDepreciation:${depreciation.id}`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.DEPRECIATION_EXPENSE, debit: amount, description: 'Asset depreciation expense' },
      { code: ACCOUNT_CODES.ACCUMULATED_DEPRECIATION, credit: amount, description: 'Accumulated depreciation' }
    ]
  });
}

export async function postAssetDisposalJournal(tx, { tenantId, asset, createdById }) {
  const purchaseCost = money(asset.purchaseCost || 0);
  const accumulated = money(asset.accumulatedDepreciation || 0);
  const disposalAmount = money(asset.disposalAmount || 0);
  const bookValue = money(purchaseCost - accumulated);
  const gainLoss = money(disposalAmount - bookValue);
  if (purchaseCost <= 0) return null;

  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: asset.disposalDate || new Date(),
    description: `Asset disposal ${asset.assetNo} - ${asset.name}`,
    reference: `FixedAsset:${asset.id}:disposal`,
    createdById,
    lines: [
      { code: ACCOUNT_CODES.CASH, debit: disposalAmount, description: 'Cash received from disposal' },
      { code: ACCOUNT_CODES.ACCUMULATED_DEPRECIATION, debit: accumulated, description: 'Remove accumulated depreciation' },
      { code: ACCOUNT_CODES.ASSET_DISPOSAL_LOSS, debit: gainLoss < 0 ? Math.abs(gainLoss) : 0, description: 'Loss on asset disposal' },
      { code: ACCOUNT_CODES.FIXED_ASSETS, credit: purchaseCost, description: 'Remove asset cost' },
      { code: ACCOUNT_CODES.ASSET_DISPOSAL_GAIN, credit: gainLoss > 0 ? gainLoss : 0, description: 'Gain on asset disposal' }
    ]
  });
}


export async function postCurrencyRevaluationJournal(tx, { tenantId, revaluation, createdById }) {
  const gainLoss = money(revaluation.gainLoss || 0);
  if (gainLoss === 0) return null;

  const entityType = String(revaluation.entityType || '').toUpperCase();
  const isLiability = entityType === 'SUPPLIER';
  const exposureCode = isLiability ? ACCOUNT_CODES.ACCOUNTS_PAYABLE : entityType === 'BANK' ? ACCOUNT_CODES.BANK : ACCOUNT_CODES.ACCOUNTS_RECEIVABLE;
  const description = `Currency revaluation ${revaluation.entityName || revaluation.entityId} ${revaluation.currencyCode}`;
  const amount = Math.abs(gainLoss);
  let lines;

  if (!isLiability) {
    lines = gainLoss > 0
      ? [
          { code: exposureCode, debit: amount, description: 'Foreign currency asset value increased' },
          { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_GAIN, credit: amount, description }
        ]
      : [
          { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_LOSS, debit: amount, description },
          { code: exposureCode, credit: amount, description: 'Foreign currency asset value decreased' }
        ];
  } else {
    lines = gainLoss > 0
      ? [
          { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_LOSS, debit: amount, description },
          { code: exposureCode, credit: amount, description: 'Foreign currency payable increased' }
        ]
      : [
          { code: exposureCode, debit: amount, description: 'Foreign currency payable decreased' },
          { code: ACCOUNT_CODES.FOREIGN_EXCHANGE_GAIN, credit: amount, description }
        ];
  }

  return createAutoJournalEntry(tx, {
    tenantId,
    entryDate: revaluation.revaluedAt || new Date(),
    description,
    reference: `CurrencyRevaluation:${revaluation.id}`,
    createdById,
    lines
  });
}
