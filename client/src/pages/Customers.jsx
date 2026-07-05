import { useEffect, useMemo, useState } from 'react';
import { Mail, Phone, Search, UserPlus, Users, Wallet } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const money = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const blankCustomer = { name: '', phone: '', email: '', creditLimit: 0 };

export default function Customers() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankCustomer);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/customers');
    setRows(Array.isArray(data) ? data : data?.items || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load customers'));
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/customers', form);
      setForm(blankCustomer);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to save customer');
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
    const receivable = rows.reduce((sum, row) => sum + Number(row.balance || 0), 0);
    const creditLimit = rows.reduce((sum, row) => sum + Number(row.creditLimit || 0), 0);
    const withPhone = rows.filter((row) => row.phone).length;
    return { receivable, creditLimit, withPhone };
  }, [rows]);

  return (
    <div className="page ui-master-page customers-page">
      <header className="page-header ui-page-hero">
        <div>
          <span className="ui-eyebrow">People / Customer Accounts</span>
          <h1>Customers</h1>
          <p>Keep customer details, credit limits, balances and contact information in one clear place.</p>
        </div>
        <div className="ui-hero-badge"><Users size={18} /> {rows.length} customers</div>
      </header>

      <section className="ui-stat-grid">
        <div className="ui-stat-card tone-purple"><span>Total Customers</span><strong>{rows.length}</strong><small>Registered customer accounts</small></div>
        <div className="ui-stat-card tone-green"><span>Total Receivable</span><strong>{money(stats.receivable)}</strong><small>Money customers still owe</small></div>
        <div className="ui-stat-card tone-orange"><span>Total Credit Limit</span><strong>{money(stats.creditLimit)}</strong><small>Allowed credit exposure</small></div>
        <div className="ui-stat-card tone-blue"><span>Contact Ready</span><strong>{stats.withPhone}</strong><small>Customers with phone numbers</small></div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <div className="ui-master-layout">
        <section className="panel ui-table-panel">
          <div className="section-title-row ui-section-title-row">
            <div>
              <h2>Customer List</h2>
              <p>Search and review balances before creating invoices or receiving payments.</p>
            </div>
            <label className="ui-search-field">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customer, phone or email" />
            </label>
          </div>

          <DataTable
            columns={[
              { key: 'name', label: 'Customer', render: (row) => <strong>{row.name}</strong> },
              { key: 'phone', label: 'Phone', render: (row) => row.phone ? <span className="ui-inline"><Phone size={14} /> {row.phone}</span> : '—' },
              { key: 'email', label: 'Email', render: (row) => row.email ? <span className="ui-inline"><Mail size={14} /> {row.email}</span> : '—' },
              { key: 'balance', label: 'Balance', render: (row) => <b className={Number(row.balance || 0) > 0 ? 'ui-danger-text' : 'ui-ok-text'}>{money(row.balance)}</b> },
              { key: 'creditLimit', label: 'Credit Limit', render: (row) => money(row.creditLimit) }
            ]}
            rows={filteredRows}
            emptyTitle="No customers found"
            emptyDescription="Add your first customer or adjust the search text."
          />
        </section>

        <aside className="panel ui-form-panel">
          <div className="ui-form-heading">
            <div className="ui-form-icon"><UserPlus size={20} /></div>
            <div>
              <h2>Add Customer</h2>
              <p>Create a customer account for invoices, statements and credit tracking.</p>
            </div>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label>Name<input name="name" value={form.name} onChange={update} placeholder="Example: Ameen Stores" required /></label>
            <label>Phone<input name="phone" value={form.phone} onChange={update} placeholder="Example: 0771234567" /></label>
            <label>Email<input name="email" type="email" value={form.email} onChange={update} placeholder="customer@email.com" /></label>
            <label>Credit Limit<input name="creditLimit" type="number" min="0" value={form.creditLimit} onChange={update} /></label>
            <button className="primary-btn full-width" disabled={saving}>{saving ? 'Saving...' : 'Save Customer'}</button>
          </form>

          <div className="ui-helper-card">
            <Wallet size={18} />
            <span>Customer balances update automatically when invoices and payments are posted.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
