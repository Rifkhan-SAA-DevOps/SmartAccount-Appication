import { useEffect, useMemo, useState } from 'react';
import { FileUp, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';
import '../styles/stage9-operations-polish.css';

const uploadInitial = { purpose: 'DOCUMENT', folder: 'documents', entityType: '', entityId: '' };
const purposeToFolder = { LOGO: 'logos', INVOICE_ATTACHMENT: 'invoices', EXPENSE_RECEIPT: 'expenses', PRODUCT_IMAGE: 'products', DOCUMENT: 'documents' };
const purposeLabels = { DOCUMENT: 'Business document', LOGO: 'Company logo', INVOICE_ATTACHMENT: 'Invoice attachment', EXPENSE_RECEIPT: 'Expense receipt', PRODUCT_IMAGE: 'Product image' };
const entityTypes = ['Invoice', 'Expense', 'Product', 'Customer', 'Supplier', 'PurchaseOrder', 'ServiceJob', 'FixedAsset', 'ApprovalRequest'];

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
function shortDate(value) { return value ? new Date(value).toLocaleString() : '-'; }
function safeStatusClass(status) { return String(status || 'UPLOADED').toLowerCase(); }

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [entities, setEntities] = useState({});
  const [config, setConfig] = useState(null);
  const [filters, setFilters] = useState({ purpose: '', entityType: '', status: '', q: '' });
  const [form, setForm] = useState(uploadInitial);
  const [file, setFile] = useState(null);
  const [selected, setSelected] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [docsRes, configRes, summaryRes, entityRes] = await Promise.all([
      api.get('/files', { params }),
      api.get('/files/config'),
      api.get('/files/summary', { params }),
      api.get('/files/entities')
    ]);
    setDocuments(docsRes.data || []);
    setConfig(configRes.data);
    setSummary(summaryRes.data || null);
    setEntities(entityRes.data || {});
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load documents'));
  }, [filters.purpose, filters.entityType, filters.status]);

  const selectedEntityOptions = entities[form.entityType] || [];
  const totals = useMemo(() => ({
    total: summary?.totalActive || documents.length,
    archived: summary?.archived || 0,
    linked: summary?.linked || documents.filter((d) => d.entityType).length,
    unlinked: summary?.unlinked || documents.filter((d) => !d.entityType).length,
    totalSizeMb: summary?.totalSizeMb || 0
  }), [summary, documents]);

  function setPurpose(purpose) { setForm((prev) => ({ ...prev, purpose, folder: purposeToFolder[purpose] || 'documents' })); }
  function applySearch(e) { e.preventDefault(); load().catch((err) => setError(err.response?.data?.message || 'Search failed')); }

  async function submit(e) {
    e.preventDefault();
    setError(''); setSuccess(''); setUploading(true);
    try {
      if (!file) throw new Error('Please select a file to upload.');
      const document = await uploadBusinessFile(file, {
        purpose: form.purpose,
        folder: form.folder,
        entityType: form.entityType || null,
        entityId: form.entityId || null
      });
      setSuccess(`${document.originalName} uploaded successfully.`);
      setFile(null); setForm(uploadInitial); setUploadOpen(false);
      await load();
    } catch (e) { setError(e.response?.data?.message || e.message || 'Upload failed'); }
    finally { setUploading(false); }
  }

  async function updateDocument(row, updates) {
    setError(''); setSuccess('');
    try {
      await api.put(`/files/${row.id}`, updates);
      setSuccess('Document updated.'); setSelected(null); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update document'); }
  }

  async function removeDocument(row) {
    if (!confirm(`Remove ${row.originalName} from SmartLedger?`)) return;
    setError(''); setSuccess('');
    try { await api.delete(`/files/${row.id}`); setSuccess('Document removed from list.'); setSelected(null); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to remove document'); }
  }

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => shortDate(r.createdAt) },
    { key: 'originalName', label: 'File', render: (r) => <div><strong>{r.originalName}</strong><small className="muted-line">{r.mimeType}</small></div> },
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="badge info">{purposeLabels[r.purpose] || r.purpose}</span> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${safeStatusClass(r.status)}`}>{r.status || 'UPLOADED'}</span> },
    { key: 'sizeBytes', label: 'Size', render: (r) => formatBytes(r.sizeBytes) },
    { key: 'entity', label: 'Linked To', render: (r) => r.entityType ? `${r.entityType}${r.entityId ? ` • ${r.entityId.slice(0, 8)}` : ''}` : <span className="danger-text">Unlinked</span> },
    { key: 'open', label: 'Open', render: (r) => r.publicUrl ? <a className="mini-action link-btn" href={r.publicUrl} target="_blank" rel="noreferrer">Open</a> : '-' }
  ];

  return (
    <div className="page documents-page document-center-page stage9-page">
      <div className="page-head document-hero stage9-hero">
        <div>
          <span className="eyebrow">Document center</span>
          <h1>Document Attachment Center</h1>
          <p>Attach, organize and search business files without shrinking the document library table.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
          <button className="primary-btn" onClick={() => setUploadOpen(true)}><FileUp size={16} /> Upload & Attach File</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      {config && !config.enabled && <div className="warning-box">S3 is not configured. Add <b>S3_UPLOAD_BUCKET</b> in <code>server/.env</code> before uploading.</div>}

      <div className="stat-grid document-stat-grid">
        <div className="stat-card"><span>Total Documents</span><strong>{totals.total}</strong><small>{totals.totalSizeMb} MB stored</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Linked Files</span><strong>{totals.linked}</strong><small>Connected to ERP records</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Unlinked Files</span><strong>{totals.unlinked}</strong><small>Need attachment review</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Archived</span><strong>{totals.archived}</strong><small>Kept but hidden</small><div className="stat-orb" /></div>
      </div>

      <section className="panel document-filter-panel stage9-filter-panel">
        <form onSubmit={applySearch} className="stage9-filter-grid">
          <input placeholder="Search file name, type, entity or ID" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          <select value={filters.purpose} onChange={(e) => setFilters({ ...filters, purpose: e.target.value })}><option value="">All purposes</option>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}><option value="">All entities</option>{entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select>
          <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">Active + archived</option><option value="UPLOADED">Uploaded</option><option value="ARCHIVED">Archived</option></select>
          <button className="secondary-btn">Search</button>
        </form>
      </section>

      <section className="panel stage9-register-panel">
        <div className="ledger-toolbar">
          <div><h2>Document Library</h2><p>Click a document row to view, relink, archive or remove it. The register stays full width.</p></div>
        </div>
        <DataTable columns={columns} rows={documents} empty="No documents uploaded yet" onRowClick={setSelected} paginationLabel="documents" />
      </section>

      <ModalDrawer open={uploadOpen} onClose={() => setUploadOpen(false)} title="Upload & Attach File" description="Upload the file inside a drawer so the document library stays full width." eyebrow="Document upload">
        <form onSubmit={submit} className="form-grid compact">
          <label>Purpose<select value={form.purpose} onChange={(e) => setPurpose(e.target.value)}>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Folder<input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} /></label>
          <label>Linked Entity Type<select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value, entityId: '' })}><option value="">No linked record</option>{entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label>Linked Entity<select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} disabled={!form.entityType}><option value="">Choose record</option>{selectedEntityOptions.map((entity) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}</select></label>
          <label className="file-drop span-two"><input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} /><strong>{file ? file.name : 'Choose file'}</strong><span>{file ? `${file.type || 'Unknown type'} • ${formatBytes(file.size)}` : `Allowed max: ${config?.maxUploadMb || 10} MB`}</span></label>
          <button className="primary-btn span-two" disabled={uploading || !config?.enabled}>{uploading ? 'Uploading...' : 'Upload and Attach'}</button>
        </form>
      </ModalDrawer>

      <ModalDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selected ? selected.originalName : 'Manage Document'} eyebrow="Document detail" description="Update document purpose, status and link information here." mode="modal" size="lg">
        {selected && <div className="detail-modal-content">
          <div className="detail-grid">
            <div><span>File</span><strong>{selected.originalName}</strong></div>
            <div><span>Size</span><strong>{formatBytes(selected.sizeBytes)}</strong></div>
            <div><span>Status</span><strong><span className={`badge ${safeStatusClass(selected.status)}`}>{selected.status || 'UPLOADED'}</span></strong></div>
            <div><span>Uploaded</span><strong>{shortDate(selected.createdAt)}</strong></div>
          </div>
          <div className="form-grid compact">
            <label>Purpose<select value={selected.purpose} onChange={(e) => setSelected({ ...selected, purpose: e.target.value, folder: purposeToFolder[e.target.value] || selected.folder })}>{Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label>Status<select value={selected.status || 'UPLOADED'} onChange={(e) => setSelected({ ...selected, status: e.target.value })}><option value="UPLOADED">Uploaded</option><option value="ARCHIVED">Archived</option></select></label>
            <label>Entity Type<select value={selected.entityType || ''} onChange={(e) => setSelected({ ...selected, entityType: e.target.value, entityId: '' })}><option value="">No linked record</option>{entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
            <label>Entity ID<input value={selected.entityId || ''} onChange={(e) => setSelected({ ...selected, entityId: e.target.value })} placeholder="Record ID" /></label>
          </div>
          <div className="modal-action-row">
            {selected.publicUrl && <a className="secondary-btn" href={selected.publicUrl} target="_blank" rel="noreferrer">Open File</a>}
            <button className="primary-btn" onClick={() => updateDocument(selected, { purpose: selected.purpose, status: selected.status || 'UPLOADED', entityType: selected.entityType || null, entityId: selected.entityId || null, originalName: selected.originalName })}>Save Changes</button>
            <button className="danger-btn" onClick={() => removeDocument(selected)}>Remove</button>
          </div>
        </div>}
      </ModalDrawer>
    </div>
  );
}
