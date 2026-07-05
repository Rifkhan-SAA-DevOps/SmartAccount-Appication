import { useEffect, useMemo, useState } from 'react';
import {
  BadgePercent,
  Calculator,
  CheckCircle2,
  Gift,
  Package,
  Plus,
  RefreshCcw,
  Route,
  Search,
  Store,
  Tag,
  XCircle
} from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './TradeOffers.css';

const blankOffer = {
  name: '',
  offerType: 'BUY_X_GET_Y',
  appliesTo: 'ALL_SHOPS',
  status: 'ACTIVE',
  productId: '',
  freeProductId: '',
  shopId: '',
  routeId: '',
  minQty: 0,
  minAmount: 0,
  buyQty: 10,
  freeQty: 1,
  discountType: 'NONE',
  discountValue: 0,
  priority: 10,
  notes: ''
};

const blankPrice = {
  productId: '',
  shopId: '',
  routeId: '',
  priceType: 'SHOP_SPECIAL',
  unitPrice: '',
  minQty: 0,
  priority: 10,
  notes: ''
};

function currency(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function DateBadge({ startDate, endDate }) {
  return (
    <span className="trade-date-badge">
      {startDate ? new Date(startDate).toLocaleDateString() : 'Today'}
      {endDate ? ` → ${new Date(endDate).toLocaleDateString()}` : ' → ongoing'}
    </span>
  );
}

export default function TradeOffers() {
  const [summary, setSummary] = useState(null);
  const [master, setMaster] = useState({ products: [], shops: [], routes: [], customers: [], offerTypes: [], appliesTo: [], priceTypes: [] });
  const [offers, setOffers] = useState([]);
  const [prices, setPrices] = useState([]);
  const [offerForm, setOfferForm] = useState(blankOffer);
  const [priceForm, setPriceForm] = useState(blankPrice);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('offers');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [summaryRes, masterRes, offersRes, pricesRes] = await Promise.all([
        api.get('/trade-offers/summary'),
        api.get('/trade-offers/master-data'),
        api.get('/trade-offers/offers'),
        api.get('/trade-offers/price-list')
      ]);
      setSummary(summaryRes.data || {});
      setMaster(masterRes.data || master);
      setOffers(Array.isArray(offersRes.data) ? offersRes.data : []);
      setPrices(Array.isArray(pricesRes.data) ? pricesRes.data : []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load trade offers');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filteredOffers = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return offers;
    return offers.filter((offer) => [offer.offerNo, offer.name, offer.offerType, offer.productName, offer.shopName, offer.routeName].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [offers, query]);

  const filteredPrices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return prices;
    return prices.filter((price) => [price.priceNo, price.priceType, price.productName, price.shopName, price.routeName, price.notes].filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [prices, query]);

  const offerPager = useClientPagination(filteredOffers, { initialPageSize: 6, resetKey: `offers-${query}-${filteredOffers.length}` });
  const pricePager = useClientPagination(filteredPrices, { initialPageSize: 10, resetKey: `prices-${query}-${filteredPrices.length}` });

  function updateOffer(field, value) {
    setOfferForm((form) => ({ ...form, [field]: value }));
  }

  function updatePrice(field, value) {
    setPriceForm((form) => ({ ...form, [field]: value }));
  }

  async function submitOffer(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...offerForm,
        productId: offerForm.productId || null,
        freeProductId: offerForm.freeProductId || null,
        shopId: offerForm.shopId || null,
        routeId: offerForm.routeId || null,
        customerId: null,
        customerGroup: null,
        minQty: Number(offerForm.minQty || 0),
        minAmount: Number(offerForm.minAmount || 0),
        buyQty: Number(offerForm.buyQty || 0),
        freeQty: Number(offerForm.freeQty || 0),
        discountValue: Number(offerForm.discountValue || 0),
        priority: Number(offerForm.priority || 10)
      };
      await api.post('/trade-offers/offers', payload);
      setOfferForm(blankOffer);
      setTab('offers');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save offer');
    } finally {
      setSaving(false);
    }
  }

  async function submitPrice(event) {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const payload = {
        ...priceForm,
        productId: priceForm.productId || null,
        shopId: priceForm.shopId || null,
        routeId: priceForm.routeId || null,
        customerId: null,
        unitPrice: Number(priceForm.unitPrice || 0),
        minQty: Number(priceForm.minQty || 0),
        priority: Number(priceForm.priority || 10)
      };
      await api.post('/trade-offers/price-list', payload);
      setPriceForm(blankPrice);
      setTab('prices');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save price rule');
    } finally {
      setSaving(false);
    }
  }

  async function changeOfferStatus(id, status) {
    try {
      await api.patch(`/trade-offers/offers/${id}/status`, { status });
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update status');
    }
  }

  const products = master.products || [];
  const shops = master.shops || [];
  const routes = master.routes || [];

  return (
    <div className="trade-page">
      <div className="trade-hero">
        <div>
          <span className="trade-eyebrow"><Gift size={16} /> Version 6.4</span>
          <h1>Trade Offers & Shop Price Lists</h1>
          <p>Manage buy-X-get-Y offers, free item schemes, dealer prices, route prices and special shop prices for your distribution business.</p>
        </div>
        <button type="button" className="trade-refresh" onClick={load} disabled={loading}>
          <RefreshCcw size={17} /> Refresh
        </button>
      </div>

      {error && <div className="trade-alert"><XCircle size={17} /> {error}</div>}

      <div className="trade-summary-grid">
        <div className="trade-summary-card pink"><BadgePercent /><span>Active offers</span><strong>{summary?.activeOffers || 0}</strong></div>
        <div className="trade-summary-card amber"><Tag /><span>Active price rules</span><strong>{summary?.activePrices || 0}</strong></div>
        <div className="trade-summary-card green"><Gift /><span>Free qty given</span><strong>{summary?.freeQtyGiven || 0}</strong></div>
        <div className="trade-summary-card blue"><Calculator /><span>Discount given</span><strong>Rs. {currency(summary?.discountGiven)}</strong></div>
      </div>

      <div className="trade-toolbar">
        <div className="trade-tabs">
          <button className={tab === 'offers' ? 'active' : ''} onClick={() => setTab('offers')}><BadgePercent size={16} /> Offers</button>
          <button className={tab === 'prices' ? 'active' : ''} onClick={() => setTab('prices')}><Tag size={16} /> Price Lists</button>
          <button className={tab === 'new-offer' ? 'active' : ''} onClick={() => setTab('new-offer')}><Plus size={16} /> New Offer</button>
          <button className={tab === 'new-price' ? 'active' : ''} onClick={() => setTab('new-price')}><Plus size={16} /> New Price</button>
        </div>
        <label className="trade-search"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search offers or price rules..." /></label>
      </div>

      {tab === 'offers' && (
        <div className="trade-list-grid">
          {offerPager.pageItems.map((offer) => (
            <article className="trade-offer-card" key={offer.id}>
              <div className="trade-card-top">
                <span className={`trade-status ${offer.status?.toLowerCase()}`}>{offer.status}</span>
                <DateBadge startDate={offer.startDate} endDate={offer.endDate} />
              </div>
              <h3>{offer.name}</h3>
              <p>{offer.offerNo} · {offer.offerType?.replaceAll('_', ' ')} · Applies to {offer.appliesTo?.replaceAll('_', ' ')}</p>
              <div className="trade-mini-grid">
                <span><Package size={15} /> {offer.productName || 'Any product'}</span>
                <span><Gift size={15} /> {offer.freeProductName || offer.productName || 'Same product'}</span>
                <span><Store size={15} /> {offer.shopName || 'All shops'}</span>
                <span><Route size={15} /> {offer.routeName || 'All routes'}</span>
              </div>
              <div className="trade-offer-rule">
                {offer.offerType === 'BUY_X_GET_Y' && <>Buy <b>{offer.buyQty}</b> get <b>{offer.freeQty}</b> free</>}
                {offer.offerType === 'PERCENT_DISCOUNT' && <>Discount <b>{offer.discountValue}%</b></>}
                {offer.offerType === 'AMOUNT_DISCOUNT' && <>Discount <b>Rs. {currency(offer.discountValue)}</b></>}
                {offer.offerType === 'BULK_PRICE' && <>Bulk price <b>Rs. {currency(offer.discountValue)}</b></>}
              </div>
              <div className="trade-card-actions">
                {offer.status === 'ACTIVE'
                  ? <button onClick={() => changeOfferStatus(offer.id, 'PAUSED')}><XCircle size={15} /> Pause</button>
                  : <button onClick={() => changeOfferStatus(offer.id, 'ACTIVE')}><CheckCircle2 size={15} /> Activate</button>}
              </div>
            </article>
          ))}
          {!filteredOffers.length && <div className="trade-empty">No trade offers found.</div>}
          <div className="trade-pager"><PaginationBar {...offerPager} label="offers" /></div>
        </div>
      )}

      {tab === 'prices' && (
        <div className="trade-table-card">
          <table className="trade-table">
            <thead><tr><th>Price No</th><th>Product</th><th>Scope</th><th>Type</th><th>Min Qty</th><th>Unit Price</th><th>Status</th></tr></thead>
            <tbody>
              {pricePager.pageItems.map((price) => (
                <tr key={price.id}>
                  <td>{price.priceNo}</td>
                  <td><strong>{price.productName}</strong><small>{price.productSku}</small></td>
                  <td>{price.shopName || price.routeName || price.customerName || 'General'}</td>
                  <td>{price.priceType?.replaceAll('_', ' ')}</td>
                  <td>{price.minQty}</td>
                  <td>Rs. {currency(price.unitPrice)}</td>
                  <td><span className={`trade-status ${price.isActive ? 'active' : 'paused'}`}>{price.isActive ? 'ACTIVE' : 'INACTIVE'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!filteredPrices.length && <div className="trade-empty">No price rules found.</div>}
          <PaginationBar {...pricePager} label="price rules" />
        </div>
      )}

      {tab === 'new-offer' && (
        <form className="trade-form-card" onSubmit={submitOffer}>
          <h2>Create trade offer</h2>
          <div className="trade-form-grid">
            <label>Offer name<input value={offerForm.name} onChange={(e) => updateOffer('name', e.target.value)} required placeholder="Buy 10 get 1 free" /></label>
            <label>Offer type<select value={offerForm.offerType} onChange={(e) => updateOffer('offerType', e.target.value)}>{(master.offerTypes || []).map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Applies to<select value={offerForm.appliesTo} onChange={(e) => updateOffer('appliesTo', e.target.value)}>{(master.appliesTo || []).map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Product<select value={offerForm.productId} onChange={(e) => updateOffer('productId', e.target.value)}><option value="">Any product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Free product<select value={offerForm.freeProductId} onChange={(e) => updateOffer('freeProductId', e.target.value)}><option value="">Same product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Shop<select value={offerForm.shopId} onChange={(e) => updateOffer('shopId', e.target.value)}><option value="">All shops</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopName}</option>)}</select></label>
            <label>Route<select value={offerForm.routeId} onChange={(e) => updateOffer('routeId', e.target.value)}><option value="">All routes</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.routeNo} - {r.name}</option>)}</select></label>
            <label>Buy qty<input type="number" min="0" step="0.001" value={offerForm.buyQty} onChange={(e) => updateOffer('buyQty', e.target.value)} /></label>
            <label>Free qty<input type="number" min="0" step="0.001" value={offerForm.freeQty} onChange={(e) => updateOffer('freeQty', e.target.value)} /></label>
            <label>Min qty<input type="number" min="0" step="0.001" value={offerForm.minQty} onChange={(e) => updateOffer('minQty', e.target.value)} /></label>
            <label>Min amount<input type="number" min="0" step="0.01" value={offerForm.minAmount} onChange={(e) => updateOffer('minAmount', e.target.value)} /></label>
            <label>Discount / bulk value<input type="number" min="0" step="0.01" value={offerForm.discountValue} onChange={(e) => updateOffer('discountValue', e.target.value)} /></label>
          </div>
          <label className="trade-wide">Notes<textarea value={offerForm.notes} onChange={(e) => updateOffer('notes', e.target.value)} placeholder="Offer conditions, route details or manager note" /></label>
          <button className="trade-primary" disabled={saving}><Plus size={17} /> Save offer</button>
        </form>
      )}

      {tab === 'new-price' && (
        <form className="trade-form-card" onSubmit={submitPrice}>
          <h2>Create shop price rule</h2>
          <div className="trade-form-grid">
            <label>Product<select value={priceForm.productId} onChange={(e) => updatePrice('productId', e.target.value)} required><option value="">Select product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label>Price type<select value={priceForm.priceType} onChange={(e) => updatePrice('priceType', e.target.value)}>{(master.priceTypes || []).map((type) => <option key={type}>{type}</option>)}</select></label>
            <label>Shop<select value={priceForm.shopId} onChange={(e) => updatePrice('shopId', e.target.value)}><option value="">All shops</option>{shops.map((s) => <option key={s.id} value={s.id}>{s.shopName}</option>)}</select></label>
            <label>Route<select value={priceForm.routeId} onChange={(e) => updatePrice('routeId', e.target.value)}><option value="">All routes</option>{routes.map((r) => <option key={r.id} value={r.id}>{r.routeNo} - {r.name}</option>)}</select></label>
            <label>Unit price<input type="number" min="0" step="0.01" value={priceForm.unitPrice} onChange={(e) => updatePrice('unitPrice', e.target.value)} required /></label>
            <label>Min qty<input type="number" min="0" step="0.001" value={priceForm.minQty} onChange={(e) => updatePrice('minQty', e.target.value)} /></label>
            <label>Priority<input type="number" min="1" value={priceForm.priority} onChange={(e) => updatePrice('priority', e.target.value)} /></label>
          </div>
          <label className="trade-wide">Notes<textarea value={priceForm.notes} onChange={(e) => updatePrice('notes', e.target.value)} placeholder="Special dealer price, route price or VIP shop agreement" /></label>
          <button className="trade-primary" disabled={saving}><Plus size={17} /> Save price rule</button>
        </form>
      )}
    </div>
  );
}
