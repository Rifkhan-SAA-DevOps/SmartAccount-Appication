import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackagePlus, RefreshCw, RotateCcw, Search, Truck, Warehouse } from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './VanStock.css';

const emptyLoad = {
  vanId: '',
  routeId: '',
  warehouseId: '',
  employeeId: '',
  status: 'DRAFT',
  notes: '',
  items: [{ productId: '', qtyLoaded: 1, unitCost: 0, notes: '' }]
};

const emptyClose = {
  loadId: '',
  cashCollected: '',
  chequeCollected: '',
  creditSales: '',
  routeExpense: '',
  soldValue: '',
  notes: '',
  items: []
};

function currency(value) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function VanStock() {
  const [summary, setSummary] = useState(null);
  const [master, setMaster] = useState({ vans: [], routes: [], warehouses: [], products: [], employees: [] });
  const [stocks, setStocks] = useState([]);
  const [loads, setLoads] = useState([]);
  const [movements, setMovements] = useState([]);
  const [loadForm, setLoadForm] = useState(emptyLoad);
  const [closeForm, setCloseForm] = useState(emptyClose);
  const [filters, setFilters] = useState({ vanId: '', status: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [summaryRes, masterRes, stocksRes, loadsRes, movementsRes] = await Promise.all([
      api.get('/van-stock/summary'),
      api.get('/van-stock/master-data'),
      api.get('/van-stock/stocks', { params: filters.vanId ? { vanId: filters.vanId } : {} }),
      api.get('/van-stock/loads', { params }),
      api.get('/van-stock/movements', { params: filters.vanId ? { vanId: filters.vanId } : {} })
    ]);
    setSummary(summaryRes.data);
    setMaster(masterRes.data || { vans: [], routes: [], warehouses: [], products: [], employees: [] });
    setStocks(stocksRes.data || []);
    setLoads(loadsRes.data || []);
    setMovements(movementsRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load van stock module')); }, []);

  const activeLoads = useMemo(() => loads.filter((load) => load.status === 'POSTED'), [loads]);
  const selectedCloseLoad = useMemo(() => loads.find((load) => load.id === closeForm.loadId), [loads, closeForm.loadId]);
  const stockPager = useClientPagination(stocks, { initialPageSize: 8, resetKey: `${filters.vanId}-${stocks.length}` });
  const movementPager = useClientPagination(movements, { initialPageSize: 10, resetKey: `${filters.vanId}-${movements.length}` });
  const loadPager = useClientPagination(loads, { initialPageSize: 8, resetKey: `${filters.vanId}-${filters.status}-${loads.length}` });

  useEffect(() => {
    if (!selectedCloseLoad) return;
    setCloseForm((old) => ({
      ...old,
      items: selectedCloseLoad.items.map((item) => ({
        productId: item.productId,
        productName: item.productName,
        qtyLoaded: item.qtyLoaded,
        qtyReturned: 0,
        qtyDamaged: 0,
        qtyMissing: 0,
        notes: ''
      }))
    }));
  }, [selectedCloseLoad?.id]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3500);
  }

  function productById(productId) {
    return master.products.find((product) => product.id === productId);
  }

  function setLoadField(field, value) {
    setLoadForm((old) => ({ ...old, [field]: value }));
  }

  function setItem(index, field, value) {
    setLoadForm((old) => ({
      ...old,
      items: old.items.map((item, i) => {
        if (i !== index) return item;
        const next = { ...item, [field]: value };
        if (field === 'productId') {
          const product = productById(value);
          next.unitCost = Number(product?.costPrice || 0);
        }
        return next;
      })
    }));
  }

  function addItem() {
    setLoadForm((old) => ({ ...old, items: [...old.items, { productId: '', qtyLoaded: 1, unitCost: 0, notes: '' }] }));
  }

  function removeItem(index) {
    setLoadForm((old) => ({ ...old, items: old.items.filter((_, i) => i !== index) }));
  }

  async function saveLoad(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/van-stock/loads', {
        ...loadForm,
        routeId: loadForm.routeId || null,
        warehouseId: loadForm.warehouseId || null,
        employeeId: loadForm.employeeId || null,
        items: loadForm.items.map((item) => ({ ...item, qtyLoaded: Number(item.qtyLoaded || 0), unitCost: Number(item.unitCost || 0) }))
      });
      setLoadForm(emptyLoad);
      flash(loadForm.status === 'POSTED' ? 'Van stock loaded and posted.' : 'Draft van load saved.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save van load');
    } finally { setSaving(false); }
  }

  async function postLoad(id) {
    setSaving(true); setError('');
    try {
      await api.post(`/van-stock/loads/${id}/post`);
      flash('Draft van load posted. Warehouse stock reduced and van stock increased.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to post load'); }
    finally { setSaving(false); }
  }

  function setCloseItem(index, field, value) {
    setCloseForm((old) => ({
      ...old,
      items: old.items.map((item, i) => (i === index ? { ...item, [field]: value } : item))
    }));
  }

  async function closeLoad(e) {
    e.preventDefault();
    if (!closeForm.loadId) return setError('Select a posted load to close.');
    setSaving(true); setError('');
    try {
      await api.post(`/van-stock/loads/${closeForm.loadId}/close`, {
        ...closeForm,
        cashCollected: Number(closeForm.cashCollected || 0),
        chequeCollected: Number(closeForm.chequeCollected || 0),
        creditSales: Number(closeForm.creditSales || 0),
        routeExpense: Number(closeForm.routeExpense || 0),
        soldValue: Number(closeForm.soldValue || 0),
        items: closeForm.items.map((item) => ({
          productId: item.productId,
          qtyReturned: Number(item.qtyReturned || 0),
          qtyDamaged: Number(item.qtyDamaged || 0),
          qtyMissing: Number(item.qtyMissing || 0),
          notes: item.notes || null
        }))
      });
      setCloseForm(emptyClose);
      flash('Van load closed. Returns, damage and missing stock recorded.');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to close van load'); }
    finally { setSaving(false); }
  }

  async function applyFilters(e) {
    e.preventDefault();
    await load().catch((e) => setError(e.response?.data?.message || 'Failed to apply filters'));
  }

  return (
    <div className="van-stock-page">
      <div className="page-hero van-stock-hero">
        <div>
          <p className="eyebrow">Distribution · Route Stock</p>
          <h1>Van Stock / Route Loading</h1>
          <p>Load products into sales vans, track vehicle stock, return unsold stock, and close the route day.</p>
        </div>
        <button className="btn ghost" onClick={() => load()}><RefreshCw size={16} /> Refresh</button>
      </div>

      {error && <div className="alert error"><AlertTriangle size={17} /> {error}</div>}
      {message && <div className="alert success"><CheckCircle2 size={17} /> {message}</div>}

      <div className="van-stat-grid">
        <div className="van-stat-card"><Truck /><span>Active vans</span><strong>{summary?.activeVans || 0}</strong></div>
        <div className="van-stat-card"><PackagePlus /><span>Van stock qty</span><strong>{qty(summary?.totalVanQty)}</strong></div>
        <div className="van-stat-card"><Warehouse /><span>Van stock value</span><strong>{currency(summary?.totalVanValue)}</strong></div>
        <div className="van-stat-card"><ClipboardCheck /><span>Posted loads</span><strong>{summary?.postedLoads || 0}</strong></div>
      </div>

      <section className="van-panel">
        <div className="panel-title-row">
          <div><h2>Create van load</h2><p>Move stock from warehouse to van. Save draft or post immediately.</p></div>
        </div>
        <form onSubmit={saveLoad} className="van-form">
          <div className="van-form-grid">
            <label>Van<select required value={loadForm.vanId} onChange={(e) => setLoadField('vanId', e.target.value)}><option value="">Select van</option>{master.vans.map((van) => <option key={van.id} value={van.id}>{van.vanNo} · {van.name}</option>)}</select></label>
            <label>Route<select value={loadForm.routeId} onChange={(e) => setLoadField('routeId', e.target.value)}><option value="">Optional route</option>{master.routes.map((route) => <option key={route.id} value={route.id}>{route.routeNo} · {route.name}</option>)}</select></label>
            <label>Warehouse<select value={loadForm.warehouseId} onChange={(e) => setLoadField('warehouseId', e.target.value)}><option value="">Main stock</option>{master.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
            <label>Sales rep / driver<select value={loadForm.employeeId} onChange={(e) => setLoadField('employeeId', e.target.value)}><option value="">Optional employee</option>{master.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo} · {employee.name}</option>)}</select></label>
            <label>Status<select value={loadForm.status} onChange={(e) => setLoadField('status', e.target.value)}><option value="DRAFT">Save as draft</option><option value="POSTED">Post immediately</option></select></label>
            <label>Notes<input value={loadForm.notes} onChange={(e) => setLoadField('notes', e.target.value)} placeholder="Route load note" /></label>
          </div>

          <div className="load-lines">
            {loadForm.items.map((item, index) => {
              const product = productById(item.productId);
              return (
                <div className="load-line" key={index}>
                  <select value={item.productId} onChange={(e) => setItem(index, 'productId', e.target.value)} required>
                    <option value="">Select product</option>
                    {master.products.map((product) => <option key={product.id} value={product.id}>{product.sku || 'SKU'} · {product.name} · Stock {qty(product.stockQty)}</option>)}
                  </select>
                  <input type="number" min="0.001" step="0.001" value={item.qtyLoaded} onChange={(e) => setItem(index, 'qtyLoaded', e.target.value)} placeholder="Qty" required />
                  <input type="number" min="0" step="0.01" value={item.unitCost} onChange={(e) => setItem(index, 'unitCost', e.target.value)} placeholder="Cost" />
                  <span className="line-value">{currency(Number(item.qtyLoaded || 0) * Number(item.unitCost || product?.costPrice || 0))}</span>
                  <button type="button" className="btn tiny danger" onClick={() => removeItem(index)} disabled={loadForm.items.length === 1}>Remove</button>
                </div>
              );
            })}
          </div>
          <div className="form-actions"><button type="button" className="btn ghost" onClick={addItem}>Add product</button><button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Save van load'}</button></div>
        </form>
      </section>

      <section className="van-panel">
        <div className="panel-title-row"><div><h2>Close posted load</h2><p>Record unsold returns, damaged stock, missing stock and daily route money.</p></div></div>
        <form onSubmit={closeLoad} className="van-form">
          <div className="van-form-grid">
            <label>Posted load<select value={closeForm.loadId} onChange={(e) => setCloseForm((old) => ({ ...old, loadId: e.target.value }))}><option value="">Select posted load</option>{activeLoads.map((load) => <option key={load.id} value={load.id}>{load.loadNo} · {load.vanNo || load.vanName} · {shortDate(load.loadDate)}</option>)}</select></label>
            <label>Cash collected<input type="number" value={closeForm.cashCollected} onChange={(e) => setCloseForm((old) => ({ ...old, cashCollected: e.target.value }))} /></label>
            <label>Cheque collected<input type="number" value={closeForm.chequeCollected} onChange={(e) => setCloseForm((old) => ({ ...old, chequeCollected: e.target.value }))} /></label>
            <label>Credit sales<input type="number" value={closeForm.creditSales} onChange={(e) => setCloseForm((old) => ({ ...old, creditSales: e.target.value }))} /></label>
            <label>Route expense<input type="number" value={closeForm.routeExpense} onChange={(e) => setCloseForm((old) => ({ ...old, routeExpense: e.target.value }))} /></label>
            <label>Sold value<input type="number" value={closeForm.soldValue} onChange={(e) => setCloseForm((old) => ({ ...old, soldValue: e.target.value }))} /></label>
          </div>
          {!!closeForm.items.length && <div className="close-lines">
            {closeForm.items.map((item, index) => (
              <div className="close-line" key={item.productId}>
                <strong>{item.productName}</strong><span>Loaded {qty(item.qtyLoaded)}</span>
                <input type="number" min="0" step="0.001" value={item.qtyReturned} onChange={(e) => setCloseItem(index, 'qtyReturned', e.target.value)} placeholder="Returned" />
                <input type="number" min="0" step="0.001" value={item.qtyDamaged} onChange={(e) => setCloseItem(index, 'qtyDamaged', e.target.value)} placeholder="Damaged" />
                <input type="number" min="0" step="0.001" value={item.qtyMissing} onChange={(e) => setCloseItem(index, 'qtyMissing', e.target.value)} placeholder="Missing" />
              </div>
            ))}
          </div>}
          <textarea value={closeForm.notes} onChange={(e) => setCloseForm((old) => ({ ...old, notes: e.target.value }))} placeholder="Closing notes" />
          <div className="form-actions"><button className="btn primary" disabled={saving || !closeForm.loadId}>{saving ? 'Closing...' : 'Close route load'}</button></div>
        </form>
      </section>

      <form className="van-filter-bar" onSubmit={applyFilters}>
        <Search size={16} />
        <select value={filters.vanId} onChange={(e) => setFilters((old) => ({ ...old, vanId: e.target.value }))}><option value="">All vans</option>{master.vans.map((van) => <option key={van.id} value={van.id}>{van.vanNo} · {van.name}</option>)}</select>
        <select value={filters.status} onChange={(e) => setFilters((old) => ({ ...old, status: e.target.value }))}><option value="">All load statuses</option><option value="DRAFT">Draft</option><option value="POSTED">Posted</option><option value="CLOSED">Closed</option></select>
        <button className="btn ghost">Apply</button>
      </form>

      <div className="van-two-col">
        <section className="van-panel">
          <h2>Current van stock</h2>
          <div className="stock-list">
            {stockPager.pageItems.map((row) => <div className="stock-row" key={row.id}><div><strong>{row.productName}</strong><span>{row.sku || '-'} · {row.vanNo} {row.vanName}</span></div><b>{qty(row.quantity)}</b><em>{currency(row.stockValue)}</em></div>)}
            {!stocks.length && <div className="empty-state">No van stock records found.</div>}
          </div>
          <PaginationBar {...stockPager} label="stock items" />
        </section>
        <section className="van-panel">
          <h2>Recent movements</h2>
          <div className="movement-list">
            {movementPager.pageItems.map((row) => <div className="movement-row" key={row.id}><span className={`movement-type ${row.type}`}>{row.type}</span><div><strong>{row.productName}</strong><small>{row.vanNo} · {shortDate(row.createdAt)}</small></div><b>{qty(row.quantity)}</b></div>)}
            {!movements.length && <div className="empty-state">No van stock movements found.</div>}
          </div>
          <PaginationBar {...movementPager} label="movements" />
        </section>
      </div>

      <section className="van-panel">
        <h2>Van loads</h2>
        <div className="load-list">
          {loadPager.pageItems.map((load) => <div className="load-card" key={load.id}><div className="load-card-head"><div><strong>{load.loadNo}</strong><span>{load.vanNo || ''} {load.vanName || ''} · {load.routeName || 'No route'} · {shortDate(load.loadDate)}</span></div><span className={`status-pill ${load.status}`}>{load.status}</span></div><div className="load-card-items">{load.items.map((item) => <span key={item.id}>{item.productName}: {qty(item.qtyLoaded)}</span>)}</div>{load.status === 'DRAFT' && <button className="btn tiny primary" onClick={() => postLoad(load.id)} disabled={saving}>Post load</button>}</div>)}
          {!loads.length && <div className="empty-state">No van loads found for the selected filters.</div>}
        </div>
        <PaginationBar {...loadPager} label="loads" />
      </section>
    </div>
  );
}
