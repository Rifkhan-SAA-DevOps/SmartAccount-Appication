import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const blankSupplier = { name: '', phone: '', email: '' };
const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankSupplier);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const { data } = await api.get('/suppliers');
    setRows(data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load suppliers')); }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.phone, r.email].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, query]);

  const payable = rows.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const activeSuppliers = rows.filter((r) => Number(r.balance || 0) !== 0).length;

  function update(e) { setForm({ ...form, [e.target.name]: e.target.value }); }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/suppliers', form);
      setForm(blankSupplier);
      setCreateOpen(false);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save supplier'); }
    finally { setSaving(false); }
  }

  const columns = [
    { key: 'name', label: 'Supplier', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">{r.email || 'No email'}</span></> },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
    { key: 'balance', label: 'Payable Balance', render: (r) => <strong>{money(r.balance)}</strong> }
  ];

  return (
    <div className="page stage6-list-page suppliers-page">
      <div className="stage6-hero">
        <div>
          <h1>Suppliers</h1>
          <p>Manage supplier profiles without making the page crowded. Purchases, supplier ledgers, payments and statements can use these saved supplier records.</p>
        </div>
        <div className="stage6-actions">
          <button className="secondary-btn" type="button" onClick={load}><RefreshCw size={18} /> Refresh</button>
          <button className="primary-btn" type="button" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add Supplier</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="stage6-kpi-grid">
        <div className="stage6-kpi-card"><span>Total Suppliers</span><strong>{rows.length}</strong><small>Saved purchase contacts</small></div>
        <div className="stage6-kpi-card"><span>With Balance</span><strong>{activeSuppliers}</strong><small>Suppliers with payable/credit activity</small></div>
        <div className="stage6-kpi-card"><span>Total Payable</span><strong>{money(payable)}</strong><small>Money owed to suppliers</small></div>
        <div className="stage6-kpi-card"><span>Clean Register</span><strong>List First</strong><small>Add form opens only when needed</small></div>
      </div>

      <section className="panel stage6-table-panel">
        <div className="stage6-toolbar">
          <div className="stage6-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier name, phone or email..." /></div>
          <span className="muted">Click a row to view supplier details</span>
        </div>
        <DataTable columns={columns} rows={filteredRows} pageSize={10} onRowClick={setSelected} empty="No suppliers found" />
      </section>

      <ModalDrawer open={createOpen} title="Add Supplier" description="Create supplier details once. Purchases, GRNs, supplier payments and statements can use this profile." onClose={() => setCreateOpen(false)}>
        <form onSubmit={submit} className="form-grid">
          <label>Name<input name="name" value={form.name} onChange={update} required /></label>
          <label>Phone<input name="phone" value={form.phone} onChange={update} /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={update} /></label>
          <div className="stage6-form-actions"><button type="button" className="secondary-btn" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-btn" disabled={saving}>Save Supplier</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selected} mode="modal" size="sm" title="Supplier Details" onClose={() => setSelected(null)}>
        {selected && <div className="stage6-detail-grid">
          <div className="stage6-detail-item"><span>Name</span><strong>{selected.name}</strong></div>
          <div className="stage6-detail-item"><span>Phone</span><strong>{selected.phone || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Email</span><strong>{selected.email || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Balance</span><strong>{money(selected.balance)}</strong></div>
        </div>}
      </ModalDrawer>
    </div>
  );
}
