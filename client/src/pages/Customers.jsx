import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, Search, UserRound } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const blankCustomer = { name: '', phone: '', email: '', creditLimit: 0 };
const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankCustomer);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const { data } = await api.get('/customers');
    setRows(data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load customers')); }, []);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => [r.name, r.phone, r.email].some((v) => String(v || '').toLowerCase().includes(q)));
  }, [rows, query]);

  const totalBalance = rows.reduce((sum, r) => sum + Number(r.balance || 0), 0);
  const totalCreditLimit = rows.reduce((sum, r) => sum + Number(r.creditLimit || 0), 0);
  const owingCustomers = rows.filter((r) => Number(r.balance || 0) > 0).length;

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/customers', { ...form, creditLimit: Number(form.creditLimit || 0) });
      setForm(blankCustomer);
      setCreateOpen(false);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save customer'); }
    finally { setSaving(false); }
  }

  const columns = [
    { key: 'name', label: 'Customer', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">{r.email || 'No email'}</span></> },
    { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
    { key: 'balance', label: 'Balance', render: (r) => <strong>{money(r.balance)}</strong> },
    { key: 'creditLimit', label: 'Credit Limit', render: (r) => money(r.creditLimit) }
  ];

  return (
    <div className="page stage6-list-page customers-page">
      <div className="stage6-hero">
        <div>
          <h1>Customers</h1>
          <p>Keep the customer list clean and easy to understand. Add customer details from the button, then use the full table for search, pagination and quick viewing.</p>
        </div>
        <div className="stage6-actions">
          <button className="secondary-btn" type="button" onClick={load}><RefreshCw size={18} /> Refresh</button>
          <button className="primary-btn" type="button" onClick={() => setCreateOpen(true)}><Plus size={18} /> Add Customer</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="stage6-kpi-grid">
        <div className="stage6-kpi-card"><span>Total Customers</span><strong>{rows.length}</strong><small>All saved customer profiles</small></div>
        <div className="stage6-kpi-card"><span>Customers Owing</span><strong>{owingCustomers}</strong><small>Customers with outstanding balance</small></div>
        <div className="stage6-kpi-card"><span>Total Receivable</span><strong>{money(totalBalance)}</strong><small>Money to collect from customers</small></div>
        <div className="stage6-kpi-card"><span>Total Credit Limit</span><strong>{money(totalCreditLimit)}</strong><small>Credit allowed for customers</small></div>
      </div>

      <section className="panel stage6-table-panel">
        <div className="stage6-toolbar">
          <div className="stage6-search"><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name, phone or email..." /></div>
          <span className="muted">Click a row to view customer details</span>
        </div>
        <DataTable columns={columns} rows={filteredRows} pageSize={10} onRowClick={setSelected} empty="No customers found" />
      </section>

      <ModalDrawer open={createOpen} title="Add Customer" description="Create the customer once. After that, invoices, payments, statements and credit reports can use this profile." onClose={() => setCreateOpen(false)}>
        <div className="stage6-form-note">Keep customer names and phone numbers clear because they will appear on invoices and statements.</div>
        <form onSubmit={submit} className="form-grid">
          <label>Name<input name="name" value={form.name} onChange={update} required /></label>
          <label>Phone<input name="phone" value={form.phone} onChange={update} /></label>
          <label>Email<input name="email" type="email" value={form.email} onChange={update} /></label>
          <label>Credit Limit<input name="creditLimit" type="number" min="0" step="0.01" value={form.creditLimit} onChange={update} /></label>
          <div className="stage6-form-actions"><button type="button" className="secondary-btn" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-btn" disabled={saving}>Save Customer</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selected} mode="modal" size="sm" title="Customer Details" description="Quick view only. Edit and advanced customer actions can stay inside customer/account pages." onClose={() => setSelected(null)}>
        {selected && <div className="stage6-detail-grid">
          <div className="stage6-detail-item"><span>Name</span><strong>{selected.name}</strong></div>
          <div className="stage6-detail-item"><span>Phone</span><strong>{selected.phone || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Email</span><strong>{selected.email || '-'}</strong></div>
          <div className="stage6-detail-item"><span>Balance</span><strong>{money(selected.balance)}</strong></div>
          <div className="stage6-detail-item"><span>Credit Limit</span><strong>{money(selected.creditLimit)}</strong></div>
        </div>}
      </ModalDrawer>
    </div>
  );
}
