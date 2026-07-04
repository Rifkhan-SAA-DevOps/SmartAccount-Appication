import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarClock, PackageCheck, RefreshCw, ScanLine } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const initialForm = {
  productId: '', warehouseId: '', supplierId: '', grnId: '', batchNo: '', manufactureDate: '', receivedDate: '', expiryDate: '', qtyIn: 1, quantity: '', unitCost: 0, notes: '', adjustStock: true
};

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function isoDate(value) { return value ? new Date(value).toISOString().slice(0, 10) : ''; }

function statusClass(status, state) {
  const s = String(status || '').toLowerCase();
  if (state === 'EXPIRED' || s === 'expired' || s === 'blocked' || s === 'recalled') return 'cancelled';
  if (state === 'NEAR_EXPIRY') return 'unpaid';
  if (s === 'active') return 'paid';
  if (s === 'depleted') return 'partial';
  return '';
}

function expiryBadge(row) {
  if (!row.expiryDate) return <span className="badge">No expiry</span>;
  if (row.expiryState === 'EXPIRED') return <span className="badge cancelled">Expired</span>;
  if (row.expiryState === 'NEAR_EXPIRY') return <span className="badge unpaid">{row.daysToExpire} day(s)</span>;
  return <span className="badge paid">OK</span>;
}

export default function Batches() {
  const [summary, setSummary] = useState(null);
  const [batches, setBatches] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [filters, setFilters] = useState({ q: '', status: '', expiring: '', productId: '', warehouseId: '' });
  const [fifo, setFifo] = useState({ productId: '', warehouseId: '', quantity: 1, reason: 'FIFO sale/usage' });
  const [fifoPlan, setFifoPlan] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const trackedProducts = useMemo(() => products.filter((p) => p.trackExpiry || true), [products]);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, batchRes, productRes, warehouseRes, supplierRes] = await Promise.all([
      api.get('/batches/summary'),
      api.get('/batches', { params }),
      api.get('/products'),
      api.get('/branches/warehouses'),
      api.get('/suppliers')
    ]);
    setSummary(summaryRes.data);
    setBatches(batchRes.data || []);
    setProducts(productRes.data || []);
    setWarehouses(warehouseRes.data || []);
    setSuppliers(supplierRes.data || []);
    const firstProduct = productRes.data?.[0]?.id || '';
    const firstWarehouse = warehouseRes.data?.[0]?.id || '';
    setForm((old) => ({ ...old, productId: old.productId || firstProduct, warehouseId: old.warehouseId || firstWarehouse }));
    setFifo((old) => ({ ...old, productId: old.productId || firstProduct, warehouseId: old.warehouseId || firstWarehouse }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load batch data')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  async function createBatch(e) {
    e.preventDefault();
    setLoading(true); setError(''); setSuccess('');
    try {
      await api.post('/batches', {
        ...form,
        supplierId: form.supplierId || null,
        grnId: form.grnId || null,
        manufactureDate: form.manufactureDate || null,
        receivedDate: form.receivedDate || undefined,
        expiryDate: form.expiryDate || null,
        qtyIn: Number(form.qtyIn || 0),
        quantity: form.quantity === '' ? null : Number(form.quantity),
        unitCost: Number(form.unitCost || 0),
        adjustStock: Boolean(form.adjustStock)
      });
      setForm((old) => ({ ...initialForm, productId: old.productId, warehouseId: old.warehouseId, supplierId: old.supplierId, adjustStock: true }));
      flash('Batch saved. Product expiry tracking is enabled for this item.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create batch'); }
    finally { setLoading(false); }
  }

  async function adjustBatch(row) {
    const value = window.prompt('Quantity change? Use minus for reduce, example -2', '1');
    if (value === null) return;
    const reason = window.prompt('Reason?', 'Manual batch adjustment') || 'Manual batch adjustment';
    setError('');
    try {
      await api.post(`/batches/${row.id}/adjust`, { quantityChange: Number(value), reason });
      flash(`Batch ${row.batchNo} adjusted`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to adjust batch'); }
  }

  async function consumeBatch(row) {
    const value = window.prompt('Quantity to consume/remove?', '1');
    if (value === null) return;
    const reason = window.prompt('Reason?', 'Sale / damage / wastage') || 'Batch consumption';
    setError('');
    try {
      await api.post(`/batches/${row.id}/consume`, { quantity: Number(value), reason, movementType: 'ADJUSTMENT' });
      flash(`Batch ${row.batchNo} consumed`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to consume batch'); }
  }

  async function markExpired(row) {
    const remove = window.confirm('Remove remaining quantity from stock also? Press OK to remove, Cancel to only mark expired.');
    setError('');
    try {
      await api.post(`/batches/${row.id}/mark-expired`, { consumeRemaining: remove });
      flash(`Batch ${row.batchNo} marked expired`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to mark expired'); }
  }

  async function previewFifo(e) {
    e.preventDefault();
    setError(''); setFifoPlan(null);
    try {
      const { data } = await api.post('/batches/fifo/preview', { ...fifo, quantity: Number(fifo.quantity || 0) });
      setFifoPlan(data);
    } catch (e) { setError(e.response?.data?.message || 'Failed to preview FIFO'); }
  }

  async function consumeFifo() {
    setError('');
    try {
      await api.post('/batches/fifo/consume', { ...fifo, quantity: Number(fifo.quantity || 0), movementType: 'ADJUSTMENT' });
      setFifoPlan(null);
      flash('FIFO batch stock consumed successfully.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to consume FIFO stock'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/batches/alerts/expiry', { days: 30 });
      flash(`${data.created} expiry alert(s) created`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate expiry alerts'); }
  }

  const columns = [
    { key: 'batchNo', label: 'Batch', render: (r) => <><strong>{r.batchNo}</strong><span className="table-subtext">{r.productName}</span></> },
    { key: 'warehouseName', label: 'Location', render: (r) => <>{r.warehouseName}<span className="table-subtext">Supplier: {r.supplierName}</span></> },
    { key: 'quantity', label: 'Qty', render: (r) => <><strong>{Number(r.quantity || 0).toFixed(3)}</strong><span className="table-subtext">In: {Number(r.qtyIn || 0).toFixed(3)}</span></> },
    { key: 'expiryDate', label: 'Expiry', render: (r) => <>{expiryBadge(r)}<span className="table-subtext">{dateOnly(r.expiryDate)}</span></> },
    { key: 'value', label: 'Value', render: (r) => <>{money(r.stockValue)}<span className="table-subtext">Cost {money(r.unitCost)}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status, r.expiryState)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row">
      <button className="mini-action" onClick={() => adjustBatch(r)}>Adjust</button>
      <button className="mini-action" onClick={() => consumeBatch(r)}>Consume</button>
      <button className="mini-danger" onClick={() => markExpired(r)}>Expire</button>
    </div> }
  ];

  return (
    <div className="page batches-page">
      <div className="page-head">
        <div>
          <h1>Expiry / Batch Tracking</h1>
          <p>Track batch numbers, expiry dates, warehouse-wise quantities, FIFO allocation, expired stock and near-expiry alerts.</p>
        </div>
        <div className="actions-row"><button className="secondary-btn" onClick={generateAlerts}><AlertTriangle size={18} /> Generate Alerts</button><button className="secondary-btn" onClick={load}><RefreshCw size={18} /> Refresh</button></div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid batch-stat-grid">
        <StatCard title="Total Batches" value={summary?.total || 0} subtitle={`${summary?.active || 0} active`} icon={ScanLine} />
        <StatCard title="Near Expiry" value={summary?.nearExpiry || 0} subtitle="Within 30 days" tone="orange" icon={CalendarClock} />
        <StatCard title="Expired" value={summary?.expired || 0} subtitle={`${summary?.depleted || 0} depleted`} tone="red" icon={AlertTriangle} />
        <StatCard title="Batch Stock Value" value={money(summary?.stockValue)} subtitle="Qty × unit cost" tone="green" icon={PackageCheck} />
      </div>

      <div className="batch-grid">
        <section className="panel">
          <div className="section-title-row"><div><h2>Create Batch / Expiry Stock</h2><p>Use this when goods are received with a batch number or expiry date.</p></div></div>
          <form onSubmit={createBatch} className="form-grid two compact">
            <label>Product<select value={form.productId} onChange={(e)=>setForm({...form,productId:e.target.value})} required><option value="">Select product</option>{trackedProducts.map((p)=><option key={p.id} value={p.id}>{p.name} · stock {Number(p.stockQty || 0)}</option>)}</select></label>
            <label>Warehouse<select value={form.warehouseId} onChange={(e)=>setForm({...form,warehouseId:e.target.value})} required><option value="">Select warehouse</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label>Supplier<select value={form.supplierId} onChange={(e)=>setForm({...form,supplierId:e.target.value})}><option value="">Optional supplier</option>{suppliers.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
            <label>Batch number<input value={form.batchNo} onChange={(e)=>setForm({...form,batchNo:e.target.value})} placeholder="BATCH-2026-001" required /></label>
            <label>Manufacture date<input type="date" value={form.manufactureDate} onChange={(e)=>setForm({...form,manufactureDate:e.target.value})} /></label>
            <label>Expiry date<input type="date" value={form.expiryDate} onChange={(e)=>setForm({...form,expiryDate:e.target.value})} /></label>
            <label>Received date<input type="date" value={form.receivedDate} onChange={(e)=>setForm({...form,receivedDate:e.target.value})} /></label>
            <label>Unit cost<input type="number" step="0.01" value={form.unitCost} onChange={(e)=>setForm({...form,unitCost:e.target.value})} /></label>
            <label>Quantity in<input type="number" step="0.001" value={form.qtyIn} onChange={(e)=>setForm({...form,qtyIn:e.target.value})} required /></label>
            <label>Current quantity<input type="number" step="0.001" value={form.quantity} onChange={(e)=>setForm({...form,quantity:e.target.value})} placeholder="leave blank = same as qty in" /></label>
            <label className="span-two">Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></label>
            <label className="check-label span-two"><input type="checkbox" checked={form.adjustStock} onChange={(e)=>setForm({...form,adjustStock:e.target.checked})} /> Increase product and warehouse stock when creating this batch</label>
            <button className="primary-btn span-two" disabled={loading}>Save Batch</button>
          </form>
        </section>

        <section className="panel">
          <div className="section-title-row"><div><h2>FIFO Allocation</h2><p>Preview or consume oldest/nearest-expiry batches first.</p></div></div>
          <form onSubmit={previewFifo} className="form-grid two compact">
            <label>Product<select value={fifo.productId} onChange={(e)=>setFifo({...fifo,productId:e.target.value})} required><option value="">Product</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Warehouse<select value={fifo.warehouseId} onChange={(e)=>setFifo({...fifo,warehouseId:e.target.value})} required><option value="">Warehouse</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
            <label>Required qty<input type="number" step="0.001" value={fifo.quantity} onChange={(e)=>setFifo({...fifo,quantity:e.target.value})} /></label>
            <label>Reason<input value={fifo.reason} onChange={(e)=>setFifo({...fifo,reason:e.target.value})} /></label>
            <button className="secondary-btn span-two">Preview FIFO</button>
          </form>
          {fifoPlan && <div className="fifo-preview">
            <div className={`warning-box ${fifoPlan.enough ? 'success-box' : ''}`}><strong>{fifoPlan.enough ? 'Enough stock' : 'Not enough stock'}</strong> · Remaining shortage: {Number(fifoPlan.remaining || 0).toFixed(3)}</div>
            <div className="mini-list">
              {fifoPlan.allocations?.map((a)=><div key={a.id}><strong>{a.batchNo}</strong><span>{a.productName} · allocate {Number(a.allocateQty).toFixed(3)} · expires {dateOnly(a.expiryDate)}</span></div>)}
            </div>
            {fifoPlan.enough && <button className="primary-btn" onClick={consumeFifo}>Consume FIFO Stock</button>}
          </div>}
        </section>
      </div>

      <section className="panel">
        <div className="section-title-row"><div><h2>Batch Register</h2><p>Search and control all batch/expiry stock records.</p></div></div>
        <div className="filters-row">
          <input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Search batch/product/SKU" />
          <select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option><option>ACTIVE</option><option>DEPLETED</option><option>EXPIRED</option><option>RECALLED</option><option>BLOCKED</option></select>
          <select value={filters.expiring} onChange={(e)=>setFilters({...filters,expiring:e.target.value})}><option value="">All expiry</option><option value="30">Expiring 30 days</option><option value="60">Expiring 60 days</option><option value="expired">Expired</option></select>
          <select value={filters.productId} onChange={(e)=>setFilters({...filters,productId:e.target.value})}><option value="">All products</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <select value={filters.warehouseId} onChange={(e)=>setFilters({...filters,warehouseId:e.target.value})}><option value="">All warehouses</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select>
          <button className="secondary-btn" onClick={load}>Apply</button>
        </div>
        <DataTable columns={columns} data={batches} empty="No batches found" />
      </section>

      {summary?.nearExpiryRows?.length > 0 && <section className="panel">
        <div className="section-title-row"><div><h2>Near Expiry Watch List</h2><p>Move these products faster, discount them, or stop selling if expired.</p></div></div>
        <div className="mini-list">
          {summary.nearExpiryRows.map((row)=><div key={row.id}><strong>{row.productName} · {row.batchNo}</strong><span>Qty {Number(row.quantity || 0).toFixed(3)} · expires {dateOnly(row.expiryDate)} · {row.warehouseName}</span></div>)}
        </div>
      </section>}
    </div>
  );
}
