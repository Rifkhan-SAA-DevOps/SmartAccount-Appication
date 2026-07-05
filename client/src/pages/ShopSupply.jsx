import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, PackagePlus, RefreshCw, Send, Store, Truck } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import './ShopSupply.css';

const emptyLine = { productId: '', description: '', qty: 1, freeQty: 0, unitPrice: 0, discount: 0 };
const emptyForm = {
  shopId: '', routeId: '', employeeId: '', vanId: '', warehouseId: '', supplyDate: '', dueDate: '',
  discount: 0, tax: 0, paid: 0, paymentMethod: 'CREDIT', createDelivery: true, notes: '', items: [{ ...emptyLine }]
};

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function date(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'posted') return 'paid';
  if (s === 'draft') return 'partial';
  if (s === 'cancelled') return 'cancelled';
  return 'unpaid';
}

export default function ShopSupply() {
  const [summary, setSummary] = useState(null);
  const [master, setMaster] = useState({ shops: [], routes: [], vans: [], warehouses: [], products: [], employees: [] });
  const [invoices, setInvoices] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ status: '', shopId: '', routeId: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [summaryRes, masterRes, invoiceRes] = await Promise.all([
      api.get('/shop-supply/summary'),
      api.get('/shop-supply/master-data'),
      api.get('/shop-supply/invoices', { params })
    ]);
    setSummary(summaryRes.data);
    setMaster(masterRes.data || { shops: [], routes: [], vans: [], warehouses: [], products: [], employees: [] });
    setInvoices(invoiceRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load shop supply module')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function updateLine(index, patch) {
    setForm((old) => ({ ...old, items: old.items.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  }

  function selectProduct(index, productId) {
    const product = master.products.find((p) => p.id === productId);
    updateLine(index, { productId, description: product?.name || '', unitPrice: Number(product?.salePrice || 0) });
  }

  function addLine() { setForm((old) => ({ ...old, items: [...old.items, { ...emptyLine }] })); }
  function removeLine(index) { setForm((old) => ({ ...old, items: old.items.filter((_, i) => i !== index) })); }

  const selectedShop = useMemo(() => master.shops.find((shop) => shop.id === form.shopId), [master.shops, form.shopId]);
  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.unitPrice || 0) - Number(item.discount || 0), 0);
    const total = Math.max(subtotal - Number(form.discount || 0), 0) + Number(form.tax || 0);
    const balance = Math.max(total - Number(form.paid || 0), 0);
    return { subtotal, total, balance };
  }, [form]);

  async function saveInvoice(e, status = 'DRAFT') {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/shop-supply/invoices', {
        ...form,
        shopId: form.shopId,
        routeId: form.routeId || selectedShop?.routeId || null,
        employeeId: form.employeeId || selectedShop?.assignedEmployeeId || null,
        vanId: form.vanId || null,
        warehouseId: form.warehouseId || null,
        supplyDate: form.supplyDate || null,
        dueDate: form.dueDate || null,
        discount: Number(form.discount || 0),
        tax: Number(form.tax || 0),
        paid: Number(form.paid || 0),
        createDelivery: Boolean(form.createDelivery),
        status,
        items: form.items.map((line) => ({
          productId: line.productId || null,
          description: line.description,
          qty: Number(line.qty || 0),
          freeQty: Number(line.freeQty || 0),
          unitPrice: Number(line.unitPrice || 0),
          discount: Number(line.discount || 0)
        }))
      });
      setForm(emptyForm);
      flash(status === 'POSTED' ? 'Shop supply invoice posted and stock updated' : 'Draft shop supply invoice saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save shop supply invoice'); }
    finally { setSaving(false); }
  }

  async function postInvoice(row) {
    setSaving(true); setError('');
    try {
      await api.post(`/shop-supply/invoices/${row.id}/post`);
      flash(`${row.supplyNo} posted`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to post invoice'); }
    finally { setSaving(false); }
  }

  async function cancelInvoice(row) {
    if (!window.confirm(`Cancel draft ${row.supplyNo}?`)) return;
    setSaving(true); setError('');
    try {
      await api.post(`/shop-supply/invoices/${row.id}/cancel`);
      flash(`${row.supplyNo} cancelled`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to cancel invoice'); }
    finally { setSaving(false); }
  }

  const columns = [
    { key: 'supplyNo', label: 'Supply No', render: (row) => <><strong>{row.supplyNo}</strong><span className="table-subtext">{date(row.supplyDate)}</span></> },
    { key: 'shop', label: 'Shop / Route', render: (row) => <><strong>{row.shopName || '-'}</strong><span className="table-subtext">{row.shopCode || '-'} · {row.routeName || 'No route'}</span></> },
    { key: 'logistics', label: 'Rep / Van', render: (row) => <>{row.employeeName || '-'}<span className="table-subtext">{row.vanName || row.warehouseName || '-'}</span></> },
    { key: 'total', label: 'Total', render: (row) => <><strong>{money(row.total)}</strong><span className="table-subtext">Paid {money(row.paid)} · Bal {money(row.balance)}</span></> },
    { key: 'status', label: 'Status', render: (row) => <span className={`badge ${statusClass(row.status)}`}>{row.status}</span> },
    { key: 'actions', label: 'Actions', render: (row) => row.status === 'DRAFT' ? <div className="row-actions"><button onClick={() => postInvoice(row)} disabled={saving}>Post</button><button className="ghost" onClick={() => cancelInvoice(row)} disabled={saving}>Cancel</button></div> : <span className="table-subtext">{row.deliveryOrderId ? 'Delivery linked' : '-'}</span> }
  ];

  return (
    <div className="page shop-supply-page">
      <div className="page-header split-header">
        <div>
          <span className="eyebrow">Version 6.0</span>
          <h1>Shop Supply Invoice</h1>
          <p>Create wholesale supply invoices for shops, reduce stock, update shop outstanding, and optionally create delivery orders.</p>
        </div>
        <button className="secondary" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {success && <div className="alert success">{success}</div>}

      <div className="stats-grid">
        <StatCard title="Today supply sales" value={money(summary?.todaySales)} subtitle={`Collected ${money(summary?.todayCollected)}`} tone="purple" />
        <StatCard title="Today credit" value={money(summary?.todayCredit)} subtitle="New shop outstanding today" tone="amber" />
        <StatCard title="Total outstanding" value={money(summary?.totalOutstanding)} subtitle="Posted unpaid supply invoices" tone="pink" />
        <StatCard title="Draft / Posted" value={`${summary?.draftCount || 0} / ${summary?.postedCount || 0}`} subtitle="Supply invoice status" tone="blue" />
      </div>

      <div className="supply-grid">
        <form className="card supply-form" onSubmit={(e) => saveInvoice(e, 'DRAFT')}>
          <div className="card-title-row">
            <h2><PackagePlus size={20} /> Create shop supply</h2>
            <span className="badge partial">Draft or post</span>
          </div>

          <div className="form-grid three">
            <label>Shop<select value={form.shopId} onChange={(e) => setForm({ ...form, shopId: e.target.value })} required><option value="">Select shop</option>{master.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopName} · {shop.shopCode}</option>)}</select></label>
            <label>Route<select value={form.routeId || selectedShop?.routeId || ''} onChange={(e) => setForm({ ...form, routeId: e.target.value })}><option value="">Auto / no route</option>{master.routes.map((route) => <option key={route.id} value={route.id}>{route.routeNo} · {route.name}</option>)}</select></label>
            <label>Sales rep<select value={form.employeeId || selectedShop?.assignedEmployeeId || ''} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}><option value="">Auto / no rep</option>{master.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
            <label>Van<select value={form.vanId} onChange={(e) => setForm({ ...form, vanId: e.target.value })}><option value="">No van</option>{master.vans.map((van) => <option key={van.id} value={van.id}>{van.vanNo} · {van.name}</option>)}</select></label>
            <label>Warehouse<select value={form.warehouseId} onChange={(e) => setForm({ ...form, warehouseId: e.target.value })}><option value="">Default warehouse</option>{master.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.code} · {warehouse.name}</option>)}</select></label>
            <label>Payment<select value={form.paymentMethod} onChange={(e) => setForm({ ...form, paymentMethod: e.target.value })}><option>CREDIT</option><option>CASH</option><option>CARD</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>ONLINE</option></select></label>
            <label>Supply date<input type="date" value={form.supplyDate} onChange={(e) => setForm({ ...form, supplyDate: e.target.value })} /></label>
            <label>Due date<input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></label>
            <label>Paid amount<input type="number" min="0" value={form.paid} onChange={(e) => setForm({ ...form, paid: e.target.value })} /></label>
          </div>

          {selectedShop && <div className="shop-credit-card"><Store size={18} /><div><b>{selectedShop.shopName}</b><span>Outstanding {money(selectedShop.currentOutstanding)} · Limit {money(selectedShop.creditLimit)} · {selectedShop.creditDays} days</span></div></div>}

          <div className="supply-lines">
            <div className="line-head"><span>Product</span><span>Qty</span><span>Free</span><span>Price</span><span>Disc.</span><span></span></div>
            {form.items.map((line, index) => (
              <div className="supply-line" key={index}>
                <select value={line.productId} onChange={(e) => selectProduct(index, e.target.value)}><option value="">Manual item</option>{master.products.map((product) => <option key={product.id} value={product.id}>{product.name} · Stock {product.stockQty}</option>)}</select>
                <input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e) => updateLine(index, { qty: e.target.value })} />
                <input type="number" min="0" step="0.001" value={line.freeQty} onChange={(e) => updateLine(index, { freeQty: e.target.value })} />
                <input type="number" min="0" value={line.unitPrice} onChange={(e) => updateLine(index, { unitPrice: e.target.value })} />
                <input type="number" min="0" value={line.discount} onChange={(e) => updateLine(index, { discount: e.target.value })} />
                <button type="button" className="ghost danger" onClick={() => removeLine(index)} disabled={form.items.length === 1}>×</button>
                <input className="description-input" placeholder="Description" value={line.description} onChange={(e) => updateLine(index, { description: e.target.value })} required />
              </div>
            ))}
          </div>
          <button type="button" className="secondary" onClick={addLine}><PackagePlus size={16} /> Add product line</button>

          <div className="form-grid three totals-grid">
            <label>Invoice discount<input type="number" min="0" value={form.discount} onChange={(e) => setForm({ ...form, discount: e.target.value })} /></label>
            <label>Tax<input type="number" min="0" value={form.tax} onChange={(e) => setForm({ ...form, tax: e.target.value })} /></label>
            <label className="checkbox-row"><input type="checkbox" checked={form.createDelivery} onChange={(e) => setForm({ ...form, createDelivery: e.target.checked })} /> Create delivery order</label>
          </div>
          <textarea placeholder="Notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />

          <div className="supply-total-card">
            <span>Subtotal <b>{money(totals.subtotal)}</b></span>
            <span>Total <b>{money(totals.total)}</b></span>
            <span>Balance <b>{money(totals.balance)}</b></span>
          </div>

          <div className="form-actions">
            <button type="submit" disabled={saving}><FileText size={16} /> Save Draft</button>
            <button type="button" className="primary" disabled={saving} onClick={(e) => saveInvoice(e, 'POSTED')}><Send size={16} /> Save & Post</button>
          </div>
        </form>

        <div className="card supply-side-panel">
          <h2><Truck size={20} /> Why this module?</h2>
          <p>This is for distributors who supply products to many shops by route or van. Posting a supply invoice reduces stock and increases shop outstanding for credit balance.</p>
          <div className="mini-timeline">
            <span><CheckCircle2 size={16} /> Select shop and route</span>
            <span><CheckCircle2 size={16} /> Add supplied products and free items</span>
            <span><CheckCircle2 size={16} /> Save draft or post immediately</span>
            <span><CheckCircle2 size={16} /> Create delivery order if needed</span>
          </div>
          <h3>Top outstanding shops</h3>
          <div className="watch-list">
            {(summary?.topOutstanding || []).map((row) => <div key={row.id}><b>{row.shopName}</b><span>{money(row.balance)}</span></div>)}
            {!(summary?.topOutstanding || []).length && <small>No outstanding shops yet.</small>}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title-row">
          <h2>Shop supply invoices</h2>
          <div className="filter-row">
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All status</option><option>DRAFT</option><option>POSTED</option><option>CANCELLED</option></select>
            <select value={filters.shopId} onChange={(e) => setFilters({ ...filters, shopId: e.target.value })}><option value="">All shops</option>{master.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopName}</option>)}</select>
            <button className="secondary" onClick={load}>Apply</button>
          </div>
        </div>
        <DataTable columns={columns} rows={invoices} empty="No shop supply invoices yet" />
      </div>
    </div>
  );
}
