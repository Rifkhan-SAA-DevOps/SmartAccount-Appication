import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';

const uploadInitial = {
  purpose: 'DOCUMENT',
  folder: 'documents',
  entityType: '',
  entityId: ''
};

const purposeToFolder = {
  LOGO: 'logos',
  INVOICE_ATTACHMENT: 'invoices',
  EXPENSE_RECEIPT: 'expenses',
  PRODUCT_IMAGE: 'products',
  DOCUMENT: 'documents'
};

const purposeLabels = {
  DOCUMENT: 'Business document',
  LOGO: 'Company logo',
  INVOICE_ATTACHMENT: 'Invoice attachment',
  EXPENSE_RECEIPT: 'Expense receipt',
  PRODUCT_IMAGE: 'Product image'
};

const entityTypes = ['Invoice', 'Expense', 'Product', 'Customer', 'Supplier', 'PurchaseOrder', 'ServiceJob', 'FixedAsset', 'ApprovalRequest'];

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function safeStatusClass(status) {
  return String(status || 'UPLOADED').toLowerCase();
}

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [entities, setEntities] = useState({});
  const [config, setConfig] = useState(null);
  const [filters, setFilters] = useState({ purpose: '', entityType: '', status: '', q: '' });
  const [form, setForm] = useState(uploadInitial);
  const [file, setFile] = useState(null);
  const [selected, setSelected] = useState(null);
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

  function setPurpose(purpose) {
    setForm((prev) => ({ ...prev, purpose, folder: purposeToFolder[purpose] || 'documents' }));
  }

  function applySearch(e) {
    e.preventDefault();
    load().catch((err) => setError(err.response?.data?.message || 'Search failed'));
  }

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
      setFile(null);
      setForm(uploadInitial);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || e.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  async function updateDocument(row, updates) {
    setError(''); setSuccess('');
    try {
      await api.put(`/files/${row.id}`, updates);
      setSuccess('Document updated.');
      setSelected(null);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to update document');
    }
  }

  async function removeDocument(row) {
    if (!confirm(`Remove ${row.originalName} from SmartLedger?`)) return;
    setError(''); setSuccess('');
    try {
      await api.delete(`/files/${row.id}`);
      setSuccess('Document removed from list.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to remove document');
    }
  }

  const columns = [
    { key: 'createdAt', label: 'Date', render: (r) => shortDate(r.createdAt) },
    { key: 'originalName', label: 'File', render: (r) => <div><strong>{r.originalName}</strong><small className="muted-line">{r.mimeType}</small></div> },
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="badge info">{purposeLabels[r.purpose] || r.purpose}</span> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${safeStatusClass(r.status)}`}>{r.status || 'UPLOADED'}</span> },
    { key: 'sizeBytes', label: 'Size', render: (r) => formatBytes(r.sizeBytes) },
    { key: 'entity', label: 'Linked To', render: (r) => r.entityType ? `${r.entityType}${r.entityId ? ` • ${r.entityId.slice(0, 8)}` : ''}` : <span className="danger-text">Unlinked</span> },
    { key: 'open', label: 'Open', render: (r) => r.publicUrl ? <a className="mini-action link-btn" href={r.publicUrl} target="_blank" rel="noreferrer">Open</a> : '-' },
    { key: 'actions', label: 'Actions', render: (r) => <div className="compact-actions"><button className="mini-action" onClick={() => setSelected(r)}>Manage</button><button className="mini-danger" onClick={() => removeDocument(r)}>Remove</button></div> }
  ];

  return (
    <div className="page documents-page document-center-page">
      <div className="page-head document-hero">
        <div>
          <span className="eyebrow">Version 4.8</span>
          <h1>Document Attachment Center</h1>
          <p>Attach, organize, search and manage files for invoices, expenses, products, customers, suppliers, service jobs, assets and approvals.</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      {config && !config.enabled && <div className="warning-box">S3 is not configured. Add <b>S3_UPLOAD_BUCKET</b> in <code>server/.env</code> or Lambda environment before uploading.</div>}

      <div className="stat-grid document-stat-grid">
        <div className="stat-card"><span>Total Documents</span><strong>{totals.total}</strong><small>{totals.totalSizeMb} MB stored</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Linked Files</span><strong>{totals.linked}</strong><small>Connected to ERP records</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Unlinked Files</span><strong>{totals.unlinked}</strong><small>Need attachment review</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Archived</span><strong>{totals.archived}</strong><small>Kept but hidden from active work</small><div className="stat-orb" /></div>
      </div>

      <section className="panel document-filter-panel">
        <form onSubmit={applySearch} className="form-grid four compact">
          <label className="span-two">Search
            <input placeholder="Search file name, type, entity or ID" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
          </label>
          <label>Purpose
            <select value={filters.purpose} onChange={(e) => setFilters({ ...filters, purpose: e.target.value })}>
              <option value="">All purposes</option>
              {Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Entity Type
            <select value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
              <option value="">All entities</option>
              {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>Status
            <select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Active + archived</option>
              <option value="UPLOADED">Uploaded</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <button className="secondary-btn">Search</button>
        </form>
      </section>

      <div className="ledger-layout small-side document-center-grid">
        <section className="panel">
          <div className="ledger-toolbar">
            <div>
              <h2>Document Library</h2>
              <p>Tenant-isolated file metadata in PostgreSQL with actual file storage in S3.</p>
            </div>
          </div>
          <DataTable columns={columns} rows={documents} empty="No documents uploaded yet" />
        </section>

        <section className="panel upload-panel">
          <h2>Upload & Attach File</h2>
          <form onSubmit={submit} className="form-grid">
            <label>Purpose
              <select value={form.purpose} onChange={(e) => setPurpose(e.target.value)}>
                {Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>Folder
              <input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} />
            </label>
            <label>Linked Entity Type
              <select value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value, entityId: '' })}>
                <option value="">No linked record</option>
                {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
              </select>
            </label>
            <label>Linked Entity
              <select value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} disabled={!form.entityType}>
                <option value="">Choose record</option>
                {selectedEntityOptions.map((entity) => <option key={entity.id} value={entity.id}>{entity.label}</option>)}
              </select>
            </label>
            <label className="file-drop span-two">
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <strong>{file ? file.name : 'Choose file'}</strong>
              <span>{file ? `${file.type || 'Unknown type'} • ${formatBytes(file.size)}` : `Allowed max: ${config?.maxUploadMb || 10} MB`}</span>
            </label>
            <button className="primary-btn span-two" disabled={uploading || !config?.enabled}>{uploading ? 'Uploading...' : 'Upload and Attach'}</button>
          </form>
          <div className="upload-note">
            <b>Purpose:</b> keep all supporting business evidence connected to ERP transactions, so audit, tax, warranty and approval work becomes easier.
          </div>
        </section>
      </div>

      {selected && <section className="panel document-manage-panel">
        <div className="section-title-row">
          <div>
            <h2>Manage Document</h2>
            <p>{selected.originalName}</p>
          </div>
          <button className="secondary-btn" onClick={() => setSelected(null)}>Close</button>
        </div>
        <div className="form-grid four compact">
          <label>Purpose
            <select value={selected.purpose} onChange={(e) => setSelected({ ...selected, purpose: e.target.value, folder: purposeToFolder[e.target.value] || selected.folder })}>
              {Object.entries(purposeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Status
            <select value={selected.status || 'UPLOADED'} onChange={(e) => setSelected({ ...selected, status: e.target.value })}>
              <option value="UPLOADED">Uploaded</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label>Entity Type
            <select value={selected.entityType || ''} onChange={(e) => setSelected({ ...selected, entityType: e.target.value, entityId: '' })}>
              <option value="">No linked record</option>
              {entityTypes.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label>Entity ID
            <input value={selected.entityId || ''} onChange={(e) => setSelected({ ...selected, entityId: e.target.value })} placeholder="Record ID" />
          </label>
          <label className="span-two">Display Name
            <input value={selected.originalName || ''} onChange={(e) => setSelected({ ...selected, originalName: e.target.value })} />
          </label>
          <button className="primary-btn" onClick={() => updateDocument(selected, selected)}>Save Changes</button>
          <button className="secondary-btn" onClick={() => updateDocument(selected, { status: 'ARCHIVED' })}>Archive</button>
        </div>
      </section>}
    </div>
  );
}
