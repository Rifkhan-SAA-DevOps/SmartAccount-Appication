import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const methodOptions = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];

function money(value) {
  return `LKR ${Number(value || 0).toFixed(2)}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
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
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');

  async function loadBase() {
    const [customerRes, supplierRes, paymentRes, accountRes] = await Promise.all([
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/payments'),
      api.get('/cashbank/accounts')
    ]);
    setCustomers(customerRes.data);
    setSuppliers(supplierRes.data);
    setPayments(paymentRes.data);
    setAccounts(accountRes.data);

    if (!selectedCustomerId && customerRes.data[0]) {
      const firstCustomer = customerRes.data[0].id;
      setSelectedCustomerId(firstCustomer);
      setCustomerPayment((old) => ({ ...old, customerId: firstCustomer, bankAccountId: old.bankAccountId || accountRes.data[0]?.id || '' }));
    }
    if (!selectedSupplierId && supplierRes.data[0]) {
      const firstSupplier = supplierRes.data[0].id;
      setSelectedSupplierId(firstSupplier);
      setSupplierPayment((old) => ({ ...old, supplierId: firstSupplier, bankAccountId: old.bankAccountId || accountRes.data[0]?.id || '' }));
    }
    if (accountRes.data[0]) {
      setCustomerPayment((old) => ({ ...old, bankAccountId: old.bankAccountId || accountRes.data[0].id }));
      setSupplierPayment((old) => ({ ...old, bankAccountId: old.bankAccountId || accountRes.data[0].id }));
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
    await loadBase();
    if (selectedCustomerId) await loadCustomerLedger(selectedCustomerId);
    if (selectedSupplierId) await loadSupplierLedger(selectedSupplierId);
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
      setCustomerPayment({ ...customerPaymentInitial, customerId: customerPayment.customerId });
      await refreshAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to record customer receipt'); }
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
      setSupplierPayment({ ...supplierPaymentInitial, supplierId: supplierPayment.supplierId });
      await refreshAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to record supplier payment'); }
  }

  async function openReceipt(id) {
    setError('');
    try {
      const { data } = await api.get(`/payments/${id}/receipt`);
      setReceipt(data);
    } catch (e) { setError(e.response?.data?.message || 'Failed to load receipt'); }
  }

  const ledgerColumns = [
    { key: 'date', label: 'Date', render: (r) => shortDate(r.date) },
    { key: 'type', label: 'Type' },
    { key: 'ref', label: 'Reference' },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', render: (r) => money(r.debit) },
    { key: 'credit', label: 'Credit', render: (r) => money(r.credit) },
    { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }
  ];

  return (
    <div className="page ledgers-page">
      <div className="page-head">
        <div>
          <h1>Ledgers & Payment Receipts</h1>
          <p>Track customer outstanding, supplier payable, full transaction history, and payment receipts.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${activeTab === 'customer' ? 'active' : ''}`} onClick={() => setActiveTab('customer')}>Customer Ledger</button>
          <button className={`tab-btn ${activeTab === 'supplier' ? 'active' : ''}`} onClick={() => setActiveTab('supplier')}>Supplier Ledger</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {activeTab === 'customer' ? (
        <div className="ledger-layout">
          <section className="panel">
            <div className="ledger-toolbar">
              <div>
                <h2>Customer Statement</h2>
                <p>Select a customer to see invoices, payments, returns, and running balance.</p>
              </div>
              <label>Customer
                <select value={selectedCustomerId} onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setCustomerPayment({ ...customerPayment, customerId: e.target.value, invoiceId: '' });
                }}>
                  <option value="">Select customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} — {money(customer.balance)}</option>)}
                </select>
              </label>
            </div>

            <div className="ledger-summary-grid">
              <div><span>Total Debit</span><strong>{money(customerLedger?.totalDebit)}</strong></div>
              <div><span>Total Credit</span><strong>{money(customerLedger?.totalCredit)}</strong></div>
              <div><span>Calculated Balance</span><strong>{money(customerLedger?.calculatedBalance)}</strong></div>
              <div><span>Stored Outstanding</span><strong>{money(customerLedger?.storedBalance)}</strong></div>
            </div>

            <DataTable columns={ledgerColumns} rows={customerLedger?.entries || []} empty="No customer ledger entries yet" />
          </section>

          <section className="panel">
            <h2>Receive Customer Payment</h2>
            <form onSubmit={submitCustomerPayment} className="form-grid">
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
                  {methodOptions.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>Reference
                <input value={customerPayment.reference} onChange={(e) => setCustomerPayment({ ...customerPayment, reference: e.target.value })} placeholder="Cheque/card/bank ref" />
              </label>
              <label>Notes
                <input value={customerPayment.notes} onChange={(e) => setCustomerPayment({ ...customerPayment, notes: e.target.value })} placeholder="Optional note" />
              </label>
              <button className="primary-btn">Save Receipt</button>
            </form>
          </section>
        </div>
      ) : (
        <div className="ledger-layout">
          <section className="panel">
            <div className="ledger-toolbar">
              <div>
                <h2>Supplier Statement</h2>
                <p>See GRNs, supplier payments, purchase returns, and payable balance.</p>
              </div>
              <label>Supplier
                <select value={selectedSupplierId} onChange={(e) => {
                  setSelectedSupplierId(e.target.value);
                  setSupplierPayment({ ...supplierPayment, supplierId: e.target.value, grnId: '' });
                }}>
                  <option value="">Select supplier</option>
                  {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} — {money(supplier.balance)}</option>)}
                </select>
              </label>
            </div>

            <div className="ledger-summary-grid">
              <div><span>Total Debit</span><strong>{money(supplierLedger?.totalDebit)}</strong></div>
              <div><span>Total Credit</span><strong>{money(supplierLedger?.totalCredit)}</strong></div>
              <div><span>Calculated Payable</span><strong>{money(supplierLedger?.calculatedBalance)}</strong></div>
              <div><span>Stored Payable</span><strong>{money(supplierLedger?.storedBalance)}</strong></div>
            </div>

            <DataTable columns={ledgerColumns} rows={supplierLedger?.entries || []} empty="No supplier ledger entries yet" />
          </section>

          <section className="panel">
            <h2>Pay Supplier</h2>
            <form onSubmit={submitSupplierPayment} className="form-grid">
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
                  {methodOptions.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>Reference
                <input value={supplierPayment.reference} onChange={(e) => setSupplierPayment({ ...supplierPayment, reference: e.target.value })} placeholder="Cheque/card/bank ref" />
              </label>
              <label>Notes
                <input value={supplierPayment.notes} onChange={(e) => setSupplierPayment({ ...supplierPayment, notes: e.target.value })} placeholder="Optional note" />
              </label>
              <button className="primary-btn">Save Supplier Payment</button>
            </form>
          </section>
        </div>
      )}

      <div className="ledger-layout small-side">
        <section className="panel">
          <h2>Recent Payment Receipts</h2>
          <DataTable columns={[
            { key: 'paidAt', label: 'Date', render: (r) => shortDate(r.paidAt) },
            { key: 'receiptNo', label: 'Receipt No', render: (r) => r.receiptNo || '-' },
            { key: 'party', label: 'Party', render: (r) => r.customer?.name || r.supplier?.name || '-' },
            { key: 'direction', label: 'Type', render: (r) => r.direction === 'IN' ? 'Money In' : 'Money Out' },
            { key: 'account', label: 'Cash/Bank', render: (r) => r.bankAccount?.name || '-' },
            { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
            { key: 'action', label: 'Receipt', render: (r) => <button className="mini-action" onClick={() => openReceipt(r.id)}>View</button> }
          ]} rows={payments} empty="No receipts yet" />
        </section>

        <section className="panel receipt-card">
          <h2>Receipt Preview</h2>
          {receipt ? (
            <div className="receipt-box">
              <div className="receipt-head">
                <strong>{receipt.receiptNo || 'Payment Receipt'}</strong>
                <span>{shortDate(receipt.paidAt)}</span>
              </div>
              <div className="receipt-line"><span>Party</span><strong>{receipt.customer?.name || receipt.supplier?.name || '-'}</strong></div>
              <div className="receipt-line"><span>Direction</span><strong>{receipt.direction === 'IN' ? 'Money received' : 'Money paid'}</strong></div>
              <div className="receipt-line"><span>Method</span><strong>{receipt.method?.replace('_', ' ')}</strong></div>
              <div className="receipt-line"><span>Cash/Bank</span><strong>{receipt.bankAccount?.name || '-'}</strong></div>
              <div className="receipt-line"><span>Amount</span><strong>{money(receipt.amount)}</strong></div>
              {receipt.invoice && <div className="receipt-line"><span>Invoice</span><strong>{receipt.invoice.invoiceNo}</strong></div>}
              {receipt.grn && <div className="receipt-line"><span>GRN</span><strong>{receipt.grn.grnNo}</strong></div>}
              {receipt.reference && <div className="receipt-line"><span>Reference</span><strong>{receipt.reference}</strong></div>}
              {receipt.notes && <p className="receipt-note">{receipt.notes}</p>}
              <button className="secondary-btn" onClick={() => window.print()}>Print Receipt</button>
            </div>
          ) : <p>Select or create a payment to preview the receipt.</p>}
        </section>
      </div>
    </div>
  );
}
