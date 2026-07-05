import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CreditCard, FileText, Plus, Printer, ReceiptText, Search, WalletCards, X } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';
import '../styles/daily-work-ui.css';

const blankItem = { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 };
const blankForm = { customerId: '', paid: 0, paymentMethod: 'CASH', discount: 0, taxRateId: '', notes: '', items: [{ ...blankItem }] };

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function statusTone(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes('paid')) return 'paid';
  if (s.includes('partial')) return 'partial';
  if (s.includes('cancel')) return 'cancelled';
  return 'unpaid';
}

export default function Invoices() {
  const [invoices, setInvoices] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [taxRates, setTaxRates] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [attachmentFile, setAttachmentFile] = useState(null);
  const [form, setForm] = useState(blankForm);

  async function load() {
    const [invoiceRes, customerRes, productRes, settingsRes] = await Promise.all([
      api.get('/invoices'),
      api.get('/customers'),
      api.get('/products'),
      api.get('/settings')
    ]);
    const activeTaxes = (settingsRes.data.taxRates || []).filter((t) => t.isActive);
    setInvoices(invoiceRes.data || []);
    setCustomers(customerRes.data || []);
    setProducts(productRes.data || []);
    setTaxRates(activeTaxes);
    if (!form.taxRateId) {
      const defaultTax = activeTaxes.find((t) => t.isDefault);
      if (defaultTax) setForm((prev) => ({ ...prev, taxRateId: defaultTax.id }));
    }
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load invoice data')); }, []);

  const subtotal = useMemo(() => form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0), 0), [form.items]);
  const selectedTax = taxRates.find((tax) => tax.id === form.taxRateId);
  const taxable = Math.max(subtotal - Number(form.discount || 0), 0);
  const taxAmount = selectedTax ? taxable * Number(selectedTax.rate || 0) / 100 : 0;
  const total = taxable + taxAmount;
  const paid = Number(form.paid || 0);
  const balance = Math.max(total - paid, 0);

  const todayInvoices = invoices.filter((invoice) => {
    const value = invoice.createdAt || invoice.invoiceDate || invoice.date;
    if (!value) return false;
    return new Date(value).toDateString() === new Date().toDateString();
  });
  const totalInvoiceValue = invoices.reduce((sum, invoice) => sum + Number(invoice.total || 0), 0);
  const totalOutstanding = invoices.reduce((sum, invoice) => sum + Number(invoice.balance || 0), 0);
  const paidInvoices = invoices.filter((invoice) => Number(invoice.balance || 0) <= 0).length;

  const filteredInvoices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((invoice) => [invoice.invoiceNo, invoice.customer?.name, invoice.status, invoice.total, invoice.balance]
      .some((value) => String(value || '').toLowerCase().includes(q)));
  }, [invoices, query]);

  function updateItem(index, key, value) {
    const items = form.items.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item);
    if (key === 'productId') {
      const product = products.find((p) => p.id === value);
      if (product) {
        items[index].description = product.name;
        items[index].unitPrice = product.salePrice;
      }
    }
    setForm({ ...form, items });
  }

  function addItem() {
    setForm({ ...form, items: [...form.items, { ...blankItem }] });
  }

  function removeItem(index) {
    if (form.items.length <= 1) return;
    setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) });
  }

  async function submit(e) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const { data } = await api.post('/invoices', {
        ...form,
        customerId: form.customerId || null,
        taxRateId: form.taxRateId || null,
        paid: Number(form.paid || 0),
        discount: Number(form.discount || 0),
        items: form.items.map((item) => ({
          ...item,
          productId: item.productId || null,
          qty: Number(item.qty || 0),
          unitPrice: Number(item.unitPrice || 0),
          discount: Number(item.discount || 0)
        }))
      });

      let attachmentUploaded = false;
      if (attachmentFile && data?.id) {
        try {
          await uploadBusinessFile(attachmentFile, {
            purpose: 'INVOICE_ATTACHMENT',
            folder: 'invoices',
            entityType: 'Invoice',
            entityId: data.id
          });
          attachmentUploaded = true;
        } catch (uploadError) {
          setError(uploadError.response?.data?.message || uploadError.message || 'Invoice created, but attachment upload failed.');
        }
      }

      setSuccess(attachmentFile
        ? (attachmentUploaded ? `Invoice ${data.invoiceNo} created and attachment uploaded.` : `Invoice ${data.invoiceNo} created, but attachment was not uploaded.`)
        : `Invoice ${data.invoiceNo} created successfully.`);
      setForm({ ...blankForm, taxRateId: taxRates.find((tax) => tax.isDefault)?.id || '' });
      setAttachmentFile(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create invoice');
    } finally {
      setSaving(false);
    }
  }

  async function printInvoice(id) {
    setError('');
    try {
      const { data } = await api.get(`/invoices/${id}/print`, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (!win) return setError('Popup blocked. Allow popups to open invoice print preview.');
      win.document.open();
      win.document.write(data);
      win.document.close();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to open invoice print preview');
    }
  }

  return (
    <div className="page workflow-page invoice-workflow-page">
      <section className="workflow-hero">
        <div className="workflow-hero-body">
          <div>
            <span className="workflow-kicker"><ReceiptText size={16} /> Sales Billing</span>
            <h1>Invoices</h1>
            <p>Create clean customer invoices, apply tax and discount, record paid/balance amounts, print branded invoices and attach proof documents.</p>
          </div>
          <div className="workflow-hero-actions">
            <button className="secondary-btn" type="button" onClick={load}>Refresh</button>
            <button className="primary-btn" type="button" onClick={() => document.getElementById('invoice-builder')?.scrollIntoView({ behavior: 'smooth' })}>New Invoice</button>
          </div>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <section className="workflow-stat-grid">
        <div className="workflow-stat-card blue"><div className="workflow-stat-icon"><FileText size={20} /></div><span>Today invoices</span><strong>{todayInvoices.length}</strong><small>Invoices created today</small></div>
        <div className="workflow-stat-card green"><div className="workflow-stat-icon"><WalletCards size={20} /></div><span>Total invoice value</span><strong>{money(totalInvoiceValue)}</strong><small>All listed invoices</small></div>
        <div className="workflow-stat-card orange"><div className="workflow-stat-icon"><AlertTriangle size={20} /></div><span>Outstanding</span><strong>{money(totalOutstanding)}</strong><small>Customer balance to collect</small></div>
        <div className="workflow-stat-card"><div className="workflow-stat-icon"><CreditCard size={20} /></div><span>Fully paid</span><strong>{paidInvoices}</strong><small>Paid invoices in list</small></div>
      </section>

      <div className="workflow-main-grid">
        <section className="workflow-panel" id="invoice-builder">
          <div className="workflow-panel-head">
            <div>
              <h2><Plus size={20} /> Create Invoice</h2>
              <p>Choose customer, add products or manual lines, then check the summary before saving.</p>
            </div>
            <span className="workflow-pill dark">Balance {money(balance)}</span>
          </div>

          <form onSubmit={submit} className="workflow-form-stack">
            <div className="workflow-form-grid">
              <label>Customer
                <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                  <option value="">Walk-in customer</option>
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label>Payment Method
                <select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}>
                  <option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>ONLINE</option><option>CREDIT</option>
                </select>
              </label>
              <label>Paid Amount
                <input type="number" min="0" step="0.01" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} />
              </label>
              <label>Tax Rate
                <select value={form.taxRateId} onChange={(e) => setForm({ ...form, taxRateId: e.target.value })}>
                  <option value="">No tax</option>
                  {taxRates.map((tax) => <option key={tax.id} value={tax.id}>{tax.name} ({Number(tax.rate).toFixed(2)}%)</option>)}
                </select>
              </label>
              <label>Invoice Discount
                <input type="number" min="0" step="0.01" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} />
              </label>
              <label className="workflow-span-two">Notes
                <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional invoice notes, delivery details or payment remarks" />
              </label>
              <label className="workflow-file-card">
                <input type="file" accept="image/*,.pdf" onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)} />
                <strong>{attachmentFile ? attachmentFile.name : 'Attach invoice proof/document'}</strong>
                <span>Optional PDF or image will upload after invoice creation.</span>
              </label>
            </div>

            <div className="workflow-item-list">
              {form.items.map((item, index) => (
                <div className="workflow-item-row" key={index}>
                  <select value={item.productId} onChange={(e) => updateItem(index, 'productId', e.target.value)}>
                    <option value="">Manual item</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} — stock {product.stockQty}</option>)}
                  </select>
                  <input placeholder="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} required />
                  <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} />
                  <input type="number" min="0" step="0.01" value={item.discount} onChange={(e) => updateItem(index, 'discount', e.target.value)} placeholder="Discount" />
                  <strong className="workflow-item-amount">{money(Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0))}</strong>
                  <button type="button" className="mini-danger icon-only" onClick={() => removeItem(index)} disabled={form.items.length === 1}><X size={16} /></button>
                </div>
              ))}
              <button type="button" className="secondary-btn" onClick={addItem}>+ Add another item</button>
            </div>

            <div className="workflow-total-strip">
              <div className="workflow-total-card"><span>Subtotal</span><strong>{money(subtotal)}</strong></div>
              <div className="workflow-total-card"><span>Tax</span><strong>{money(taxAmount)}</strong></div>
              <div className="workflow-total-card highlight"><span>Total</span><strong>{money(total)}</strong></div>
              <div className="workflow-total-card"><span>Balance</span><strong>{money(balance)}</strong></div>
            </div>

            <div className="workflow-action-row">
              <button type="button" className="ghost-btn" onClick={() => setForm({ ...blankForm, taxRateId: taxRates.find((tax) => tax.isDefault)?.id || '' })}>Clear form</button>
              <button className="primary-btn" disabled={saving}>{saving ? 'Creating...' : 'Create Invoice'}</button>
            </div>
          </form>
        </section>

        <aside className="workflow-summary-stack">
          <div className="workflow-help-card">
            <h2>How invoice works</h2>
            <div className="workflow-help-list">
              <div><b>1</b><span>Select customer. Use walk-in for cash counter customers.</span></div>
              <div><b>2</b><span>Add product lines. Product stock reduces after invoice is saved.</span></div>
              <div><b>3</b><span>Enter paid amount. Unpaid balance becomes customer outstanding.</span></div>
            </div>
          </div>
          <div className="workflow-mini-card"><span>Selected customer</span><strong>{customers.find((c) => c.id === form.customerId)?.name || 'Walk-in'}</strong></div>
          <div className="workflow-mini-card"><span>Items in invoice</span><strong>{form.items.length}</strong></div>
          <div className="workflow-mini-card"><span>Payment status</span><strong>{balance <= 0 ? 'Paid' : paid > 0 ? 'Partial' : 'Credit'}</strong></div>
        </aside>
      </div>

      <section className="workflow-panel workflow-table-panel">
        <div className="workflow-panel-head">
          <div>
            <h2><Printer size={20} /> Recent Invoices</h2>
            <p>Search invoices quickly and open print preview when the customer needs a copy.</p>
          </div>
          <div className="workflow-search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search invoice, customer or status" />
            <select value="" onChange={(e) => setQuery(e.target.value)}>
              <option value="">Quick status</option>
              <option value="PAID">Paid</option>
              <option value="PARTIAL">Partial</option>
              <option value="UNPAID">Unpaid</option>
            </select>
            <button className="secondary-btn" type="button" onClick={() => setQuery('')}><Search size={16} /> Reset</button>
          </div>
        </div>
        <DataTable
          columns={[
            { key: 'invoiceNo', label: 'Invoice', render: (row) => <strong>{row.invoiceNo}</strong> },
            { key: 'customer', label: 'Customer', render: (row) => row.customer?.name || 'Walk-in' },
            { key: 'tax', label: 'Tax', render: (row) => money(row.tax) },
            { key: 'total', label: 'Total', render: (row) => <strong>{money(row.total)}</strong> },
            { key: 'balance', label: 'Balance', render: (row) => money(row.balance) },
            { key: 'status', label: 'Status', render: (row) => <span className={`badge ${statusTone(row.status)}`}>{row.status}</span> },
            { key: 'print', label: 'Print', render: (row) => <button className="mini-action" onClick={() => printInvoice(row.id)}>Open</button> }
          ]}
          rows={filteredInvoices}
          empty="No invoices found. Create your first invoice from the form above."
        />
      </section>
    </div>
  );
}
