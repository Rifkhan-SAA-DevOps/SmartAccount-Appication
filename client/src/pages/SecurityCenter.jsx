import { useEffect, useState } from 'react';
import { MonitorSmartphone, RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage9-operations-polish.css';

function shortDate(value) { return value ? new Date(value).toLocaleString() : '-'; }
function badgeClass(value) { return String(value || '').toLowerCase(); }

export default function SecurityCenter() {
  const [tab, setTab] = useState('logins');
  const [summary, setSummary] = useState(null);
  const [loginHistory, setLoginHistory] = useState([]);
  const [devices, setDevices] = useState([]);
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState({ status: 'ALL', severity: 'ALL' });
  const [selected, setSelected] = useState(null);
  const [selectedType, setSelectedType] = useState('');
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

  function openDetail(type, row) { setSelectedType(type); setSelected(row); }

  async function trustDevice(row) {
    setError(''); setMessage('');
    try { await api.post(`/security/devices/${row.id}/trust`); setMessage('Device marked as trusted.'); setSelected(null); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to trust device'); }
  }

  async function revokeDevice(row) {
    if (!confirm(`Revoke ${row.deviceName || 'this device'}?`)) return;
    setError(''); setMessage('');
    try { await api.post(`/security/devices/${row.id}/revoke`); setMessage('Device revoked.'); setSelected(null); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to revoke device'); }
  }

  const loginColumns = [
    { key: 'createdAt', label: 'Time', render: (r) => shortDate(r.createdAt) },
    { key: 'user', label: 'User', render: (r) => <div><strong>{r.user?.name || r.email}</strong><small className="muted-line">{r.user?.email || r.email}</small></div> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${badgeClass(r.status)}`}>{r.status}</span> },
    { key: 'reason', label: 'Reason', render: (r) => r.reason || '-' },
    { key: 'deviceName', label: 'Device', render: (r) => <div><strong>{r.deviceName || 'Unknown device'}</strong><small className="muted-line">{r.ip || '-'}</small></div> }
  ];

  const deviceColumns = [
    { key: 'deviceName', label: 'Device', render: (r) => <div><strong>{r.deviceName || 'Unknown device'}</strong><small className="muted-line">{r.deviceHash?.slice(0, 18)}</small></div> },
    { key: 'user', label: 'User', render: (r) => r.user?.email || '-' },
    { key: 'ipAddress', label: 'Last IP' },
    { key: 'lastSeenAt', label: 'Last Seen', render: (r) => shortDate(r.lastSeenAt) },
    { key: 'isTrusted', label: 'Trusted', render: (r) => <span className={`badge ${r.revokedAt ? 'cancelled' : r.isTrusted ? 'posted' : 'pending'}`}>{r.revokedAt ? 'REVOKED' : r.isTrusted ? 'TRUSTED' : 'NEW'}</span> }
  ];

  const eventColumns = [
    { key: 'createdAt', label: 'Time', render: (r) => shortDate(r.createdAt) },
    { key: 'severity', label: 'Severity', render: (r) => <span className={`badge ${badgeClass(r.severity)}`}>{r.severity}</span> },
    { key: 'type', label: 'Type' },
    { key: 'title', label: 'Title', render: (r) => <div><strong>{r.title}</strong><small className="muted-line">{r.description || '-'}</small></div> },
    { key: 'user', label: 'User', render: (r) => r.user?.email || '-' }
  ];

  return (
    <div className="page security-center-page stage9-page">
      <div className="page-head security-hero stage9-hero security-modern-hero">
        <div>
          <span className="eyebrow">Security control center</span>
          <h1>Security Center</h1>
          <p>Monitor login history, failed attempts, devices and warning events in a cleaner professional control panel.</p>
        </div>
        <button className="secondary-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <div className="security-score-panel">
        <div className="security-score-ring"><ShieldCheck size={30} /><strong>{summary?.score ?? '-'}</strong><span>score</span></div>
        <div className="security-score-copy"><h2>Security posture</h2><p>Score is based on recent failed logins, device trust and security activity. Review untrusted devices and high severity events first.</p></div>
        <div className="security-mini-grid"><div><span>Logins Today</span><strong>{summary?.loginsToday || 0}</strong></div><div><span>Failed 7 Days</span><strong>{summary?.failed7d || 0}</strong></div><div><span>Trusted Devices</span><strong>{summary?.trustedDevices || 0}</strong></div><div><span>New/Untrusted</span><strong>{summary?.untrustedDevices || 0}</strong></div></div>
      </div>

      <section className="panel security-tabs stage9-tabs"><button className={tab === 'logins' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('logins')}>Login History</button><button className={tab === 'devices' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('devices')}>Devices</button><button className={tab === 'events' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('events')}>Security Events</button><button className={tab === 'users' ? 'primary-btn' : 'secondary-btn'} onClick={() => setTab('users')}>Users</button></section>

      {tab === 'logins' && <section className="panel stage9-register-panel"><div className="section-title-row"><div><h2><ShieldAlert size={20} /> Login History</h2><p>Click a row to see browser, device and login details.</p></div><label>Status<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="ALL">All</option><option value="SUCCESS">Success</option><option value="FAILED">Failed</option></select></label></div><DataTable columns={loginColumns} rows={loginHistory} empty="No login history yet" onRowClick={(row) => openDetail('login', row)} paginationLabel="logins" /></section>}

      {tab === 'devices' && <section className="panel stage9-register-panel"><div className="section-title-row"><div><h2><MonitorSmartphone size={20} /> Device Tracking</h2><p>Click a device row to trust or revoke it from the modal.</p></div></div><DataTable columns={deviceColumns} rows={devices} empty="No devices recorded yet" onRowClick={(row) => openDetail('device', row)} paginationLabel="devices" /></section>}

      {tab === 'events' && <section className="panel stage9-register-panel"><div className="section-title-row"><div><h2>Security Events</h2><p>Important security actions and warning events.</p></div><label>Severity<select value={filter.severity} onChange={(e) => setFilter({ ...filter, severity: e.target.value })}><option value="ALL">All</option><option value="INFO">Info</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select></label></div><DataTable columns={eventColumns} rows={events} empty="No security events yet" onRowClick={(row) => openDetail('event', row)} paginationLabel="events" /></section>}

      {tab === 'users' && <section className="panel stage9-register-panel"><h2>User Security Overview</h2><div className="security-user-grid stage9-user-grid">{(summary?.usersList || []).map((user) => <div className="security-user-card" key={user.id}><strong>{user.name}</strong><span>{user.email}</span><small>{user.role}</small><em className={user.isActive ? 'good' : 'bad'}>{user.isActive ? 'Active' : 'Disabled'}</em><small>Last login: {shortDate(user.lastLoginAt)}</small></div>)}</div></section>}

      <ModalDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={selectedType === 'device' ? 'Device Details' : selectedType === 'event' ? 'Security Event' : 'Login Details'} eyebrow="Security detail" description="Review the selected security record in a readable modal." mode="modal" size="lg">
        {selected && <div className="detail-modal-content"><div className="detail-grid"><div><span>Type</span><strong>{selectedType}</strong></div><div><span>Status/Severity</span><strong>{selected.status || selected.severity || (selected.isTrusted ? 'TRUSTED' : 'NEW')}</strong></div><div><span>User</span><strong>{selected.user?.email || selected.email || '-'}</strong></div><div><span>Device</span><strong>{selected.deviceName || 'Unknown device'}</strong></div><div><span>IP</span><strong>{selected.ip || selected.ipAddress || '-'}</strong></div><div><span>Time</span><strong>{shortDate(selected.createdAt || selected.lastSeenAt)}</strong></div></div><div className="modal-info-block"><strong>Details</strong><p>{selected.description || selected.reason || selected.userAgent || selected.title || 'No extra details.'}</p></div>{selectedType === 'device' && <div className="modal-action-row"><button className="primary-btn" onClick={() => trustDevice(selected)}>Trust Device</button><button className="danger-btn" onClick={() => revokeDevice(selected)}>Revoke Device</button></div>}</div>}
      </ModalDrawer>
    </div>
  );
}
