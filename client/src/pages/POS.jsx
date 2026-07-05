import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clock3, CreditCard, PauseCircle, RefreshCw, ScanLine, ShoppingCart, Trash2, Wifi, WifiOff } from 'lucide-react';
import { api } from '../api/http.js';
import { openAuthenticatedPrint } from '../utils/print.js';
import {
  createClientSaleId,
  hasNetworkError,
  queueOfflinePosSale,
  readOfflinePosQueue,
  readPosCache,
  removeOfflinePosSale,
  savePosCache,
  updateOfflinePosSale
} from '../utils/offlineQueue.js';
import '../styles/daily-work-ui.css';

const emptyPayment = { method: 'CASH', paid: 0, customerId: '', warehouseId: '' };

function money(value) {
  return Number(value || 0).toFixed(2);
}

export default function POS() {
  const scanRef = useRef(null);
  const syncingRef = useRef(false);
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState([]);
  const [payment, setPayment] = useState(emptyPayment);
  const [heldBills, setHeldBills] = useState([]);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [lastInvoice, setLastInvoice] = useState(null);
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [syncStatus, setSyncStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const applyCachedPosData = useCallback(() => {
    const cache = readPosCache();
    if (Array.isArray(cache.products)) setProducts(cache.products);
    if (Array.isArray(cache.customers)) setCustomers(cache.customers);
    if (Array.isArray(cache.warehouses)) {
      setWarehouses(cache.warehouses);
      setPayment((prev) => ({ ...prev, warehouseId: prev.warehouseId || cache.warehouses.find((w) => w.isDefault)?.id || cache.warehouses[0]?.id || '' }));
    }
    if (cache.cachedAt) setSyncStatus(`Using cached POS data from ${new Date(cache.cachedAt).toLocaleString()}`);
  }, []);

  async function load() {
    applyCachedPosData();
    const [productRes, customerRes, warehouseRes] = await Promise.all([
      api.get('/products'),
      api.get('/customers'),
      api.get('/branches/warehouses').catch(() => ({ data: [] }))
    ]);
    const nextProducts = productRes.data || [];
    const nextCustomers = customerRes.data || [];
    const wh = warehouseRes.data || [];
    setProducts(nextProducts);
    setCustomers(nextCustomers);
    setWarehouses(wh);
    setPayment((prev) => ({ ...prev, warehouseId: prev.warehouseId || wh.find((w) => w.isDefault)?.id || wh[0]?.id || '' }));
    savePosCache({ products: nextProducts, customers: nextCustomers, warehouses: wh });
    setSyncStatus('POS data updated and available for offline billing.');
  }

  const refreshOfflineQueue = useCallback(() => setOfflineQueue(readOfflinePosQueue()), []);

  useEffect(() => {
    applyCachedPosData();
    load().catch((e) => {
      setError(e.response?.data?.message || 'Offline mode active. Cached POS data is being used.');
    });
    try { setHeldBills(JSON.parse(localStorage.getItem('smartledger_held_bills') || '[]')); } catch { setHeldBills([]); }
    refreshOfflineQueue();
    setTimeout(() => scanRef.current?.focus(), 300);
  }, [applyCachedPosData, refreshOfflineQueue]);

  useEffect(() => {
    const online = () => { setIsOnline(true); setSyncStatus('Back online. Ready to sync offline sales.'); };
    const offline = () => { setIsOnline(false); setSyncStatus('Offline mode. Sales will be queued on this device.'); };
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    window.addEventListener('smartledger:offline-pos-queue-changed', refreshOfflineQueue);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      window.removeEventListener('smartledger:offline-pos-queue-changed', refreshOfflineQueue);
    };
  }, [refreshOfflineQueue]);

  const filteredProducts = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products.slice(0, 24);
    return products.filter((p) => [p.name, p.sku, p.barcode].some((v) => String(v || '').toLowerCase().includes(q))).slice(0, 24);
  }, [products, query]);

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.qty * Number(item.salePrice || 0), 0), [cart]);
  const paidAmount = payment.method === 'CREDIT' ? 0 : Number(payment.paid || subtotal || 0);
  const change = Math.max(paidAmount - subtotal, 0);
  const balance = Math.max(subtotal - paidAmount, 0);

  function addProduct(product, qty = 1) {
    if (!product) return;
    setCart((prev) => {
      const existing = prev.find((item) => item.id === product.id);
      if (existing) return prev.map((item) => item.id === product.id ? { ...item, qty: item.qty + qty } : item);
      return [...prev, { ...product, qty }];
    });
    setQuery('');
    setTimeout(() => scanRef.current?.focus(), 100);
  }

  function updateQty(id, qty) {
    const n = Number(qty || 0);
    if (n <= 0) return setCart((prev) => prev.filter((item) => item.id !== id));
    setCart((prev) => prev.map((item) => item.id === id ? { ...item, qty: n } : item));
  }

  function scanSubmit(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    const exact = products.find((p) => String(p.barcode || '').toLowerCase() === q.toLowerCase() || String(p.sku || '').toLowerCase() === q.toLowerCase());
    if (exact) addProduct(exact);
    else setError('No exact barcode/SKU found. Select from product tiles below.');
  }

  function saveHeldBills(next) {
    setHeldBills(next);
    localStorage.setItem('smartledger_held_bills', JSON.stringify(next));
  }

  function holdBill() {
    if (!cart.length) return;
    const bill = { id: crypto.randomUUID(), cart, payment, total: subtotal, createdAt: new Date().toISOString() };
    saveHeldBills([bill, ...heldBills].slice(0, 20));
    setCart([]);
    setPayment((prev) => ({ ...emptyPayment, warehouseId: prev.warehouseId }));
    setLastInvoice(null);
  }

  function resumeBill(bill) {
    setCart(bill.cart || []);
    setPayment({ ...emptyPayment, ...(bill.payment || {}) });
    saveHeldBills(heldBills.filter((item) => item.id !== bill.id));
  }

  function buildSalePayload(clientSaleId = createClientSaleId()) {
    const tendered = payment.method === 'CREDIT' ? 0 : Number(paidAmount || subtotal || 0);
    return {
      clientSaleId,
      customerId: payment.customerId || null,
      warehouseId: payment.warehouseId || null,
      paid: Math.min(tendered, subtotal),
      paymentMethod: payment.method,
      notes: `Created from POS | tendered=${tendered.toFixed(2)} | change=${change.toFixed(2)}`,
      items: cart.map((item) => ({
        productId: item.id,
        description: item.name,
        qty: item.qty,
        unitPrice: Number(item.salePrice || 0),
        discount: 0
      }))
    };
  }

  function saveCurrentSaleOffline(payload) {
    queueOfflinePosSale({
      clientSaleId: payload.clientSaleId,
      payload,
      cartSnapshot: cart,
      total: subtotal,
      paymentMethod: payment.method,
      warehouseId: payment.warehouseId,
      customerId: payment.customerId
    });
    refreshOfflineQueue();
    setCart([]);
    setPayment((prev) => ({ ...emptyPayment, warehouseId: prev.warehouseId }));
    setLastInvoice(null);
    setSyncStatus('Sale saved offline. It will sync when internet is available.');
  }

  async function syncPendingSales() {
    if (syncingRef.current) return;
    const queue = readOfflinePosQueue();
    if (!queue.length) return setSyncStatus('No offline sales waiting to sync.');
    if (!navigator.onLine) return setSyncStatus('Still offline. Connect internet before syncing.');

    syncingRef.current = true;
    setLoading(true);
    setError('');
    setSyncStatus(`Syncing ${queue.length} offline sale(s)...`);

    let synced = 0;
    let failed = 0;
    for (const sale of queue) {
      try {
        updateOfflinePosSale(sale.clientSaleId, { status: 'SYNCING', attempts: Number(sale.attempts || 0) + 1, lastTriedAt: new Date().toISOString() });
        await api.post('/invoices', sale.payload);
        removeOfflinePosSale(sale.clientSaleId);
        synced += 1;
      } catch (e) {
        failed += 1;
        updateOfflinePosSale(sale.clientSaleId, { status: 'FAILED', lastError: e.response?.data?.message || e.message || 'Sync failed', lastTriedAt: new Date().toISOString() });
        if (hasNetworkError(e)) break;
      }
    }

    refreshOfflineQueue();
    if (synced) load().catch(() => null);
    setSyncStatus(`Sync completed. Synced: ${synced}. Failed: ${failed}.`);
    syncingRef.current = false;
    setLoading(false);
  }

  useEffect(() => {
    if (isOnline && offlineQueue.length) {
      const timer = setTimeout(() => syncPendingSales(), 1200);
      return () => clearTimeout(timer);
    }
  }, [isOnline, offlineQueue.length]);

  async function checkout() {
    if (!cart.length) return setError('Cart is empty');
    setLoading(true);
    setError('');
    const payload = buildSalePayload();

    if (!navigator.onLine) {
      saveCurrentSaleOffline(payload);
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.post('/invoices', payload);
      setLastInvoice(data);
      setCart([]);
      setPayment((prev) => ({ ...emptyPayment, warehouseId: prev.warehouseId }));
      await load();
      setTimeout(() => openAuthenticatedPrint(`/invoices/${data.id}/thermal-receipt`), 250);
    } catch (e) {
      if (hasNetworkError(e)) {
        saveCurrentSaleOffline(payload);
      } else {
        setError(e.response?.data?.message || 'Failed to complete POS sale');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page pos-page">
      <section className="panel pos-top-panel">
        <div>
          <span className="workflow-kicker"><ScanLine size={16} /> Counter Sales</span>
          <h1>Fast POS</h1>
          <p>Scan barcode/SKU, select products, hold bills, print receipts and continue selling even if the internet disconnects.</p>
          <div className="pos-status-row">
            <span className={`status-pill ${isOnline ? 'online' : 'offline'}`}>
              {isOnline ? <Wifi size={14} /> : <WifiOff size={14} />} {isOnline ? 'Online' : 'Offline Mode'}
            </span>
            <span className="queue-pill"><Clock3 size={14} /> Offline queue: {offlineQueue.length}</span>
            {syncStatus && <span className="sync-text">{syncStatus}</span>}
          </div>
        </div>
        <div className="actions-row">
          <button className="ghost-btn" type="button" onClick={() => setCart([])}><Trash2 size={16} /> Clear Cart</button>
          <button className="secondary-btn" type="button" onClick={holdBill} disabled={!cart.length}><PauseCircle size={16} /> Hold Bill</button>
          <button className="secondary-btn" type="button" onClick={syncPendingSales} disabled={loading || !offlineQueue.length || !isOnline}><RefreshCw size={16} /> Sync Pending</button>
          <button className="primary-btn" type="button" onClick={checkout} disabled={loading || !cart.length}>{loading ? 'Saving...' : isOnline ? 'Complete Sale' : 'Save Offline'}</button>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <section className="workflow-stat-grid">
        <div className="workflow-stat-card blue">
          <div className="workflow-stat-icon"><ShoppingCart size={20} /></div>
          <span>Cart items</span>
          <strong>{cart.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</strong>
          <small>{cart.length} product lines</small>
        </div>
        <div className="workflow-stat-card green">
          <div className="workflow-stat-icon"><CreditCard size={20} /></div>
          <span>Bill total</span>
          <strong>LKR {money(subtotal)}</strong>
          <small>Current customer bill</small>
        </div>
        <div className="workflow-stat-card orange">
          <div className="workflow-stat-icon"><PauseCircle size={20} /></div>
          <span>Held bills</span>
          <strong>{heldBills.length}</strong>
          <small>Paused bills saved locally</small>
        </div>
        <div className="workflow-stat-card">
          <div className="workflow-stat-icon"><Clock3 size={20} /></div>
          <span>Offline queue</span>
          <strong>{offlineQueue.length}</strong>
          <small>Bills waiting to sync</small>
        </div>
      </section>

      <div className="pos-layout">
        <section className="panel pos-left">
          <div className="workflow-panel-head">
            <div>
              <h2><ScanLine size={20} /> Add Products</h2>
              <p>Scan barcode or type product name/SKU. Tap a tile to add it to the current bill.</p>
            </div>
            <span className="workflow-pill dark">Showing {filteredProducts.length}</span>
          </div>

          <form onSubmit={scanSubmit} className="scanner-bar">
            <input ref={scanRef} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Scan barcode / type SKU / search product" />
            <button className="primary-btn" type="submit">Add</button>
          </form>

          <div className="product-tile-grid">
            {filteredProducts.map((product) => (
              <button className="product-tile" type="button" key={product.id} onClick={() => addProduct(product)}>
                <strong>{product.name}</strong>
                <span>{product.sku || product.barcode || 'No code'}</span>
                <b>LKR {money(product.salePrice)}</b>
                <small>Stock: {Number(product.stockQty || 0)}</small>
              </button>
            ))}
            {!filteredProducts.length && <div className="workflow-empty-state">No products found for this search.</div>}
          </div>
        </section>

        <section className="panel pos-cart-panel">
          <div className="workflow-panel-head">
            <div>
              <h2><ShoppingCart size={20} /> Current Bill</h2>
              <p>Review quantities, customer and payment before completing the sale.</p>
            </div>
          </div>

          <div className="cart-lines">
            {cart.map((item) => (
              <div className="cart-line" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>LKR {money(item.salePrice)} each</span>
                </div>
                <input type="number" min="0" step="1" value={item.qty} onChange={(e) => updateQty(item.id, e.target.value)} />
                <b>LKR {money(item.qty * Number(item.salePrice || 0))}</b>
              </div>
            ))}
            {!cart.length && <div className="empty-cart">No products added yet. Scan or tap a product tile.</div>}
          </div>

          <div className="payment-box">
            <label>Customer
              <select value={payment.customerId} onChange={(e) => setPayment({ ...payment, customerId: e.target.value })}>
                <option value="">Walk-in Customer</option>
                {customers.map((c) => <option value={c.id} key={c.id}>{c.name} {c.phone ? `- ${c.phone}` : ''}</option>)}
              </select>
            </label>
            <label>Warehouse
              <select value={payment.warehouseId} onChange={(e) => setPayment({ ...payment, warehouseId: e.target.value })}>
                {warehouses.map((w) => <option value={w.id} key={w.id}>{w.name}</option>)}
              </select>
            </label>
            <label>Payment Method
              <select value={payment.method} onChange={(e) => setPayment({ ...payment, method: e.target.value, paid: e.target.value === 'CREDIT' ? 0 : subtotal })}>
                <option value="CASH">Cash</option>
                <option value="CARD">Card</option>
                <option value="BANK_TRANSFER">Bank Transfer</option>
                <option value="ONLINE">Online</option>
                <option value="CREDIT">Credit</option>
              </select>
            </label>
            <label>Paid Amount
              <input type="number" value={payment.method === 'CREDIT' ? 0 : payment.paid || subtotal} disabled={payment.method === 'CREDIT'} onChange={(e) => setPayment({ ...payment, paid: e.target.value })} />
            </label>
          </div>

          <div className="pos-total-box">
            <div><span>Subtotal</span><b>LKR {money(subtotal)}</b></div>
            <div><span>Paid</span><b>LKR {money(paidAmount)}</b></div>
            <div><span>Balance</span><b>LKR {money(balance)}</b></div>
            <div><span>Change</span><b>LKR {money(change)}</b></div>
          </div>

          <button className="primary-btn full-width" type="button" onClick={checkout} disabled={loading || !cart.length}>{loading ? 'Saving...' : isOnline ? 'Complete Sale & Print' : 'Save Bill Offline'}</button>

          {lastInvoice && (
            <button className="secondary-btn full-width" type="button" onClick={() => openAuthenticatedPrint(`/invoices/${lastInvoice.id}/thermal-receipt`)}>
              Reprint Last Receipt {lastInvoice.invoiceNo}
            </button>
          )}
        </section>
      </div>

      {!!offlineQueue.length && (
        <section className="panel offline-queue-panel">
          <div className="workflow-panel-head">
            <div>
              <h2><RefreshCw size={20} /> Offline POS Queue</h2>
              <p>These bills are stored on this device. Keep this browser data until they sync.</p>
            </div>
            <button className="primary-btn" type="button" onClick={syncPendingSales} disabled={!isOnline || loading}>Sync Now</button>
          </div>
          <div className="offline-sale-grid">
            {offlineQueue.map((sale) => (
              <div className="offline-sale-card" key={sale.clientSaleId}>
                <strong>LKR {money(sale.total)}</strong>
                <span>{sale.cartSnapshot?.length || sale.payload?.items?.length || 0} item lines • {sale.paymentMethod}</span>
                <small>{sale.status || 'PENDING'} • {new Date(sale.queuedAt).toLocaleString()}</small>
                {sale.lastError && <em>{sale.lastError}</em>}
              </div>
            ))}
          </div>
        </section>
      )}

      {!!heldBills.length && (
        <section className="panel held-bills-panel">
          <div className="workflow-panel-head">
            <div>
              <h2><PauseCircle size={20} /> Held Bills</h2>
              <p>Tap a held bill to resume it and continue checkout.</p>
            </div>
          </div>
          <div className="held-bills-grid">
            {heldBills.map((bill) => (
              <button className="held-bill" type="button" key={bill.id} onClick={() => resumeBill(bill)}>
                <strong>LKR {money(bill.total)}</strong>
                <span>{bill.cart?.length || 0} item lines</span>
                <small>{new Date(bill.createdAt).toLocaleString()}</small>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
