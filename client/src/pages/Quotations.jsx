import { useEffect, useMemo, useState } from 'react';
import { FileSignature, FileText, RefreshCw, Send, ShoppingBag } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyItem = { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0 };
const emptyQuote = { customerId: '', crmLeadId: '', title: '', status: 'DRAFT', issueDate: '', validUntil: '', discount: 0, tax: 0, notes: '', terms: '', items: [{ ...emptyItem }] };
const emptyOrder = { customerId: '', crmLeadId: '', quotationId: '', warehouseId: '', status: 'DRAFT', orderDate: '', expectedDate: '', discount: 0, tax: 0, notes: '', terms: '', items: [{ ...emptyItem }] };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (['accepted', 'converted', 'confirmed', 'delivered', 'invoiced'].includes(s)) return 'paid';
  if (['sent', 'draft', 'partial'].includes(s)) return 'unpaid';
  if (['rejected', 'expired', 'cancelled'].includes(s)) return 'cancelled';
  return 'partial';
}

export default function Quotations() {
  const [summary, setSummary] = useState(null);
  const [quotes, setQuotes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [leads, setLeads] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [quoteForm, setQuoteForm] = useState(emptyQuote);
  const [orderForm, setOrderForm] = useState(emptyOrder);
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [tab, setTab] = useState('quotes');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, quoteRes, orderRes, customerRes, productRes, leadRes, warehouseRes] = await Promise.all([
      api.get('/quotations/summary'),
      api.get('/quotations', { params }),
      api.get('/quotations/sales-orders', { params }),
      api.get('/customers'),
      api.get('/products'),
      api.get('/crm/leads').catch(() => ({ data: [] })),
      api.get('/branches/warehouses')
    ]);
    setSummary(summaryRes.data);
    setQuotes(quoteRes.data || []);
    setOrders(orderRes.data || []);
    setCustomers(customerRes.data || []);
    setProducts(productRes.data || []);
    setLeads(leadRes.data || []);
    setWarehouses(warehouseRes.data || []);
    setOrderForm((old) => ({ ...old, warehouseId: old.warehouseId || warehouseRes.data?.[0]?.id || '' }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load quotations')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function productChanged(formName, index, productId) {
    const product = products.find((p) => p.id === productId);
    const setter = formName === 'quote' ? setQuoteForm : setOrderForm;
    setter((old) => ({
      ...old,
      items: old.items.map((item, i) => i === index ? { ...item, productId, description: product?.name || '', unitPrice: product?.salePrice || 0 } : item)
    }));
  }

  function updateItem(formName, index, patch) {
    const setter = formName === 'quote' ? setQuoteForm : setOrderForm;
    setter((old) => ({ ...old, items: old.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function addItem(formName) {
    const setter = formName === 'quote' ? setQuoteForm : setOrderForm;
    setter((old) => ({ ...old, items: [...old.items, { ...emptyItem }] }));
  }

  function removeItem(formName, index) {
    const setter = formName === 'quote' ? setQuoteForm : setOrderForm;
    setter((old) => ({ ...old, items: old.items.length <= 1 ? old.items : old.items.filter((_, i) => i !== index) }));
  }

  function formTotal(form) {
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0), 0);
    return Math.max(subtotal - Number(form.discount || 0), 0) + Number(form.tax || 0);
  }

  async function createQuote(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/quotations', {
        ...quoteForm,
        customerId: quoteForm.customerId || null,
        crmLeadId: quoteForm.crmLeadId || null,
        issueDate: quoteForm.issueDate || undefined,
        validUntil: quoteForm.validUntil || null,
        discount: Number(quoteForm.discount || 0),
        tax: Number(quoteForm.tax || 0),
        items: quoteForm.items.map((item) => ({ ...item, productId: item.productId || null, qty: Number(item.qty || 0), unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0) }))
      });
      setQuoteForm(emptyQuote);
      flash('Quotation created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create quotation'); }
    finally { setSaving(false); }
  }

  async function createOrder(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/quotations/sales-orders', {
        ...orderForm,
        customerId: orderForm.customerId || null,
        crmLeadId: orderForm.crmLeadId || null,
        quotationId: orderForm.quotationId || null,
        warehouseId: orderForm.warehouseId || null,
        orderDate: orderForm.orderDate || undefined,
        expectedDate: orderForm.expectedDate || null,
        discount: Number(orderForm.discount || 0),
        tax: Number(orderForm.tax || 0),
        items: orderForm.items.map((item) => ({ ...item, productId: item.productId || null, qty: Number(item.qty || 0), unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0) }))
      });
      setOrderForm({ ...emptyOrder, warehouseId: warehouses[0]?.id || '' });
      flash('Sales order created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create sales order'); }
    finally { setSaving(false); }
  }

  async function updateQuoteStatus(quote, status) {
    setError('');
    try {
      await api.patch(`/quotations/${quote.id}/status`, { status });
      flash(`${quote.quoteNo} marked ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update quotation'); }
  }

  async function updateOrderStatus(order, status) {
    setError('');
    try {
      await api.patch(`/quotations/sales-orders/${order.id}/status`, { status });
      flash(`${order.orderNo} marked ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update sales order'); }
  }

  async function convertQuote(quote) {
    setError('');
    try {
      await api.post(`/quotations/${quote.id}/sales-order`, { warehouseId: warehouses[0]?.id || null });
      flash(`${quote.quoteNo} converted to sales order`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to convert quotation'); }
  }

  async function invoiceOrder(order) {
    setError('');
    try {
      const { data } = await api.post(`/quotations/sales-orders/${order.id}/invoice`);
      flash(`${order.orderNo} invoiced as ${data.invoice.invoiceNo}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to invoice sales order'); }
  }

  async function openPrint(endpoint) {
    setError('');
    try {
      const { data } = await api.get(endpoint, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (!win) return setError('Popup blocked. Allow popups to open print preview.');
      win.document.open();
      win.document.write(data);
      win.document.close();
    } catch (e) { setError(e.response?.data?.message || 'Failed to open print preview'); }
  }

  function fillOrderFromQuote(quote) {
    setOrderForm({
      customerId: quote.customerId || '',
      crmLeadId: quote.crmLeadId || '',
      quotationId: quote.id,
      warehouseId: warehouses[0]?.id || '',
      status: 'DRAFT',
      orderDate: '',
      expectedDate: '',
      discount: Number(quote.discount || 0),
      tax: Number(quote.tax || 0),
      notes: `Created from quotation ${quote.quoteNo}`,
      terms: quote.terms || '',
      items: (quote.items || []).map((item) => ({ productId: item.productId || '', description: item.description, qty: Number(item.qty || 0), unitPrice: Number(item.unitPrice || 0), discount: Number(item.discount || 0) }))
    });
    setTab('create-order');
  }

  const quoteColumns = [
    { key: 'quoteNo', label: 'Quotation', render: (r) => <><strong>{r.quoteNo}</strong><span className="table-subtext">{r.title || r.leadTitle || '-'}</span></> },
    { key: 'customerName', label: 'Customer', render: (r) => <>{r.customerName}<span className="table-subtext">{r.customerPhone || '-'}</span></> },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.isExpired && <span className="table-subtext danger-text">Expired</span>}</> },
    { key: 'validUntil', label: 'Valid Until', render: (r) => dateOnly(r.validUntil) },
    { key: 'total', label: 'Total', render: (r) => <strong>{money(r.total)}</strong> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions">
      <button className="mini-action" onClick={() => openPrint(`/quotations/${r.id}/print`)}>Print</button>
      {r.status === 'DRAFT' && <button className="mini-action" onClick={() => updateQuoteStatus(r, 'SENT')}>Send</button>}
      {!['ACCEPTED','CONVERTED','REJECTED','CANCELLED'].includes(r.status) && <button className="mini-action" onClick={() => updateQuoteStatus(r, 'ACCEPTED')}>Accept</button>}
      {!['CONVERTED','REJECTED','CANCELLED'].includes(r.status) && <button className="mini-action" onClick={() => convertQuote(r)}>Convert</button>}
      <button className="mini-action" onClick={() => fillOrderFromQuote(r)}>Copy</button>
      {r.status !== 'REJECTED' && <button className="mini-danger" onClick={() => updateQuoteStatus(r, 'REJECTED')}>Reject</button>}
    </div> }
  ];

  const orderColumns = [
    { key: 'orderNo', label: 'Sales Order', render: (r) => <><strong>{r.orderNo}</strong><span className="table-subtext">From {r.quotation?.quoteNo || 'Manual'}</span></> },
    { key: 'customerName', label: 'Customer' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'expectedDate', label: 'Expected', render: (r) => dateOnly(r.expectedDate) },
    { key: 'total', label: 'Total', render: (r) => <strong>{money(r.total)}</strong> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions">
      <button className="mini-action" onClick={() => openPrint(`/quotations/sales-orders/${r.id}/print`)}>Print</button>
      {r.status === 'DRAFT' && <button className="mini-action" onClick={() => updateOrderStatus(r, 'CONFIRMED')}>Confirm</button>}
      {!['INVOICED','CANCELLED'].includes(r.status) && <button className="mini-action" onClick={() => invoiceOrder(r)}>Invoice</button>}
      {r.status !== 'CANCELLED' && <button className="mini-danger" onClick={() => updateOrderStatus(r, 'CANCELLED')}>Cancel</button>}
    </div> }
  ];

  function ItemLines({ formName, form }) {
    return <div className="quote-lines">
      <div className="section-title-row small"><strong>Items</strong><span>{money(formTotal(form))}</span></div>
      {form.items.map((item, index) => <div className="quote-line-row" key={index}>
        <select value={item.productId} onChange={(e) => productChanged(formName, index, e.target.value)}><option value="">No product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
        <input placeholder="Description" value={item.description} onChange={(e) => updateItem(formName, index, { description: e.target.value })} required />
        <input type="number" step="0.001" min="0.001" value={item.qty} onChange={(e) => updateItem(formName, index, { qty: e.target.value })} />
        <input type="number" step="0.01" min="0" value={item.unitPrice} onChange={(e) => updateItem(formName, index, { unitPrice: e.target.value })} />
        <input type="number" step="0.01" min="0" value={item.discount} onChange={(e) => updateItem(formName, index, { discount: e.target.value })} />
        <button type="button" className="mini-danger" onClick={() => removeItem(formName, index)}>×</button>
      </div>)}
      <button type="button" className="mini-action" onClick={() => addItem(formName)}>+ Add item</button>
    </div>;
  }

  return (
    <div className="page quotations-page">
      <div className="page-head">
        <div>
          <h1>Quotation / Estimate + Sales Order</h1>
          <p>Create estimates, print/send quotations, convert to sales orders, and invoice confirmed orders.</p>
        </div>
        <button className="secondary-btn" onClick={load}><RefreshCw size={18} /> Refresh</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid quotation-stat-grid">
        <StatCard title="Draft Quotes" value={summary?.draftQuotes || 0} subtitle={`${summary?.sentQuotes || 0} sent`} />
        <StatCard title="Accepted Quotes" value={summary?.acceptedQuotes || 0} subtitle={`${summary?.expiredQuotes || 0} expired`} tone="green" />
        <StatCard title="Open Orders" value={summary?.openOrders || 0} subtitle={`${summary?.invoicedOrders || 0} invoiced`} tone="blue" />
        <StatCard title="Pipeline Value" value={money(summary?.quoteValue)} subtitle={`Orders ${money(summary?.orderValue)}`} tone="orange" />
      </div>

      <div className="tab-actions">
        {[
          ['quotes', 'Quotations'], ['orders', 'Sales Orders'], ['create-quote', 'Create Quote'], ['create-order', 'Create Order']
        ].map(([key, label]) => <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>

      {(tab === 'quotes' || tab === 'orders') && <div className="panel quotation-filter-panel">
        <div className="filters-row quotation-filter-row">
          <input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search quotation/order/customer" />
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All statuses</option>{['DRAFT','SENT','ACCEPTED','CONVERTED','REJECTED','CONFIRMED','INVOICED','CANCELLED'].map((s) => <option key={s}>{s}</option>)}</select>
          <button className="secondary-btn" onClick={load}>Apply</button>
        </div>
      </div>}

      {tab === 'quotes' && <section className="panel"><h2><FileSignature size={20}/> Quotations</h2><DataTable columns={quoteColumns} rows={quotes} empty="No quotations found" /></section>}
      {tab === 'orders' && <section className="panel"><h2><ShoppingBag size={20}/> Sales Orders</h2><DataTable columns={orderColumns} rows={orders} empty="No sales orders found" /></section>}

      {tab === 'create-quote' && <div className="quotation-create-grid">
        <form className="panel form-grid two" onSubmit={createQuote}>
          <h2 className="span-two"><Send size={20}/> Create Quotation</h2>
          <label>Customer<select value={quoteForm.customerId} onChange={(e) => setQuoteForm({ ...quoteForm, customerId: e.target.value })}><option value="">Walk-in / not selected</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>CRM Lead<select value={quoteForm.crmLeadId} onChange={(e) => setQuoteForm({ ...quoteForm, crmLeadId: e.target.value })}><option value="">No lead</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.leadNo} - {l.title}</option>)}</select></label>
          <label className="span-two">Title<input value={quoteForm.title} onChange={(e) => setQuoteForm({ ...quoteForm, title: e.target.value })} placeholder="Website development quotation / product estimate" /></label>
          <label>Status<select value={quoteForm.status} onChange={(e) => setQuoteForm({ ...quoteForm, status: e.target.value })}>{['DRAFT','SENT'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Valid until<input type="date" value={quoteForm.validUntil} onChange={(e) => setQuoteForm({ ...quoteForm, validUntil: e.target.value })} /></label>
          <ItemLines formName="quote" form={quoteForm} />
          <label>Document discount<input type="number" min="0" step="0.01" value={quoteForm.discount} onChange={(e) => setQuoteForm({ ...quoteForm, discount: e.target.value })} /></label>
          <label>Tax<input type="number" min="0" step="0.01" value={quoteForm.tax} onChange={(e) => setQuoteForm({ ...quoteForm, tax: e.target.value })} /></label>
          <label className="span-two">Notes<textarea value={quoteForm.notes} onChange={(e) => setQuoteForm({ ...quoteForm, notes: e.target.value })} /></label>
          <label className="span-two">Terms<textarea value={quoteForm.terms} onChange={(e) => setQuoteForm({ ...quoteForm, terms: e.target.value })} /></label>
          <button className="primary-btn span-two" disabled={saving}>Save Quotation</button>
        </form>
        <div className="panel quotation-help-card"><h2><FileText size={20}/> Quotation flow</h2><p>Create estimate → send/print → customer accepts → convert to sales order → invoice when confirmed.</p><strong>Total preview: {money(formTotal(quoteForm))}</strong></div>
      </div>}

      {tab === 'create-order' && <div className="quotation-create-grid">
        <form className="panel form-grid two" onSubmit={createOrder}>
          <h2 className="span-two"><ShoppingBag size={20}/> Create Sales Order</h2>
          <label>Customer<select value={orderForm.customerId} onChange={(e) => setOrderForm({ ...orderForm, customerId: e.target.value })}><option value="">Walk-in / not selected</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>CRM Lead<select value={orderForm.crmLeadId} onChange={(e) => setOrderForm({ ...orderForm, crmLeadId: e.target.value })}><option value="">No lead</option>{leads.map((l) => <option key={l.id} value={l.id}>{l.leadNo} - {l.title}</option>)}</select></label>
          <label>Warehouse<select value={orderForm.warehouseId} onChange={(e) => setOrderForm({ ...orderForm, warehouseId: e.target.value })}><option value="">Default warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label>Expected date<input type="date" value={orderForm.expectedDate} onChange={(e) => setOrderForm({ ...orderForm, expectedDate: e.target.value })} /></label>
          <ItemLines formName="order" form={orderForm} />
          <label>Document discount<input type="number" min="0" step="0.01" value={orderForm.discount} onChange={(e) => setOrderForm({ ...orderForm, discount: e.target.value })} /></label>
          <label>Tax<input type="number" min="0" step="0.01" value={orderForm.tax} onChange={(e) => setOrderForm({ ...orderForm, tax: e.target.value })} /></label>
          <label className="span-two">Notes<textarea value={orderForm.notes} onChange={(e) => setOrderForm({ ...orderForm, notes: e.target.value })} /></label>
          <label className="span-two">Terms<textarea value={orderForm.terms} onChange={(e) => setOrderForm({ ...orderForm, terms: e.target.value })} /></label>
          <button className="primary-btn span-two" disabled={saving}>Save Sales Order</button>
        </form>
        <div className="panel quotation-help-card"><h2>Sales order flow</h2><p>Confirm order and invoice when ready. Stock is reduced only when creating the invoice.</p><strong>Total preview: {money(formTotal(orderForm))}</strong></div>
      </div>}
    </div>
  );
}
