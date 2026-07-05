import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArchiveRestore, Boxes, CalendarClock, FileText, PackageCheck, Plus, RefreshCw, Route, Search, Store, Truck, Undo2 } from 'lucide-react';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './ShopReturns.css';

const emptyItem = { productId: '', description: '', qty: 1, unitPrice: 0, discount: 0, condition: 'DAMAGED', batchNo: '', expiryDate: '', notes: '' };
const emptyForm = {
  shopId: '', routeId: '', employeeId: '', vanId: '', warehouseId: '', supplyInvoiceId: '',
  returnType: 'DAMAGED', stockAction: 'HOLD', returnDate: '', reason: '', notes: '', discount: 0, creditAmount: '', items: [{ ...emptyItem }]
};

function currency(value) {
  return `Rs. ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function shortDate(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function nice(text) { return String(text || '').replaceAll('_', ' '); }

export default function ShopReturns() {
  const [summary, setSummary] = useState(null);
  const [master, setMaster] = useState({ shops: [], routes: [], employees: [], vans: [], warehouses: [], products: [], supplies: [], returnTypes: [], stockActions: [] });
  const [returns, setReturns] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', returnType: '', shopId: '' });
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== ''));
    const [summaryRes, masterRes, returnsRes] = await Promise.all([
      api.get('/shop-returns/summary'),
      api.get('/shop-returns/master-data'),
      api.get('/shop-returns/returns', { params })
    ]);
    setSummary(summaryRes.data);
    setMaster(masterRes.data || { shops: [], routes: [], employees: [], vans: [], warehouses: [], products: [], supplies: [] });
    setReturns(returnsRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load shop returns')); }, []);

  const selectedShop = useMemo(() => master.shops.find((shop) => shop.id === form.shopId), [master.shops, form.shopId]);
  const returnPager = useClientPagination(returns, { initialPageSize: 10, resetKey: `${filters.q}-${filters.status}-${filters.returnType}-${filters.shopId}-${returns.length}` });

  const totals = useMemo(() => {
    const subtotal = form.items.reduce((sum, item) => sum + (Number(item.qty || 0) * Number(item.unitPrice || 0)) - Number(item.discount || 0), 0);
    const discount = Number(form.discount || 0);
    const total = Math.max(subtotal - discount, 0);
    const creditAmount = form.creditAmount === '' ? total : Number(form.creditAmount || 0);
    return { subtotal, discount, total, creditAmount };
  }, [form.items, form.discount, form.creditAmount]);

  function flash(text) {
    setMessage(text);
    setTimeout(() => setMessage(''), 3500);
  }

  function updateForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function selectShop(shopId) {
    const shop = master.shops.find((s) => s.id === shopId);
    setForm((current) => ({
      ...current,
      shopId,
      routeId: shop?.routeId || current.routeId,
      employeeId: shop?.assignedEmployeeId || current.employeeId
    }));
  }

  function selectSupply(supplyId) {
    const supply = master.supplies.find((s) => s.id === supplyId);
    setForm((current) => ({
      ...current,
      supplyInvoiceId: supplyId,
      shopId: supply?.shopId || current.shopId,
      routeId: supply?.routeId || current.routeId,
      employeeId: supply?.employeeId || current.employeeId,
      vanId: supply?.vanId || current.vanId,
      warehouseId: supply?.warehouseId || current.warehouseId
    }));
  }

  function updateItem(index, key, value) {
    setForm((current) => {
      const items = current.items.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [key]: value };
        if (key === 'productId') {
          const product = master.products.find((p) => p.id === value);
          updated.description = product?.name || updated.description;
          updated.unitPrice = Number(product?.salePrice || updated.unitPrice || 0);
        }
        return updated;
      });
      return { ...current, items };
    });
  }

  function addItem() { setForm((current) => ({ ...current, items: [...current.items, { ...emptyItem }] })); }
  function removeItem(index) { setForm((current) => ({ ...current, items: current.items.filter((_, i) => i !== index) || [{ ...emptyItem }] })); }

  async function submit(status) {
    setSaving(true);
    setError('');
    try {
      const payload = { ...form, status, creditAmount: totals.creditAmount, returnDate: form.returnDate || undefined, items: form.items.filter((item) => item.description && Number(item.qty) > 0) };
      await api.post('/shop-returns/returns', payload);
      setForm(emptyForm);
      await load();
      flash(status === 'POSTED' ? 'Shop return posted and balances updated' : 'Shop return saved as draft');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save shop return');
    } finally {
      setSaving(false);
    }
  }

  async function postReturn(id) {
    setSaving(true);
    setError('');
    try {
      await api.post(`/shop-returns/returns/${id}/post`);
      await load();
      flash('Return posted successfully');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to post return');
    } finally { setSaving(false); }
  }

  async function cancelReturn(id) {
    setSaving(true);
    setError('');
    try {
      await api.post(`/shop-returns/returns/${id}/cancel`);
      await load();
      flash('Draft return cancelled');
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cancel return');
    } finally { setSaving(false); }
  }

  return (
    <div className="shop-returns-page">
      <section className="sr-hero">
        <div>
          <span className="sr-kicker"><Undo2 size={16} /> Distribution returns</span>
          <h1>Shop Returns / Damage / Expiry</h1>
          <p>Record products returned by shops, create credit notes, update shop outstanding, and return saleable stock back to warehouse.</p>
        </div>
        <button className="sr-refresh" onClick={() => load().catch((e) => setError(e.response?.data?.message || 'Failed to refresh'))}>
          <RefreshCw size={18} /> Refresh
        </button>
      </section>

      {error && <div className="sr-alert error"><AlertTriangle size={17} /> {error}</div>}
      {message && <div className="sr-alert success"><PackageCheck size={17} /> {message}</div>}

      <section className="sr-cards">
        <article><FileText size={20} /><span>Total returns</span><strong>{summary?.totalCount || 0}</strong><small>{currency(summary?.totalValue)}</small></article>
        <article><ArchiveRestore size={20} /><span>Credit notes</span><strong>{currency(summary?.totalCredit)}</strong><small>{summary?.postedCount || 0} posted</small></article>
        <article><AlertTriangle size={20} /><span>Damage / expiry</span><strong>{(summary?.damagedCount || 0) + (summary?.expiredCount || 0)}</strong><small>Needs action</small></article>
        <article><Boxes size={20} /><span>Saleable returns</span><strong>{summary?.saleableCount || 0}</strong><small>Can return to stock</small></article>
      </section>

      <section className="sr-grid">
        <form className="sr-panel sr-form" onSubmit={(e) => { e.preventDefault(); submit('DRAFT'); }}>
          <div className="sr-panel-head"><div><h2>New shop return</h2><p>Save as draft or post immediately.</p></div><Plus size={19} /></div>

          <div className="sr-fields three">
            <label>Shop<select value={form.shopId} onChange={(e) => selectShop(e.target.value)} required><option value="">Select shop</option>{master.shops.map((shop) => <option key={shop.id} value={shop.id}>{shop.shopCode} — {shop.shopName}</option>)}</select></label>
            <label>From supply invoice<select value={form.supplyInvoiceId} onChange={(e) => selectSupply(e.target.value)}><option value="">Optional</option>{master.supplies.map((s) => <option key={s.id} value={s.id}>{s.supplyNo} — {currency(s.balance)} balance</option>)}</select></label>
            <label>Warehouse<select value={form.warehouseId} onChange={(e) => updateForm('warehouseId', e.target.value)}><option value="">Default warehouse</option>{master.warehouses.map((w) => <option key={w.id} value={w.id}>{w.code || ''} {w.name}</option>)}</select></label>
          </div>

          <div className="sr-fields four">
            <label>Route<select value={form.routeId} onChange={(e) => updateForm('routeId', e.target.value)}><option value="">Auto / none</option>{master.routes.map((r) => <option key={r.id} value={r.id}>{r.routeNo} — {r.name}</option>)}</select></label>
            <label>Sales rep<select value={form.employeeId} onChange={(e) => updateForm('employeeId', e.target.value)}><option value="">Auto / none</option>{master.employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.employeeNo || ''} {emp.name}</option>)}</select></label>
            <label>Van<select value={form.vanId} onChange={(e) => updateForm('vanId', e.target.value)}><option value="">Optional</option>{master.vans.map((v) => <option key={v.id} value={v.id}>{v.vanNo} — {v.name}</option>)}</select></label>
            <label>Date<input type="date" value={form.returnDate} onChange={(e) => updateForm('returnDate', e.target.value)} /></label>
          </div>

          <div className="sr-fields four">
            <label>Return type<select value={form.returnType} onChange={(e) => updateForm('returnType', e.target.value)}>{master.returnTypes.map((type) => <option key={type} value={type}>{nice(type)}</option>)}</select></label>
            <label>Stock action<select value={form.stockAction} onChange={(e) => updateForm('stockAction', e.target.value)}>{master.stockActions.map((action) => <option key={action} value={action}>{nice(action)}</option>)}</select></label>
            <label>Discount<input type="number" min="0" value={form.discount} onChange={(e) => updateForm('discount', e.target.value)} /></label>
            <label>Credit amount<input type="number" min="0" value={form.creditAmount} onChange={(e) => updateForm('creditAmount', e.target.value)} placeholder={String(totals.total)} /></label>
          </div>

          {selectedShop && <div className="sr-shop-strip"><Store size={17} /><b>{selectedShop.shopName}</b><span>Outstanding: {currency(selectedShop.currentOutstanding)}</span><span>Credit limit: {currency(selectedShop.creditLimit)}</span></div>}

          <div className="sr-items">
            {form.items.map((item, index) => (
              <div className="sr-item" key={index}>
                <select value={item.productId} onChange={(e) => updateItem(index, 'productId', e.target.value)}><option value="">Manual item</option>{master.products.map((p) => <option key={p.id} value={p.id}>{p.sku || ''} {p.name}</option>)}</select>
                <input placeholder="Description" value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} required />
                <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => updateItem(index, 'qty', e.target.value)} />
                <input type="number" min="0" value={item.unitPrice} onChange={(e) => updateItem(index, 'unitPrice', e.target.value)} />
                <select value={item.condition} onChange={(e) => updateItem(index, 'condition', e.target.value)}><option>SALEABLE</option><option>DAMAGED</option><option>EXPIRED</option><option>UNSOLD</option><option>WRONG_DELIVERY</option></select>
                <button type="button" onClick={() => removeItem(index)}>Remove</button>
              </div>
            ))}
            <button type="button" className="sr-add" onClick={addItem}>+ Add item</button>
          </div>

          <label>Reason<input value={form.reason} onChange={(e) => updateForm('reason', e.target.value)} placeholder="Expired stock, damaged, slow moving, wrong item..." /></label>
          <label>Notes<textarea value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Extra notes for warehouse/accounting" /></label>

          <div className="sr-total-bar"><span>Subtotal {currency(totals.subtotal)}</span><span>Total {currency(totals.total)}</span><strong>Credit {currency(totals.creditAmount)}</strong></div>
          <div className="sr-actions"><button disabled={saving}>Save draft</button><button type="button" disabled={saving} onClick={() => submit('POSTED')}>Save & post</button></div>
        </form>

        <aside className="sr-panel sr-tips">
          <h3>Return handling guide</h3>
          <p><b>RETURN_TO_WAREHOUSE</b> increases product stock. Use only for saleable/unsold/wrong-delivery items.</p>
          <p><b>HOLD</b> records damaged/expired items without increasing stock.</p>
          <p><b>SCRAP</b> keeps the record for reporting and credit note only.</p>
          <div><Route size={18} /> Route-wise return reports help identify shops/products causing more returns.</div>
          <div><Truck size={18} /> Van-linked returns help daily route closing.</div>
          <div><CalendarClock size={18} /> Expiry returns help plan batch rotation.</div>
        </aside>
      </section>

      <section className="sr-panel sr-list-panel">
        <div className="sr-panel-head"><div><h2>Return history</h2><p>Draft, posted, damage, expiry and saleable returns.</p></div></div>
        <div className="sr-filter-row">
          <label><Search size={16} /><input placeholder="Search return no / reason" value={filters.q} onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))} /></label>
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}><option value="">All status</option><option>DRAFT</option><option>POSTED</option><option>CANCELLED</option></select>
          <select value={filters.returnType} onChange={(e) => setFilters((f) => ({ ...f, returnType: e.target.value }))}><option value="">All types</option>{master.returnTypes.map((type) => <option key={type}>{type}</option>)}</select>
          <button onClick={() => load().catch((e) => setError(e.response?.data?.message || 'Failed to filter'))}>Apply</button>
        </div>
        <div className="sr-table-wrap">
          <table className="sr-table">
            <thead><tr><th>Return</th><th>Shop</th><th>Type</th><th>Credit</th><th>Stock action</th><th>Status</th><th>Date</th><th></th></tr></thead>
            <tbody>{returnPager.pageItems.map((row) => (
              <tr key={row.id}>
                <td><b>{row.returnNo}</b><small>{row.supplyNo || row.reason || 'Manual return'}</small></td>
                <td><b>{row.shopName}</b><small>{row.routeName || '-'}</small></td>
                <td>{nice(row.returnType)}</td>
                <td>{currency(row.creditAmount)}</td>
                <td>{nice(row.stockAction)}</td>
                <td><span className={`sr-status ${String(row.status).toLowerCase()}`}>{row.status}</span></td>
                <td>{shortDate(row.returnDate)}</td>
                <td className="sr-row-actions">{row.status === 'DRAFT' && <><button onClick={() => postReturn(row.id)} disabled={saving}>Post</button><button onClick={() => cancelReturn(row.id)} disabled={saving}>Cancel</button></>}</td>
              </tr>
            ))}</tbody>
          </table>
          {!returns.length && <div className="empty-state">No return records found for the selected filters.</div>}
        </div>
        <PaginationBar {...returnPager} label="returns" />
      </section>
    </div>
  );
}
