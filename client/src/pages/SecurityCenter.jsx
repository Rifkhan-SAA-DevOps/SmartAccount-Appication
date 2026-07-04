import { useEffect, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

function badgeClass(value) {
  return String(value || '').toLowerCase();
}

export default function SecurityCenter() {
  const [tab, setTab] = useState('logins');
  const [summary, setSummary] = useState(null);
  const [loginHistory, setLoginHistory] = useState([]);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState({ status: 'ALL', severity: 'ALL' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [summaryRes, loginRes, deviceRes, eventsRes] = await Promise.all([
      api.get('/security/summary'),
      api.get('/security/login-history', { params: { status: filter.status } }),
      api.get('/security/devices'),
      api.get('/security/events', { params: { severity: filter.severity } })
    ]);
    setSummary(summaryRes.data || null);
    setLoginHistory(loginRes.data || []);
    setDevices(deviceRes.data || []);
    setEvents(eventsRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load security data')); }, [filter.status, filter.severity]);

  async function trustDevice(row) {
    setError(''); setMessage('');
    try {
      await api.post(`/security/devices/${row.id}/trust`);
      setMessage('Device marked as trusted.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to trust device');
    }
  }

  async function revokeDevice(row) {
    if (!confirm(`Revoke ${row.deviceName || 'this device'}?`)) return;
    setError(''); setMessage('');
    try {
      await api.post(`/security/devices/${row.id}/revoke`);
      setMessage('Device revoked.');
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to revoke device');
    }
  }

  const loginColumns = [
    { key: 'createdAt', label: 'Time', render: (r) => shortDate(r.createdAt) },
    { key: 'user', label: 'User', render: (r) => <div><strong>{r.user?.name || r.email}</strong><small className="muted-line">{r.user?.email || r.email}</small></div> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${badgeClass(r.status)}`}>{r.status}</span> },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '-' },
    { key: 'deviceName', label: 'Device', render: (r) => <div><strong>{r.deviceName || 'Unknown device'}</strong><small className="muted-line">{r.ip || '-'}</small></div> },
    { key: 'agent', label: 'Browser Agent', render: (r) => <span className="truncate-text">{r.userAgent || '-'}</span> }
  ];

  const deviceColumns = [
    { key: 'deviceName', label: 'Device', render: (r) => <div><strong>{r.deviceName || 'Unknown device'}</strong><small className="muted-line">{r.deviceHash?.slice(0, 18)}</small></div> },
    { key: 'user', label: 'User', render: (r) => r.user?.email || '-' },
    { key: 'ipAddress', label: 'Last IP' },
    { key: 'firstSeenAt', label: 'First Seen', render: (r) => shortDate(r.firstSeenAt) },
    { key: 'lastSeenAt', label: 'Last Seen', render: (r) => shortDate(r.lastSeenAt) },
    { key: 'isTrusted', label: 'Trusted', render: (r) => <span className={`badge ${r.revokedAt ? 'cancelled' : r.isTrusted ? 'posted' : 'pending'}`}>{r.revokedAt ? 'REVOKED' : r.isTrusted ? 'TRUSTED' : 'NEW'}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="compact-actions"><button className="mini-action" onClick={() => trustDevice(r)}>Trust</button><button className="mini-danger" onClick={() => revokeDevice(r)}>Revoke</button></div> }
  ];

  const eventColumns = [
    { key: 'createdAt', label: 'Time', render: (r) => shortDate(r.createdAt) },
    { key: 'severity', label: 'Severity', render: (r) => <span className={`badge ${badgeClass(r.severity)}`}>{r.severity}</span> },
    { key: 'type', label: 'Type' },
    { key: 'title', label: 'Title', render: (r) => <div><strong>{r.title}</strong><small className="muted-line">{r.description || '-'}</small></div> },
    { key: 'user', label: 'User', render: (r) => r.user?.email || '-' },
    { key: 'ip', label: 'IP' }
  ];

  return (
    <div className="page security-center-page">
      <div className="page-head security-hero">
        <div>
          <span className="eyebrow">Version 5.4</span>
          <h1>Security Center</h1>
          <p>Track login history, device activity, trusted devices, failed login attempts and important security events.</p>
        </div>
        <button className="secondary-btn" onClick={load}>Refresh</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="stat-grid security-stat-grid">
        <div className="stat-card"><span>Security Score</span><strong>{summary?.score ?? '-'}</strong><small>Based on failures and devices</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Logins Today</span><strong>{summary?.loginsToday || 0}</strong><small>Successful sign-ins</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Failed 7 Days</span><strong>{summary?.failed7d || 0}</strong><small>Watch unusual attempts</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Trusted Devices</span><strong>{summary?.trustedDevices || 0}</strong><small>{summary?.untrustedDevices || 0} new/untrusted</small><div className="stat-orb" /></div>
      </div>

      <section className="panel security-tabs">
        <button className={tab === 'logins' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('logins')}>Login History</button>
        <button className={tab === 'devices' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('devices')}>Devices</button>
        <button className={tab === 'events' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('events')}>Security Events</button>
        <button className={tab === 'users' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('users')}>Users</button>
      </section>

      {tab === 'logins' && <section className="panel">
        <div className="section-title-row">
          <div><h2>Login History</h2><p>Successful and failed user login attempts.</p></div>
          <label>Status
            <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
              <option value="ALL">All</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
            </select>
          </label>
        </div>
        <DataTable columns={loginColumns} rows={loginHistory} empty="No login history yet. Log out and log in again after migration." />
      </section>}

      {tab === 'devices' && <section className="panel">
        <h2>Device Tracking</h2>
        <p>Every successful login creates or updates a device fingerprint based on browser and IP.</p>
        <DataTable columns={deviceColumns} rows={devices} empty="No devices recorded yet" />
      </section>}

      {tab === 'events' && <section className="panel">
        <div className="section-title-row">
          <div><h2>Security Events</h2><p>Important security actions and warning events.</p></div>
          <label>Severity
            <select value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })}>
              <option value="ALL">All</option>
              <option value="INFO">Info</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </select>
          </label>
        </div>
        <DataTable columns={eventColumns} rows={events} empty="No security events yet" />
      </section>}

      {tab === 'users' && <section className="panel">
        <h2>User Security Overview</h2>
        <div className="security-user-grid">
          {(summary?.usersList || []).map((user) => <div className="security-user-card" key={user.id}>
            <strong>{user.name}</strong>
            <span>{user.email}</span>
            <small>{user.role}</small>
            <em className={user.isActive ? 'good' : 'bad'}>{user.isActive ? 'Active' : 'Disabled'}</em>
            <small>Last login: {shortDate(user.lastLoginAt)}</small>
          </div>)}
        </div>
      </section>}
    </div>
  );
}
