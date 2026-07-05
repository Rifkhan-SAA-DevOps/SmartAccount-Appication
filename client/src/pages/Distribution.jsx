import { useEffect, useMemo, useState } from 'react';
import { MapPinned, PackageCheck, Plus, RefreshCw, Route, Store, Truck, UserCheck, WalletCards } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import './Distribution.css';

const emptyRoute = { name: '', area: '', assignedEmployeeId: '', targetDailySales: 0, notes: '' };
const emptyShop = { shopName: '', ownerName: '', phone: '', address: '', area: '', category: 'Retail Shop', routeId: '', assignedEmployeeId: '', creditLimit: 0, currentOutstanding: 0, creditDays: 7, visitFrequency: 'Weekly', paymentTerms: 'Credit', mapUrl: '' };
const emptyVisit = { shopId: '', routeId: '', employeeId: '', plannedAt: '', status: 'PLANNED', orderTaken: false, collectionPromise: 0, nextFollowUpAt: '', noOrderReason: '', notes: '' };
const emptyVan = { name: '', vehicleNo: '', driverEmployeeId: '', routeId: '', capacityNotes: '' };
const emptyCollection = { shopId: '', routeId: '', employeeId: '', amount: 0, method: 'CASH', reference: '', notes: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dt(value) { return value ? new Date(value).toLocaleString() : '-'; }
function dateInput(value) {
  if (!value) return '';
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (['visited', 'delivered', 'active'].includes(s)) return 'paid';
  if (['shop_closed', 'cancelled', 'blocked'].includes(s)) return 'cancelled';
  if (['payment_promised', 'planned'].includes(s)) return 'partial';
  return 'unpaid';
}

export default function Distribution() {
  const [summary, setSummary] = useState(null);
  const [routes, setRoutes] = useState([]);
  const [shops, setShops] = useState([]);
  const [visits, setVisits] = useState([]);
  const [vans, setVans] = useState([]);
  const [collections, setCollections] = useState([]);
  const [salesReps, setSalesReps] = useState([]);
  const [routeForm, setRouteForm] = useState(emptyRoute);
  const [shopForm, setShopForm] = useState(emptyShop);
  const [visitForm, setVisitForm] = useState(emptyVisit);
  const [vanForm, setVanForm] = useState(emptyVan);
  const [collectionForm, setCollectionForm] = useState(emptyCollection);
  const [tab, setTab] = useState('shops');
  const [filters, setFilters] = useState({ q: '', routeId: '', employeeId: '', blocked: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const shopParams = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, routesRes, shopsRes, visitsRes, vansRes, collectionsRes, repsRes] = await Promise.all([
      api.get('/distribution/summary'),
      api.get('/distribution/routes'),
      api.get('/distribution/shops', { params: shopParams }),
      api.get('/distribution/visits'),
      api.get('/distribution/vans'),
      api.get('/distribution/collections'),
      api.get('/distribution/sales-reps')
    ]);
    setSummary(summaryRes.data);
    setRoutes(routesRes.data || []);
    setShops(shopsRes.data || []);
    setVisits(visitsRes.data || []);
    setVans(vansRes.data || []);
    setCollections(collectionsRes.data || []);
    setSalesReps(repsRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load distribution module')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3200);
  }

  async function createRoute(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/distribution/routes', { ...routeForm, assignedEmployeeId: routeForm.assignedEmployeeId || null, targetDailySales: Number(routeForm.targetDailySales || 0) });
      setRouteForm(emptyRoute); flash('Route created'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create route'); }
    finally { setSaving(false); }
  }

  async function createShop(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/distribution/shops', {
        ...shopForm,
        routeId: shopForm.routeId || null,
        assignedEmployeeId: shopForm.assignedEmployeeId || null,
        creditLimit: Number(shopForm.creditLimit || 0),
        currentOutstanding: Number(shopForm.currentOutstanding || 0),
        creditDays: Number(shopForm.creditDays || 0)
      });
      setShopForm(emptyShop); flash('Shop profile created'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create shop'); }
    finally { setSaving(false); }
  }

  async function createVisit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/distribution/visits', {
        ...visitForm,
        routeId: visitForm.routeId || null,
        employeeId: visitForm.employeeId || null,
        plannedAt: visitForm.plannedAt || null,
        nextFollowUpAt: visitForm.nextFollowUpAt || null,
        collectionPromise: Number(visitForm.collectionPromise || 0)
      });
      setVisitForm(emptyVisit); flash('Shop visit saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create visit'); }
    finally { setSaving(false); }
  }

  async function createVan(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/distribution/vans', { ...vanForm, driverEmployeeId: vanForm.driverEmployeeId || null, routeId: vanForm.routeId || null });
      setVanForm(emptyVan); flash('Van / delivery vehicle created'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create van'); }
    finally { setSaving(false); }
  }

  async function createCollection(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/distribution/collections', {
        ...collectionForm,
        routeId: collectionForm.routeId || null,
        employeeId: collectionForm.employeeId || null,
        amount: Number(collectionForm.amount || 0)
      });
      setCollectionForm(emptyCollection); flash('Collection recorded and shop balance updated'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to record collection'); }
    finally { setSaving(false); }
  }

  const filteredOutstanding = useMemo(() => [...shops].sort((a, b) => Number(b.currentOutstanding || 0) - Number(a.currentOutstanding || 0)).slice(0, 10), [shops]);

  const shopColumns = [
    { key: 'shopName', label: 'Shop', render: (r) => <><strong>{r.shopName}</strong><span className="table-subtext">{r.shopCode} · {r.ownerName || r.phone || '-'}</span></> },
    { key: 'routeName', label: 'Route / Rep', render: (r) => <>{r.routeName || '-'}<span className="table-subtext">{r.assignedEmployeeName || 'No rep assigned'}</span></> },
    { key: 'area', label: 'Area', render: (r) => <>{r.area || '-'}<span className="table-subtext">{r.category || 'Retail Shop'}</span></> },
    { key: 'balance', label: 'Credit', render: (r) => <><strong className={r.isOverLimit ? 'danger-text' : ''}>{money(r.currentOutstanding)}</strong><span className="table-subtext">Limit {money(r.creditLimit)} · {r.creditDays} days</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.isBlocked ? 'cancelled' : r.isActive ? 'paid' : 'unpaid'}`}>{r.isBlocked ? 'Blocked' : r.isActive ? 'Active' : 'Inactive'}</span> }
  ];

  const routeColumns = [
    { key: 'routeNo', label: 'Route', render: (r) => <><strong>{r.routeNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'area', label: 'Area', render: (r) => r.area || '-' },
    { key: 'assignedEmployeeName', label: 'Sales Rep', render: (r) => r.assignedEmployeeName || '-' },
    { key: 'targetDailySales', label: 'Daily Target', render: (r) => money(r.targetDailySales) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.isActive ? 'paid' : 'cancelled'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
  ];

  const visitColumns = [
    { key: 'visitNo', label: 'Visit', render: (r) => <><strong>{r.visitNo}</strong><span className="table-subtext">{dt(r.plannedAt)}</span></> },
    { key: 'shopName', label: 'Shop', render: (r) => <>{r.shopName || '-'}<span className="table-subtext">{r.routeName || '-'}</span></> },
    { key: 'employeeName', label: 'Sales Rep', render: (r) => r.employeeName || '-' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{String(r.status || '').replaceAll('_', ' ')}</span> },
    { key: 'promise', label: 'Collection Promise', render: (r) => <>{money(r.collectionPromise)}<span className="table-subtext">Next: {dt(r.nextFollowUpAt)}</span></> }
  ];

  const collectionColumns = [
    { key: 'collectionNo', label: 'Receipt', render: (r) => <><strong>{r.collectionNo}</strong><span className="table-subtext">{dt(r.collectedAt)}</span></> },
    { key: 'shopName', label: 'Shop', render: (r) => <>{r.shopName || '-'}<span className="table-subtext">{r.routeName || '-'}</span></> },
    { key: 'employeeName', label: 'Collected by', render: (r) => r.employeeName || '-' },
    { key: 'amount', label: 'Amount', render: (r) => <strong>{money(r.amount)}</strong> },
    { key: 'method', label: 'Method', render: (r) => <span className="badge partial">{r.method}</span> }
  ];

  const vanColumns = [
    { key: 'vanNo', label: 'Van', render: (r) => <><strong>{r.vanNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'vehicleNo', label: 'Vehicle No', render: (r) => r.vehicleNo || '-' },
    { key: 'driverName', label: 'Driver', render: (r) => r.driverName || '-' },
    { key: 'routeName', label: 'Route', render: (r) => r.routeName || '-' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${r.isActive ? 'paid' : 'cancelled'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
  ];

  return (
    <div className="page distribution-page">
      <div className="page-header distribution-hero">
        <div>
          <span className="eyebrow">v5.9 / wholesale distribution / shop supply</span>
          <h1>Distribution & Shop Supply</h1>
          <p>Manage retail shops, delivery routes, sales reps, vans, visits, collections and shop-wise outstanding balances.</p>
        </div>
        <div className="head-actions">
          <button className="ghost-btn" onClick={() => load()}><RefreshCw size={16} /> Refresh</button>
          <button className="primary-btn" onClick={() => setTab('create-shop')}><Plus size={16} /> Add Shop</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid report-stat-grid">
        <StatCard title="Active Shops" value={summary?.activeShops || 0} subtitle={`${summary?.shops || 0} total shops`} tone="green" />
        <StatCard title="Total Outstanding" value={money(summary?.totalOutstanding || 0)} subtitle={`${summary?.creditUsedPercent || 0}% of credit limit used`} tone="orange" />
        <StatCard title="Today Collections" value={money(summary?.todayCollectionTotal || 0)} subtitle="Cash/bank/cheque collected" tone="green" />
        <StatCard title="Routes / Vans" value={`${summary?.routes || 0} / ${summary?.vans || 0}`} subtitle={`${summary?.visitsToday || 0} visits today`} tone="blue" />
      </div>

      <div className="distribution-quick-panel">
        <div><MapPinned size={18} /><strong>Route selling workflow</strong><span>Plan route → visit shops → supply goods → collect money → track outstanding.</span></div>
        <div><PackageCheck size={18} /><strong>Next versions</strong><span>Supply invoices, van stock loading, returns, offers and distributor reports.</span></div>
      </div>

      <div className="filter-row distribution-filters">
        <input placeholder="Search shop / owner / phone / area" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        <select value={filters.routeId} onChange={(e) => setFilters({ ...filters, routeId: e.target.value })}>
          <option value="">All routes</option>
          {routes.map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}
        </select>
        <select value={filters.employeeId} onChange={(e) => setFilters({ ...filters, employeeId: e.target.value })}>
          <option value="">All sales reps</option>
          {salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
        <select value={filters.blocked} onChange={(e) => setFilters({ ...filters, blocked: e.target.value })}>
          <option value="">All status</option>
          <option value="true">Blocked / watchlist</option>
        </select>
        <button className="ghost-btn" onClick={() => load()}>Apply</button>
      </div>

      <div className="tab-actions">
        {[
          ['shops', 'Shops'], ['routes', 'Routes'], ['visits', 'Visits'], ['collections', 'Collections'], ['vans', 'Vans'],
          ['create-shop', 'Add Shop'], ['create-route', 'Add Route'], ['create-visit', 'Add Visit'], ['create-collection', 'Add Collection'], ['create-van', 'Add Van']
        ].map(([key, label]) => <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>

      {tab === 'shops' && <div className="content-card"><DataTable columns={shopColumns} data={shops} empty="No shops yet" /></div>}
      {tab === 'routes' && <div className="content-card"><DataTable columns={routeColumns} data={routes} empty="No routes yet" /></div>}
      {tab === 'visits' && <div className="content-card"><DataTable columns={visitColumns} data={visits} empty="No shop visits yet" /></div>}
      {tab === 'collections' && <div className="content-card"><DataTable columns={collectionColumns} data={collections} empty="No collections yet" /></div>}
      {tab === 'vans' && <div className="content-card"><DataTable columns={vanColumns} data={vans} empty="No vans yet" /></div>}

      {tab === 'create-route' && <form className="form-card distribution-form" onSubmit={createRoute}>
        <h3><Route size={18} /> Create route</h3>
        <div className="form-grid">
          <label>Route name<input required value={routeForm.name} onChange={(e) => setRouteForm({ ...routeForm, name: e.target.value })} placeholder="Akkaraipattu Route" /></label>
          <label>Area<input value={routeForm.area} onChange={(e) => setRouteForm({ ...routeForm, area: e.target.value })} placeholder="Akkaraipattu" /></label>
          <label>Sales rep<select value={routeForm.assignedEmployeeId} onChange={(e) => setRouteForm({ ...routeForm, assignedEmployeeId: e.target.value })}><option value="">Not assigned</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Daily target<input type="number" value={routeForm.targetDailySales} onChange={(e) => setRouteForm({ ...routeForm, targetDailySales: e.target.value })} /></label>
          <label className="full-span">Notes<textarea value={routeForm.notes} onChange={(e) => setRouteForm({ ...routeForm, notes: e.target.value })} /></label>
        </div>
        <button className="primary-btn" disabled={saving}>Save Route</button>
      </form>}

      {tab === 'create-shop' && <form className="form-card distribution-form" onSubmit={createShop}>
        <h3><Store size={18} /> Create shop / outlet</h3>
        <div className="form-grid">
          <label>Shop name<input required value={shopForm.shopName} onChange={(e) => setShopForm({ ...shopForm, shopName: e.target.value })} placeholder="Ameen Stores" /></label>
          <label>Owner name<input value={shopForm.ownerName} onChange={(e) => setShopForm({ ...shopForm, ownerName: e.target.value })} /></label>
          <label>Phone<input value={shopForm.phone} onChange={(e) => setShopForm({ ...shopForm, phone: e.target.value })} /></label>
          <label>Area<input value={shopForm.area} onChange={(e) => setShopForm({ ...shopForm, area: e.target.value })} /></label>
          <label>Route<select value={shopForm.routeId} onChange={(e) => setShopForm({ ...shopForm, routeId: e.target.value })}><option value="">No route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.routeNo} · {r.name}</option>)}</select></label>
          <label>Sales rep<select value={shopForm.assignedEmployeeId} onChange={(e) => setShopForm({ ...shopForm, assignedEmployeeId: e.target.value })}><option value="">No rep</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Credit limit<input type="number" value={shopForm.creditLimit} onChange={(e) => setShopForm({ ...shopForm, creditLimit: e.target.value })} /></label>
          <label>Current outstanding<input type="number" value={shopForm.currentOutstanding} onChange={(e) => setShopForm({ ...shopForm, currentOutstanding: e.target.value })} /></label>
          <label>Credit days<input type="number" value={shopForm.creditDays} onChange={(e) => setShopForm({ ...shopForm, creditDays: e.target.value })} /></label>
          <label>Visit frequency<input value={shopForm.visitFrequency} onChange={(e) => setShopForm({ ...shopForm, visitFrequency: e.target.value })} /></label>
          <label className="full-span">Address<textarea value={shopForm.address} onChange={(e) => setShopForm({ ...shopForm, address: e.target.value })} /></label>
        </div>
        <button className="primary-btn" disabled={saving}>Save Shop</button>
      </form>}

      {tab === 'create-visit' && <form className="form-card distribution-form" onSubmit={createVisit}>
        <h3><UserCheck size={18} /> Plan / record shop visit</h3>
        <div className="form-grid">
          <label>Shop<select required value={visitForm.shopId} onChange={(e) => { const shop = shops.find((s) => s.id === e.target.value); setVisitForm({ ...visitForm, shopId: e.target.value, routeId: shop?.routeId || '', employeeId: shop?.assignedEmployeeId || '' }); }}><option value="">Choose shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopCode} · {s.shopName}</option>)}</select></label>
          <label>Route<select value={visitForm.routeId} onChange={(e) => setVisitForm({ ...visitForm, routeId: e.target.value })}><option value="">Auto/from shop</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Sales rep<select value={visitForm.employeeId} onChange={(e) => setVisitForm({ ...visitForm, employeeId: e.target.value })}><option value="">Auto/from shop</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Planned at<input type="datetime-local" value={visitForm.plannedAt} onChange={(e) => setVisitForm({ ...visitForm, plannedAt: e.target.value })} /></label>
          <label>Status<select value={visitForm.status} onChange={(e) => setVisitForm({ ...visitForm, status: e.target.value })}><option value="PLANNED">Planned</option><option value="VISITED">Visited</option><option value="NO_ORDER">No order</option><option value="SHOP_CLOSED">Shop closed</option><option value="PAYMENT_PROMISED">Payment promised</option></select></label>
          <label>Collection promise<input type="number" value={visitForm.collectionPromise} onChange={(e) => setVisitForm({ ...visitForm, collectionPromise: e.target.value })} /></label>
          <label className="full-span">Notes<textarea value={visitForm.notes} onChange={(e) => setVisitForm({ ...visitForm, notes: e.target.value })} /></label>
        </div>
        <button className="primary-btn" disabled={saving}>Save Visit</button>
      </form>}

      {tab === 'create-collection' && <form className="form-card distribution-form" onSubmit={createCollection}>
        <h3><WalletCards size={18} /> Record shop collection</h3>
        <div className="form-grid">
          <label>Shop<select required value={collectionForm.shopId} onChange={(e) => { const shop = shops.find((s) => s.id === e.target.value); setCollectionForm({ ...collectionForm, shopId: e.target.value, routeId: shop?.routeId || '', employeeId: shop?.assignedEmployeeId || '' }); }}><option value="">Choose shop</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopCode} · {s.shopName} · {money(s.currentOutstanding)}</option>)}</select></label>
          <label>Route<select value={collectionForm.routeId} onChange={(e) => setCollectionForm({ ...collectionForm, routeId: e.target.value })}><option value="">Auto/from shop</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Sales rep<select value={collectionForm.employeeId} onChange={(e) => setCollectionForm({ ...collectionForm, employeeId: e.target.value })}><option value="">Auto/from shop</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Amount<input required type="number" value={collectionForm.amount} onChange={(e) => setCollectionForm({ ...collectionForm, amount: e.target.value })} /></label>
          <label>Method<select value={collectionForm.method} onChange={(e) => setCollectionForm({ ...collectionForm, method: e.target.value })}><option>CASH</option><option>BANK_TRANSFER</option><option>CHEQUE</option><option>CARD</option><option>ONLINE</option></select></label>
          <label>Reference<input value={collectionForm.reference} onChange={(e) => setCollectionForm({ ...collectionForm, reference: e.target.value })} /></label>
          <label className="full-span">Notes<textarea value={collectionForm.notes} onChange={(e) => setCollectionForm({ ...collectionForm, notes: e.target.value })} /></label>
        </div>
        <button className="primary-btn" disabled={saving}>Save Collection</button>
      </form>}

      {tab === 'create-van' && <form className="form-card distribution-form" onSubmit={createVan}>
        <h3><Truck size={18} /> Create delivery van / vehicle</h3>
        <div className="form-grid">
          <label>Van name<input required value={vanForm.name} onChange={(e) => setVanForm({ ...vanForm, name: e.target.value })} placeholder="Van 01" /></label>
          <label>Vehicle number<input value={vanForm.vehicleNo} onChange={(e) => setVanForm({ ...vanForm, vehicleNo: e.target.value })} /></label>
          <label>Driver<select value={vanForm.driverEmployeeId} onChange={(e) => setVanForm({ ...vanForm, driverEmployeeId: e.target.value })}><option value="">No driver</option>{salesReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Default route<select value={vanForm.routeId} onChange={(e) => setVanForm({ ...vanForm, routeId: e.target.value })}><option value="">No route</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label className="full-span">Capacity notes<textarea value={vanForm.capacityNotes} onChange={(e) => setVanForm({ ...vanForm, capacityNotes: e.target.value })} /></label>
        </div>
        <button className="primary-btn" disabled={saving}>Save Van</button>
      </form>}

      <div className="content-card distribution-watchlist">
        <h3>Top outstanding shops</h3>
        <div className="watchlist-grid">
          {filteredOutstanding.length ? filteredOutstanding.map((shop) => <div className="watchlist-shop" key={shop.id}>
            <strong>{shop.shopName}</strong>
            <span>{shop.routeName || 'No route'} · {shop.assignedEmployeeName || 'No rep'}</span>
            <b>{money(shop.currentOutstanding)}</b>
          </div>) : <p className="muted-text">No outstanding shop balances yet.</p>}
        </div>
      </div>
    </div>
  );
}
