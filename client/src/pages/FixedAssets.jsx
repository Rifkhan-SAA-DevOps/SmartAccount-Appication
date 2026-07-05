import { useEffect, useMemo, useState } from 'react';
import { Archive, BellRing, Calculator, Eye, Plus, RefreshCw, Trash2, Wrench } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyAsset = { supplierId: '', name: '', category: 'Equipment', serialNo: '', location: '', custodianEmployeeId: '', purchaseDate: '', purchaseCost: 0, salvageValue: 0, usefulLifeMonths: 60, depreciationMethod: 'STRAIGHT_LINE', warrantyUntil: '', nextMaintenanceDate: '', notes: '' };
const emptyMaintenance = { assetId: '', maintenanceDate: '', vendor: '', description: '', cost: 0, nextMaintenanceDate: '', status: 'COMPLETED', notes: '' };

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function dateOnly(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'active') return 'paid';
  if (s === 'disposed' || s === 'lost') return 'cancelled';
  if (s === 'maintenance' || s === 'fully_depreciated') return 'unpaid';
  return 'partial';
}

function cleanLabel(value) {
  return String(value || '-').replaceAll('_', ' ');
}

export default function FixedAssets() {
  const [summary, setSummary] = useState(null);
  const [assets, setAssets] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [assetForm, setAssetForm] = useState(emptyAsset);
  const [maintenanceForm, setMaintenanceForm] = useState(emptyMaintenance);
  const [filters, setFilters] = useState({ q: '', status: '', category: '' });
  const [tab, setTab] = useState('assets');
  const [assetDrawer, setAssetDrawer] = useState(false);
  const [maintenanceDrawer, setMaintenanceDrawer] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, assetRes, supplierRes] = await Promise.all([
      api.get('/assets/summary'),
      api.get('/assets', { params }),
      api.get('/suppliers')
    ]);
    setSummary(summaryRes.data);
    setAssets(Array.isArray(assetRes.data) ? assetRes.data : []);
    setSuppliers(Array.isArray(supplierRes.data) ? supplierRes.data : []);
    try {
      const empRes = await api.get('/hr/employees');
      setEmployees(Array.isArray(empRes.data) ? empRes.data : []);
    } catch {
      setEmployees([]);
    }
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load fixed assets'));
  }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const categories = useMemo(() => [...new Set(assets.map((a) => a.category).filter(Boolean))], [assets]);
  const maintenanceDue = useMemo(() => assets.filter((a) => a.isMaintenanceDue), [assets]);
  const activeAssets = useMemo(() => assets.filter((a) => a.status === 'ACTIVE'), [assets]);

  function openAssetCreate() {
    setAssetForm(emptyAsset);
    setAssetDrawer(true);
  }

  function openMaintenance(asset = null) {
    setMaintenanceForm({ ...emptyMaintenance, assetId: asset?.id || selectedAsset?.id || '' });
    setMaintenanceDrawer(true);
  }

  async function createAsset(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/assets', {
        ...assetForm,
        supplierId: assetForm.supplierId || null,
        custodianEmployeeId: assetForm.custodianEmployeeId || null,
        serialNo: assetForm.serialNo || null,
        location: assetForm.location || null,
        warrantyUntil: assetForm.warrantyUntil || null,
        nextMaintenanceDate: assetForm.nextMaintenanceDate || null,
        purchaseCost: Number(assetForm.purchaseCost || 0),
        salvageValue: Number(assetForm.salvageValue || 0),
        usefulLifeMonths: Number(assetForm.usefulLifeMonths || 60)
      });
      setAssetForm(emptyAsset);
      setAssetDrawer(false);
      flash('Fixed asset registered');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save asset');
    } finally {
      setSaving(false);
    }
  }

  async function postDepreciation(asset) {
    if (!asset) return;
    const value = window.prompt(`Depreciation amount for ${asset.assetNo}. Leave blank for monthly amount.`, '');
    setError('');
    try {
      await api.post(`/assets/${asset.id}/depreciate`, { amount: value ? Number(value) : undefined });
      flash(`Depreciation posted for ${asset.assetNo}`);
      setSelectedAsset(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to post depreciation');
    }
  }

  async function runDepreciation() {
    if (!window.confirm('Post monthly depreciation for all active assets?')) return;
    setError('');
    try {
      const { data } = await api.post('/assets/run-depreciation');
      flash(`${data.posted} asset depreciation entries posted`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to run depreciation');
    }
  }

  async function disposeAsset(asset) {
    if (!asset) return;
    const value = window.prompt(`Disposal amount received for ${asset.assetNo}`, '0');
    if (value === null) return;
    const notes = window.prompt('Disposal note?', 'Asset disposed') || 'Asset disposed';
    setError('');
    try {
      await api.post(`/assets/${asset.id}/dispose`, { disposalAmount: Number(value || 0), notes });
      flash(`${asset.assetNo} disposed`);
      setSelectedAsset(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to dispose asset');
    }
  }

  async function saveMaintenance(e) {
    e.preventDefault();
    if (!maintenanceForm.assetId) return setError('Select an asset for maintenance');
    setSaving(true);
    setError('');
    try {
      await api.post(`/assets/${maintenanceForm.assetId}/maintenance`, {
        ...maintenanceForm,
        cost: Number(maintenanceForm.cost || 0),
        maintenanceDate: maintenanceForm.maintenanceDate || undefined,
        nextMaintenanceDate: maintenanceForm.nextMaintenanceDate || null
      });
      setMaintenanceForm(emptyMaintenance);
      setMaintenanceDrawer(false);
      setSelectedAsset(null);
      flash('Maintenance record saved');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save maintenance');
    } finally {
      setSaving(false);
    }
  }

  async function createAlerts() {
    setError('');
    try {
      const { data } = await api.post('/assets/alerts');
      flash(`${data.created} maintenance alert(s) created`);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create alerts');
    }
  }

  const assetColumns = [
    { key: 'assetNo', label: 'Asset', render: (r) => <><strong>{r.assetNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'category', label: 'Category', render: (r) => <>{r.category}<span className="table-subtext">{r.location || '-'}</span></> },
    { key: 'purchaseCost', label: 'Cost / Book', render: (r) => <><strong>{money(r.purchaseCost)}</strong><span className="table-subtext">Book {money(r.bookValue)}</span></> },
    { key: 'depreciation', label: 'Depreciation', render: (r) => <>{money(r.accumulatedDepreciation)}<span className="table-subtext">Monthly {money(r.monthlyDepreciation)}</span></> },
    { key: 'maintenance', label: 'Maintenance', render: (r) => <>{dateOnly(r.nextMaintenanceDate)}{r.isMaintenanceDue && <span className="table-subtext danger-text">Due soon</span>}</> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{cleanLabel(r.status)}</span> }
  ];

  const depreciationColumns = [
    { key: 'depreciationDate', label: 'Date', render: (r) => dateOnly(r.depreciationDate) },
    { key: 'period', label: 'Period', render: (r) => `${dateOnly(r.periodStart)} - ${dateOnly(r.periodEnd)}` },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'accumulatedAfter', label: 'Accumulated', render: (r) => money(r.accumulatedAfter) },
    { key: 'bookValueAfter', label: 'Book Value', render: (r) => money(r.bookValueAfter) }
  ];

  const maintenanceColumns = [
    { key: 'maintenanceDate', label: 'Date', render: (r) => dateOnly(r.maintenanceDate) },
    { key: 'description', label: 'Description' },
    { key: 'vendor', label: 'Vendor', render: (r) => r.vendor || '-' },
    { key: 'cost', label: 'Cost', render: (r) => money(r.cost) },
    { key: 'status', label: 'Status', render: (r) => <span className="badge partial">{cleanLabel(r.status)}</span> }
  ];

  return (
    <div className="page fixed-assets-page stage11-assets-page">
      <div className="page-header stage11-hero">
        <div>
          <span className="eyebrow">Fixed asset management</span>
          <h1>Fixed Assets</h1>
          <p>Keep the asset register full width. Click a row to view details, maintenance, depreciation and actions in a modal.</p>
        </div>
        <div className="head-actions stage11-head-actions">
          <button className="ghost-btn" type="button" onClick={load}><RefreshCw size={16} /> Refresh</button>
          <button className="secondary-btn" type="button" onClick={createAlerts}><BellRing size={16} /> Maintenance Alerts</button>
          <button className="primary-btn" type="button" onClick={openAssetCreate}><Plus size={16} /> Register Asset</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid fixed-asset-stat-grid stage11-stat-grid">
        <StatCard title="Total Assets" value={summary?.total || 0} subtitle={`${summary?.active || 0} active`} />
        <StatCard title="Cost Value" value={money(summary?.costValue)} subtitle="Purchase value" tone="green" />
        <StatCard title="Book Value" value={money(summary?.bookValue)} subtitle="After depreciation" tone="orange" />
        <StatCard title="Maintenance Due" value={summary?.maintenanceDue || 0} subtitle={`${summary?.disposed || 0} disposed`} tone="red" />
      </div>

      <div className="tab-actions stage11-tab-actions">
        <button className={`tab-btn ${tab === 'assets' ? 'active' : ''}`} type="button" onClick={() => setTab('assets')}><Archive size={16} /> Asset Register</button>
        <button className={`tab-btn ${tab === 'maintenance' ? 'active' : ''}`} type="button" onClick={() => setTab('maintenance')}><Wrench size={16} /> Maintenance Due</button>
        <button className={`tab-btn ${tab === 'depreciation' ? 'active' : ''}`} type="button" onClick={() => setTab('depreciation')}><Calculator size={16} /> Depreciation</button>
      </div>

      {tab === 'assets' && (
        <section className="panel stage11-assets-panel">
          <div className="stage11-panel-head">
            <div>
              <h2>Asset Register</h2>
              <p>Click an asset row to view the full asset profile and action buttons.</p>
            </div>
            <button className="primary-btn" type="button" onClick={openAssetCreate}><Plus size={16} /> Register New Asset</button>
          </div>
          <div className="audit-filter-grid fixed-asset-filter-grid stage11-filter-grid">
            <label className="span-two">Search<input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Asset no, name, serial, location" /></label>
            <label>Status<select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All</option>{['ACTIVE', 'MAINTENANCE', 'FULLY_DEPRECIATED', 'DISPOSED', 'LOST'].map((s) => <option key={s}>{s}</option>)}</select></label>
            <label>Category<select value={filters.category} onChange={(e) => setFilters({ ...filters, category: e.target.value })}><option value="">All</option>{categories.map((c) => <option key={c}>{c}</option>)}</select></label>
            <button className="primary-btn" type="button" onClick={load}>Apply Filter</button>
          </div>
          <DataTable columns={assetColumns} rows={assets} empty="No fixed assets found" paginationLabel="assets" pageSize={10} onRowClick={(row) => setSelectedAsset(row)} />
        </section>
      )}

      {tab === 'maintenance' && (
        <section className="panel stage11-assets-panel">
          <div className="stage11-panel-head">
            <div>
              <h2>Maintenance Due</h2>
              <p>Click an asset to view details or record maintenance from the modal.</p>
            </div>
            <button className="primary-btn" type="button" onClick={() => openMaintenance()}><Wrench size={16} /> Record Maintenance</button>
          </div>
          <DataTable columns={assetColumns} rows={maintenanceDue} empty="No maintenance due" paginationLabel="assets" pageSize={10} onRowClick={(row) => setSelectedAsset(row)} />
        </section>
      )}

      {tab === 'depreciation' && (
        <section className="panel depreciation-panel stage11-assets-panel">
          <div className="stage11-panel-head">
            <div>
              <h2>Depreciation</h2>
              <p>Click an active asset to review details, or run monthly depreciation for all active assets.</p>
            </div>
            <button className="primary-btn" type="button" onClick={runDepreciation}><Calculator size={16} /> Run Monthly Depreciation</button>
          </div>
          <DataTable columns={assetColumns} rows={activeAssets} empty="No active depreciable assets" paginationLabel="active assets" pageSize={10} onRowClick={(row) => setSelectedAsset(row)} />
        </section>
      )}

      <ModalDrawer
        open={assetDrawer}
        onClose={() => setAssetDrawer(false)}
        title="Register Fixed Asset"
        eyebrow="Asset register"
        description="Add the asset once. Depreciation, maintenance and disposal actions are handled from the asset detail modal."
        size="lg"
      >
        <form className="form-grid stage11-modal-form" onSubmit={createAsset}>
          <label>Name<input required value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} placeholder="Laptop, vehicle, camera, machinery" /></label>
          <label>Category<input value={assetForm.category} onChange={(e) => setAssetForm({ ...assetForm, category: e.target.value })} /></label>
          <label>Supplier<select value={assetForm.supplierId} onChange={(e) => setAssetForm({ ...assetForm, supplierId: e.target.value })}><option value="">No supplier</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Serial No<input value={assetForm.serialNo} onChange={(e) => setAssetForm({ ...assetForm, serialNo: e.target.value })} /></label>
          <label>Location<input value={assetForm.location} onChange={(e) => setAssetForm({ ...assetForm, location: e.target.value })} placeholder="Head office / warehouse" /></label>
          <label>Custodian<select value={assetForm.custodianEmployeeId} onChange={(e) => setAssetForm({ ...assetForm, custodianEmployeeId: e.target.value })}><option value="">No employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}</select></label>
          <label>Purchase Date<input required type="date" value={assetForm.purchaseDate} onChange={(e) => setAssetForm({ ...assetForm, purchaseDate: e.target.value })} /></label>
          <label>Purchase Cost<input required type="number" min="0" step="0.01" value={assetForm.purchaseCost} onChange={(e) => setAssetForm({ ...assetForm, purchaseCost: e.target.value })} /></label>
          <label>Salvage Value<input type="number" min="0" step="0.01" value={assetForm.salvageValue} onChange={(e) => setAssetForm({ ...assetForm, salvageValue: e.target.value })} /></label>
          <label>Useful Life Months<input type="number" min="1" value={assetForm.usefulLifeMonths} onChange={(e) => setAssetForm({ ...assetForm, usefulLifeMonths: e.target.value })} /></label>
          <label>Warranty Until<input type="date" value={assetForm.warrantyUntil} onChange={(e) => setAssetForm({ ...assetForm, warrantyUntil: e.target.value })} /></label>
          <label>Next Maintenance<input type="date" value={assetForm.nextMaintenanceDate} onChange={(e) => setAssetForm({ ...assetForm, nextMaintenanceDate: e.target.value })} /></label>
          <label className="span-two">Notes<textarea value={assetForm.notes} onChange={(e) => setAssetForm({ ...assetForm, notes: e.target.value })} /></label>
          <div className="modal-action-row span-two">
            <button className="ghost-btn" type="button" onClick={() => setAssetDrawer(false)}>Cancel</button>
            <button className="primary-btn" type="submit" disabled={saving}>Save Asset</button>
          </div>
        </form>
      </ModalDrawer>

      <ModalDrawer
        open={maintenanceDrawer}
        onClose={() => setMaintenanceDrawer(false)}
        title="Record Asset Maintenance"
        eyebrow="Maintenance"
        description="Record completed/scheduled maintenance without shrinking the register table."
        size="lg"
      >
        <form className="form-grid stage11-modal-form" onSubmit={saveMaintenance}>
          <label className="span-two">Asset<select required value={maintenanceForm.assetId} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, assetId: e.target.value })}><option value="">Select asset</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.assetNo} - {asset.name}</option>)}</select></label>
          <label>Date<input type="date" value={maintenanceForm.maintenanceDate} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, maintenanceDate: e.target.value })} /></label>
          <label>Vendor<input value={maintenanceForm.vendor} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, vendor: e.target.value })} /></label>
          <label className="span-two">Description<input required value={maintenanceForm.description} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })} /></label>
          <label>Cost<input type="number" min="0" value={maintenanceForm.cost} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })} /></label>
          <label>Next Maintenance<input type="date" value={maintenanceForm.nextMaintenanceDate} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, nextMaintenanceDate: e.target.value })} /></label>
          <label className="span-two">Notes<textarea value={maintenanceForm.notes} onChange={(e) => setMaintenanceForm({ ...maintenanceForm, notes: e.target.value })} /></label>
          <div className="modal-action-row span-two">
            <button className="ghost-btn" type="button" onClick={() => setMaintenanceDrawer(false)}>Cancel</button>
            <button className="primary-btn" type="submit" disabled={saving}>Save Maintenance</button>
          </div>
        </form>
      </ModalDrawer>

      <ModalDrawer
        open={Boolean(selectedAsset)}
        onClose={() => setSelectedAsset(null)}
        title={selectedAsset ? `${selectedAsset.assetNo} — ${selectedAsset.name}` : 'Asset Details'}
        eyebrow="Asset detail"
        description="Actions are moved here so the register table stays clean and responsive."
        mode="modal"
        size="xl"
      >
        {selectedAsset && (
          <div className="stage11-detail-stack">
            <div className="stage11-detail-grid">
              <div><span>Status</span><strong><span className={`badge ${statusClass(selectedAsset.status)}`}>{cleanLabel(selectedAsset.status)}</span></strong></div>
              <div><span>Category</span><strong>{selectedAsset.category || '-'}</strong></div>
              <div><span>Supplier</span><strong>{selectedAsset.supplierName || selectedAsset.supplier?.name || '-'}</strong></div>
              <div><span>Serial No</span><strong>{selectedAsset.serialNo || '-'}</strong></div>
              <div><span>Location</span><strong>{selectedAsset.location || '-'}</strong></div>
              <div><span>Purchase Date</span><strong>{dateOnly(selectedAsset.purchaseDate)}</strong></div>
              <div><span>Purchase Cost</span><strong>{money(selectedAsset.purchaseCost)}</strong></div>
              <div><span>Book Value</span><strong>{money(selectedAsset.bookValue)}</strong></div>
              <div><span>Accumulated Depreciation</span><strong>{money(selectedAsset.accumulatedDepreciation)}</strong></div>
              <div><span>Monthly Depreciation</span><strong>{money(selectedAsset.monthlyDepreciation)}</strong></div>
              <div><span>Warranty Until</span><strong>{dateOnly(selectedAsset.warrantyUntil)}</strong></div>
              <div><span>Next Maintenance</span><strong>{dateOnly(selectedAsset.nextMaintenanceDate)}</strong></div>
              {selectedAsset.notes && <div className="span-two"><span>Notes</span><strong>{selectedAsset.notes}</strong></div>}
            </div>

            <div className="stage11-modal-actions">
              <button className="ghost-btn" type="button" onClick={() => setSelectedAsset(null)}><Eye size={16} /> Close</button>
              {selectedAsset.status === 'ACTIVE' && <button className="secondary-btn" type="button" onClick={() => postDepreciation(selectedAsset)}><Calculator size={16} /> Post Depreciation</button>}
              <button className="secondary-btn" type="button" onClick={() => openMaintenance(selectedAsset)}><Wrench size={16} /> Record Maintenance</button>
              {selectedAsset.status !== 'DISPOSED' && <button className="danger-btn mini-danger" type="button" onClick={() => disposeAsset(selectedAsset)}><Trash2 size={16} /> Dispose Asset</button>}
            </div>

            <div className="stage11-history-grid">
              <section className="stage11-history-card">
                <h3>Recent Maintenance</h3>
                <DataTable columns={maintenanceColumns} rows={selectedAsset.maintenances || []} empty="No maintenance records" pageSize={5} paginationLabel="maintenance records" />
              </section>
              <section className="stage11-history-card">
                <h3>Recent Depreciation</h3>
                <DataTable columns={depreciationColumns} rows={selectedAsset.depreciations || []} empty="No depreciation records" pageSize={5} paginationLabel="depreciation records" />
              </section>
            </div>
          </div>
        )}
      </ModalDrawer>
    </div>
  );
}
