import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  CreditCard,
  Loader2,
  MapPin,
  PackagePlus,
  Phone,
  RefreshCcw,
  Route,
  Save,
  Search,
  Store,
  Truck,
  UserRound,
  WalletCards,
  X
} from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './RepMobile.css';

const today = () => new Date().toISOString().slice(0, 10);

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function pickLabel(items, id, key = 'name', fallback = 'All') {
  if (!id) return fallback;
  const item = items.find((entry) => entry.id === id);
  return item?.[key] || fallback;
}

function statusText(status) {
  return String(status || '').replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, (char) => char.toUpperCase());
}

function Card({ icon: Icon, label, value, hint, tone = 'blue' }) {
  return (
    <div className={`rm-card tone-${tone}`}>
      <span className="rm-card-icon"><Icon size={20} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        {hint && <em>{hint}</em>}
      </div>
    </div>
  );
}

function Drawer({ title, open, onClose, children }) {
  if (!open) return null;
  return (
    <div className="rm-drawer-backdrop" onClick={onClose}>
      <div className="rm-drawer" onClick={(event) => event.stopPropagation()}>
        <div className="rm-drawer-head">
          <strong>{title}</strong>
          <button type="button" onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

const blankVisit = { status: 'VISITED', collectionPromise: 0, noOrderReason: '', notes: '' };
const blankCollection = { amount: '', method: 'CASH', reference: '', notes: '' };
const blankSupply = { paid: 0, paymentMethod: 'CREDIT', discount: 0, tax: 0, notes: '', items: [{ productId: '', description: '', qty: 1, freeQty: 0, unitPrice: 0, discount: 0 }] };
const blankClosing = { cashCollected: 0, chequeCollected: 0, creditSales: 0, routeExpense: 0, soldValue: 0, returnedValue: 0, damagedValue: 0, missingValue: 0, notes: '' };

export default function RepMobile() {
  const [date, setDate] = useState(today());
  const [routeId, setRouteId] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [vanId, setVanId] = useState('');
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeShop, setActiveShop] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [visitForm, setVisitForm] = useState(blankVisit);
  const [collectionForm, setCollectionForm] = useState(blankCollection);
  const [supplyForm, setSupplyForm] = useState(blankSupply);
  const [closingForm, setClosingForm] = useState(blankClosing);

  const master = data?.masterData || { routes: [], shops: [], employees: [], vans: [], products: [] };
  const summary = data?.summary || {};

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { date };
      if (routeId) params.routeId = routeId;
      if (employeeId) params.employeeId = employeeId;
      if (vanId) params.vanId = vanId;
      const res = await api.get('/rep-mobile/summary', { params });
      setData(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load mobile sales rep data.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [date, routeId, employeeId, vanId]);

  const filteredShops = useMemo(() => {
    const text = query.trim().toLowerCase();
    const shops = data?.routeShops || [];
    if (!text) return shops;
    return shops.filter((shop) => [shop.shopName, shop.shopCode, shop.ownerName, shop.phone, shop.area].filter(Boolean).join(' ').toLowerCase().includes(text));
  }, [query, data]);

  const shopPager = useClientPagination(filteredShops, { initialPageSize: 8, resetKey: `${query}-${routeId}-${employeeId}-${vanId}-${date}-${filteredShops.length}` });

  function openDrawer(type, shop = null) {
    setError('');
    setSuccess('');
    setActiveShop(shop);
    setDrawer(type);
    setVisitForm(blankVisit);
    setCollectionForm(blankCollection);
    setSupplyForm(blankSupply);
    setClosingForm(blankClosing);
  }

  function selectedProduct(productId) {
    return master.products.find((product) => product.id === productId);
  }

  function updateSupplyItem(index, patch) {
    setSupplyForm((current) => {
      const items = current.items.map((item, idx) => idx === index ? { ...item, ...patch } : item);
      return { ...current, items };
    });
  }

  function addSupplyItem() {
    setSupplyForm((current) => ({ ...current, items: [...current.items, { productId: '', description: '', qty: 1, freeQty: 0, unitPrice: 0, discount: 0 }] }));
  }

  function removeSupplyItem(index) {
    setSupplyForm((current) => ({ ...current, items: current.items.filter((_, idx) => idx !== index) }));
  }

  const supplySubtotal = useMemo(() => {
    return supplyForm.items.reduce((total, item) => total + Math.max(0, (Number(item.qty || 0) * Number(item.unitPrice || 0)) - Number(item.discount || 0)), 0);
  }, [supplyForm.items]);

  const supplyTotal = Math.max(0, supplySubtotal - Number(supplyForm.discount || 0) + Number(supplyForm.tax || 0));
  const supplyBalance = Math.max(0, supplyTotal - Number(supplyForm.paid || 0));

  async function saveVisit() {
    if (!activeShop) return;
    setSaving(true);
    try {
      await api.post('/rep-mobile/visits', {
        shopId: activeShop.id,
        routeId: routeId || activeShop.routeId || null,
        employeeId: employeeId || activeShop.assignedEmployeeId || null,
        status: visitForm.status,
        orderTaken: visitForm.status === 'ORDER_TAKEN',
        collectionPromise: Number(visitForm.collectionPromise || 0),
        noOrderReason: visitForm.noOrderReason || null,
        notes: visitForm.notes || null
      });
      setSuccess('Visit saved successfully.');
      setDrawer(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save visit.');
    } finally {
      setSaving(false);
    }
  }

  async function saveCollection() {
    if (!activeShop) return;
    setSaving(true);
    try {
      await api.post('/rep-mobile/collections', {
        shopId: activeShop.id,
        routeId: routeId || activeShop.routeId || null,
        employeeId: employeeId || activeShop.assignedEmployeeId || null,
        amount: Number(collectionForm.amount || 0),
        method: collectionForm.method,
        reference: collectionForm.reference || null,
        notes: collectionForm.notes || null
      });
      setSuccess('Collection saved and outstanding updated.');
      setDrawer(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save collection.');
    } finally {
      setSaving(false);
    }
  }

  async function saveSupply() {
    if (!activeShop) return;
    const items = supplyForm.items
      .filter((item) => item.description || item.productId)
      .map((item) => ({
        productId: item.productId || null,
        description: item.description || selectedProduct(item.productId)?.name || 'Supply item',
        qty: Number(item.qty || 0),
        freeQty: Number(item.freeQty || 0),
        unitPrice: Number(item.unitPrice || 0),
        discount: Number(item.discount || 0)
      }));
    if (!items.length) return setError('Add at least one product/item.');

    setSaving(true);
    try {
      await api.post('/rep-mobile/quick-supply', {
        shopId: activeShop.id,
        routeId: routeId || activeShop.routeId || null,
        employeeId: employeeId || activeShop.assignedEmployeeId || null,
        vanId: vanId || null,
        paid: Number(supplyForm.paid || 0),
        paymentMethod: supplyForm.paymentMethod,
        discount: Number(supplyForm.discount || 0),
        tax: Number(supplyForm.tax || 0),
        notes: supplyForm.notes || null,
        items
      });
      setSuccess('Quick supply invoice posted.');
      setDrawer(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save quick supply.');
    } finally {
      setSaving(false);
    }
  }

  async function saveClosing() {
    if (!vanId) return setError('Select a van first.');
    setSaving(true);
    try {
      await api.post('/rep-mobile/day-closing', {
        vanId,
        routeId: routeId || null,
        employeeId: employeeId || null,
        ...Object.fromEntries(Object.entries(closingForm).map(([key, value]) => [key, key === 'notes' ? value : Number(value || 0)]))
      });
      setSuccess('Daily closing saved.');
      setDrawer(null);
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save daily closing.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rep-mobile-page">
      <section className="rm-hero">
        <div>
          <span className="rm-eyebrow"><Truck size={16} /> Mobile Sales Rep Mode</span>
          <h1>Today route work</h1>
          <p>Mobile-friendly screen for route sales reps: visit shops, record collections, post quick supply invoices, and close the day from phone or tablet.</p>
        </div>
        <button type="button" className="rm-refresh" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="spin" size={18} /> : <RefreshCcw size={18} />}
          Refresh
        </button>
      </section>

      <section className="rm-filter-card">
        <label><CalendarDays size={15} /> <input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></label>
        <label><Route size={15} />
          <select value={routeId} onChange={(event) => setRouteId(event.target.value)}>
            <option value="">All routes</option>
            {master.routes.map((route) => <option key={route.id} value={route.id}>{route.routeNo} - {route.name}</option>)}
          </select>
        </label>
        <label><UserRound size={15} />
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">All reps</option>
            {master.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
          </select>
        </label>
        <label><Truck size={15} />
          <select value={vanId} onChange={(event) => setVanId(event.target.value)}>
            <option value="">No van filter</option>
            {master.vans.map((van) => <option key={van.id} value={van.id}>{van.vanNo} - {van.name || van.vehicleNo}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="rm-alert error"><AlertTriangle size={18} /> {error}</div>}
      {success && <div className="rm-alert success"><CheckCircle2 size={18} /> {success}</div>}

      <section className="rm-cards">
        <Card icon={Store} label="Route shops" value={summary.shopsOnRoute || 0} hint="shops in selected route" tone="blue" />
        <Card icon={ClipboardCheck} label="Visited" value={`${summary.visited || 0}/${summary.shopsOnRoute || 0}`} hint="today coverage" tone="green" />
        <Card icon={PackagePlus} label="Supplied" value={money(summary.supplyTotal)} hint={`${summary.supplyCount || 0} invoices`} tone="pink" />
        <Card icon={WalletCards} label="Collections" value={money(summary.collectionTotal)} hint={`${summary.collectionCount || 0} payments`} tone="amber" />
        <Card icon={CreditCard} label="Outstanding" value={money(summary.outstandingTotal)} hint={`${summary.blockedShops || 0} blocked shops`} tone="red" />
      </section>

      <div className="rm-main-grid">
        <section className="rm-panel rm-shops-panel">
          <div className="rm-panel-head">
            <div>
              <h2>Shop route list</h2>
              <p>{pickLabel(master.routes, routeId, 'name', 'All route shops')} · {pickLabel(master.employees, employeeId, 'name', 'All reps')}</p>
            </div>
            <label className="rm-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shop, owner, area..." /></label>
          </div>

          {loading ? <div className="rm-loading"><Loader2 className="spin" /> Loading route...</div> : null}
          {!loading && !filteredShops.length ? <div className="rm-empty">No shops found for this filter.</div> : null}

          <div className="rm-shop-list">
            {shopPager.pageItems.map((shop) => (
              <article className={`rm-shop-card ${Number(shop.currentOutstanding || 0) > Number(shop.creditLimit || 0) && Number(shop.creditLimit || 0) > 0 ? 'risk' : ''}`} key={shop.id}>
                <div className="rm-shop-top">
                  <div>
                    <strong>{shop.shopCode} · {shop.shopName}</strong>
                    <span><MapPin size={13} /> {shop.area || 'No area'} · {shop.routeName}</span>
                    {shop.phone && <a href={`tel:${shop.phone}`}><Phone size={13} /> {shop.phone}</a>}
                  </div>
                  <em className={`status status-${String(shop.visitStatus || '').toLowerCase().replaceAll('_', '-')}`}>{statusText(shop.visitStatus)}</em>
                </div>
                <div className="rm-shop-metrics">
                  <span>Outstanding <b>{money(shop.currentOutstanding)}</b></span>
                  <span>Limit <b>{money(shop.creditLimit)}</b></span>
                  <span>Terms <b>{shop.paymentTerms || '-'}</b></span>
                </div>
                <div className="rm-actions">
                  <button type="button" onClick={() => openDrawer('visit', shop)}>Visit</button>
                  <button type="button" onClick={() => openDrawer('collection', shop)}>Collect</button>
                  <button type="button" onClick={() => openDrawer('supply', shop)}>Supply</button>
                </div>
              </article>
            ))}
          </div>
          <PaginationBar {...shopPager} label="shops" />
        </section>

        <aside className="rm-side-stack">
          <section className="rm-panel">
            <div className="rm-panel-head compact"><h2>Van stock</h2><button type="button" onClick={() => openDrawer('closing')}>Close day</button></div>
            {!vanId && <div className="rm-empty small">Select a van to view stock.</div>}
            {vanId && !(data?.vanStock || []).length && <div className="rm-empty small">No stock found for selected van.</div>}
            {(data?.vanStock || []).slice(0, 12).map((stock) => (
              <div className="rm-mini-row" key={stock.id || `${stock.productId}-${stock.vanId}`}>
                <span>{stock.sku ? `${stock.sku} · ` : ''}{stock.productName}</span>
                <b>{qty(stock.quantity)}</b>
              </div>
            ))}
          </section>

          <section className="rm-panel">
            <div className="rm-panel-head compact"><h2>Credit risk</h2></div>
            {(data?.topOutstanding || []).slice(0, 8).map((shop) => (
              <div className="rm-mini-row" key={shop.id}>
                <span>{shop.shopCode} · {shop.shopName}</span>
                <b>{money(shop.outstanding)}</b>
              </div>
            ))}
          </section>

          <section className="rm-panel">
            <div className="rm-panel-head compact"><h2>Recent collections</h2></div>
            {(data?.collections || []).slice(0, 8).map((collection) => (
              <div className="rm-mini-row" key={collection.id}>
                <span>{collection.shopName}</span>
                <b>{money(collection.amount)}</b>
              </div>
            ))}
          </section>
        </aside>
      </div>

      <Drawer title={`Visit — ${activeShop?.shopName || ''}`} open={drawer === 'visit'} onClose={() => setDrawer(null)}>
        <div className="rm-form-grid">
          <label>Status<select value={visitForm.status} onChange={(event) => setVisitForm({ ...visitForm, status: event.target.value })}>
            <option value="VISITED">Visited</option>
            <option value="ORDER_TAKEN">Order taken</option>
            <option value="NO_ORDER">No order</option>
            <option value="SHOP_CLOSED">Shop closed</option>
            <option value="OWNER_NOT_AVAILABLE">Owner not available</option>
            <option value="PAYMENT_PROMISED">Payment promised</option>
          </select></label>
          <label>Payment promised<input type="number" value={visitForm.collectionPromise} onChange={(event) => setVisitForm({ ...visitForm, collectionPromise: event.target.value })} /></label>
          <label>No-order reason<input value={visitForm.noOrderReason} onChange={(event) => setVisitForm({ ...visitForm, noOrderReason: event.target.value })} /></label>
          <label className="wide">Notes<textarea value={visitForm.notes} onChange={(event) => setVisitForm({ ...visitForm, notes: event.target.value })} /></label>
          <button className="rm-primary wide" disabled={saving} onClick={saveVisit}><Save size={17} /> Save visit</button>
        </div>
      </Drawer>

      <Drawer title={`Collect — ${activeShop?.shopName || ''}`} open={drawer === 'collection'} onClose={() => setDrawer(null)}>
        <div className="rm-form-grid">
          <label>Amount<input type="number" value={collectionForm.amount} onChange={(event) => setCollectionForm({ ...collectionForm, amount: event.target.value })} /></label>
          <label>Method<select value={collectionForm.method} onChange={(event) => setCollectionForm({ ...collectionForm, method: event.target.value })}>
            <option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option><option value="ONLINE">Online</option>
          </select></label>
          <label>Reference<input value={collectionForm.reference} onChange={(event) => setCollectionForm({ ...collectionForm, reference: event.target.value })} /></label>
          <label className="wide">Notes<textarea value={collectionForm.notes} onChange={(event) => setCollectionForm({ ...collectionForm, notes: event.target.value })} /></label>
          <button className="rm-primary wide" disabled={saving} onClick={saveCollection}><WalletCards size={17} /> Save collection</button>
        </div>
      </Drawer>

      <Drawer title={`Quick supply — ${activeShop?.shopName || ''}`} open={drawer === 'supply'} onClose={() => setDrawer(null)}>
        <div className="rm-supply-items">
          {supplyForm.items.map((item, index) => (
            <div className="rm-supply-item" key={index}>
              <label>Product<select value={item.productId} onChange={(event) => {
                const product = selectedProduct(event.target.value);
                updateSupplyItem(index, { productId: event.target.value, description: product?.name || '', unitPrice: product?.salePrice || 0 });
              }}>
                <option value="">Manual item</option>
                {master.products.map((product) => <option key={product.id} value={product.id}>{product.sku} · {product.name}</option>)}
              </select></label>
              <label>Description<input value={item.description} onChange={(event) => updateSupplyItem(index, { description: event.target.value })} /></label>
              <div className="rm-item-grid">
                <label>Qty<input type="number" value={item.qty} onChange={(event) => updateSupplyItem(index, { qty: event.target.value })} /></label>
                <label>Free<input type="number" value={item.freeQty} onChange={(event) => updateSupplyItem(index, { freeQty: event.target.value })} /></label>
                <label>Price<input type="number" value={item.unitPrice} onChange={(event) => updateSupplyItem(index, { unitPrice: event.target.value })} /></label>
                <label>Discount<input type="number" value={item.discount} onChange={(event) => updateSupplyItem(index, { discount: event.target.value })} /></label>
              </div>
              {supplyForm.items.length > 1 && <button className="rm-text-danger" type="button" onClick={() => removeSupplyItem(index)}>Remove item</button>}
            </div>
          ))}
          <button className="rm-secondary" type="button" onClick={addSupplyItem}>+ Add item</button>
        </div>
        <div className="rm-form-grid totals">
          <label>Invoice discount<input type="number" value={supplyForm.discount} onChange={(event) => setSupplyForm({ ...supplyForm, discount: event.target.value })} /></label>
          <label>Tax<input type="number" value={supplyForm.tax} onChange={(event) => setSupplyForm({ ...supplyForm, tax: event.target.value })} /></label>
          <label>Paid<input type="number" value={supplyForm.paid} onChange={(event) => setSupplyForm({ ...supplyForm, paid: event.target.value })} /></label>
          <label>Method<select value={supplyForm.paymentMethod} onChange={(event) => setSupplyForm({ ...supplyForm, paymentMethod: event.target.value })}>
            <option value="CREDIT">Credit</option><option value="CASH">Cash</option><option value="CARD">Card</option><option value="BANK_TRANSFER">Bank transfer</option><option value="CHEQUE">Cheque</option>
          </select></label>
          <div className="rm-total-box wide"><span>Total {money(supplyTotal)}</span><b>Balance {money(supplyBalance)}</b></div>
          <button className="rm-primary wide" disabled={saving} onClick={saveSupply}><PackagePlus size={17} /> Post supply</button>
        </div>
      </Drawer>

      <Drawer title="Daily route closing" open={drawer === 'closing'} onClose={() => setDrawer(null)}>
        <div className="rm-form-grid">
          <label>Cash collected<input type="number" value={closingForm.cashCollected} onChange={(event) => setClosingForm({ ...closingForm, cashCollected: event.target.value })} /></label>
          <label>Cheque collected<input type="number" value={closingForm.chequeCollected} onChange={(event) => setClosingForm({ ...closingForm, chequeCollected: event.target.value })} /></label>
          <label>Credit sales<input type="number" value={closingForm.creditSales} onChange={(event) => setClosingForm({ ...closingForm, creditSales: event.target.value })} /></label>
          <label>Route expenses<input type="number" value={closingForm.routeExpense} onChange={(event) => setClosingForm({ ...closingForm, routeExpense: event.target.value })} /></label>
          <label>Sold value<input type="number" value={closingForm.soldValue} onChange={(event) => setClosingForm({ ...closingForm, soldValue: event.target.value })} /></label>
          <label>Returned value<input type="number" value={closingForm.returnedValue} onChange={(event) => setClosingForm({ ...closingForm, returnedValue: event.target.value })} /></label>
          <label>Damaged value<input type="number" value={closingForm.damagedValue} onChange={(event) => setClosingForm({ ...closingForm, damagedValue: event.target.value })} /></label>
          <label>Missing value<input type="number" value={closingForm.missingValue} onChange={(event) => setClosingForm({ ...closingForm, missingValue: event.target.value })} /></label>
          <label className="wide">Notes<textarea value={closingForm.notes} onChange={(event) => setClosingForm({ ...closingForm, notes: event.target.value })} /></label>
          <button className="rm-primary wide" disabled={saving} onClick={saveClosing}><CheckCircle2 size={17} /> Save closing</button>
        </div>
      </Drawer>
    </div>
  );
}
