import { useEffect, useMemo, useState } from 'react';
import { Search, Shield, UserCog, UserPlus } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const roles = ['CASHIER', 'ADMIN', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'SALES_STAFF', 'VIEWER', 'AUDITOR'];
const blankUser = { name: '', email: '', password: '', role: 'CASHIER' };

const roleLabel = (role) => String(role || '').replaceAll('_', ' ');

export default function Users() {
  const [rows, setRows] = useState([]);
  const [form, setForm] = useState(blankUser);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data } = await api.get('/users');
    setRows(Array.isArray(data) ? data : data?.items || []);
  }

  useEffect(() => {
    load().catch((e) => setError(e.response?.data?.message || 'Failed to load users'));
  }, []);

  function update(e) {
    setForm({ ...form, [e.target.name]: e.target.value });
  }

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/users', form);
      setForm(blankUser);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create user');
    } finally {
      setSaving(false);
    }
  }

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) => [row.name, row.email, row.role].some((value) => String(value || '').toLowerCase().includes(term)));
  }, [query, rows]);

  const stats = useMemo(() => {
    const active = rows.filter((row) => row.isActive).length;
    const admins = rows.filter((row) => String(row.role || '').includes('ADMIN')).length;
    const disabled = rows.filter((row) => !row.isActive).length;
    return { active, admins, disabled };
  }, [rows]);

  return (
    <div className="page ui-master-page users-page">
      <header className="page-header ui-page-hero users-hero">
        <div>
          <span className="ui-eyebrow">Control Center / Access Management</span>
          <h1>Users & Roles</h1>
          <p>Create staff logins and assign clear roles so each user only sees what they need.</p>
        </div>
        <div className="ui-hero-badge"><Shield size={18} /> Permission based access</div>
      </header>

      <section className="ui-stat-grid">
        <div className="ui-stat-card tone-purple"><span>Total Users</span><strong>{rows.length}</strong><small>Accounts created</small></div>
        <div className="ui-stat-card tone-green"><span>Active Users</span><strong>{stats.active}</strong><small>Can log in and work</small></div>
        <div className="ui-stat-card tone-blue"><span>Admin Users</span><strong>{stats.admins}</strong><small>Users with admin access</small></div>
        <div className="ui-stat-card tone-orange"><span>Disabled</span><strong>{stats.disabled}</strong><small>Accounts currently blocked</small></div>
      </section>

      {error && <div className="error-box">{error}</div>}

      <div className="ui-master-layout">
        <section className="panel ui-table-panel">
          <div className="section-title-row ui-section-title-row">
            <div>
              <h2>User List</h2>
              <p>Search staff accounts and check role/status before giving system access.</p>
            </div>
            <label className="ui-search-field">
              <Search size={17} />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search user, email or role" />
            </label>
          </div>

          <DataTable
            columns={[
              { key: 'name', label: 'Name', render: (row) => <strong>{row.name}</strong> },
              { key: 'email', label: 'Email' },
              { key: 'role', label: 'Role', render: (row) => <span className="ui-role-pill">{roleLabel(row.role)}</span> },
              { key: 'isActive', label: 'Status', render: (row) => row.isActive ? <span className="badge paid">Active</span> : <span className="badge cancelled">Disabled</span> }
            ]}
            rows={filteredRows}
            emptyTitle="No users found"
            emptyDescription="Create a user account for staff, cashier, accountant or inventory manager."
          />
        </section>

        <aside className="panel ui-form-panel">
          <div className="ui-form-heading">
            <div className="ui-form-icon"><UserPlus size={20} /></div>
            <div>
              <h2>Add User</h2>
              <p>Use a strong password and choose the closest role for the employee.</p>
            </div>
          </div>

          <form onSubmit={submit} className="form-grid">
            <label>Name<input name="name" value={form.name} onChange={update} placeholder="Staff name" required /></label>
            <label>Email<input name="email" type="email" value={form.email} onChange={update} placeholder="staff@email.com" required /></label>
            <label>Password<input name="password" type="password" value={form.password} onChange={update} placeholder="Temporary password" required /></label>
            <label>Role
              <select name="role" value={form.role} onChange={update}>
                {roles.map((role) => <option key={role} value={role}>{roleLabel(role)}</option>)}
              </select>
            </label>
            <button className="primary-btn full-width" disabled={saving}>{saving ? 'Creating...' : 'Create User'}</button>
          </form>

          <div className="ui-helper-card">
            <UserCog size={18} />
            <span>Roles control access. Give the smallest role needed for each staff member.</span>
          </div>
          <div className="ui-role-guide">
            <strong>Simple role guide</strong>
            <span><b>Cashier:</b> POS and invoice work</span>
            <span><b>Accountant:</b> money, reports and ledgers</span>
            <span><b>Inventory:</b> products, GRN and stock</span>
            <span><b>Viewer:</b> read-only checking</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
