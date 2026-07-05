import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, Search, Truck, UserPlus, Wallet } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const blankSupplier = { name: '', phone: '', email: '' };

export default function Suppliers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankSupplier);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/suppliers');
    setRows(Array.isArray(data) ? data : data?.items || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load suppliers'));
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/suppliers', form);
      setForm(blankSupplier);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save supplier');
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.name, row.phone, row.email].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [query, rows]);

  const stats = useMemo(() => {
    const payable = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const withPhone = rows.filter((row) => row.phone).length;
    const withEmail = rows.filter((row) => row.email).length;
    return { payable, withPhone, withEmail };
  }, [rows]);

  return (
    <div className="page ui-master-page suppliers-page">
      <header className="page-header ui-page-hero supplier-hero">
        <div>
          <span className="ui-eyebrow">People / Supplier Management</span>
          <h1>Suppliers</h1>
          <p>Manage vendors, supplier balances and contact details for purchases, GRNs and payments.</p>
        </div>
        <div className="ui-hero-badge"><Truck size={18} /> {rows.length} suppliers</div>
      </header>

      <section className="ui-stat-grid">
        <div className="ui-stat-card tone-purple"><span>Total Suppliers</span><strong>{rows.length}</strong><small>Active vendor accounts</small></div>
        <div className="ui-stat-card tone-orange"><span>Total Payable</span><strong>{money(stats.payable)}</strong><small>Money owed to suppliers</small></div>
        <div className="ui-stat-card tone-blue"><span>Phone Contacts</span><strong>{stats.withPhone}</strong><small>Suppliers with phone numbers</small></div>
        <div className="ui-stat-card tone-green"><span>Email Contacts</span><strong>{stats.withEmail}</strong><small>Suppliers with email addresses</small></div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <div className="ui-master-layout">
        <section className="panel ui-table-panel">
          <div className="section-title-row ui-section-title-row">
            <div>
              <h2>Supplier List</h2>
              <p>Use this list before purchase orders, GRNs, supplier payments and statements.</p>
            </div>
            <label className="ui-search-field">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search supplier, phone or email" />
            </label>
          </div>

          <DataTable
            columns={[
              { key: 'name', label: 'Supplier', render: (row) => <strong>{row.name}</strong> },
              { key: 'phone', label: 'Phone', render: (row) => row.phone ? <span className="ui-inline"><Phone size={14} /> {row.phone}</span> : '—' },
              { key: 'email', label: 'Email', render: (row) => row.email ? <span className="ui-inline"><Mail size={14} /> {row.email}</span> : '—' },
              { key: 'balance', label: 'Payable Balance', render: (row) => <b className={Number(row.balance || 0) > 0 ? 'ui-warning-text' : 'ui-ok-text'}>{money(row.balance)}</b> }
            ]}
            rows={filteredRows}
            emptyTitle="No suppliers found"
            emptyDescription="Add a supplier to start recording purchases and GRNs."
          />
        </section>

        <aside className="panel ui-form-panel">
          <div className="ui-form-heading">
            <div className="ui-form-icon"><UserPlus size={20} /></div>
            <div>
              <h2>Add Supplier</h2>
              <p>Create vendor details for purchases, supplier ledger and payable tracking.</p>
            </div>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label>Name<input name="name" value={form.name} onChange={update} placeholder="Example: ABC Distributors" required /></label>
            <label>Phone<input name="phone" value={form.phone} onChange={update} placeholder="Example: 0771234567" /></label>
            <label>Email<input name="email" type="email" value={form.email} onChange={update} placeholder="supplier@email.com" /></label>
            <button className="primary-btn full-width" disabled={saving}>{saving ? 'Saving...' : 'Save Supplier'}</button>
          </form>

          <div className="ui-helper-card">
            <Wallet size={18} />
            <span>Supplier balances update when purchases, purchase returns and payments are posted.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
