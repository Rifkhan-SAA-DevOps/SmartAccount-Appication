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

export default function Documents() {
  const [documents, setDocuments] = useState([]);
  const [config, setConfig] = useState(null);
  const [filter, setFilter] = useState('');
  const [form, setForm] = useState(uploadInitial);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const [docsRes, configRes] = await Promise.all([
      api.get('/files', { params: filter ? { purpose: filter } : {} }),
      api.get('/files/config')
    ]);
    setDocuments(docsRes.data || []);
    setConfig(configRes.data);
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load documents'));
  }, [filter]);

  const grouped = useMemo(() => ({
    total: documents.length,
    logos: documents.filter((d) => d.purpose === 'LOGO').length,
    invoices: documents.filter((d) => d.purpose === 'INVOICE_ATTACHMENT').length,
    expenses: documents.filter((d) => d.purpose === 'EXPENSE_RECEIPT').length
  }), [documents]);

  function setPurpose(purpose) {
    setForm((prev) => ({ ...prev, purpose, folder: purposeToFolder[purpose] || 'documents' }));
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
    { key: 'purpose', label: 'Purpose', render: (r) => <span className="badge info">{r.purpose.replaceAll('_', ' ')}</span> },
    { key: 'sizeBytes', label: 'Size', render: (r) => formatBytes(r.sizeBytes) },
    { key: 'entity', label: 'Linked To', render: (r) => r.entityType ? `${r.entityType}${r.entityId ? ` • ${r.entityId.slice(0, 8)}` : ''}` : '-' },
    { key: 'open', label: 'Open', render: (r) => r.publicUrl ? <a className="mini-action link-btn" href={r.publicUrl} target="_blank" rel="noreferrer">Open</a> : '-' },
    { key: 'delete', label: 'Remove', render: (r) => <button className="mini-danger" onClick={() => removeDocument(r)}>Remove</button> }
  ];

  return (
    <div className="page documents-page">
      <div className="page-head">
        <div>
          <h1>Documents & S3 Files</h1>
          <p>Upload logos, invoice attachments, expense receipts, product images and business documents to AWS S3.</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}
      {config && !config.enabled && <div className="warning-box">S3 is not configured. Add <b>S3_UPLOAD_BUCKET</b> in <code>server/.env</code> or Lambda environment before uploading.</div>}

      <div className="stat-grid">
        <div className="stat-card"><span>Total Documents</span><strong>{grouped.total}</strong><small>Active uploaded files</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Company Logos</span><strong>{grouped.logos}</strong><small>Branding files</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Invoice Files</span><strong>{grouped.invoices}</strong><small>Attached proofs</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Expense Receipts</span><strong>{grouped.expenses}</strong><small>Bills and receipts</small><div className="stat-orb" /></div>
      </div>

      <div className="ledger-layout small-side">
        <section className="panel">
          <div className="ledger-toolbar">
            <div>
              <h2>Document Library</h2>
              <p>All file metadata is tenant-isolated in PostgreSQL. Actual files are stored in S3.</p>
            </div>
            <label>Filter
              <select value={filter} onChange={(e) => setFilter(e.target.value)}>
                <option value="">All files</option>
                <option value="LOGO">Logos</option>
                <option value="INVOICE_ATTACHMENT">Invoice attachments</option>
                <option value="EXPENSE_RECEIPT">Expense receipts</option>
                <option value="PRODUCT_IMAGE">Product images</option>
                <option value="DOCUMENT">Business documents</option>
              </select>
            </label>
          </div>
          <DataTable columns={columns} rows={documents} empty="No documents uploaded yet" />
        </section>

        <section className="panel upload-panel">
          <h2>Upload File</h2>
          <form onSubmit={submit} className="form-grid">
            <label>Purpose
              <select value={form.purpose} onChange={(e) => setPurpose(e.target.value)}>
                <option value="DOCUMENT">Business document</option>
                <option value="LOGO">Company logo</option>
                <option value="INVOICE_ATTACHMENT">Invoice attachment</option>
                <option value="EXPENSE_RECEIPT">Expense receipt</option>
                <option value="PRODUCT_IMAGE">Product image</option>
              </select>
            </label>
            <label>Folder
              <input value={form.folder} onChange={(e) => setForm({ ...form, folder: e.target.value })} />
            </label>
            <label>Linked Entity Type
              <input placeholder="Invoice / Expense / Product" value={form.entityType} onChange={(e) => setForm({ ...form, entityType: e.target.value })} />
            </label>
            <label>Linked Entity ID
              <input placeholder="Optional record ID" value={form.entityId} onChange={(e) => setForm({ ...form, entityId: e.target.value })} />
            </label>
            <label className="file-drop span-two">
              <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
              <strong>{file ? file.name : 'Choose file'}</strong>
              <span>{file ? `${file.type || 'Unknown type'} • ${formatBytes(file.size)}` : `Allowed max: ${config?.maxUploadMb || 10} MB`}</span>
            </label>
            <button className="primary-btn span-two" disabled={uploading || !config?.enabled}>{uploading ? 'Uploading...' : 'Upload to S3'}</button>
          </form>
          <div className="upload-note">
            <b>How it works:</b> SmartLedger asks Lambda for a secure presigned URL, uploads the file directly to S3, then saves the file record in PostgreSQL.
          </div>
        </section>
      </div>
    </div>
  );
}
