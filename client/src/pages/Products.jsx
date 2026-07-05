import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Barcode, Boxes, Package, Search } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankProduct = { name: '', sku: '', barcode: '', costPrice: 0, salePrice: 0, stockQty: 0, reorderLevel: 0 };

function makeBarcode() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SL${timestamp}${random}`;
}

export default function Products() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankProduct);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/products');
    setRows(Array.isArray(data) ? data : data?.items || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load products'));
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/products', form);
      setForm(blankProduct);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.name, row.sku, row.barcode].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [query, rows]);

  const stats = useMemo(() => {
    const stockUnits = rows.reduce((sum, row) => sum + Number(row.stockQty || 0), 0);
    const stockValue = rows.reduce((sum, row) => sum + (Number(row.stockQty || 0) * Number(row.costPrice || 0)), 0);
    const lowStock = rows.filter((row) => Number(row.stockQty || 0) <= Number(row.reorderLevel || 0)).length;
    return { stockUnits, stockValue, lowStock };
  }, [rows]);

  return (
    <div className="page ui-master-page products-page">
      <header className="page-header ui-page-hero product-hero">
        <div>
          <span className="ui-eyebrow">Inventory / Product Master</span>
          <h1>Products</h1>
          <p>Manage product names, prices, barcode, opening stock and reorder levels with a clean inventory view.</p>
        </div>
        <div className="head-actions">
          <Link className="secondary-btn" to="/barcode-labels"><Barcode size={17} /> Print Labels</Link>
        </div>
      </header>

      <section className="ui-stat-grid">
        <div className="ui-stat-card tone-purple"><span>Total Products</span><strong>{rows.length}</strong><small>Inventory items created</small></div>
        <div className="ui-stat-card tone-green"><span>Stock Units</span><strong>{stats.stockUnits.toLocaleString()}</strong><small>Total quantity available</small></div>
        <div className="ui-stat-card tone-blue"><span>Stock Value</span><strong>{money(stats.stockValue)}</strong><small>Based on cost price</small></div>
        <div className="ui-stat-card tone-orange"><span>Low Stock</span><strong>{stats.lowStock}</strong><small>Items at or below reorder level</small></div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <div className="ui-master-layout product-layout">
        <section className="panel ui-table-panel">
          <div className="section-title-row ui-section-title-row">
            <div>
              <h2>Product List</h2>
              <p>Search items and quickly identify stock, selling price and reorder warnings.</p>
            </div>
            <label className="ui-search-field">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product, SKU or barcode" />
            </label>
          </div>

          <DataTable
            columns={[
              { key: 'name', label: 'Product', render: (row) => <strong>{row.name}</strong> },
              { key: 'sku', label: 'SKU' },
              { key: 'barcode', label: 'Barcode' },
              { key: 'stockQty', label: 'Stock', render: (row) => <span className={Number(row.stockQty || 0) <= Number(row.reorderLevel || 0) ? 'ui-stock-low' : 'ui-stock-ok'}>{Number(row.stockQty || 0).toLocaleString()}</span> },
              { key: 'salePrice', label: 'Sale Price', render: (row) => money(row.salePrice) },
              { key: 'reorderLevel', label: 'Reorder', render: (row) => Number(row.reorderLevel || 0).toLocaleString() }
            ]}
            rows={filteredRows}
            emptyTitle="No products found"
            emptyDescription="Add products with price, stock and barcode details."
          />
        </section>

        <aside className="panel ui-form-panel">
          <div className="ui-form-heading">
            <div className="ui-form-icon"><Package size={20} /></div>
            <div>
              <h2>Add Product</h2>
              <p>Create products for POS, invoices, purchases, stock transfers and distribution.</p>
            </div>
          </div>

          <form onSubmit={submit} className="form-grid two compact">
            <label className="span-two">Name<input name="name" value={form.name} onChange={update} placeholder="Example: Chocolate Biscuit Box" required /></label>
            <label>SKU<input name="sku" value={form.sku} onChange={update} placeholder="BIS-001" /></label>
            <label>Barcode
              <div className="inline-input">
                <input name="barcode" value={form.barcode} onChange={update} placeholder="Scan or generate" />
                <button className="ghost-btn" type="button" onClick={() => setForm({ ...form, barcode: makeBarcode() })}>Generate</button>
              </div>
            </label>
            <label>Cost Price<input name="costPrice" type="number" min="0" value={form.costPrice} onChange={update} /></label>
            <label>Sale Price<input name="salePrice" type="number" min="0" value={form.salePrice} onChange={update} /></label>
            <label>Opening Stock<input name="stockQty" type="number" min="0" value={form.stockQty} onChange={update} /></label>
            <label>Reorder Level<input name="reorderLevel" type="number" min="0" value={form.reorderLevel} onChange={update} /></label>
            <button className="primary-btn span-two" disabled={saving}>{saving ? 'Saving...' : 'Save Product'}</button>
          </form>

          <div className="ui-helper-card">
            <AlertTriangle size={18} />
            <span>Set reorder level so the dashboard can warn you before stock runs out.</span>
          </div>
          <div className="ui-helper-card soft-green">
            <Boxes size={18} />
            <span>Stock will later change automatically from purchases, invoices, returns and transfers.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
