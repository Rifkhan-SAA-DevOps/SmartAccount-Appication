import { useEffect, useMemo, useState } from 'react';
import { Banknote, CalendarClock, CircleDollarSign, ClipboardList, CreditCard, MapPinned, RefreshCw, Route, Search, Store, UserRoundCheck } from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './ShopCollections.css';

const emptyForm = {
  shopId: '',
  routeId: '',
  employeeId: '',
  amount: '',
  method: 'CASH',
  reference: '',
  notes: '',
  autoAllocate: true
};

const emptyFollowUp = {
  shopId: '',
  routeId: '',
  employeeId: '',
  plannedAt: '',
  collectionPromise: '',
  notes: ''
};

function currency(value) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function methodLabel(method) {
  return String(method || '').replaceAll('_', ' ');
}

export default function ShopCollections() {
  const [summary, setSummary] = useState(null);
  const [master, setMaster] = useState({ shops: [], routes: [], employees: [], paymentMethods: [] });
  const [collections, setCollections] = useState([]);
  const [outstanding, setOutstanding] = useState([]);
  const [closing, setClosing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [followUp, setFollowUp] = useState(emptyFollowUp);
  const [filters, setFilters] = useState({ q: '', routeId: '', employeeId: '', overdueOnly: false });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const outstandingParams = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== '' && value !== false));
    const [summaryRes, masterRes, collectionsRes, outstandingRes, closingRes] = await Promise.all([
      api.get('/shop-collections/summary'),
      api.get('/shop-collections/master-data'),
      api.get('/shop-collections/collections'),
      api.get('/shop-collections/outstanding', { params: outstandingParams }),
      api.get('/shop-collections/daily-closing')
    ]);
    setSummary(summaryRes.data);
    setMaster(masterRes.data || { shops: [], routes: [], employees: [], paymentMethods: [] });
    setCollections(collectionsRes.data || []);
    setOutstanding(outstandingRes.data || []);
    setClosing(closingRes.data);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load shop collection module')); }, []);

  const selectedShop = useMemo(() => master.shops.find((shop) => shop.id === form.shopId), [master.shops, form.shopId]);
  const selectedFollowUpShop = useMemo(() => master.shops.find((shop) => shop.id === followUp.shopId), [master.shops, followUp.shopId]);
  const outstandingPager = useClientPagination(outstanding, { initialPageSize: 8, resetKey: `${filters.q}-${filters.routeId}-${filters.employeeId}-${filters.overdueOnly}` });
  const collectionPager = useClientPagination(collections, { initialPageSize: 10, resetKey: `${collections.length}` });

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3500);
  }

  function selectShop(shopId) {
    const shop = master.shops.find((s) => s.id === shopId);
    setForm((old) => ({ ...old, shopId, routeId: shop?.routeId || '', employeeId: shop?.assignedEmployeeId || '' }));
  }

  function selectFollowUpShop(shopId) {
    const shop = master.shops.find((s) => s.id === shopId);
    setFollowUp((old) => ({ ...old, shopId, routeId: shop?.routeId || '', employeeId: shop?.assignedEmployeeId || '' }));
  }

  async function saveCollection(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/shop-collections/collections', {
        ...form,
        routeId: form.routeId || null,
        employeeId: form.employeeId || null,
        amount: Number(form.amount || 0)
      });
      setForm(emptyForm);
      flash('Collection recorded and outstanding updated.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to record collection');
    } finally {
      setSaving(false);
    }
  }

  async function saveFollowUp(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/shop-collections/follow-ups', {
        ...followUp,
        routeId: followUp.routeId || null,
        employeeId: followUp.employeeId || null,
        collectionPromise: Number(followUp.collectionPromise || 0)
      });
      setFollowUp(emptyFollowUp);
      flash('Collection follow-up planned.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to plan follow-up');
    } finally {
      setSaving(false);
    }
  }

  async function applyFilters(e) {
    e?.preventDefault?.();
    await load().catch((err) => setError(err.response?.data?.message || 'Failed to apply filters'));
  }

  return (
    <div className="shop-collections-page page-shell">
      <div className="split-header">
        <div>
          <span className="eyebrow">Version 6.1</span>
          <h1>Shop Collections & Outstanding Recovery</h1>
          <p>Collect money from shops, reduce outstanding balances, plan payment follow-ups, and close daily route collections.</p>
        </div>
        <button className="btn ghost" type="button" onClick={() => load()}><RefreshCw size={16} /> Refresh</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert success">{message}</div>}

      <div className="collection-stat-grid">
        <div className="collection-stat-card purple"><Banknote /><span>Today Collected</span><strong>{currency(summary?.todayCollectionTotal)}</strong></div>
        <div className="collection-stat-card blue"><CircleDollarSign /><span>This Month</span><strong>{currency(summary?.monthCollectionTotal)}</strong></div>
        <div className="collection-stat-card amber"><Store /><span>Outstanding Watch</span><strong>{currency(summary?.outstandingWatchTotal)}</strong></div>
        <div className="collection-stat-card red"><CalendarClock /><span>Overdue</span><strong>{currency(summary?.overdueTotal)}</strong></div>
      </div>

      <div className="collection-grid">
        <form className="card collection-form" onSubmit={saveCollection}>
          <div className="card-title-row"><h2><CreditCard size={20} /> Record Shop Collection</h2></div>
          <div className="form-grid two">
            <label>Shop / Outlet
              <select value={form.shopId} onChange={(e) => selectShop(e.target.value)} required>
                <option value="">Select shop</option>
                {master.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} — {shop.shopName}</option>)}
              </select>
            </label>
            <label>Amount
              <input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
            </label>
            <label>Route
              <select value={form.routeId} onChange={(e) => setForm({ ...form, routeId: e.target.value })}>
                <option value="">Auto / none</option>
                {master.routes.map((route) => <option key={route.id} value={route.id}>{route.routeNo} — {route.name}</option>)}
              </select>
            </label>
            <label>Sales rep / collector
              <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
                <option value="">Auto / none</option>
                {master.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employeeNo || 'EMP'} — {employee.name}</option>)}
              </select>
            </label>
            <label>Payment method
              <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                {(master.paymentMethods?.length ? master.paymentMethods : ['CASH', 'CHEQUE', 'BANK_TRANSFER']).map((method) => <option key={method} value={method}>{methodLabel(method)}</option>)}
              </select>
            </label>
            <label>Reference
              <input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} placeholder="Receipt / cheque / bank ref" />
            </label>
          </div>

          {selectedShop && (
            <div className="shop-balance-strip">
              <Store size={20} />
              <div><b>{selectedShop.shopName}</b><span>Outstanding {currency(selectedShop.currentOutstanding)} / Limit {currency(selectedShop.creditLimit)}</span></div>
            </div>
          )}

          <label>Notes
            <textarea rows="3" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Optional collection notes" />
          </label>
          <label className="inline-check"><input type="checkbox" checked={form.autoAllocate} onChange={(e) => setForm({ ...form, autoAllocate: e.target.checked })} /> Auto-allocate collection to oldest shop supply invoices</label>
          <button className="btn primary" disabled={saving}>{saving ? 'Saving...' : 'Record Collection'}</button>
        </form>

        <form className="card followup-card" onSubmit={saveFollowUp}>
          <div className="card-title-row"><h2><UserRoundCheck size={20} /> Plan Collection Follow-up</h2></div>
          <label>Shop
            <select value={followUp.shopId} onChange={(e) => selectFollowUpShop(e.target.value)} required>
              <option value="">Select shop</option>
              {master.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} — {shop.shopName}</option>)}
            </select>
          </label>
          <label>Follow-up date
            <input type="datetime-local" value={followUp.plannedAt} onChange={(e) => setFollowUp({ ...followUp, plannedAt: e.target.value })} required />
          </label>
          <label>Promised amount
            <input type="number" min="0" step="0.01" value={followUp.collectionPromise} onChange={(e) => setFollowUp({ ...followUp, collectionPromise: e.target.value })} />
          </label>
          {selectedFollowUpShop && <div className="mini-note">Current outstanding: <b>{currency(selectedFollowUpShop.currentOutstanding)}</b></div>}
          <label>Notes
            <textarea rows="3" value={followUp.notes} onChange={(e) => setFollowUp({ ...followUp, notes: e.target.value })} placeholder="Payment promised, owner unavailable, shop closed, etc." />
          </label>
          <button className="btn secondary" disabled={saving}>Plan Follow-up</button>
        </form>
      </div>

      <div className="collection-panel-grid">
        <section className="card outstanding-panel">
          <div className="card-title-row">
            <h2><MapPinned size={20} /> Outstanding Recovery List</h2>
            <form className="filter-row" onSubmit={applyFilters}>
              <div className="filter-input"><Search size={15} /><input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search shop" /></div>
              <select value={filters.routeId} onChange={(e) => setFilters({ ...filters, routeId: e.target.value })}><option value="">All routes</option>{master.routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <label className="inline-check small"><input type="checkbox" checked={filters.overdueOnly} onChange={(e) => setFilters({ ...filters, overdueOnly: e.target.checked })} /> Overdue only</label>
              <button className="btn ghost" type="submit">Filter</button>
            </form>
          </div>

          <div className="recovery-list">
            {outstandingPager.pageItems.map((shop) => (
              <div className={`recovery-row ${shop.overCreditLimit ? 'danger' : shop.overdueBalance > 0 ? 'warning' : ''}`} key={shop.id}>
                <div><b>{shop.shopName}</b><span>{shop.shopCode} • {shop.area || 'No area'} • {shop.routeName || 'No route'}</span></div>
                <div><span>Outstanding</span><strong>{currency(shop.currentOutstanding)}</strong></div>
                <div><span>Overdue</span><strong>{currency(shop.overdueBalance)}</strong></div>
                <div><span>Credit Used</span><strong>{shop.creditUsedPercent}%</strong></div>
                <button className="btn tiny" type="button" onClick={() => selectShop(shop.id)}>Collect</button>
              </div>
            ))}
            {!outstanding.length && <div className="empty-state">No outstanding shops found for current filters.</div>}
          </div>
          <PaginationBar {...outstandingPager} label="shops" />
        </section>

        <section className="card closing-panel">
          <div className="card-title-row"><h2><ClipboardList size={20} /> Daily Route Closing</h2></div>
          <div className="closing-summary">
            <div><span>Collected</span><strong>{currency(closing?.collectionTotal)}</strong></div>
            <div><span>Supply Sales</span><strong>{currency(closing?.supplySalesTotal)}</strong></div>
            <div><span>Credit Added</span><strong>{currency(closing?.creditAdded)}</strong></div>
            <div><span>Visits</span><strong>{closing?.visitCount || 0}</strong></div>
          </div>
          <div className="method-list">
            {(closing?.methodBreakdown || []).filter((m) => m.total > 0 || m.count > 0).map((method) => (
              <div key={method.method}><span>{methodLabel(method.method)}</span><b>{currency(method.total)}</b></div>
            ))}
            {!(closing?.methodBreakdown || []).some((m) => m.total > 0) && <div className="empty-state compact">No collections today yet.</div>}
          </div>
        </section>
      </div>

      <section className="card collection-history">
        <div className="card-title-row"><h2><Route size={20} /> Recent Collections</h2></div>
        <div className="history-table">
          <div className="history-head"><span>No</span><span>Shop</span><span>Method</span><span>Collector</span><span>Date</span><span>Amount</span></div>
          {collectionPager.pageItems.map((row) => (
            <div className="history-row" key={row.id}>
              <span>{row.collectionNo}</span>
              <span><b>{row.shopName || 'Shop'}</b><small>{row.routeName || ''}</small></span>
              <span>{methodLabel(row.method)}</span>
              <span>{row.employeeName || '-'}</span>
              <span>{shortDate(row.collectedAt)}</span>
              <strong>{currency(row.amount)}</strong>
            </div>
          ))}
          {!collections.length && <div className="empty-state">No collection records found.</div>}
        </div>
        <PaginationBar {...collectionPager} label="collections" />
      </section>
    </div>
  );
}
