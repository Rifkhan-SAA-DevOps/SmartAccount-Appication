import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const emptyTransferItem = { productId: '', qty: 1 };

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

export default function BranchTransfers() {
  const [dashboard, setDashboard] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transfer, setTransfer] = useState({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [emptyTransferItem] });
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [dashboardRes, warehousesRes, productsRes, transfersRes] = await Promise.all([
      api.get('/branches/transfer-dashboard'),
      api.get('/branches/warehouses'),
      api.get('/products'),
      api.get('/branches/transfers')
    ]);
    setDashboard(dashboardRes.data || null);
    setWarehouses(warehousesRes.data || []);
    setProducts(productsRes.data || []);
    setTransfers(transfersRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load branch transfer data')); }, []);

  const selectedFrom = useMemo(() => warehouses.find((w) => w.id === transfer.fromWarehouseId), [warehouses, transfer.fromWarehouseId]);
  const selectedTo = useMemo(() => warehouses.find((w) => w.id === transfer.toWarehouseId), [warehouses, transfer.toWarehouseId]);

  function updateItem(index, patch) {
    setPreview(null);
    setTransfer((prev) => ({ ...prev, items: prev.items.map((item, i) => i === index ? { ...item, ...patch } : item) }));
  }

  function addItem() {
    setPreview(null);
    setTransfer((prev) => ({ ...prev, items: [...prev.items, { ...emptyTransferItem }] }));
  }

  function removeItem(index) {
    setPreview(null);
    setTransfer((prev) => ({ ...prev, items: prev.items.filter((_, i) => i !== index) }));
  }

  async function previewTransfer() {
    setError(''); setMessage('');
    try {
      const res = await api.post('/branches/transfers/preview', transfer);
      setPreview(res.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Preview failed');
    }
  }

  async function postTransfer(e) {
    e.preventDefault();
    setError(''); setMessage('');
    try {
      if (preview && !preview.canPost) throw new Error('Fix stock problems before posting transfer.');
      const res = await api.post('/branches/transfers', transfer);
      setMessage(`${res.data.transferNo} posted successfully.`);
      setTransfer({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [emptyTransferItem] });
      setPreview(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to post transfer');
    }
  }

  async function cancelTransfer(row) {
    if (!confirm(`Cancel ${row.transferNo} and reverse stock movement?`)) return;
    setError(''); setMessage('');
    try {
      await api.post(`/branches/transfers/${row.id}/cancel`);
      setMessage(`${row.transferNo} cancelled and stock reversed.`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cancel transfer');
    }
  }

  const transferColumns = [
    { key: 'transferNo', label: 'Transfer No' },
    { key: 'transferDate', label: 'Date', render: (r) => new Date(r.transferDate).toLocaleDateString() },
    { key: 'from', label: 'From', render: (r) => r.fromWarehouse?.name || '-' },
    { key: 'to', label: 'To', render: (r) => r.toWarehouse?.name || '-' },
    { key: 'items', label: 'Items', render: (r) => r.items?.length || 0 },
    { key: 'value', label: 'Value', render: (r) => money((r.items || []).reduce((total, item) => total + Number(item.qty || 0) * Number(item.unitCost || item.product?.costPrice || 0), 0)) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${String(r.status || '').toLowerCase()}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => r.status === 'POSTED' ? <button className="mini-danger" onClick={() => cancelTransfer(r)}>Cancel & Reverse</button> : '-' }
  ];

  return (
    <div className="page branch-transfer-page">
      <div className="page-head transfer-hero">
        <div>
          <span className="eyebrow">Version 5.0</span>
          <h1>Branch Transfer / Inter-Branch Stock Movement</h1>
          <p>Move inventory between warehouses, validate available stock before posting, and reverse transfers safely when needed.</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="stat-grid transfer-stat-grid">
        <div className="stat-card"><span>Warehouses</span><strong>{dashboard?.totals?.warehouses || 0}</strong><small>Active stock locations</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Total Stock Qty</span><strong>{qty(dashboard?.totals?.totalQty)}</strong><small>Across all warehouses</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Stock Value</span><strong>{money(dashboard?.totals?.stockValue)}</strong><small>Estimated by cost price</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Transfers</span><strong>{dashboard?.totals?.transfers || 0}</strong><small>{dashboard?.totals?.postedTransfers || 0} posted</small><div className="stat-orb" /></div>
      </div>

      <div className="transfer-layout">
        <section className="panel transfer-main-panel">
          <div className="section-title-row">
            <div>
              <h2>Create Stock Transfer</h2>
              <p>Choose a source warehouse, destination warehouse and products to move.</p>
            </div>
            <button className="secondary-btn" type="button" onClick={previewTransfer}>Preview Availability</button>
          </div>

          <form onSubmit={postTransfer} className="form-grid">
            <label>From Warehouse
              <select value={transfer.fromWarehouseId} onChange={(e) => { setPreview(null); setTransfer({ ...transfer, fromWarehouseId: e.target.value }); }}>
                <option value="">Select source</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} • {warehouse.branch?.name || 'No branch'}</option>)}
              </select>
            </label>
            <label>To Warehouse
              <select value={transfer.toWarehouseId} onChange={(e) => { setPreview(null); setTransfer({ ...transfer, toWarehouseId: e.target.value }); }}>
                <option value="">Select destination</option>
                {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} • {warehouse.branch?.name || 'No branch'}</option>)}
              </select>
            </label>
            <label className="span-two">Notes
              <input value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} placeholder="Reason for movement, vehicle, handover person..." />
            </label>

            <div className="span-two transfer-route-card">
              <strong>{selectedFrom?.name || 'Source warehouse'}</strong>
              <span>→</span>
              <strong>{selectedTo?.name || 'Destination warehouse'}</strong>
            </div>

            <div className="span-two transfer-items">
              {transfer.items.map((item, index) => (
                <div className="transfer-item-row" key={index}>
                  <select value={item.productId} onChange={(e) => updateItem(index, { productId: e.target.value })}>
                    <option value="">Select product</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} • {product.sku || product.barcode || 'No code'}</option>)}
                  </select>
                  <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => updateItem(index, { qty: e.target.value })} />
                  <button className="secondary-btn" type="button" onClick={() => removeItem(index)} disabled={transfer.items.length === 1}>Remove</button>
                </div>
              ))}
              <button className="secondary-btn" type="button" onClick={addItem}>+ Add Product</button>
            </div>

            <button className="primary-btn span-two">Post Transfer</button>
          </form>

          {preview && <div className={`transfer-preview ${preview.canPost ? 'ok' : 'bad'}`}>
            <div className="section-title-row">
              <div>
                <h3>Availability Preview</h3>
                <p>{preview.fromWarehouse?.name} → {preview.toWarehouse?.name}</p>
              </div>
              <strong>{preview.canPost ? 'Ready to post' : 'Needs correction'}</strong>
            </div>
            <div className="preview-row-list">
              {preview.rows.map((row) => <div key={row.productId} className="preview-row">
                <strong>{row.product}</strong>
                <span>Need {qty(row.requestedQty)} / Available {qty(row.fromAvailable)}</span>
                <small>{row.message}</small>
              </div>)}
            </div>
          </div>}
        </section>

        <section className="panel transfer-side-panel">
          <h2>Warehouse Health</h2>
          <div className="warehouse-card-list">
            {(dashboard?.warehouses || []).map((warehouse) => <div className="warehouse-health-card" key={warehouse.id}>
              <strong>{warehouse.name}</strong>
              <span>{warehouse.branch}</span>
              <div><b>{qty(warehouse.totalQty)}</b><small>Qty</small><b>{money(warehouse.stockValue)}</b><small>Value</small></div>
              {warehouse.lowStockCount > 0 && <em>{warehouse.lowStockCount} low stock items</em>}
            </div>)}
          </div>
        </section>
      </div>

      <section className="panel low-stock-panel">
        <h2>Low Stock by Warehouse</h2>
        <div className="low-stock-chip-row">
          {(dashboard?.lowStock || []).map((row) => <div className="low-stock-chip" key={row.id}>
            <strong>{row.product}</strong>
            <span>{row.warehouse} • {qty(row.quantity)} / reorder {qty(row.reorderLevel)}</span>
          </div>)}
          {!dashboard?.lowStock?.length && <p className="muted-text">No warehouse-level low stock warnings.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>Recent Transfers</h2>
        <DataTable columns={transferColumns} rows={transfers} empty="No stock transfers yet" />
      </section>
    </div>
  );
}
