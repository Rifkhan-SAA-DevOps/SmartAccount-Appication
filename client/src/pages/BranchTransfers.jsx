import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage13-registers-finance-polish.css';

const emptyTransferItem = { productId: '', qty: 1 };

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function dateOnly(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function transferValue(row) {
  return (row.items || []).reduce((total, item) => total + Number(item.qty || 0) * Number(item.unitCost || item.product?.costPrice || 0), 0);
}

export default function BranchTransfers() {
  const [dashboard, setDashboard] = useState(null);
  const [warehouses, setWarehouses] = useState([]);
  const [products, setProducts] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [transfer, setTransfer] = useState({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [emptyTransferItem] });
  const [preview, setPreview] = useState(null);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [transferDrawerOpen, setTransferDrawerOpen] = useState(false);
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

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load branch transfer data'));
  }, []);

  const selectedFrom = useMemo(() => warehouses.find((w) => w.id === transfer.fromWarehouseId), [warehouses, transfer.fromWarehouseId]);
  const selectedTo = useMemo(() => warehouses.find((w) => w.id === transfer.toWarehouseId), [warehouses, transfer.toWarehouseId]);

  function resetTransferForm() {
    setTransfer({ fromWarehouseId: '', toWarehouseId: '', notes: '', items: [{ ...emptyTransferItem }] });
    setPreview(null);
  }

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
    setError('');
    setMessage('');
    try {
      const res = await api.post('/branches/transfers/preview', transfer);
      setPreview(res.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Preview failed');
    }
  }

  async function postTransfer(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      if (preview && !preview.canPost) throw new Error('Fix stock problems before posting transfer.');
      const res = await api.post('/branches/transfers', transfer);
      setMessage(`${res.data.transferNo} posted successfully.`);
      resetTransferForm();
      setTransferDrawerOpen(false);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Failed to post transfer');
    }
  }

  async function cancelTransfer(row) {
    if (!row?.id) return;
    if (!confirm(`Cancel ${row.transferNo} and reverse stock movement?`)) return;
    setError('');
    setMessage('');
    try {
      await api.post(`/branches/transfers/${row.id}/cancel`);
      setMessage(`${row.transferNo} cancelled and stock reversed.`);
      setSelectedTransfer(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cancel transfer');
    }
  }

  const transferColumns = [
    { key: 'transferNo', label: 'Transfer No', render: (r) => <><strong>{r.transferNo}</strong><span className="table-subtext">Click to view details</span></> },
    { key: 'transferDate', label: 'Date', render: (r) => dateOnly(r.transferDate) },
    { key: 'from', label: 'From', render: (r) => r.fromWarehouse?.name || '-' },
    { key: 'to', label: 'To', render: (r) => r.toWarehouse?.name || '-' },
    { key: 'items', label: 'Items', render: (r) => r.items?.length || 0 },
    { key: 'value', label: 'Value', render: (r) => money(transferValue(r)) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${String(r.status || '').toLowerCase()}`}>{r.status}</span> }
  ];

  return (
    <div className="page branch-transfer-page stage13-page">
      <div className="page-head stage13-hero">
        <div>
          <span className="eyebrow">Inventory control</span>
          <h1>Branch Transfers</h1>
          <p>Move stock between warehouses safely. The register is now the main view; create and cancel actions happen in clean modal screens.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" type="button" onClick={load}>Refresh</button>
          <button className="primary-btn" type="button" onClick={() => setTransferDrawerOpen(true)}>+ Create Stock Transfer</button>
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

      <section className="panel stage13-register-panel">
        <div className="section-title-row">
          <div>
            <h2>Recent Transfers</h2>
            <p>Click any transfer row to view items and available actions. Actions are removed from the table to keep it responsive.</p>
          </div>
          <button className="primary-btn" type="button" onClick={() => setTransferDrawerOpen(true)}>+ New Transfer</button>
        </div>
        <DataTable
          columns={transferColumns}
          rows={transfers}
          empty="No stock transfers yet"
          onRowClick={setSelectedTransfer}
          pagination
          pageSize={10}
          paginationLabel="transfers"
        />
      </section>

      <section className="panel low-stock-panel stage13-full-panel">
        <div className="section-title-row"><div><h2>Low Stock by Warehouse</h2><p>Use this before creating transfers to decide where stock is needed.</p></div></div>
        <div className="low-stock-chip-row stage13-chip-row">
          {(dashboard?.lowStock || []).map((row) => <div className="low-stock-chip" key={row.id}>
            <strong>{row.product}</strong>
            <span>{row.warehouse} • {qty(row.quantity)} / reorder {qty(row.reorderLevel)}</span>
          </div>)}
          {!dashboard?.lowStock?.length && <p className="muted-text">No warehouse-level low stock warnings.</p>}
        </div>
      </section>

      <section className="panel stage13-full-panel">
        <div className="section-title-row"><div><h2>Warehouse Health</h2><p>Simple stock value and quantity overview for each warehouse.</p></div></div>
        <div className="warehouse-card-list stage13-card-list">
          {(dashboard?.warehouses || []).map((warehouse) => <div className="warehouse-health-card stage13-info-card" key={warehouse.id}>
            <strong>{warehouse.name}</strong>
            <span>{warehouse.branch}</span>
            <div><b>{qty(warehouse.totalQty)}</b><small>Qty</small><b>{money(warehouse.stockValue)}</b><small>Value</small></div>
            {warehouse.lowStockCount > 0 && <em>{warehouse.lowStockCount} low stock items</em>}
          </div>)}
          {!dashboard?.warehouses?.length && <p className="muted-text">No warehouse data available.</p>}
        </div>
      </section>

      <ModalDrawer
        open={transferDrawerOpen}
        onClose={() => setTransferDrawerOpen(false)}
        title="Create Stock Transfer"
        eyebrow="Branch transfer"
        description="Choose source, destination and products. Preview availability before posting when needed."
        size="lg"
        mode="drawer"
        footer={(
          <>
            <button type="button" className="secondary-btn" onClick={previewTransfer}>Preview Availability</button>
            <button type="submit" form="branch-transfer-form" className="primary-btn">Post Transfer</button>
          </>
        )}
      >
        <form id="branch-transfer-form" onSubmit={postTransfer} className="form-grid stage13-form-grid">
          <label>From Warehouse
            <select value={transfer.fromWarehouseId} onChange={(e) => { setPreview(null); setTransfer({ ...transfer, fromWarehouseId: e.target.value }); }} required>
              <option value="">Select source</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} • {warehouse.branch?.name || 'No branch'}</option>)}
            </select>
          </label>
          <label>To Warehouse
            <select value={transfer.toWarehouseId} onChange={(e) => { setPreview(null); setTransfer({ ...transfer, toWarehouseId: e.target.value }); }} required>
              <option value="">Select destination</option>
              {warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name} • {warehouse.branch?.name || 'No branch'}</option>)}
            </select>
          </label>
          <label className="span-two">Notes
            <input value={transfer.notes} onChange={(e) => setTransfer({ ...transfer, notes: e.target.value })} placeholder="Reason for movement, vehicle, handover person..." />
          </label>

          <div className="span-two transfer-route-card stage13-route-card">
            <strong>{selectedFrom?.name || 'Source warehouse'}</strong>
            <span>→</span>
            <strong>{selectedTo?.name || 'Destination warehouse'}</strong>
          </div>

          <div className="span-two stage13-item-stack">
            {transfer.items.map((item, index) => (
              <div className="stage13-item-row" key={index}>
                <label>Product
                  <select value={item.productId} onChange={(e) => updateItem(index, { productId: e.target.value })} required>
                    <option value="">Select product</option>
                    {products.map((product) => <option key={product.id} value={product.id}>{product.name} • {product.sku || product.barcode || 'No code'}</option>)}
                  </select>
                </label>
                <label>Qty
                  <input type="number" min="0.001" step="0.001" value={item.qty} onChange={(e) => updateItem(index, { qty: e.target.value })} required />
                </label>
                <button className="secondary-btn" type="button" onClick={() => removeItem(index)} disabled={transfer.items.length === 1}>Remove</button>
              </div>
            ))}
            <button className="secondary-btn" type="button" onClick={addItem}>+ Add Product</button>
          </div>
        </form>

        {preview && <div className={`transfer-preview ${preview.canPost ? 'ok' : 'bad'} stage13-preview`}>
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
      </ModalDrawer>

      <ModalDrawer
        open={Boolean(selectedTransfer)}
        onClose={() => setSelectedTransfer(null)}
        title={selectedTransfer?.transferNo || 'Transfer details'}
        eyebrow="Transfer register"
        description="Review movement details and cancel only if stock must be reversed."
        size="lg"
        mode="modal"
        footer={selectedTransfer?.status === 'POSTED' ? <button className="mini-danger" type="button" onClick={() => cancelTransfer(selectedTransfer)}>Cancel & Reverse</button> : null}
      >
        {selectedTransfer && <>
          <div className="stage13-detail-grid">
            <div><span>Date</span><strong>{dateOnly(selectedTransfer.transferDate)}</strong></div>
            <div><span>Status</span><strong>{selectedTransfer.status}</strong></div>
            <div><span>From</span><strong>{selectedTransfer.fromWarehouse?.name || '-'}</strong></div>
            <div><span>To</span><strong>{selectedTransfer.toWarehouse?.name || '-'}</strong></div>
            <div><span>Items</span><strong>{selectedTransfer.items?.length || 0}</strong></div>
            <div><span>Value</span><strong>{money(transferValue(selectedTransfer))}</strong></div>
          </div>
          {selectedTransfer.notes && <div className="stage13-note-box"><strong>Notes</strong><p>{selectedTransfer.notes}</p></div>}
          <DataTable
            columns={[
              { key: 'product', label: 'Product', render: (r) => r.product?.name || r.productName || '-' },
              { key: 'qty', label: 'Qty', render: (r) => qty(r.qty) },
              { key: 'unitCost', label: 'Unit Cost', render: (r) => money(r.unitCost || r.product?.costPrice) },
              { key: 'lineValue', label: 'Line Value', render: (r) => money(Number(r.qty || 0) * Number(r.unitCost || r.product?.costPrice || 0)) }
            ]}
            rows={selectedTransfer.items || []}
            pagination={false}
            empty="No items found"
          />
        </>}
      </ModalDrawer>
    </div>
  );
}
