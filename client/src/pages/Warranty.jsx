import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Cpu, RefreshCw, ShieldCheck, Smartphone, Wrench } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage9-operations-polish.css';

const serialFormInitial = {
  productId: '',
  warehouseId: '',
  supplierId: '',
  serialNumbers: '',
  batchNo: '',
  warrantyMonths: 12,
  warrantyStartAt: '',
  warrantyEndAt: '',
  notes: ''
};

const claimFormInitial = {
  serialId: '',
  customerId: '',
  issueDescription: '',
  serviceCost: 0,
  resolution: ''
};

function date(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'in_stock' || s === 'completed') return 'paid';
  if (s === 'sold' || s === 'in_progress') return 'partial';
  if (s === 'repair' || s === 'open') return 'unpaid';
  if (['damaged', 'lost', 'expired', 'rejected'].includes(s)) return 'cancelled';
  return '';
}

function warrantyBadge(serial) {
  if (!serial?.warrantyEndAt) return <span className="badge">No warranty</span>;
  const end = new Date(serial.warrantyEndAt);
  const now = new Date();
  const days = Math.ceil((end - now) / 86400000);
  if (days < 0) return <span className="badge cancelled">Expired</span>;
  if (days <= 30) return <span className="badge unpaid">{days} day(s) left</span>;
  return <span className="badge paid">Active</span>;
}

export default function Warranty() {
  const [summary, setSummary] = useState(null);
  const [serials, setSerials] = useState([]);
  const [claims, setClaims] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [filters, setFilters] = useState({ q: '', status: '', expiring: '' });
  const [serialForm, setSerialForm] = useState(serialFormInitial);
  const [claimForm, setClaimForm] = useState(claimFormInitial);
  const [actionCustomerId, setActionCustomerId] = useState('');
  const [actionWarehouseId, setActionWarehouseId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [drawer, setDrawer] = useState(null);
  const [selectedSerial, setSelectedSerial] = useState(null);
  const [selectedClaim, setSelectedClaim] = useState(null);

  const inStockSerials = useMemo(() => serials.filter((s) => s.status === 'IN_STOCK' || s.status === 'SOLD' || s.status === 'REPAIR'), [serials]);

  async function loadAll() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, serialsRes, claimsRes, productsRes, warehousesRes, customersRes, suppliersRes] = await Promise.all([
      api.get('/warranty/summary'),
      api.get('/warranty/serials', { params }),
      api.get('/warranty/claims'),
      api.get('/products'),
      api.get('/branches/warehouses'),
      api.get('/customers'),
      api.get('/suppliers')
    ]);
    setSummary(summaryRes.data);
    setSerials(serialsRes.data);
    setClaims(claimsRes.data);
    setProducts(productsRes.data);
    setWarehouses(warehousesRes.data);
    setCustomers(customersRes.data);
    setSuppliers(suppliersRes.data);
    if (!serialForm.productId && productsRes.data[0]) setSerialForm((old) => ({ ...old, productId: productsRes.data[0].id }));
    if (!serialForm.warehouseId && warehousesRes.data[0]) setSerialForm((old) => ({ ...old, warehouseId: warehousesRes.data[0].id }));
    if (!actionWarehouseId && warehousesRes.data[0]) setActionWarehouseId(warehousesRes.data[0].id);
    if (!actionCustomerId && customersRes.data[0]) setActionCustomerId(customersRes.data[0].id);
  }

  useEffect(() => {
    loadAll().catch((e) => setError(e.response?.data?.message || 'Failed to load warranty data'));
  }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  async function applyFilters() {
    setError('');
    try { await loadAll(); } catch (e) { setError(e.response?.data?.message || 'Failed to apply filters'); }
  }

  async function submitSerials(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/warranty/serials', {
        ...serialForm,
        supplierId: serialForm.supplierId || null,
        warehouseId: serialForm.warehouseId || null,
        warrantyMonths: serialForm.warrantyMonths ? Number(serialForm.warrantyMonths) : null,
        warrantyStartAt: serialForm.warrantyStartAt || null,
        warrantyEndAt: serialForm.warrantyEndAt || null
      });
      setSerialForm((old) => ({ ...serialFormInitial, productId: old.productId, warehouseId: old.warehouseId, warrantyMonths: old.warrantyMonths }));
      flash(`${data.created} serial/IMEI item(s) registered`);
      setDrawer(null);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to register serials'); }
  }

  async function sellSerial(serial) {
    setError('');
    const customerId = actionCustomerId || window.prompt('Customer ID?');
    if (!customerId) return setError('Select a customer first.');
    try {
      await api.post(`/warranty/serials/${serial.id}/sell`, { customerId, warrantyMonths: 12, notes: 'Sold from warranty page' });
      flash(`${serial.serialNo} marked as sold`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to mark serial as sold'); }
  }

  async function transferSerial(serial) {
    setError('');
    if (!actionWarehouseId) return setError('Select a warehouse first.');
    try {
      await api.post(`/warranty/serials/${serial.id}/transfer`, { warehouseId: actionWarehouseId, notes: 'Manual serial transfer' });
      flash(`${serial.serialNo} transferred`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to transfer serial'); }
  }

  async function changeSerialStatus(serial, status) {
    setError('');
    try {
      await api.patch(`/warranty/serials/${serial.id}/status`, { status, notes: `Status changed to ${status}` });
      flash(`${serial.serialNo} marked ${status}`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update serial status'); }
  }

  async function submitClaim(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/warranty/claims', {
        ...claimForm,
        customerId: claimForm.customerId || null,
        serviceCost: Number(claimForm.serviceCost || 0)
      });
      setClaimForm(claimFormInitial);
      flash(`Warranty claim ${data.claimNo} opened`);
      setDrawer(null);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to open warranty claim'); }
  }

  async function updateClaim(claim, status) {
    setError('');
    const resolution = ['COMPLETED', 'REJECTED', 'REPLACED'].includes(status)
      ? (window.prompt('Resolution note?', claim.resolution || '') || `${status} by user`)
      : claim.resolution || '';
    try {
      await api.patch(`/warranty/claims/${claim.id}/status`, { status, resolution });
      flash(`${claim.claimNo} marked ${status}`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update warranty claim'); }
  }

  async function generateExpiryAlerts() {
    setError('');
    try {
      const { data } = await api.post('/warranty/alerts/warranty-expiry');
      flash(`${data.created} warranty expiry alert(s) created`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate warranty alerts'); }
  }

  const serialColumns = [
    { key: 'serialNo', label: 'Serial / IMEI', render: (r) => <><strong>{r.serialNo}</strong><span className="table-subtext">{r.imei1 || r.batchNo || 'No IMEI/batch'} </span></> },
    { key: 'productName', label: 'Product', render: (r) => <>{r.productName}<span className="table-subtext">{r.warehouseName}</span></> },
    { key: 'party', label: 'Party', render: (r) => <>{r.customerName !== '-' ? r.customerName : r.supplierName}<span className="table-subtext">Customer / Supplier</span></> },
    { key: 'warrantyEndAt', label: 'Warranty', render: (r) => <>{warrantyBadge(r)}<span className="table-subtext">Ends: {date(r.warrantyEndAt)}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  const claimColumns = [
    { key: 'claimNo', label: 'Claim', render: (r) => <><strong>{r.claimNo}</strong><span className="table-subtext">{date(r.receivedAt)}</span></> },
    { key: 'productName', label: 'Item', render: (r) => <>{r.productName}<span className="table-subtext">{r.serialNo}</span></> },
    { key: 'customerName', label: 'Customer' },
    { key: 'issueDescription', label: 'Issue' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  return (
    <div className="page warranty-page stage8-page">
      <div className="page-head">
        <div>
          <h1>Warranty + Serial/IMEI Tracking</h1>
          <p>Track mobile phones, electronics, computer parts, appliances, warranty dates and service claims.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={generateExpiryAlerts}><AlertTriangle size={18}/> Warranty Alerts</button>
          <button className="secondary-btn" onClick={loadAll}><RefreshCw size={18}/> Refresh</button>
          <button className="primary-btn" onClick={() => setDrawer('serial')}><ShieldCheck size={18}/> Register Serial</button>
          <button className="primary-btn" onClick={() => setDrawer('claim')}><Wrench size={18}/> Open Claim</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid warranty-stat-grid">
        <div className="stat-card"><span>Total Serials</span><strong>{summary?.total || 0}</strong><small>IMEI / serial records</small></div>
        <div className="stat-card tone-green"><span>In Stock</span><strong>{summary?.inStock || 0}</strong><small>Ready to sell</small></div>
        <div className="stat-card tone-blue"><span>Sold</span><strong>{summary?.sold || 0}</strong><small>Customer warranty active</small></div>
        <div className="stat-card tone-orange"><span>Repair</span><strong>{summary?.repair || 0}</strong><small>Currently in service</small></div>
        <div className="stat-card"><span>Open Claims</span><strong>{summary?.openClaims || 0}</strong><small>Needs action</small></div>
        <div className="stat-card tone-orange"><span>Expiring 30 Days</span><strong>{summary?.expiringWarranty || 0}</strong><small>{summary?.expiredWarranty || 0} expired</small></div>
      </div>

      <section className="panel warranty-filter-panel ops-register-panel">
        <div className="section-title-row">
          <div><h2><Smartphone size={20}/> Serial / IMEI Register</h2><p>Search by product name, customer name, serial number, IMEI or batch. Actions use the selected warehouse/customer below.</p></div>
        </div>
        <div className="form-grid four">
          <label>Search<input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="IMEI, serial, product..." /></label>
          <label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option>{['IN_STOCK', 'SOLD', 'REPAIR', 'RETURNED', 'DAMAGED', 'LOST', 'EXPIRED'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <label>Warranty<select value={filters.expiring} onChange={(e) => setFilters({ ...filters, expiring: e.target.value })}><option value="">All</option><option value="30">Expiring in 30 days</option><option value="expired">Expired</option></select></label>
          <label>Action Warehouse<select value={actionWarehouseId} onChange={(e) => setActionWarehouseId(e.target.value)}><option value="">Select</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label>Action Customer<select value={actionCustomerId} onChange={(e) => setActionCustomerId(e.target.value)}><option value="">Select</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <button className="primary-btn" onClick={applyFilters}>Apply Filters</button>
        </div>
        <DataTable columns={serialColumns} rows={serials} empty="No serial/IMEI records found" onRowClick={setSelectedSerial} paginationLabel="serials" />
      </section>

      <section className="panel ops-register-panel">
        <div className="section-title-row"><div><h2><CheckCircle2 size={20}/> Warranty Claims</h2><p>Manage repair, replacement, rejection and completed claim statuses.</p></div></div>
        <DataTable columns={claimColumns} rows={claims} empty="No warranty claims found" onRowClick={setSelectedClaim} paginationLabel="claims" />
      </section>


      <ModalDrawer open={Boolean(selectedSerial)} onClose={() => setSelectedSerial(null)} title={selectedSerial ? `Serial ${selectedSerial.serialNo}` : 'Serial Details'} eyebrow="Warranty serial" description="View serial/IMEI details and run actions from the modal." mode="modal" size="lg">
        {selectedSerial && <div className="detail-modal-content">
          <div className="detail-grid">
            <div><span>Product</span><strong>{selectedSerial.productName || '-'}</strong></div>
            <div><span>Status</span><strong><span className={`badge ${statusClass(selectedSerial.status)}`}>{selectedSerial.status}</span></strong></div>
            <div><span>Warehouse</span><strong>{selectedSerial.warehouseName || '-'}</strong></div>
            <div><span>Customer</span><strong>{selectedSerial.customerName || '-'}</strong></div>
            <div><span>Supplier</span><strong>{selectedSerial.supplierName || '-'}</strong></div>
            <div><span>Warranty End</span><strong>{date(selectedSerial.warrantyEndAt)}</strong></div>
          </div>
          <div className="modal-action-row">
            {selectedSerial.status === 'IN_STOCK' && <button className="primary-btn" onClick={() => { sellSerial(selectedSerial); setSelectedSerial(null); }}>Sell</button>}
            <button className="secondary-btn" onClick={() => { transferSerial(selectedSerial); setSelectedSerial(null); }}>Transfer</button>
            <button className="danger-btn" onClick={() => { changeSerialStatus(selectedSerial, 'DAMAGED'); setSelectedSerial(null); }}>Mark Damaged</button>
          </div>
        </div>}
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedClaim)} onClose={() => setSelectedClaim(null)} title={selectedClaim ? `Claim ${selectedClaim.claimNo}` : 'Claim Details'} eyebrow="Warranty claim" description="View claim information and update repair/replacement status here." mode="modal" size="lg">
        {selectedClaim && <div className="detail-modal-content">
          <div className="detail-grid">
            <div><span>Product</span><strong>{selectedClaim.productName || '-'}</strong></div>
            <div><span>Serial</span><strong>{selectedClaim.serialNo || '-'}</strong></div>
            <div><span>Customer</span><strong>{selectedClaim.customerName || '-'}</strong></div>
            <div><span>Status</span><strong><span className={`badge ${statusClass(selectedClaim.status)}`}>{selectedClaim.status}</span></strong></div>
            <div><span>Received</span><strong>{date(selectedClaim.receivedAt)}</strong></div>
            <div><span>Cost</span><strong>LKR {Number(selectedClaim.serviceCost || 0).toLocaleString()}</strong></div>
          </div>
          <div className="modal-info-block"><strong>Issue</strong><p>{selectedClaim.issueDescription || '-'}</p></div>
          <div className="modal-action-row">
            {selectedClaim.status === 'OPEN' && <button className="secondary-btn" onClick={() => { updateClaim(selectedClaim, 'IN_PROGRESS'); setSelectedClaim(null); }}>Start Repair</button>}
            {['OPEN','IN_PROGRESS'].includes(selectedClaim.status) && <button className="primary-btn" onClick={() => { updateClaim(selectedClaim, 'COMPLETED'); setSelectedClaim(null); }}>Complete</button>}
            {['OPEN','IN_PROGRESS'].includes(selectedClaim.status) && <button className="secondary-btn" onClick={() => { updateClaim(selectedClaim, 'REPLACED'); setSelectedClaim(null); }}>Replace</button>}
          </div>
        </div>}
      </ModalDrawer>

      <ModalDrawer open={drawer === 'serial'} onClose={() => setDrawer(null)} title="Register Serial / IMEI" eyebrow="Warranty" description="Add one or many serial numbers after GRN or product purchase.">
        <form onSubmit={submitSerials} className="form-grid two">
          <label>Product<select value={serialForm.productId} onChange={(e) => setSerialForm({ ...serialForm, productId: e.target.value })}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
          <label>Warehouse<select value={serialForm.warehouseId} onChange={(e) => setSerialForm({ ...serialForm, warehouseId: e.target.value })}><option value="">No warehouse</option>{warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label>Supplier<select value={serialForm.supplierId} onChange={(e) => setSerialForm({ ...serialForm, supplierId: e.target.value })}><option value="">Optional supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Batch No<input value={serialForm.batchNo} onChange={(e) => setSerialForm({ ...serialForm, batchNo: e.target.value })} placeholder="Batch / lot no" /></label>
          <label>Warranty Months<input type="number" value={serialForm.warrantyMonths} onChange={(e) => setSerialForm({ ...serialForm, warrantyMonths: e.target.value })} /></label>
          <label>Warranty End Date<input type="date" value={serialForm.warrantyEndAt} onChange={(e) => setSerialForm({ ...serialForm, warrantyEndAt: e.target.value })} /></label>
          <label className="span-two">Serial / IMEI Numbers<textarea value={serialForm.serialNumbers} onChange={(e) => setSerialForm({ ...serialForm, serialNumbers: e.target.value })} placeholder={'Enter one per line\nIMEI001\nIMEI002'} /></label>
          <label className="span-two">Notes<textarea value={serialForm.notes} onChange={(e) => setSerialForm({ ...serialForm, notes: e.target.value })} placeholder="Warranty terms, supplier invoice no, condition..." /></label>
          <button className="primary-btn span-two"><ShieldCheck size={18}/> Register Serials</button>
        </form>
      </ModalDrawer>

      <ModalDrawer open={drawer === 'claim'} onClose={() => setDrawer(null)} title="Open Warranty Claim" eyebrow="Warranty service" description="Open a repair/replacement claim in a responsive drawer.">
        <form onSubmit={submitClaim} className="form-grid">
          <label>Serial / IMEI<select value={claimForm.serialId} onChange={(e) => setClaimForm({ ...claimForm, serialId: e.target.value })}><option value="">Select serial</option>{inStockSerials.map((s) => <option key={s.id} value={s.id}>{s.serialNo} • {s.productName}</option>)}</select></label>
          <label>Customer<select value={claimForm.customerId} onChange={(e) => setClaimForm({ ...claimForm, customerId: e.target.value })}><option value="">Use linked customer</option>{customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Service Cost<input type="number" value={claimForm.serviceCost} onChange={(e) => setClaimForm({ ...claimForm, serviceCost: e.target.value })} /></label>
          <label className="span-two">Issue Description<textarea value={claimForm.issueDescription} onChange={(e) => setClaimForm({ ...claimForm, issueDescription: e.target.value })} placeholder="Display problem, charging issue, motherboard issue..." /></label>
          <label className="span-two">Resolution Note<textarea value={claimForm.resolution} onChange={(e) => setClaimForm({ ...claimForm, resolution: e.target.value })} placeholder="Optional initial note" /></label>
          <button className="primary-btn span-two"><Wrench size={18}/> Open Claim</button>
        </form>
      </ModalDrawer>
    </div>
  );
}
