import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Tag } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const blankProduct = { name: '', sku: '', barcode: '', costPrice: 0, salePrice: 0, stockQty: 0, reorderLevel: 0 };
const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function makeBarcode() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SL${timestamp}${random}`;
}

export default function Products() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankProduct);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const { data } = await api.get('/products');
    setRows(data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load products')); }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.sku, r.barcode].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, query]);

  const stockValue = rows.reduce((sum, r) => sum + (Number(r.stockQty || 0) * Number(r.costPrice || 0)), 0);
  const lowStock = rows.filter((r) => Number(r.stockQty || 0) <= Number(r.reorderLevel || 0)).length;

  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/products', {
        ...form,
        costPrice: Number(form.costPrice || 0),
        salePrice: Number(form.salePrice || 0),
        stockQty: Number(form.stockQty || 0),
        reorderLevel: Number(form.reorderLevel || 0)
      });
      setForm(blankProduct);
      setCreateOpen(false);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save product'); }
    finally { setSaving(false); }
  }

  const columns = [
    { key: 'name', label: 'Product', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">SKU {r.sku || '-'} · Barcode {r.barcode || '-'}</span></> },
    { key: 'stockQty', label: 'Stock', render: (r) => <strong>{Number(r.stockQty || 0)}</strong> },
    { key: 'salePrice', label: 'Sale Price', render: (r) => money(r.salePrice) },
    { key: 'costPrice', label: 'Cost', render: (r) => money(r.costPrice) },
    { key: 'reorderLevel', label: 'Reorder', render: (r) => Number(r.reorderLevel || 0) },
    { key: 'status', label: 'Status', render: (r) => Number(r.stockQty || 0) <= Number(r.reorderLevel || 0) ? <span className="badge cancelled">LOW</span> : <span className="badge paid">OK</span> }
  ];

  return (
    <div className="page stage6-list-page products-page">
      <div className="stage6-hero">
        <div>
          <h1>Inventory Products</h1>
          <p>Product creation is now hidden inside a drawer, so the product table can stay wide, readable, searchable and paginated.</p>
        </div>
        <div className="stage6-actions">
          <Link className="secondary-btn" to="/barcode-labels"><Tag size={18} /> Print Labels</Link>
          <button className="secondary-btn" type="button" onClick={load}><RefreshCw size={18} /> Refresh</button>
          <button className="primary-btn" type="button" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add Product</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="stage6-kpi-grid">
        <div className="stage6-kpi-card"><span>Total Products</span><strong>{rows.length}</strong><small>Items in product master</small></div>
        <div className="stage6-kpi-card"><span>Low Stock</span><strong>{lowStock}</strong><small>At or below reorder level</small></div>
        <div className="stage6-kpi-card"><span>Stock Value</span><strong>{money(stockValue)}</strong><small>Qty × cost price</small></div>
        <div className="stage6-kpi-card"><span>Barcode Ready</span><strong>{rows.filter((r) => r.barcode).length}</strong><small>Products with barcode</small></div>
      </div>

      <section className="panel stage6-table-panel">
        <div className="stage6-toolbar">
          <div className="stage6-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, SKU or barcode..." /></div>
          <span className="muted">Click a row to view product details</span>
        </div>
        <DataTable columns={columns} rows={filteredRows} pageSize={10} onRowClick={setSelected} empty="No products found" />
      </section>

      <ModalDrawer open={createOpen} size="lg" title="Add Product" description="Create product details without shrinking the main product table." onClose={() => setCreateOpen(false)}>
        <form onSubmit={submit} className="form-grid two compact">
          <label className="span-two">Name<input name="name" value={form.name} onChange={update} required /></label>
          <label>SKU<input name="sku" value={form.sku} onChange={update} /></label>
          <label>Barcode<div className="inline-input"><input name="barcode" value={form.barcode} onChange={update} placeholder="Scan or auto-generate" /><button className="ghost-btn" type="button" onClick={() => setForm({ ...form, barcode: makeBarcode() })}>Generate</button></div></label>
          <label>Cost<input name="costPrice" type="number" min="0" step="0.01" value={form.costPrice} onChange={update} /></label>
          <label>Sale Price<input name="salePrice" type="number" min="0" step="0.01" value={form.salePrice} onChange={update} /></label>
          <label>Opening Stock<input name="stockQty" type="number" step="0.001" value={form.stockQty} onChange={update} /></label>
          <label>Reorder Level<input name="reorderLevel" type="number" step="0.001" value={form.reorderLevel} onChange={update} /></label>
          <div className="stage6-form-actions span-two"><button type="button" className="secondary-btn" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-btn" disabled={saving}>Save Product</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selected} mode="modal" size="sm" title="Product Details" onClose={() => setSelected(null)}>
        {selected && <div className="stage6-detail-grid">
          <div className="stage6-detail-item"><span>Name</span><strong>{selected.name}</strong></div>
          <div className="stage6-detail-item"><span>SKU</span><strong>{selected.sku || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Barcode</span><strong>{selected.barcode || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Stock</span><strong>{Number(selected.stockQty || 0)}</strong></div>
          <div className="stage6-detail-item"><span>Cost</span><strong>{money(selected.costPrice)}</strong></div>
          <div className="stage6-detail-item"><span>Sale Price</span><strong>{money(selected.salePrice)}</strong></div>
        </div>}
      </ModalDrawer>
    </div>
  );
}
