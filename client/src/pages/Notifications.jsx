import { useEffect, useMemo, useState } from 'react';
import { Bell, CheckCheck, Mail, MessageCircle, RefreshCcw, Send, Settings2, Trash2 } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const emptyManual = { title: '', message: '', type: 'INFO', priority: 'NORMAL', actionUrl: '' };
const emptySend = { recipient: '', subject: 'SmartLedger Reminder', message: '' };

function badgeClass(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'success' || key === 'sent') return 'badge posted';
  if (key === 'warning' || key === 'link_ready') return 'badge partial';
  if (key === 'danger' || key === 'failed' || key === 'urgent') return 'badge cancelled';
  if (key === 'high') return 'badge danger';
  return 'badge info';
}

function fmtDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

export default function Notifications() {
  const [tab, setTab] = useState('notifications');
  const [summary, setSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [logs, setLogs] = useState([]);
  const [settings, setSettings] = useState(null);
  const [filter, setFilter] = useState({ status: 'UNREAD', type: 'ALL', priority: 'ALL' });
  const [manual, setManual] = useState(emptyManual);
  const [sendEmail, setSendEmail] = useState(emptySend);
  const [sendWhatsapp, setSendWhatsapp] = useState({ recipient: '', message: '' });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const [s, n, st, l] = await Promise.all([
      api.get('/notifications/summary'),
      api.get('/notifications', { params: filter }),
      api.get('/notifications/settings/reminders'),
      api.get('/notifications/communication-logs')
    ]);
    setSummary(s.data || null);
    setNotifications(n.data || []);
    setSettings(st.data || null);
    setLogs(l.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load notifications')); }, [filter.status, filter.type, filter.priority]);

  function showOk(text) {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 2500);
  }

  const unreadValue = useMemo(() => notifications.filter((n) => !n.isRead).length, [notifications]);

  async function markRead(item) {
    try {
      await api.put(`/notifications/${item.id}/read`);
      await load();
      showOk('Notification marked as read');
    } catch (e) { setError(e.response?.data?.message || 'Failed to update notification'); }
  }

  async function markAllRead() {
    try {
      const res = await api.put('/notifications/read-all');
      await load();
      showOk(`${res.data?.updated || 0} notifications marked as read`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to mark all read'); }
  }

  async function deleteNotification(item) {
    if (!confirm(`Delete notification: ${item.title}?`)) return;
    try {
      await api.delete(`/notifications/${item.id}`);
      await load();
      showOk('Notification deleted');
    } catch (e) { setError(e.response?.data?.message || 'Failed to delete notification'); }
  }

  async function generateAlerts() {
    try {
      const res = await api.post('/notifications/generate-alerts');
      await load();
      showOk(`${res.data?.created || 0} business alerts generated`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate alerts'); }
  }

  async function saveSettings(e) {
    e.preventDefault();
    try {
      await api.put('/notifications/settings/reminders', settings);
      await load();
      showOk('Reminder settings saved');
    } catch (e) { setError(e.response?.data?.message || 'Failed to save reminder settings'); }
  }

  async function createManual(e) {
    e.preventDefault();
    try {
      await api.post('/notifications', { ...manual, actionUrl: manual.actionUrl || null });
      setManual(emptyManual);
      await load();
      showOk('Manual notification created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create notification'); }
  }

  async function sendEmailReminder(e) {
    e.preventDefault();
    try {
      const res = await api.post('/notifications/send-email', sendEmail);
      await load();
      showOk(res.data?.status === 'SENT' ? 'Email sent' : 'Email logged. Configure SMTP to send automatically.');
    } catch (e) { setError(e.response?.data?.message || 'Failed to send/log email'); }
  }

  async function sendWhatsappReminder(e) {
    e.preventDefault();
    try {
      const res = await api.post('/notifications/send-whatsapp', sendWhatsapp);
      await load();
      showOk('WhatsApp link created');
      if (res.data?.whatsappLink) window.open(res.data.whatsappLink, '_blank', 'noopener,noreferrer');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create WhatsApp link'); }
  }

  return (
    <div className="page notifications-page">
      <div className="page-head">
        <div>
          <h1>Notification Center</h1>
          <p>Business alerts, reminders, approval updates, email logs and WhatsApp reminder foundation.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${tab === 'notifications' ? 'active' : ''}`} onClick={() => setTab('notifications')}><Bell size={16} /> Alerts</button>
          <button className={`tab-btn ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}><Settings2 size={16} /> Settings</button>
          <button className={`tab-btn ${tab === 'send' ? 'active' : ''}`} onClick={() => setTab('send')}><Send size={16} /> Send</button>
          <button className={`tab-btn ${tab === 'logs' ? 'active' : ''}`} onClick={() => setTab('logs')}>Logs</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <section className="stat-grid">
        <div className="stat-card"><span>Unread</span><strong>{summary?.unread || 0}</strong><small>{unreadValue} in current filter</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>High / Urgent</span><strong>{summary?.urgent || 0}</strong><small>Needs fast action</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Warnings</span><strong>{summary?.warnings || 0}</strong><small>Credit, stock, subscription</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Messages Today</span><strong>{summary?.logsToday || 0}</strong><small>Email / WhatsApp logs</small><div className="stat-orb" /></div>
      </section>

      {tab === 'notifications' && (
        <section className="panel">
          <div className="ledger-toolbar notification-toolbar">
            <div>
              <h2>Alerts & Reminders</h2>
              <p>Generate alerts for low stock, customer credit, supplier payables, approvals and subscription expiry.</p>
            </div>
            <div className="approval-filter-row">
              <label>Status<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="ALL">All</option>
                <option value="UNREAD">Unread</option>
                <option value="READ">Read</option>
              </select></label>
              <label>Type<select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
                <option value="ALL">All</option>
                <option value="INFO">Info</option>
                <option value="SUCCESS">Success</option>
                <option value="WARNING">Warning</option>
                <option value="DANGER">Danger</option>
              </select></label>
              <label>Priority<select value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value })}>
                <option value="ALL">All</option>
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
                <option value="URGENT">Urgent</option>
              </select></label>
              <button className="secondary-btn" onClick={markAllRead}><CheckCheck size={16} /> Mark all read</button>
              <button className="primary-btn" onClick={generateAlerts}><RefreshCcw size={16} /> Generate alerts</button>
            </div>
          </div>

          <DataTable columns={[
            { key: 'title', label: 'Notification', render: (r) => <div><strong>{r.title}</strong><small className="table-subtext">{r.message}</small></div> },
            { key: 'type', label: 'Type', render: (r) => <span className={badgeClass(r.type)}>{r.type}</span> },
            { key: 'priority', label: 'Priority', render: (r) => <span className={badgeClass(r.priority)}>{r.priority}</span> },
            { key: 'isRead', label: 'Status', render: (r) => <span className={r.isRead ? 'badge posted' : 'badge partial'}>{r.isRead ? 'READ' : 'UNREAD'}</span> },
            { key: 'createdAt', label: 'Created', render: (r) => fmtDate(r.createdAt) },
            { key: 'actionUrl', label: 'Open', render: (r) => r.actionUrl ? <a className="secondary-btn compact-link" href={r.actionUrl}>Open</a> : '-' },
            { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions">
              {!r.isRead && <button className="secondary-btn" onClick={() => markRead(r)}>Read</button>}
              <button className="mini-danger" onClick={() => deleteNotification(r)}><Trash2 size={14} /></button>
            </div> }
          ]} rows={notifications} empty="No notifications found" />
        </section>
      )}

      {tab === 'settings' && settings && (
        <section className="panel notification-settings-panel">
          <h2>Reminder Settings</h2>
          <p>These settings control which alerts are generated. Email and WhatsApp are foundations now; SMTP can send email and WhatsApp opens a wa.me link.</p>
          <form onSubmit={saveSettings} className="settings-grid notification-settings-grid">
            {[
              ['lowStockEnabled', 'Low stock alerts'],
              ['customerCreditEnabled', 'Customer credit reminders'],
              ['supplierPaymentEnabled', 'Supplier payment reminders'],
              ['approvalEnabled', 'Approval reminders'],
              ['subscriptionEnabled', 'Subscription expiry reminders'],
              ['emailEnabled', 'Enable email reminders'],
              ['whatsappEnabled', 'Enable WhatsApp reminders']
            ].map(([key, label]) => (
              <label key={key} className="check-label setting-check"><input type="checkbox" checked={Boolean(settings[key])} onChange={(e) => setSettings({ ...settings, [key]: e.target.checked })} /> {label}</label>
            ))}
            <label>Reminder days before due<input type="number" min="0" max="60" value={settings.reminderDaysBeforeDue || 0} onChange={(e) => setSettings({ ...settings, reminderDaysBeforeDue: Number(e.target.value || 0) })} /></label>
            <label>Default WhatsApp phone<input value={settings.whatsappDefaultPhone || ''} onChange={(e) => setSettings({ ...settings, whatsappDefaultPhone: e.target.value })} placeholder="9477xxxxxxx" /></label>
            <label>Daily summary email<input value={settings.dailySummaryEmail || ''} onChange={(e) => setSettings({ ...settings, dailySummaryEmail: e.target.value })} placeholder="owner@example.com" /></label>
            <button className="primary-btn">Save Settings</button>
          </form>
        </section>
      )}

      {tab === 'send' && (
        <div className="two-col-page">
          <section className="panel">
            <h2><Bell size={18} /> Create In-App Notification</h2>
            <form className="form-grid" onSubmit={createManual}>
              <input placeholder="Title" value={manual.title} onChange={(e) => setManual({ ...manual, title: e.target.value })} required />
              <select value={manual.type} onChange={(e) => setManual({ ...manual, type: e.target.value })}>
                <option value="INFO">Info</option><option value="SUCCESS">Success</option><option value="WARNING">Warning</option><option value="DANGER">Danger</option>
              </select>
              <select value={manual.priority} onChange={(e) => setManual({ ...manual, priority: e.target.value })}>
                <option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High</option><option value="URGENT">Urgent</option>
              </select>
              <input placeholder="Action URL, example /products" value={manual.actionUrl} onChange={(e) => setManual({ ...manual, actionUrl: e.target.value })} />
              <textarea placeholder="Message" value={manual.message} onChange={(e) => setManual({ ...manual, message: e.target.value })} required />
              <button className="primary-btn">Create Notification</button>
            </form>
          </section>

          <section className="panel">
            <h2><Mail size={18} /> Email Reminder</h2>
            <form className="form-grid" onSubmit={sendEmailReminder}>
              <input placeholder="Recipient email" value={sendEmail.recipient} onChange={(e) => setSendEmail({ ...sendEmail, recipient: e.target.value })} required />
              <input placeholder="Subject" value={sendEmail.subject} onChange={(e) => setSendEmail({ ...sendEmail, subject: e.target.value })} />
              <textarea placeholder="Email message" value={sendEmail.message} onChange={(e) => setSendEmail({ ...sendEmail, message: e.target.value })} required />
              <button className="primary-btn"><Mail size={16} /> Send / Log Email</button>
            </form>
          </section>

          <section className="panel">
            <h2><MessageCircle size={18} /> WhatsApp Reminder</h2>
            <form className="form-grid" onSubmit={sendWhatsappReminder}>
              <input placeholder="Phone with country code, example 9477xxxxxxx" value={sendWhatsapp.recipient} onChange={(e) => setSendWhatsapp({ ...sendWhatsapp, recipient: e.target.value })} required />
              <textarea placeholder="WhatsApp message" value={sendWhatsapp.message} onChange={(e) => setSendWhatsapp({ ...sendWhatsapp, message: e.target.value })} required />
              <button className="primary-btn"><MessageCircle size={16} /> Open WhatsApp Link</button>
            </form>
          </section>
        </div>
      )}

      {tab === 'logs' && (
        <section className="panel">
          <div className="ledger-toolbar"><div><h2>Communication Logs</h2><p>Email and WhatsApp reminder history for this company.</p></div></div>
          <DataTable columns={[
            { key: 'channel', label: 'Channel' },
            { key: 'recipient', label: 'Recipient' },
            { key: 'subject', label: 'Subject', render: (r) => r.subject || '-' },
            { key: 'message', label: 'Message', render: (r) => <small className="table-subtext">{r.message}</small> },
            { key: 'status', label: 'Status', render: (r) => <span className={badgeClass(r.status)}>{r.status}</span> },
            { key: 'provider', label: 'Provider', render: (r) => r.provider || '-' },
            { key: 'createdAt', label: 'Created', render: (r) => fmtDate(r.createdAt) },
            { key: 'providerRef', label: 'Link', render: (r) => r.channel === 'WHATSAPP' && r.providerRef ? <a className="secondary-btn compact-link" href={r.providerRef} target="_blank" rel="noreferrer">Open</a> : '-' }
          ]} rows={logs} empty="No communication logs yet" />
        </section>
      )}
    </div>
  );
}
