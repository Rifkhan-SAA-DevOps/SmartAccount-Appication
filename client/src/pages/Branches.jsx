import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const emptyBranch = { name: '', code: '', address: '', phone: '', isMain: false };
const emptyWarehouse = { name: '', code: '', branchId: '', isDefault: false };
const emptyTransferItem = { productId: '', qty: 1 };

function moneyLike(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function Branches() {
  const [tab, setTab] = useState('branches');
  const [branches, setBranches] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [selectedWarehouse, setSelectedWarehouse] = useState('');
  const [branchForm, setBranchForm] = useState(emptyBranch);
  const [warehouseForm, setWarehouseForm] = useState(emptyWarehouse);
  const [transfer, setTransfer] = useState({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [emptyTransferItem] });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [b, w, p, t] = await Promise.all([
      api.get('/branches'),
      api.get('/branches/warehouses'),
      api.get('/products'),
      api.get('/branches/transfers')
    ]);
    setBranches(b.data || []);
    setWarehouses(w.data || []);
    setProducts(p.data || []);
    setTransfers(t.data || []);
    if (!selectedWarehouse && w.data?.[0]) setSelectedWarehouse(w.data[0].id);
  }

  async function loadStocks(warehouseId = selectedWarehouse) {
    const { data } = await api.get('/branches/stocks', { params: warehouseId ? { warehouseId } : {} });
    setStocks(data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load branches')); }, []);
  useEffect(() => { loadStocks().catch(() => {}); }, [selectedWarehouse]);

  const totalStockValue = useMemo(() => stocks.reduce((sum, row) => sum + Number(row.quantity || 0) * Number(row.product?.costPrice || 0), 0), [stocks]);
  const lowStockCount = useMemo(() => stocks.filter((row) => Number(row.quantity || 0) <= Number(row.product?.reorderLevel || row.reorderLevel || 0)).length, [stocks]);

  function showOk(text) {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 2500);
  }

  async function saveBranch(e) {
    e.preventDefault();
    try {
      await api.post('/branches', { ...branchForm, isMain: Boolean(branchForm.isMain) });
      setBranchForm(emptyBranch);
      await load();
      showOk('Branch created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create branch'); }
  }

  async function saveWarehouse(e) {
    e.preventDefault();
    try {
      await api.post('/branches/warehouses', { ...warehouseForm, branchId: warehouseForm.branchId || null, isDefault: Boolean(warehouseForm.isDefault) });
      setWarehouseForm(emptyWarehouse);
      await load();
      showOk('Warehouse created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create warehouse'); }
  }

  function updateTransferItem(index, key, value) {
    setTransfer((prev) => ({
      ...prev,
      items: prev.items.map((item, i) => i === index ? { ...item, [key]: value } : item)
    }));
  }

  async function saveTransfer(e) {
    e.preventDefault();
    try {
      const payload = {
        ...transfer,
        items: transfer.items.filter((item) => item.productId && Number(item.qty) > 0)
      };
      await api.post('/branches/transfers', payload);
      setTransfer({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [emptyTransferItem] });
      await load();
      await loadStocks();
      showOk('Stock transferred');
    } catch (e) { setError(e.response?.data?.message || 'Failed to transfer stock'); }
  }

  return (
    <div className="page branches-page">
      <div className="page-head">
        <div>
          <h1>Branches & Warehouses</h1>
          <p>Manage company locations, warehouse-wise stock and stock transfers.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${tab === 'branches' ? 'active' : ''}`} onClick={() => setTab('branches')}>Branches</button>
          <button className={`tab-btn ${tab === 'warehouses' ? 'active' : ''}`} onClick={() => setTab('warehouses')}>Warehouses</button>
          <button className={`tab-btn ${tab === 'stock' ? 'active' : ''}`} onClick={() => setTab('stock')}>Stock</button>
          <button className={`tab-btn ${tab === 'transfers' ? 'active' : ''}`} onClick={() => setTab('transfers')}>Transfers</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <section className="stat-grid">
        <div className="stat-card"><span>Branches</span><strong>{branches.length}</strong><small>Locations in this company</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Warehouses</span><strong>{warehouses.length}</strong><small>Stock locations</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Low Stock Lines</span><strong>{lowStockCount}</strong><small>Warehouse stock below reorder</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Stock Value</span><strong>LKR {totalStockValue.toLocaleString()}</strong><small>Selected warehouse cost value</small><div className="stat-orb" /></div>
      </section>

      {tab === 'branches' && (
        <div className="two-col-page">
          <section className="panel">
            <h2>Branch List</h2>
            <DataTable columns={[
              { key: 'name', label: 'Branch' },
              { key: 'code', label: 'Code' },
              { key: 'phone', label: 'Phone' },
              { key: 'isMain', label: 'Main', render: (r) => r.isMain ? <span className="badge posted">MAIN</span> : '-' },
              { key: 'warehouses', label: 'Warehouses', render: (r) => r.warehouses?.length || 0 }
            ]} rows={branches} />
          </section>
          <section className="panel">
            <h2>Add Branch</h2>
            <form className="form-grid" onSubmit={saveBranch}>
              <label>Name<input value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required /></label>
              <label>Code<input value={branchForm.code} onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })} required placeholder="BR-01" /></label>
              <label>Phone<input value={branchForm.phone} onChange={(e) => setBranchForm({ ...branchForm, phone: e.target.value })} /></label>
              <label>Address<input value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} /></label>
              <label className="check-label"><input type="checkbox" checked={branchForm.isMain} onChange={(e) => setBranchForm({ ...branchForm, isMain: e.target.checked })} /> Make main branch</label>
              <button className="primary-btn">Save Branch</button>
            </form>
          </section>
        </div>
      )}

      {tab === 'warehouses' && (
        <div className="two-col-page">
          <section className="panel">
            <h2>Warehouse List</h2>
            <DataTable columns={[
              { key: 'name', label: 'Warehouse' },
              { key: 'code', label: 'Code' },
              { key: 'branch', label: 'Branch', render: (r) => r.branch?.name || '-' },
              { key: 'isDefault', label: 'Default', render: (r) => r.isDefault ? <span className="badge info">DEFAULT</span> : '-' },
              { key: 'stocks', label: 'Stock Lines', render: (r) => r._count?.stocks || 0 }
            ]} rows={warehouses} />
          </section>
          <section className="panel">
            <h2>Add Warehouse</h2>
            <form className="form-grid" onSubmit={saveWarehouse}>
              <label>Name<input value={warehouseForm.name} onChange={(e) => setWarehouseForm({ ...warehouseForm, name: e.target.value })} required /></label>
              <label>Code<input value={warehouseForm.code} onChange={(e) => setWarehouseForm({ ...warehouseForm, code: e.target.value })} required placeholder="WH-01" /></label>
              <label>Branch<select value={warehouseForm.branchId} onChange={(e) => setWarehouseForm({ ...warehouseForm, branchId: e.target.value })}>
                <option value="">No branch</option>
                {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select></label>
              <label className="check-label"><input type="checkbox" checked={warehouseForm.isDefault} onChange={(e) => setWarehouseForm({ ...warehouseForm, isDefault: e.target.checked })} /> Default warehouse</label>
              <button className="primary-btn">Save Warehouse</button>
            </form>
            <div className="upload-note">Multi-warehouse creation is controlled by the subscription plan. Starter/shop plans can be restricted to one warehouse.</div>
          </section>
        </div>
      )}

      {tab === 'stock' && (
        <section className="panel">
          <div className="ledger-toolbar">
            <div>
              <h2>Warehouse Stock</h2>
              <p>Stock shown here is separated by warehouse. Product stock still shows the total company stock.</p>
            </div>
            <label>Warehouse<select value={selectedWarehouse} onChange={(e) => setSelectedWarehouse(e.target.value)}>
              <option value="">All warehouses</option>
              {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select></label>
          </div>
          <DataTable columns={[
            { key: 'product', label: 'Product', render: (r) => <><b>{r.product?.name}</b><span className="muted-line">{r.product?.sku || 'No SKU'}</span></> },
            { key: 'warehouse', label: 'Warehouse', render: (r) => <><b>{r.warehouse?.name}</b><span className="muted-line">{r.warehouse?.branch?.name || 'No branch'}</span></> },
            { key: 'quantity', label: 'Qty', render: (r) => moneyLike(r.quantity) },
            { key: 'reorderLevel', label: 'Reorder', render: (r) => moneyLike(r.reorderLevel || r.product?.reorderLevel) },
            { key: 'value', label: 'Value', render: (r) => `LKR ${(Number(r.quantity || 0) * Number(r.product?.costPrice || 0)).toLocaleString()}` }
          ]} rows={stocks} />
        </section>
      )}

      {tab === 'transfers' && (
        <div className="two-col-page">
          <section className="panel">
            <h2>Recent Transfers</h2>
            <DataTable columns={[
              { key: 'transferNo', label: 'No' },
              { key: 'fromWarehouse', label: 'From', render: (r) => r.fromWarehouse?.name },
              { key: 'toWarehouse', label: 'To', render: (r) => r.toWarehouse?.name },
              { key: 'items', label: 'Items', render: (r) => r.items?.length || 0 },
              { key: 'transferDate', label: 'Date', render: (r) => new Date(r.transferDate).toLocaleDateString() }
            ]} rows={transfers} />
          </section>
          <section className="panel">
            <h2>Transfer Stock</h2>
            <form className="form-grid" onSubmit={saveTransfer}>
              <label>From Warehouse<select value={transfer.fromWarehouseId} onChange={(e) => setTransfer({ ...transfer, fromWarehouseId: e.target.value })} required>
                <option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
              <label>To Warehouse<select value={transfer.toWarehouseId} onChange={(e) => setTransfer({ ...transfer, toWarehouseId: e.target.value })} required>
                <option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select></label>
              <div className="transfer-items">
                {transfer.items.map((item, index) => (
                  <div className="transfer-row" key={index}>
                    <select value={item.productId} onChange={(e) => updateTransferItem(index, 'productId', e.target.value)} required>
                      <option value="">Product</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} - Stock {moneyLike(p.stockQty)}</option>)}
                    </select>
                    <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => updateTransferItem(index, 'qty', e.target.value)} required />
                    <button type="button" className="mini-danger" onClick={() => setTransfer((prev) => { const nextItems = prev.items.filter((_, i) => i !== index); return { ...prev, items: nextItems.length ? nextItems : [emptyTransferItem] }; })}>×</button>
                  </div>
                ))}
              </div>
              <button type="button" className="secondary-btn" onClick={() => setTransfer((prev) => ({ ...prev, items: [...prev.items, emptyTransferItem] }))}>+ Add Item</button>
              <label>Notes<input value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} /></label>
              <button className="primary-btn">Post Transfer</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
