import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

function makeBarcode() {
  const timestamp = Date.now().toString().slice(-8);
  const random = Math.floor(1000 + Math.random() * 9000);
  return `SL${timestamp}${random}`;
}

export default function Products() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', costPrice: 0, salePrice: 0, stockQty: 0, reorderLevel: 0 });
  const [error, setError] = useState('');
  async function load() { const { data } = await api.get('/products'); setRows(data); }
  useEffect(() => { load().catch(e=>setError(e.response?.data?.message || 'Failed to load products')); }, []);
  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }
  async function submit(e) {
    e.preventDefault();
    try {
      await api.post('/products', form);
      setForm({ name: '', sku: '', barcode: '', costPrice: 0, salePrice: 0, stockQty: 0, reorderLevel: 0 });
      load();
    } catch(e){ setError(e.response?.data?.message || 'Failed to save'); }
  }

  return (
    <div className="page two-col-page">
      <section className="panel">
        <div className="section-title-row">
          <div>
            <h1>Inventory Products</h1>
            <p>Manage product price, stock, SKU, barcode and QR label printing.</p>
          </div>
          <Link className="secondary-btn" to="/barcode-labels">Print Labels</Link>
        </div>
        {error && <div className="error-box">{error}</div>}
        <DataTable columns={[
          {key:'name',label:'Product'},
          {key:'sku',label:'SKU'},
          {key:'barcode',label:'Barcode'},
          {key:'stockQty',label:'Stock'},
          {key:'salePrice',label:'Sale Price',render:(r)=>`LKR ${Number(r.salePrice || 0).toFixed(2)}`},
          {key:'reorderLevel',label:'Reorder'}
        ]} rows={rows} />
      </section>
      <section className="panel">
        <h2>Add Product</h2>
        <form onSubmit={submit} className="form-grid two compact">
          <label className="span-two">Name<input name="name" value={form.name} onChange={update} required /></label>
          <label>SKU<input name="sku" value={form.sku} onChange={update} /></label>
          <label>Barcode
            <div className="inline-input">
              <input name="barcode" value={form.barcode} onChange={update} placeholder="Scan or auto-generate" />
              <button className="ghost-btn" type="button" onClick={() => setForm({ ...form, barcode: makeBarcode() })}>Generate</button>
            </div>
          </label>
          <label>Cost<input name="costPrice" type="number" value={form.costPrice} onChange={update} /></label>
          <label>Sale Price<input name="salePrice" type="number" value={form.salePrice} onChange={update} /></label>
          <label>Opening Stock<input name="stockQty" type="number" value={form.stockQty} onChange={update} /></label>
          <label>Reorder Level<input name="reorderLevel" type="number" value={form.reorderLevel} onChange={update} /></label>
          <button className="primary-btn span-two">Save Product</button>
        </form>
      </section>
    </div>
  );
}
