import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, RefreshCcw, Search, ShieldCheck, Trash2 } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

function todayMinus(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function badgeClass(value) {
  const key = String(value || '').toLowerCase();
  if (['create', 'receipt', 'payment', 'upload', 'approve', 'setup_defaults'].includes(key)) return 'badge posted';
  if (['update', 'adjust', 'transfer', 'set_default', 'generate_alerts'].includes(key)) return 'badge partial';
  if (['delete', 'disable', 'reject', 'cancel', 'cleanup'].includes(key)) return 'badge cancelled';
  return 'badge info';
}

function JsonPreview({ title, value }) {
  if (!value) return <div className="json-card muted"><strong>{title}</strong><span>No data</span></div>;
  return (
    <div className="json-card">
      <strong>{title}</strong>
      <pre>{JSON.stringify(value, null, 2)}</pre>
    </div>
  );
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [filters, setFilters] = useState({
    from: todayMinus(30),
    to: new Date().toISOString().slice(0, 10),
    action: 'ALL',
    entity: 'ALL',
    userId: 'ALL',
    search: '',
    take: 150
  });

  const actions = useMemo(() => ['ALL', ...(summary?.byAction || []).map((item) => item.action)], [summary]);
  const entities = useMemo(() => ['ALL', ...(summary?.byEntity || []).map((item) => item.entity)], [summary]);

  function params() {
    return {
      ...filters,
      to: filters.to ? `${filters.to}T23:59:59` : undefined,
      from: filters.from || undefined,
      search: filters.search || undefined
    };
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const [s, l] = await Promise.all([
        api.get('/audit/summary', { params: params() }),
        api.get('/audit', { params: params() })
      ]);
      setSummary(s.data || null);
      setLogs(l.data || []);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function openDetails(row) {
    try {
      const res = await api.get(`/audit/${row.id}`);
      setSelected(res.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to open audit details');
    }
  }

  function exportCsv() {
    const query = new URLSearchParams(params()).toString();
    const base = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
    const token = localStorage.getItem('smartledger_token');
    // Browser downloads cannot attach Authorization headers to normal links.
    // So we fetch the file and create a safe download blob.
    fetch(`${base}/audit/export.csv?${query}`, { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => {
        if (!res.ok) throw new Error('Export failed');
        return res.blob();
      })
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `smartledger-audit-${Date.now()}.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      })
      .catch(() => setError('Failed to export audit CSV'));
  }

  async function cleanupOldLogs() {
    const days = Number(prompt('Delete audit logs older than how many days? Minimum 30 days.', '365'));
    if (!days || days < 30) return;
    if (!confirm(`Delete audit logs older than ${days} days? This cannot be undone.`)) return;
    try {
      const res = await api.delete('/audit/cleanup', { data: { days } });
      setMessage(`${res.data?.deleted || 0} old audit logs deleted`);
      await load();
      setTimeout(() => setMessage(''), 2500);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to cleanup logs. Only Owner/Admin with audit manage permission can do this.');
    }
  }

  return (
    <div className="page audit-page">
      <div className="page-head">
        <div>
          <h1>Audit Logs</h1>
          <p>Track user actions, security events, data changes, approvals, payments, stock activity and document uploads.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={exportCsv}><Download size={16} /> Export CSV</button>
          <button className="primary-btn" onClick={load}><RefreshCcw size={16} /> Refresh</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <section className="stat-grid">
        <div className="stat-card"><span>Total Logs</span><strong>{summary?.total || 0}</strong><small>Current filter</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Today</span><strong>{summary?.today || 0}</strong><small>Actions recorded today</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Top Action</span><strong>{summary?.byAction?.[0]?.action || '-'}</strong><small>{summary?.byAction?.[0]?.count || 0} records</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Top Entity</span><strong>{summary?.byEntity?.[0]?.entity || '-'}</strong><small>{summary?.byEntity?.[0]?.count || 0} records</small><div className="stat-orb" /></div>
      </section>

      <section className="panel audit-filter-panel">
        <div className="ledger-toolbar audit-toolbar">
          <div>
            <h2>Filter Activity</h2>
            <p>Search by action, module/entity, user, date range or entity ID.</p>
          </div>
          <div className="audit-filter-grid">
            <label>From<input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} /></label>
            <label>To<input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} /></label>
            <label>Action<select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value })}>{actions.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
            <label>Entity<select value={filters.entity} onChange={(e) => setFilters({ ...filters, entity: e.target.value })}>{entities.map((e) => <option key={e} value={e}>{e}</option>)}</select></label>
            <label>User<select value={filters.userId} onChange={(e) => setFilters({ ...filters, userId: e.target.value })}>
              <option value="ALL">All users</option>
              <option value="SYSTEM">System</option>
              {(summary?.users || []).map((u) => <option key={u.id} value={u.id}>{u.name} - {u.role}</option>)}
            </select></label>
            <label>Limit<select value={filters.take} onChange={(e) => setFilters({ ...filters, take: Number(e.target.value) })}>
              <option value="50">50</option>
              <option value="150">150</option>
              <option value="300">300</option>
              <option value="500">500</option>
            </select></label>
            <label className="span-two">Search<input placeholder="Search action, entity or entity ID" value={filters.search} onChange={(e) => setFilters({ ...filters, search: e.target.value })} /></label>
            <button className="primary-btn" onClick={load}><Search size={16} /> Apply Filter</button>
            <button className="mini-danger" onClick={cleanupOldLogs}><Trash2 size={16} /> Cleanup</button>
          </div>
        </div>
      </section>

      <section className="two-col-page audit-two-col">
        <div className="panel">
          <div className="section-head">
            <div>
              <h2>Activity Timeline</h2>
              <p>{loading ? 'Loading...' : `${logs.length} records loaded`}</p>
            </div>
            <ShieldCheck size={26} />
          </div>
          <DataTable columns={[
            { key: 'createdAt', label: 'Time', render: (r) => fmtDate(r.createdAt) },
            { key: 'user', label: 'User', render: (r) => <div><strong>{r.user?.name || 'System'}</strong><small className="table-subtext">{r.user?.email || '-'}</small></div> },
            { key: 'action', label: 'Action', render: (r) => <span className={badgeClass(r.action)}>{r.action}</span> },
            { key: 'entity', label: 'Entity', render: (r) => <div><strong>{r.entity}</strong><small className="table-subtext">{r.entityId || '-'}</small></div> },
            { key: 'ip', label: 'IP', render: (r) => r.ip || '-' },
            { key: 'open', label: 'Open', render: (r) => <button className="secondary-btn compact-link" onClick={() => openDetails(r)}><Eye size={14} /> View</button> }
          ]} rows={logs} empty="No audit logs found" />
        </div>

        <aside className="panel audit-detail-panel">
          <h2>Change Details</h2>
          {selected ? (
            <div className="audit-detail-grid">
              <div className="audit-detail-head">
                <span className={badgeClass(selected.action)}>{selected.action}</span>
                <strong>{selected.entity}</strong>
                <small>{fmtDate(selected.createdAt)}</small>
                <small>{selected.user?.name || 'System'} • {selected.user?.role || '-'}</small>
              </div>
              <JsonPreview title="Before" value={selected.before} />
              <JsonPreview title="After" value={selected.after} />
            </div>
          ) : (
            <div className="empty-detail">
              <ShieldCheck size={34} />
              <strong>Select an activity</strong>
              <span>Click View to inspect before/after data for an action.</span>
            </div>
          )}
        </aside>
      </section>
    </div>
  );
}
