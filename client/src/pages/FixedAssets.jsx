import { useEffect, useMemo, useState } from 'react';
import { Archive, BellRing, Calculator, RefreshCw, Wrench } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyAsset = { supplierId: '', name: '', category: 'Equipment', serialNo: '', location: '', custodianEmployeeId: '', purchaseDate: '', purchaseCost: 0, salvageValue: 0, usefulLifeMonths: 60, depreciationMethod: 'STRAIGHT_LINE', warrantyUntil: '', nextMaintenanceDate: '', notes: '' };
const emptyMaintenance = { assetId: '', maintenanceDate: '', vendor: '', description: '', cost: 0, nextMaintenanceDate: '', status: 'COMPLETED', notes: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'active') return 'paid';
  if (s === 'disposed' || s === 'lost') return 'cancelled';
  if (s === 'maintenance' || s === 'fully_depreciated') return 'unpaid';
  return 'partial';
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
    setAssets(assetRes.data || []);
    setSuppliers(supplierRes.data || []);
    try {
      const empRes = await api.get('/hr/employees');
      setEmployees(empRes.data || []);
    } catch { setEmployees([]); }
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load fixed assets')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const categories = useMemo(() => [...new Set(assets.map((a) => a.category).filter(Boolean))], [assets]);
  const maintenanceDue = useMemo(() => assets.filter((a) => a.isMaintenanceDue), [assets]);

  async function createAsset(e) {
    e.preventDefault();
    setSaving(true); setError('');
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
      flash('Fixed asset registered');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save asset'); }
    finally { setSaving(false); }
  }

  async function postDepreciation(asset) {
    const value = window.prompt(`Depreciation amount for ${asset.assetNo}. Leave blank for monthly amount.`, '');
    setError('');
    try {
      await api.post(`/assets/${asset.id}/depreciate`, { amount: value ? Number(value) : undefined });
      flash(`Depreciation posted for ${asset.assetNo}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to post depreciation'); }
  }

  async function runDepreciation() {
    if (!window.confirm('Post monthly depreciation for all active assets?')) return;
    setError('');
    try {
      const { data } = await api.post('/assets/run-depreciation');
      flash(`${data.posted} asset depreciation entries posted`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to run depreciation'); }
  }

  async function disposeAsset(asset) {
    const value = window.prompt(`Disposal amount received for ${asset.assetNo}`, '0');
    if (value === null) return;
    const notes = window.prompt('Disposal note?', 'Asset disposed') || 'Asset disposed';
    setError('');
    try {
      await api.post(`/assets/${asset.id}/dispose`, { disposalAmount: Number(value || 0), notes });
      flash(`${asset.assetNo} disposed`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to dispose asset'); }
  }

  async function saveMaintenance(e) {
    e.preventDefault();
    if (!maintenanceForm.assetId) return setError('Select an asset for maintenance');
    setSaving(true); setError('');
    try {
      await api.post(`/assets/${maintenanceForm.assetId}/maintenance`, { ...maintenanceForm, cost: Number(maintenanceForm.cost || 0), maintenanceDate: maintenanceForm.maintenanceDate || undefined, nextMaintenanceDate: maintenanceForm.nextMaintenanceDate || null });
      setMaintenanceForm(emptyMaintenance);
      flash('Maintenance record saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save maintenance'); }
    finally { setSaving(false); }
  }

  async function createAlerts() {
    setError('');
    try {
      const { data } = await api.post('/assets/alerts');
      flash(`${data.created} maintenance alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create alerts'); }
  }

  const columns = [
    { key: 'assetNo', label: 'Asset', render: (r) => <><strong>{r.assetNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'category', label: 'Category', render: (r) => <>{r.category}<span className="table-subtext">{r.location || '-'}</span></> },
    { key: 'purchaseCost', label: 'Cost / Book', render: (r) => <><strong>{money(r.purchaseCost)}</strong><span className="table-subtext">Book {money(r.bookValue)}</span></> },
    { key: 'depreciation', label: 'Depreciation', render: (r) => <>{money(r.accumulatedDepreciation)}<span className="table-subtext">Monthly {money(r.monthlyDepreciation)}</span></> },
    { key: 'maintenance', label: 'Maintenance', render: (r) => <>{dateOnly(r.nextMaintenanceDate)}{r.isMaintenanceDue && <span className="table-subtext danger-text">Due soon</span>}</> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions">
      {r.status === 'ACTIVE' && <button className="mini-action" onClick={() => postDepreciation(r)}>Depreciate</button>}
      <button className="mini-action" onClick={() => { setMaintenanceForm({ ...emptyMaintenance, assetId: r.id }); setTab('maintenance'); }}>Maintain</button>
      {r.status !== 'DISPOSED' && <button className="mini-danger" onClick={() => disposeAsset(r)}>Dispose</button>}
    </div> }
  ];

  return <div className="page fixed-assets-page">
    <div className="page-header">
      <div><span className="eyebrow">Fixed asset management</span><h1>Fixed Assets</h1><p>Register company assets, post depreciation, track maintenance, custodians, disposal and book value.</p></div>
      <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={createAlerts}><BellRing size={16}/> Maintenance Alerts</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid fixed-asset-stat-grid">
      <StatCard title="Total Assets" value={summary?.total || 0} subtitle={`${summary?.active || 0} active`} />
      <StatCard title="Cost Value" value={money(summary?.costValue)} subtitle="Purchase value" tone="green" />
      <StatCard title="Book Value" value={money(summary?.bookValue)} subtitle="After depreciation" tone="orange" />
      <StatCard title="Maintenance Due" value={summary?.maintenanceDue || 0} subtitle={`${summary?.disposed || 0} disposed`} tone="red" />
    </div>

    <div className="tab-actions">
      {['assets','create','maintenance','depreciation'].map((item) => <button key={item} className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{item}</button>)}
    </div>

    {tab === 'assets' && <>
      <div className="panel fixed-asset-filter-panel">
        <div className="audit-filter-grid fixed-asset-filter-grid">
          <label className="span-two">Search<input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Asset no, name, serial, location" /></label>
          <label>Status<select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All</option>{['ACTIVE','MAINTENANCE','FULLY_DEPRECIATED','DISPOSED','LOST'].map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Category<select value={filters.category} onChange={(e)=>setFilters({...filters,category:e.target.value})}><option value="">All</option>{categories.map((c)=><option key={c}>{c}</option>)}</select></label>
          <button className="primary-btn" onClick={load}>Apply</button>
        </div>
      </div>
      <DataTable columns={columns} rows={assets} empty="No fixed assets found" />
    </>}

    {tab === 'create' && <div className="two-col-page fixed-asset-create-grid">
      <form className="panel form-grid" onSubmit={createAsset}>
        <h2><Archive size={18}/> Register asset</h2>
        <label>Name<input required value={assetForm.name} onChange={(e)=>setAssetForm({...assetForm,name:e.target.value})} placeholder="Laptop, vehicle, camera, machinery" /></label>
        <label>Category<input value={assetForm.category} onChange={(e)=>setAssetForm({...assetForm,category:e.target.value})} /></label>
        <label>Supplier<select value={assetForm.supplierId} onChange={(e)=>setAssetForm({...assetForm,supplierId:e.target.value})}><option value="">No supplier</option>{suppliers.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <label>Serial No<input value={assetForm.serialNo} onChange={(e)=>setAssetForm({...assetForm,serialNo:e.target.value})} /></label>
        <label>Location<input value={assetForm.location} onChange={(e)=>setAssetForm({...assetForm,location:e.target.value})} placeholder="Head office / warehouse" /></label>
        <label>Custodian<select value={assetForm.custodianEmployeeId} onChange={(e)=>setAssetForm({...assetForm,custodianEmployeeId:e.target.value})}><option value="">No employee</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Purchase Date<input required type="date" value={assetForm.purchaseDate} onChange={(e)=>setAssetForm({...assetForm,purchaseDate:e.target.value})} /></label>
        <label>Purchase Cost<input required type="number" min="0" step="0.01" value={assetForm.purchaseCost} onChange={(e)=>setAssetForm({...assetForm,purchaseCost:e.target.value})} /></label>
        <label>Salvage Value<input type="number" min="0" step="0.01" value={assetForm.salvageValue} onChange={(e)=>setAssetForm({...assetForm,salvageValue:e.target.value})} /></label>
        <label>Useful Life Months<input type="number" min="1" value={assetForm.usefulLifeMonths} onChange={(e)=>setAssetForm({...assetForm,usefulLifeMonths:e.target.value})} /></label>
        <label>Warranty Until<input type="date" value={assetForm.warrantyUntil} onChange={(e)=>setAssetForm({...assetForm,warrantyUntil:e.target.value})} /></label>
        <label>Next Maintenance<input type="date" value={assetForm.nextMaintenanceDate} onChange={(e)=>setAssetForm({...assetForm,nextMaintenanceDate:e.target.value})} /></label>
        <label className="span-two">Notes<textarea value={assetForm.notes} onChange={(e)=>setAssetForm({...assetForm,notes:e.target.value})} /></label>
        <button className="primary-btn span-two" disabled={saving}>Save Asset</button>
      </form>
      <div className="panel fixed-asset-help"><h2>Accounting flow</h2><div className="approval-steps"><div><strong>1</strong><span>Register asset</span><small>Asset cost, useful life, location and custodian.</small></div><div><strong>2</strong><span>Post depreciation</span><small>Debit depreciation expense and credit accumulated depreciation.</small></div><div><strong>3</strong><span>Dispose asset</span><small>Calculate gain/loss and post disposal journal.</small></div></div></div>
    </div>}

    {tab === 'maintenance' && <div className="two-col-page fixed-asset-maintenance-grid">
      <form className="panel form-grid" onSubmit={saveMaintenance}>
        <h2><Wrench size={18}/> Maintenance</h2>
        <label className="span-two">Asset<select required value={maintenanceForm.assetId} onChange={(e)=>setMaintenanceForm({...maintenanceForm,assetId:e.target.value})}><option value="">Select asset</option>{assets.map((a)=><option key={a.id} value={a.id}>{a.assetNo} - {a.name}</option>)}</select></label>
        <label>Date<input type="date" value={maintenanceForm.maintenanceDate} onChange={(e)=>setMaintenanceForm({...maintenanceForm,maintenanceDate:e.target.value})} /></label>
        <label>Vendor<input value={maintenanceForm.vendor} onChange={(e)=>setMaintenanceForm({...maintenanceForm,vendor:e.target.value})} /></label>
        <label className="span-two">Description<input required value={maintenanceForm.description} onChange={(e)=>setMaintenanceForm({...maintenanceForm,description:e.target.value})} /></label>
        <label>Cost<input type="number" min="0" value={maintenanceForm.cost} onChange={(e)=>setMaintenanceForm({...maintenanceForm,cost:e.target.value})} /></label>
        <label>Next Maintenance<input type="date" value={maintenanceForm.nextMaintenanceDate} onChange={(e)=>setMaintenanceForm({...maintenanceForm,nextMaintenanceDate:e.target.value})} /></label>
        <button className="primary-btn span-two" disabled={saving}>Save Maintenance</button>
      </form>
      <div className="panel"><h2>Due soon</h2><DataTable columns={columns.slice(0,6)} rows={maintenanceDue} empty="No maintenance due" /></div>
    </div>}

    {tab === 'depreciation' && <div className="panel depreciation-panel">
      <div className="section-title-row"><div><h2><Calculator size={18}/> Depreciation</h2><p>Post monthly depreciation for one asset or all active assets.</p></div><button className="primary-btn" onClick={runDepreciation}>Run Monthly Depreciation</button></div>
      <DataTable columns={columns} rows={assets.filter((a)=>a.status === 'ACTIVE')} empty="No active depreciable assets" />
    </div>}
  </div>;
}
