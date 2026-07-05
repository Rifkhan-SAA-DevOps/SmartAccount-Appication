import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Box,
  CalendarDays,
  CheckCircle2,
  Cloud,
  CloudOff,
  DownloadCloud,
  FileClock,
  Loader2,
  MapPinned,
  PackageCheck,
  RefreshCcw,
  Save,
  Send,
  Smartphone,
  Trash2,
  Truck,
  WalletCards,
  Wifi,
  WifiOff
} from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import {
  addOfflineDraft,
  clearAllOfflineDrafts,
  clearSyncedDrafts,
  getOfflineQueue,
  getOfflineSettings,
  getOfflineSnapshot,
  removeOfflineDraft,
  saveOfflineSettings,
  saveOfflineSnapshot,
  syncOfflineQueue
} from '../utils/repOfflineQueue.js';
import './RepOffline.css';

const visitStatuses = [
  'VISITED',
  'ORDER_TAKEN',
  'NO_ORDER',
  'SHOP_CLOSED',
  'OWNER_NOT_AVAILABLE',
  'PAYMENT_PROMISED',
  'SKIPPED'
];

const paymentMethods = ['CASH', 'CHEQUE', 'BANK_TRANSFER', 'CARD', 'ONLINE', 'CREDIT'];

const defaultVisit = {
  shopId: '',
  status: 'VISITED',
  collectionPromise: '',
  noOrderReason: '',
  notes: ''
};

const defaultCollection = {
  shopId: '',
  amount: '',
  method: 'CASH',
  reference: '',
  notes: ''
};

const defaultSupply = {
  shopId: '',
  productId: '',
  qty: '1',
  freeQty: '0',
  unitPrice: '',
  paid: '0',
  paymentMethod: 'CREDIT',
  notes: ''
};

const defaultClosing = {
  cashCollected: '',
  chequeCollected: '',
  creditSales: '',
  routeExpense: '',
  soldValue: '',
  returnedValue: '',
  damagedValue: '',
  missingValue: '',
  notes: ''
};

function formatDateTime(value) {
  if (!value) return 'Not cached yet';
  return new Date(value).toLocaleString();
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function labelById(list, id, keys = ['name']) {
  const row = list.find((item) => item.id === id);
  if (!row) return 'Not selected';
  return keys.map((key) => row[key]).filter(Boolean).join(' - ') || row.id;
}

function StatusPill({ online }) {
  return (
    <span className={`rep-offline-status ${online ? 'online' : 'offline'}`}>
      {online ? <Wifi size={16} /> : <WifiOff size={16} />}
      {online ? 'Online' : 'Offline'}
    </span>
  );
}

function DraftCard({ draft, onRemove }) {
  const iconMap = {
    visit: MapPinned,
    collection: WalletCards,
    quickSupply: PackageCheck,
    dayClosing: FileClock
  };
  const Icon = iconMap[draft.type] || FileClock;
  return (
    <div className={`rep-offline-draft status-${String(draft.status || 'PENDING').toLowerCase()}`}>
      <div className="rep-offline-draft-icon"><Icon size={18} /></div>
      <div className="rep-offline-draft-main">
        <div className="rep-offline-draft-top">
          <strong>{draft.title}</strong>
          <span>{draft.status}</span>
        </div>
        <small>{formatDateTime(draft.createdAt)} · Attempts: {draft.attempts || 0}</small>
        {draft.error && <em>{draft.error}</em>}
      </div>
      {draft.status !== 'SYNCING' && (
        <button type="button" className="rep-offline-icon-btn danger" onClick={() => onRemove(draft.id)} title="Remove draft">
          <Trash2 size={16} />
        </button>
      )}
    </div>
  );
}

export default function RepOffline() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [settings, setSettings] = useState(() => getOfflineSettings());
  const [snapshot, setSnapshot] = useState(() => getOfflineSnapshot());
  const [queue, setQueue] = useState(() => getOfflineQueue());
  const [loadingSnapshot, setLoadingSnapshot] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState('');
  const [visit, setVisit] = useState(defaultVisit);
  const [collection, setCollection] = useState(defaultCollection);
  const [supply, setSupply] = useState(defaultSupply);
  const [closing, setClosing] = useState(defaultClosing);

  const masterData = snapshot?.masterData || {};
  const shops = masterData.shops || [];
  const routes = masterData.routes || [];
  const employees = masterData.employees || [];
  const vans = masterData.vans || [];
  const products = masterData.products || [];

  const pendingCount = queue.filter((item) => item.status !== 'SYNCED').length;
  const syncedCount = queue.filter((item) => item.status === 'SYNCED').length;
  const queuePager = useClientPagination(queue, { initialPageSize: 8, resetKey: `${queue.length}-${pendingCount}-${syncedCount}` });

  const selectedLabels = useMemo(() => ({
    route: labelById(routes, settings.routeId, ['routeNo', 'name']),
    employee: labelById(employees, settings.employeeId, ['name']),
    van: labelById(vans, settings.vanId, ['vanNo', 'name', 'vehicleNo'])
  }), [routes, employees, vans, settings.routeId, settings.employeeId, settings.vanId]);

  useEffect(() => {
    function handleOnline() { setOnline(true); }
    function handleOffline() { setOnline(false); }
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  function refreshQueue() {
    setQueue(getOfflineQueue());
  }

  function updateSettings(patch) {
    const next = saveOfflineSettings(patch);
    setSettings(next);
  }

  async function downloadSnapshot() {
    if (!online) {
      setMessage('You are offline. Use the last cached route data.');
      return;
    }
    setLoadingSnapshot(true);
    setMessage('');
    try {
      const params = new URLSearchParams();
      if (settings.date) params.set('date', settings.date);
      if (settings.routeId) params.set('routeId', settings.routeId);
      if (settings.employeeId) params.set('employeeId', settings.employeeId);
      if (settings.vanId) params.set('vanId', settings.vanId);
      const response = await api.get(`/rep-mobile/summary?${params.toString()}`);
      const saved = saveOfflineSnapshot(response.data);
      setSnapshot(saved);
      setMessage('Route data cached for offline use.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Could not download offline data.');
    } finally {
      setLoadingSnapshot(false);
    }
  }

  function addDraft(type, payload, title) {
    addOfflineDraft(type, payload, title);
    refreshQueue();
    setMessage('Draft saved offline. It will sync when internet is available.');
  }

  function saveVisitDraft(event) {
    event.preventDefault();
    if (!visit.shopId) return setMessage('Select a shop first.');
    const payload = {
      ...visit,
      routeId: settings.routeId || undefined,
      employeeId: settings.employeeId || undefined,
      orderTaken: visit.status === 'ORDER_TAKEN',
      collectionPromise: Number(visit.collectionPromise || 0),
      plannedAt: new Date().toISOString(),
      visitedAt: new Date().toISOString()
    };
    const shopName = labelById(shops, visit.shopId, ['shopCode', 'shopName']);
    addDraft('visit', payload, `Visit · ${shopName}`);
    setVisit(defaultVisit);
  }

  function saveCollectionDraft(event) {
    event.preventDefault();
    if (!collection.shopId) return setMessage('Select a shop first.');
    if (Number(collection.amount || 0) <= 0) return setMessage('Collection amount must be greater than zero.');
    const payload = {
      ...collection,
      routeId: settings.routeId || undefined,
      employeeId: settings.employeeId || undefined,
      amount: Number(collection.amount),
      collectedAt: new Date().toISOString()
    };
    const shopName = labelById(shops, collection.shopId, ['shopCode', 'shopName']);
    addDraft('collection', payload, `Collection Rs. ${money(collection.amount)} · ${shopName}`);
    setCollection(defaultCollection);
  }

  function saveSupplyDraft(event) {
    event.preventDefault();
    if (!supply.shopId) return setMessage('Select a shop first.');
    const product = products.find((item) => item.id === supply.productId);
    if (!product) return setMessage('Select a product first.');
    const qty = Number(supply.qty || 0);
    if (qty <= 0) return setMessage('Quantity must be greater than zero.');
    const payload = {
      shopId: supply.shopId,
      routeId: settings.routeId || undefined,
      employeeId: settings.employeeId || undefined,
      vanId: settings.vanId || undefined,
      supplyDate: new Date().toISOString(),
      paid: Number(supply.paid || 0),
      paymentMethod: supply.paymentMethod,
      notes: supply.notes || 'Created from offline sales rep mode',
      items: [
        {
          productId: product.id,
          description: product.name,
          qty,
          freeQty: Number(supply.freeQty || 0),
          unitPrice: Number(supply.unitPrice || product.salePrice || 0),
          discount: 0
        }
      ]
    };
    const shopName = labelById(shops, supply.shopId, ['shopCode', 'shopName']);
    addDraft('quickSupply', payload, `Supply · ${product.name} · ${shopName}`);
    setSupply(defaultSupply);
  }

  function saveClosingDraft(event) {
    event.preventDefault();
    if (!settings.vanId) return setMessage('Select a van before saving daily closing.');
    const payload = {
      vanId: settings.vanId,
      routeId: settings.routeId || undefined,
      employeeId: settings.employeeId || undefined,
      cashCollected: Number(closing.cashCollected || 0),
      chequeCollected: Number(closing.chequeCollected || 0),
      creditSales: Number(closing.creditSales || 0),
      routeExpense: Number(closing.routeExpense || 0),
      soldValue: Number(closing.soldValue || 0),
      returnedValue: Number(closing.returnedValue || 0),
      damagedValue: Number(closing.damagedValue || 0),
      missingValue: Number(closing.missingValue || 0),
      notes: closing.notes || 'Created from offline sales rep mode'
    };
    addDraft('dayClosing', payload, `Daily closing · ${selectedLabels.van}`);
    setClosing(defaultClosing);
  }

  async function syncNow() {
    if (!online) {
      setMessage('You are offline. Sync will work when internet returns.');
      return;
    }
    setSyncing(true);
    setMessage('Syncing offline drafts...');
    try {
      const results = await syncOfflineQueue(api, () => refreshQueue());
      refreshQueue();
      const failed = results.find((item) => item.status === 'FAILED');
      setMessage(failed ? `Sync stopped: ${failed.error}` : 'Offline drafts synced successfully.');
    } catch (error) {
      setMessage(error.response?.data?.message || error.message || 'Sync failed.');
    } finally {
      setSyncing(false);
      refreshQueue();
    }
  }

  function removeDraft(id) {
    removeOfflineDraft(id);
    refreshQueue();
  }

  return (
    <div className="rep-offline-page">
      <div className="rep-offline-hero">
        <div>
          <span className="rep-offline-eyebrow"><Smartphone size={16} /> v6.8 Mobile Offline / PWA</span>
          <h1>Offline Sales Rep Mode</h1>
          <p>Download today’s route, keep visit/collection/supply drafts on the phone, then sync when internet returns.</p>
        </div>
        <div className="rep-offline-hero-actions">
          <StatusPill online={online} />
          <button className="rep-offline-primary" onClick={downloadSnapshot} disabled={loadingSnapshot}>
            {loadingSnapshot ? <Loader2 className="spin" size={18} /> : <DownloadCloud size={18} />}
            Cache Route Data
          </button>
          <button className="rep-offline-secondary" onClick={syncNow} disabled={syncing || pendingCount === 0}>
            {syncing ? <Loader2 className="spin" size={18} /> : <Send size={18} />}
            Sync Pending
          </button>
        </div>
      </div>

      {message && <div className="rep-offline-message"><AlertTriangle size={17} /> {message}</div>}

      <div className="rep-offline-stats">
        <div className="rep-offline-stat"><Cloud size={20} /><span>Cached</span><strong>{formatDateTime(snapshot?.cachedAt)}</strong></div>
        <div className="rep-offline-stat"><MapPinned size={20} /><span>Shops cached</span><strong>{shops.length}</strong></div>
        <div className="rep-offline-stat"><FileClock size={20} /><span>Pending drafts</span><strong>{pendingCount}</strong></div>
        <div className="rep-offline-stat"><CheckCircle2 size={20} /><span>Synced drafts</span><strong>{syncedCount}</strong></div>
      </div>

      <section className="rep-offline-card rep-offline-filter-card">
        <div className="rep-offline-section-title">
          <div><CalendarDays size={18} /><h2>Route cache setup</h2></div>
          <small>Select route/rep/van, then cache before leaving the office.</small>
        </div>
        <div className="rep-offline-grid four">
          <label>
            <span>Date</span>
            <input type="date" value={settings.date || ''} onChange={(event) => updateSettings({ date: event.target.value })} />
          </label>
          <label>
            <span>Route</span>
            <select value={settings.routeId || ''} onChange={(event) => updateSettings({ routeId: event.target.value })}>
              <option value="">All routes</option>
              {routes.map((route) => <option key={route.id} value={route.id}>{route.routeNo} - {route.name}</option>)}
            </select>
          </label>
          <label>
            <span>Sales rep</span>
            <select value={settings.employeeId || ''} onChange={(event) => updateSettings({ employeeId: event.target.value })}>
              <option value="">All reps</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </label>
          <label>
            <span>Van</span>
            <select value={settings.vanId || ''} onChange={(event) => updateSettings({ vanId: event.target.value })}>
              <option value="">No van</option>
              {vans.map((van) => <option key={van.id} value={van.id}>{van.vanNo} - {van.name || van.vehicleNo}</option>)}
            </select>
          </label>
        </div>
      </section>

      <div className="rep-offline-workspace">
        <section className="rep-offline-card">
          <div className="rep-offline-section-title"><div><MapPinned size={18} /><h2>Offline visit</h2></div></div>
          <form onSubmit={saveVisitDraft} className="rep-offline-form">
            <label><span>Shop</span><select value={visit.shopId} onChange={(event) => setVisit({ ...visit, shopId: event.target.value })}><option value="">Select shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} - {shop.shopName}</option>)}</select></label>
            <label><span>Status</span><select value={visit.status} onChange={(event) => setVisit({ ...visit, status: event.target.value })}>{visitStatuses.map((status) => <option key={status} value={status}>{status.replaceAll('_', ' ')}</option>)}</select></label>
            <label><span>Payment promise</span><input type="number" min="0" value={visit.collectionPromise} onChange={(event) => setVisit({ ...visit, collectionPromise: event.target.value })} placeholder="0.00" /></label>
            <label><span>No-order reason</span><input value={visit.noOrderReason} onChange={(event) => setVisit({ ...visit, noOrderReason: event.target.value })} placeholder="Shop closed / no need / owner away" /></label>
            <label className="full"><span>Notes</span><textarea value={visit.notes} onChange={(event) => setVisit({ ...visit, notes: event.target.value })} placeholder="Optional visit notes" /></label>
            <button className="rep-offline-primary" type="submit"><Save size={17} /> Save Visit Draft</button>
          </form>
        </section>

        <section className="rep-offline-card">
          <div className="rep-offline-section-title"><div><WalletCards size={18} /><h2>Offline collection</h2></div></div>
          <form onSubmit={saveCollectionDraft} className="rep-offline-form">
            <label><span>Shop</span><select value={collection.shopId} onChange={(event) => setCollection({ ...collection, shopId: event.target.value })}><option value="">Select shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} - {shop.shopName} · Rs. {money(shop.currentOutstanding)}</option>)}</select></label>
            <label><span>Amount</span><input type="number" min="0" step="0.01" value={collection.amount} onChange={(event) => setCollection({ ...collection, amount: event.target.value })} placeholder="0.00" /></label>
            <label><span>Method</span><select value={collection.method} onChange={(event) => setCollection({ ...collection, method: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}</select></label>
            <label><span>Reference</span><input value={collection.reference} onChange={(event) => setCollection({ ...collection, reference: event.target.value })} placeholder="Receipt / cheque / transfer ref" /></label>
            <label className="full"><span>Notes</span><textarea value={collection.notes} onChange={(event) => setCollection({ ...collection, notes: event.target.value })} /></label>
            <button className="rep-offline-primary" type="submit"><Save size={17} /> Save Collection Draft</button>
          </form>
        </section>

        <section className="rep-offline-card">
          <div className="rep-offline-section-title"><div><PackageCheck size={18} /><h2>Offline quick supply</h2></div></div>
          <form onSubmit={saveSupplyDraft} className="rep-offline-form">
            <label><span>Shop</span><select value={supply.shopId} onChange={(event) => setSupply({ ...supply, shopId: event.target.value })}><option value="">Select shop</option>{shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} - {shop.shopName}</option>)}</select></label>
            <label><span>Product</span><select value={supply.productId} onChange={(event) => { const product = products.find((item) => item.id === event.target.value); setSupply({ ...supply, productId: event.target.value, unitPrice: product?.salePrice || supply.unitPrice }); }}><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.sku} - {product.name}</option>)}</select></label>
            <label><span>Qty</span><input type="number" min="0" step="0.001" value={supply.qty} onChange={(event) => setSupply({ ...supply, qty: event.target.value })} /></label>
            <label><span>Free qty</span><input type="number" min="0" step="0.001" value={supply.freeQty} onChange={(event) => setSupply({ ...supply, freeQty: event.target.value })} /></label>
            <label><span>Unit price</span><input type="number" min="0" step="0.01" value={supply.unitPrice} onChange={(event) => setSupply({ ...supply, unitPrice: event.target.value })} /></label>
            <label><span>Paid now</span><input type="number" min="0" step="0.01" value={supply.paid} onChange={(event) => setSupply({ ...supply, paid: event.target.value })} /></label>
            <label><span>Payment method</span><select value={supply.paymentMethod} onChange={(event) => setSupply({ ...supply, paymentMethod: event.target.value })}>{paymentMethods.map((method) => <option key={method} value={method}>{method.replaceAll('_', ' ')}</option>)}</select></label>
            <label className="full"><span>Notes</span><textarea value={supply.notes} onChange={(event) => setSupply({ ...supply, notes: event.target.value })} /></label>
            <button className="rep-offline-primary" type="submit"><Save size={17} /> Save Supply Draft</button>
          </form>
        </section>

        <section className="rep-offline-card">
          <div className="rep-offline-section-title"><div><Truck size={18} /><h2>Offline day closing</h2></div></div>
          <form onSubmit={saveClosingDraft} className="rep-offline-form compact">
            {['cashCollected', 'chequeCollected', 'creditSales', 'routeExpense', 'soldValue', 'returnedValue', 'damagedValue', 'missingValue'].map((field) => (
              <label key={field}><span>{field.replace(/([A-Z])/g, ' $1')}</span><input type="number" min="0" step="0.01" value={closing[field]} onChange={(event) => setClosing({ ...closing, [field]: event.target.value })} /></label>
            ))}
            <label className="full"><span>Notes</span><textarea value={closing.notes} onChange={(event) => setClosing({ ...closing, notes: event.target.value })} /></label>
            <button className="rep-offline-primary" type="submit"><Save size={17} /> Save Closing Draft</button>
          </form>
        </section>
      </div>

      <section className="rep-offline-card queue-card">
        <div className="rep-offline-section-title">
          <div><FileClock size={18} /><h2>Offline queue</h2></div>
          <div className="rep-offline-queue-actions">
            <button className="rep-offline-secondary" onClick={syncNow} disabled={syncing || pendingCount === 0}>{syncing ? <Loader2 className="spin" size={16} /> : <RefreshCcw size={16} />} Sync</button>
            <button className="rep-offline-secondary" onClick={() => { clearSyncedDrafts(); refreshQueue(); }}><BadgeCheck size={16} /> Clear synced</button>
            <button className="rep-offline-danger" onClick={() => { if (confirm('Clear all offline drafts?')) { clearAllOfflineDrafts(); refreshQueue(); } }}><Trash2 size={16} /> Clear all</button>
          </div>
        </div>
        {queue.length === 0 ? (
          <div className="rep-offline-empty"><CloudOff size={34} /><strong>No offline drafts yet</strong><span>Save a visit, collection, supply or closing draft while offline.</span></div>
        ) : (
          <div className="rep-offline-draft-list">
            {queuePager.pageItems.map((draft) => <DraftCard key={draft.id} draft={draft} onRemove={removeDraft} />)}
          </div>
        )}
        <PaginationBar {...queuePager} label="drafts" />
      </section>

      <section className="rep-offline-guide">
        <Box size={18} />
        <span>Best practice: cache route data in the morning, work offline during route visits, then sync before daily closing.</span>
      </section>
    </div>
  );
}
