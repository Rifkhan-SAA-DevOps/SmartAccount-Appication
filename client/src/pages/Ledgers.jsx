import { useEffect, useMemo, useState } from 'react';
import { Building2, CreditCard, Eye, ReceiptText, RefreshCw, UserRound, WalletCards } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const methodOptions = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function cleanLabel(value) {
  return String(value || '-').replaceAll('_', ' ');
}

const customerPaymentInitial = { customerId: '', invoiceId: '', bankAccountId: '', amount: '', method: 'CASH', reference: '', notes: '' };
const supplierPaymentInitial = { supplierId: '', grnId: '', bankAccountId: '', amount: '', method: 'CASH', reference: '', notes: '' };

export default function Ledgers() {
  const [activeTab, setActiveTab] = useState('customer');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [payments, setPayments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [customerLedger, setCustomerLedger] = useState(null);
  const [supplierLedger, setSupplierLedger] = useState(null);
  const [customerPayment, setCustomerPayment] = useState(customerPaymentInitial);
  const [supplierPayment, setSupplierPayment] = useState(supplierPaymentInitial);
  const [paymentDrawer, setPaymentDrawer] = useState(null);
  const [selectedEntry, setSelectedEntry] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function loadBase() {
    const [customerRes, supplierRes, paymentRes, accountRes] = await Promise.all([
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/payments'),
      api.get('/cashbank/accounts')
    ]);

    const customerRows = Array.isArray(customerRes.data) ? customerRes.data : [];
    const supplierRows = Array.isArray(supplierRes.data) ? supplierRes.data : [];
    const paymentRows = Array.isArray(paymentRes.data) ? paymentRes.data : [];
    const accountRows = Array.isArray(accountRes.data) ? accountRes.data : [];

    setCustomers(customerRows);
    setSuppliers(supplierRows);
    setPayments(paymentRows);
    setAccounts(accountRows);

    if (!selectedCustomerId && customerRows[0]) {
      const firstCustomer = customerRows[0].id;
      setSelectedCustomerId(firstCustomer);
      setCustomerPayment((old) => ({ ...old, customerId: firstCustomer, bankAccountId: old.bankAccountId || accountRows[0]?.id || '' }));
    }

    if (!selectedSupplierId && supplierRows[0]) {
      const firstSupplier = supplierRows[0].id;
      setSelectedSupplierId(firstSupplier);
      setSupplierPayment((old) => ({ ...old, supplierId: firstSupplier, bankAccountId: old.bankAccountId || accountRows[0]?.id || '' }));
    }

    if (accountRows[0]) {
      setCustomerPayment((old) => ({ ...old, bankAccountId: old.bankAccountId || accountRows[0].id }));
      setSupplierPayment((old) => ({ ...old, bankAccountId: old.bankAccountId || accountRows[0].id }));
    }
  }

  async function loadCustomerLedger(customerId = selectedCustomerId) {
    if (!customerId) return setCustomerLedger(null);
    const { data } = await api.get(`/ledgers/customers/${customerId}`);
    setCustomerLedger(data);
  }

  async function loadSupplierLedger(supplierId = selectedSupplierId) {
    if (!supplierId) return setSupplierLedger(null);
    const { data } = await api.get(`/ledgers/suppliers/${supplierId}`);
    setSupplierLedger(data);
  }

  async function refreshAll() {
    setLoading(true);
    setError('');
    try {
      await loadBase();
      if (selectedCustomerId) await loadCustomerLedger(selectedCustomerId);
      if (selectedSupplierId) await loadSupplierLedger(selectedSupplierId);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to refresh ledger data');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBase().catch((e) => setError(e.response?.data?.message || 'Failed to load ledgers'));
  }, []);

  useEffect(() => {
    if (selectedCustomerId) loadCustomerLedger(selectedCustomerId).catch((e) => setError(e.response?.data?.message || 'Failed to load customer ledger'));
  }, [selectedCustomerId]);

  useEffect(() => {
    if (selectedSupplierId) loadSupplierLedger(selectedSupplierId).catch((e) => setError(e.response?.data?.message || 'Failed to load supplier ledger'));
  }, [selectedSupplierId]);

  const customerOpenInvoices = useMemo(() => customerLedger?.openInvoices || [], [customerLedger]);
  const supplierOpenGrns = useMemo(() => supplierLedger?.openGrns || [], [supplierLedger]);

  function openCustomerPaymentDrawer() {
    setActiveTab('customer');
    setPaymentDrawer('customer');
    setCustomerPayment((old) => ({ ...old, customerId: old.customerId || selectedCustomerId, invoiceId: '' }));
  }

  function openSupplierPaymentDrawer() {
    setActiveTab('supplier');
    setPaymentDrawer('supplier');
    setSupplierPayment((old) => ({ ...old, supplierId: old.supplierId || selectedSupplierId, grnId: '' }));
  }

  async function submitCustomerPayment(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/payments/customer', {
        customerId: customerPayment.customerId || null,
        invoiceId: customerPayment.invoiceId || null,
        bankAccountId: customerPayment.bankAccountId || null,
        amount: Number(customerPayment.amount),
        method: customerPayment.method,
        reference: customerPayment.reference || null,
        notes: customerPayment.notes || null
      });
      setReceipt(data.payment);
      setReceiptOpen(true);
      setPaymentDrawer(null);
      setCustomerPayment((old) => ({ ...customerPaymentInitial, customerId: old.customerId, bankAccountId: old.bankAccountId }));
      await refreshAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record customer receipt');
    }
  }

  async function submitSupplierPayment(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/payments/supplier', {
        supplierId: supplierPayment.supplierId || null,
        grnId: supplierPayment.grnId || null,
        bankAccountId: supplierPayment.bankAccountId || null,
        amount: Number(supplierPayment.amount),
        method: supplierPayment.method,
        reference: supplierPayment.reference || null,
        notes: supplierPayment.notes || null
      });
      setReceipt(data.payment);
      setReceiptOpen(true);
      setPaymentDrawer(null);
      setSupplierPayment((old) => ({ ...supplierPaymentInitial, supplierId: old.supplierId, bankAccountId: old.bankAccountId }));
      await refreshAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record supplier payment');
    }
  }

  async function openReceipt(id) {
    if (!id) return;
    setError('');
    try {
      const { data } = await api.get(`/payments/${id}/receipt`);
      setReceipt(data);
      setReceiptOpen(true);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load receipt');
    }
  }

  function handleLedgerRowClick(entry, partyType) {
    setSelectedEntry({ ...entry, partyType });
  }

  const ledgerColumns = [
    { key: 'date', label: 'Date', render: (r) => shortDate(r.date) },
    { key: 'type', label: 'Type', render: (r) => <span className="badge partial">{cleanLabel(r.type)}</span> },
    { key: 'ref', label: 'Reference', render: (r) => <strong>{r.ref || '-'}</strong> },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', render: (r) => money(r.debit) },
    { key: 'credit', label: 'Credit', render: (r) => money(r.credit) },
    { key: 'balance', label: 'Balance', render: (r) => <strong>{money(r.balance)}</strong> }
  ];

  const receiptColumns = [
    { key: 'paidAt', label: 'Date', render: (r) => shortDate(r.paidAt) },
    { key: 'receiptNo', label: 'Receipt No', render: (r) => <strong>{r.receiptNo || '-'}</strong> },
    { key: 'party', label: 'Party', render: (r) => r.customer?.name || r.supplier?.name || '-' },
    { key: 'direction', label: 'Type', render: (r) => <span className={`badge ${r.direction === 'IN' ? 'paid' : 'unpaid'}`}>{r.direction === 'IN' ? 'Money In' : 'Money Out'}</span> },
    { key: 'account', label: 'Cash/Bank', render: (r) => r.bankAccount?.name || '-' },
    { key: 'amount', label: 'Amount', render: (r) => <strong>{money(r.amount)}</strong> }
  ];

  const activeLedger = activeTab === 'customer' ? customerLedger : supplierLedger;
  const activeParty = activeTab === 'customer' ? customerLedger?.customer : supplierLedger?.supplier;

  return (
    <div className="page ledgers-page stage11-ledgers-page">
      <div className="page-header stage11-hero">
        <div>
          <span className="eyebrow">Finance control</span>
          <h1>Ledgers & Payment Receipts</h1>
          <p>Use this page to check customer/supplier balances, open a ledger line, and view receipts in a clean modal.</p>
        </div>
        <div className="head-actions stage11-head-actions">
          <button className="ghost-btn" type="button" onClick={refreshAll} disabled={loading}><RefreshCw size={16} /> Refresh</button>
          <button className="primary-btn" type="button" onClick={openCustomerPaymentDrawer}><WalletCards size={16} /> Receive Customer Payment</button>
          <button className="secondary-btn" type="button" onClick={openSupplierPaymentDrawer}><CreditCard size={16} /> Pay Supplier</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="tab-actions stage11-tab-actions">
        <button className={`tab-btn ${activeTab === 'customer' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('customer')}><UserRound size={16} /> Customer Ledger</button>
        <button className={`tab-btn ${activeTab === 'supplier' ? 'active' : ''}`} type="button" onClick={() => setActiveTab('supplier')}><Building2 size={16} /> Supplier Ledger</button>
      </div>

      <section className="panel stage11-ledger-panel">
        <div className="stage11-panel-head">
          <div>
            <h2>{activeTab === 'customer' ? 'Customer Statement' : 'Supplier Statement'}</h2>
            <p>{activeTab === 'customer' ? 'Click any customer ledger row to view debit, credit and reference details.' : 'Click any supplier ledger row to view payable movement details.'}</p>
          </div>
          <label className="stage11-inline-select">
            {activeTab === 'customer' ? 'Customer' : 'Supplier'}
            {activeTab === 'customer' ? (
              <select value={selectedCustomerId} onChange={(e) => {
                setSelectedCustomerId(e.target.value);
                setCustomerPayment((old) => ({ ...old, customerId: e.target.value, invoiceId: '' }));
              }}>
                <option value="">Select customer</option>
                {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {money(customer.balance)}</option>)}
              </select>
            ) : (
              <select value={selectedSupplierId} onChange={(e) => {
                setSelectedSupplierId(e.target.value);
                setSupplierPayment((old) => ({ ...old, supplierId: e.target.value, grnId: '' }));
              }}>
                <option value="">Select supplier</option>
                {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} — {money(supplier.balance)}</option>)}
              </select>
            )}
          </label>
        </div>

        <div className="ledger-summary-grid stage11-summary-grid">
          <div><span>Selected Party</span><strong>{activeParty?.name || '-'}</strong></div>
          <div><span>Total Debit</span><strong>{money(activeLedger?.totalDebit)}</strong></div>
          <div><span>Total Credit</span><strong>{money(activeLedger?.totalCredit)}</strong></div>
          <div><span>{activeTab === 'customer' ? 'Outstanding' : 'Payable'}</span><strong>{money(activeLedger?.storedBalance)}</strong></div>
        </div>

        <DataTable
          columns={ledgerColumns}
          rows={activeLedger?.entries || []}
          empty={`No ${activeTab} ledger entries yet`}
          paginationLabel="ledger entries"
          pageSize={10}
          onRowClick={(row) => handleLedgerRowClick(row, activeTab)}
        />
      </section>

      <section className="panel stage11-ledger-panel">
        <div className="stage11-panel-head">
          <div>
            <h2>Recent Payment Receipts</h2>
            <p>Click a receipt row to open the printable receipt view.</p>
          </div>
          <button className="ghost-btn" type="button" onClick={() => payments[0]?.id && openReceipt(payments[0].id)}><Eye size={16} /> Open Latest</button>
        </div>
        <DataTable columns={receiptColumns} rows={payments} empty="No receipts yet" paginationLabel="receipts" pageSize={10} onRowClick={(row) => openReceipt(row.id)} />
      </section>

      <ModalDrawer
        open={paymentDrawer === 'customer'}
        onClose={() => setPaymentDrawer(null)}
        title="Receive Customer Payment"
        eyebrow="Customer ledger"
        description="Record money received and optionally apply it to an open invoice."
        size="lg"
      >
        <form onSubmit={submitCustomerPayment} className="form-grid stage11-modal-form">
          <label>Customer
            <select value={customerPayment.customerId} onChange={(e) => {
              setCustomerPayment({ ...customerPayment, customerId: e.target.value, invoiceId: '' });
              setSelectedCustomerId(e.target.value);
            }} required>
              <option value="">Select customer</option>
              {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
            </select>
          </label>
          <label>Apply to Invoice
            <select value={customerPayment.invoiceId} onChange={(e) => setCustomerPayment({ ...customerPayment, invoiceId: e.target.value })}>
              <option value="">General customer balance</option>
              {customerOpenInvoices.map((invoice) => <option key={invoice.id} value={invoice.id}>{invoice.invoiceNo} — due {money(invoice.balance)}</option>)}
            </select>
          </label>
          <label>Received To
            <select value={customerPayment.bankAccountId} onChange={(e) => setCustomerPayment({ ...customerPayment, bankAccountId: e.target.value })}>
              <option value="">Do not update cash/bank</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
            </select>
          </label>
          <label>Amount
            <input type="number" min="0.01" step="0.01" value={customerPayment.amount} onChange={(e) => setCustomerPayment({ ...customerPayment, amount: e.target.value })} required />
          </label>
          <label>Method
            <select value={customerPayment.method} onChange={(e) => setCustomerPayment({ ...customerPayment, method: e.target.value })}>
              {methodOptions.map((method) => <option key={method} value={method}>{cleanLabel(method)}</option>)}
            </select>
          </label>
          <label>Reference
            <input value={customerPayment.reference} onChange={(e) => setCustomerPayment({ ...customerPayment, reference: e.target.value })} placeholder="Cheque/card/bank ref" />
          </label>
          <label className="span-two">Notes
            <textarea value={customerPayment.notes} onChange={(e) => setCustomerPayment({ ...customerPayment, notes: e.target.value })} placeholder="Optional note" />
          </label>
          <div className="modal-action-row span-two">
            <button className="ghost-btn" type="button" onClick={() => setPaymentDrawer(null)}>Cancel</button>
            <button className="primary-btn" type="submit">Save Receipt</button>
          </div>
        </form>
      </ModalDrawer>

      <ModalDrawer
        open={paymentDrawer === 'supplier'}
        onClose={() => setPaymentDrawer(null)}
        title="Pay Supplier"
        eyebrow="Supplier ledger"
        description="Record a supplier payment and optionally apply it to an open GRN."
        size="lg"
      >
        <form onSubmit={submitSupplierPayment} className="form-grid stage11-modal-form">
          <label>Supplier
            <select value={supplierPayment.supplierId} onChange={(e) => {
              setSupplierPayment({ ...supplierPayment, supplierId: e.target.value, grnId: '' });
              setSelectedSupplierId(e.target.value);
            }} required>
              <option value="">Select supplier</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
            </select>
          </label>
          <label>Apply to GRN
            <select value={supplierPayment.grnId} onChange={(e) => setSupplierPayment({ ...supplierPayment, grnId: e.target.value })}>
              <option value="">General supplier balance</option>
              {supplierOpenGrns.map((grn) => <option key={grn.id} value={grn.id}>{grn.grnNo} — due {money(grn.balance)}</option>)}
            </select>
          </label>
          <label>Paid From
            <select value={supplierPayment.bankAccountId} onChange={(e) => setSupplierPayment({ ...supplierPayment, bankAccountId: e.target.value })}>
              <option value="">Do not update cash/bank</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
            </select>
          </label>
          <label>Amount
            <input type="number" min="0.01" step="0.01" value={supplierPayment.amount} onChange={(e) => setSupplierPayment({ ...supplierPayment, amount: e.target.value })} required />
          </label>
          <label>Method
            <select value={supplierPayment.method} onChange={(e) => setSupplierPayment({ ...supplierPayment, method: e.target.value })}>
              {methodOptions.map((method) => <option key={method} value={method}>{cleanLabel(method)}</option>)}
            </select>
          </label>
          <label>Reference
            <input value={supplierPayment.reference} onChange={(e) => setSupplierPayment({ ...supplierPayment, reference: e.target.value })} placeholder="Cheque/card/bank ref" />
          </label>
          <label className="span-two">Notes
            <textarea value={supplierPayment.notes} onChange={(e) => setSupplierPayment({ ...supplierPayment, notes: e.target.value })} placeholder="Optional note" />
          </label>
          <div className="modal-action-row span-two">
            <button className="ghost-btn" type="button" onClick={() => setPaymentDrawer(null)}>Cancel</button>
            <button className="primary-btn" type="submit">Save Supplier Payment</button>
          </div>
        </form>
      </ModalDrawer>

      <ModalDrawer
        open={Boolean(selectedEntry)}
        onClose={() => setSelectedEntry(null)}
        title="Ledger Entry Details"
        eyebrow={selectedEntry?.partyType === 'customer' ? 'Customer ledger' : 'Supplier ledger'}
        description="This modal keeps the table clean and puts details/actions in one readable place."
        mode="modal"
        size="md"
      >
        {selectedEntry && (
          <div className="stage11-detail-stack">
            <div className="stage11-detail-grid">
              <div><span>Date</span><strong>{shortDate(selectedEntry.date)}</strong></div>
              <div><span>Type</span><strong>{cleanLabel(selectedEntry.type)}</strong></div>
              <div><span>Reference</span><strong>{selectedEntry.ref || '-'}</strong></div>
              <div><span>Method</span><strong>{cleanLabel(selectedEntry.method)}</strong></div>
              <div><span>Debit</span><strong>{money(selectedEntry.debit)}</strong></div>
              <div><span>Credit</span><strong>{money(selectedEntry.credit)}</strong></div>
              <div className="span-two"><span>Running Balance</span><strong>{money(selectedEntry.balance)}</strong></div>
              <div className="span-two"><span>Description</span><strong>{selectedEntry.description || '-'}</strong></div>
            </div>
            {String(selectedEntry.id || '').startsWith('payment-') && (
              <button className="primary-btn" type="button" onClick={() => openReceipt(String(selectedEntry.id).replace('payment-', ''))}><ReceiptText size={16} /> View Receipt</button>
            )}
          </div>
        )}
      </ModalDrawer>

      <ModalDrawer
        open={receiptOpen}
        onClose={() => setReceiptOpen(false)}
        title="Payment Receipt"
        eyebrow="Printable view"
        description="Review the payment receipt without making the receipt table wider."
        mode="modal"
        size="md"
      >
        {receipt ? (
          <div className="receipt-box stage11-receipt-box">
            <div className="receipt-head">
              <strong>{receipt.receiptNo || 'Payment Receipt'}</strong>
              <span>{shortDate(receipt.paidAt)}</span>
            </div>
            <div className="receipt-line"><span>Party</span><strong>{receipt.customer?.name || receipt.supplier?.name || '-'}</strong></div>
            <div className="receipt-line"><span>Direction</span><strong>{receipt.direction === 'IN' ? 'Money received' : 'Money paid'}</strong></div>
            <div className="receipt-line"><span>Method</span><strong>{cleanLabel(receipt.method)}</strong></div>
            <div className="receipt-line"><span>Cash/Bank</span><strong>{receipt.bankAccount?.name || '-'}</strong></div>
            <div className="receipt-line"><span>Amount</span><strong>{money(receipt.amount)}</strong></div>
            {receipt.invoice && <div className="receipt-line"><span>Invoice</span><strong>{receipt.invoice.invoiceNo}</strong></div>}
            {receipt.grn && <div className="receipt-line"><span>GRN</span><strong>{receipt.grn.grnNo}</strong></div>}
            {receipt.reference && <div className="receipt-line"><span>Reference</span><strong>{receipt.reference}</strong></div>}
            {receipt.notes && <p className="receipt-note">{receipt.notes}</p>}
            <div className="modal-action-row">
              <button className="ghost-btn" type="button" onClick={() => setReceiptOpen(false)}>Close</button>
              <button className="primary-btn" type="button" onClick={() => window.print()}>Print Receipt</button>
            </div>
          </div>
        ) : <p>No receipt selected.</p>}
      </ModalDrawer>
    </div>
  );
}
