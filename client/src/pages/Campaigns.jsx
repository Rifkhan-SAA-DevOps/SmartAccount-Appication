import { useEffect, useMemo, useState } from 'react';
import { Bell, Mail, Megaphone, MessageCircle, Plus, RefreshCw, Send, Users } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyTemplate = { name: 'Payment Reminder Template', channel: 'WHATSAPP', subject: 'Payment reminder', body: 'Hi {{customerName}}, your pending balance is {{balance}}. Please arrange payment soon. Thank you, {{businessName}}.', isActive: true };
const emptyCampaign = { name: 'Monthly Customer Promotion', channel: 'WHATSAPP', audienceType: 'ALL_CUSTOMERS', subject: 'Special offer', message: 'Hi {{customerName}}, we have a special offer for you from {{businessName}}. Visit us today!', scheduledAt: '', notes: '' };
const emptyReminder = { channel: 'WHATSAPP', minBalance: 1, message: 'Hi {{customerName}}, your pending balance is {{balance}}. Please arrange payment soon. Thank you, {{businessName}}.' };

function d(v) { return v ? new Date(v).toLocaleString() : '-'; }
function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (['sent', 'logged'].includes(s)) return 'paid';
  if (['ready', 'scheduled', 'sending'].includes(s)) return 'partial';
  if (['failed', 'cancelled'].includes(s)) return 'cancelled';
  return 'unpaid';
}

export default function Campaigns() {
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [logs, setLogs] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplate);
  const [campaignForm, setCampaignForm] = useState(emptyCampaign);
  const [reminderForm, setReminderForm] = useState(emptyReminder);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const [summaryRes, campaignRes, templateRes, customerRes, logRes] = await Promise.all([
      api.get('/campaigns/summary'),
      api.get('/campaigns/campaigns'),
      api.get('/campaigns/templates'),
      api.get('/campaigns/customers'),
      api.get('/campaigns/logs')
    ]);
    const campaignRows = campaignRes.data || [];
    setSummary(summaryRes.data);
    setCampaigns(campaignRows);
    setTemplates(templateRes.data || []);
    setCustomers(customerRes.data || []);
    setLogs(logRes.data || []);
    const nextCampaignId = selectedCampaignId || campaignRows[0]?.id || '';
    setSelectedCampaignId(nextCampaignId);
    if (nextCampaignId) await loadCampaign(nextCampaignId);
  }

  async function loadCampaign(id = selectedCampaignId) {
    if (!id) { setSelectedCampaign(null); return; }
    const { data } = await api.get(`/campaigns/campaigns/${id}`);
    setSelectedCampaign(data);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load campaigns')); }, []);
  useEffect(() => { if (selectedCampaignId) loadCampaign(selectedCampaignId).catch(() => {}); }, [selectedCampaignId]);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  const selectedTemplate = useMemo(() => templates.find((t) => t.id === campaignForm.templateId), [templates, campaignForm.templateId]);

  function applyTemplate(id) {
    const t = templates.find((row) => row.id === id);
    if (!t) return setCampaignForm({ ...campaignForm, templateId: '', subject: campaignForm.subject, message: campaignForm.message });
    setCampaignForm({ ...campaignForm, templateId: t.id, channel: t.channel, subject: t.subject || '', message: t.body });
  }

  async function createTemplate(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/campaigns/templates', templateForm);
      setTemplateForm(emptyTemplate);
      flash('Template saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save template'); }
    finally { setSaving(false); }
  }

  async function createCampaign(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const payload = { ...campaignForm, templateId: campaignForm.templateId || null, scheduledAt: campaignForm.scheduledAt || null };
      const { data } = await api.post('/campaigns/campaigns', payload);
      setCampaignForm(emptyCampaign);
      setSelectedCampaignId(data.id);
      flash('Campaign created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create campaign'); }
    finally { setSaving(false); }
  }

  async function importRecipients() {
    if (!selectedCampaignId) return setError('Select a campaign first');
    setSaving(true); setError('');
    try {
      const { data } = await api.post(`/campaigns/campaigns/${selectedCampaignId}/import-customers`, { audienceType: selectedCampaign?.audienceType || campaignForm.audienceType, customerIds: selectedCustomerIds, limit: 500 });
      flash(`${data.imported || 0} recipient(s) imported`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to import recipients'); }
    finally { setSaving(false); }
  }

  async function sendCampaign(row = selectedCampaign) {
    const id = row?.id || selectedCampaignId;
    if (!id) return setError('Select a campaign first');
    if (!window.confirm('Log/send this campaign to all pending recipients?')) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.post(`/campaigns/campaigns/${id}/send`);
      flash(`${data.sent || 0} message(s) logged`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to send campaign'); }
    finally { setSaving(false); }
  }

  async function quickBalanceReminders(e) {
    e.preventDefault();
    if (!window.confirm('Create balance reminder communication logs for customers with pending balances?')) return;
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/campaigns/quick-balance-reminders', reminderForm);
      flash(`${data.sent || 0} reminder(s) logged`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create quick reminders'); }
    finally { setSaving(false); }
  }

  function toggleCustomer(id) {
    setSelectedCustomerIds((old) => old.includes(id) ? old.filter((x) => x !== id) : [...old, id]);
  }

  const campaignColumns = [
    { key: 'campaign', label: 'Campaign', render: (r) => <><strong>{r.campaignNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'channel', label: 'Channel', render: (r) => <span className="badge partial">{r.channel}</span> },
    { key: 'audience', label: 'Audience', render: (r) => r.audienceType },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'count', label: 'Recipients', render: (r) => <>{r.totalRecipients || r._count?.recipients || 0}<span className="table-subtext">Sent {r.sentCount || 0} · Failed {r.failedCount || 0}</span></> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions"><button className="mini-action" onClick={() => setSelectedCampaignId(r.id)}>View</button><button className="mini-action" disabled={saving} onClick={() => sendCampaign(r)}>Send</button></div> }
  ];

  const recipientColumns = [
    { key: 'name', label: 'Recipient', render: (r) => <><strong>{r.name || r.customer?.name || '-'}</strong><span className="table-subtext">{r.recipientAddress}</span></> },
    { key: 'channel', label: 'Channel', render: (r) => r.channel },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'sent', label: 'Sent At', render: (r) => d(r.sentAt) },
    { key: 'error', label: 'Error', render: (r) => r.error || '-' }
  ];

  const templateColumns = [
    { key: 'name', label: 'Template', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">{r.subject || 'No subject'}</span></> },
    { key: 'channel', label: 'Channel', render: (r) => <span className="badge partial">{r.channel}</span> },
    { key: 'active', label: 'Active', render: (r) => r.isActive ? 'Yes' : 'No' },
    { key: 'body', label: 'Message', render: (r) => <span className="table-subtext">{String(r.body || '').slice(0, 120)}...</span> }
  ];

  const logColumns = [
    { key: 'channel', label: 'Channel', render: (r) => <span className="badge partial">{r.channel}</span> },
    { key: 'recipient', label: 'Recipient', render: (r) => <><strong>{r.recipient}</strong><span className="table-subtext">{r.subject || '-'}</span></> },
    { key: 'message', label: 'Message', render: (r) => <span className="table-subtext">{String(r.message || '').slice(0, 120)}...</span> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'date', label: 'Date', render: (r) => d(r.createdAt) }
  ];

  return <div className="page campaigns-page">
    <div className="page-header">
      <div><span className="eyebrow">Marketing automation</span><h1>WhatsApp / Email Campaigns</h1><p>Create customer campaigns, import recipients, log WhatsApp/email reminders, and keep communication history without leaving SmartLedger.</p></div>
      <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={importRecipients} disabled={saving || !selectedCampaignId}><Users size={16}/> Import Recipients</button><button className="secondary-btn" onClick={() => sendCampaign(selectedCampaign)} disabled={saving || !selectedCampaignId}><Send size={16}/> Send Campaign</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid campaign-stat-grid">
      <StatCard title="Campaigns" value={summary?.campaigns || 0} subtitle={summary?.recentCampaign?.name || 'No campaign yet'} />
      <StatCard title="Recipients Sent" value={summary?.sentRecipients || 0} subtitle={`${summary?.pendingRecipients || 0} pending`} tone="green" />
      <StatCard title="Templates" value={summary?.activeTemplates || 0} subtitle="Active message templates" tone="purple" />
      <StatCard title="Logs Last 30 Days" value={summary?.logsLast30Days || 0} subtitle="Communication history" tone="orange" />
    </div>

    <div className="campaign-grid">
      <section className="panel campaign-main-panel">
        <div className="section-title-row"><h2><Megaphone size={20}/> Campaign Register</h2><select value={selectedCampaignId} onChange={(e)=>setSelectedCampaignId(e.target.value)}><option value="">Select campaign</option>{campaigns.map((c)=><option key={c.id} value={c.id}>{c.campaignNo} · {c.name}</option>)}</select></div>
        <DataTable columns={campaignColumns} rows={campaigns} empty="No campaigns found" />
      </section>

      <aside className="panel campaign-form-panel">
        <h2><Plus size={20}/> Create Campaign</h2>
        <form className="form-grid compact" onSubmit={createCampaign}>
          <label>Template<select value={campaignForm.templateId || ''} onChange={(e)=>applyTemplate(e.target.value)}><option value="">No template</option>{templates.map((t)=><option key={t.id} value={t.id}>{t.name} · {t.channel}</option>)}</select></label>
          {selectedTemplate && <div className="campaign-template-note">Template loaded: <strong>{selectedTemplate.name}</strong></div>}
          <label>Campaign name<input value={campaignForm.name} onChange={(e)=>setCampaignForm({...campaignForm,name:e.target.value})} required /></label>
          <div className="form-grid two"><label>Channel<select value={campaignForm.channel} onChange={(e)=>setCampaignForm({...campaignForm,channel:e.target.value})}>{['EMAIL','WHATSAPP','SMS','IN_APP'].map((s)=><option key={s}>{s}</option>)}</select></label><label>Audience<select value={campaignForm.audienceType} onChange={(e)=>setCampaignForm({...campaignForm,audienceType:e.target.value})}>{['ALL_CUSTOMERS','ACTIVE_CUSTOMERS','HAS_BALANCE','LOYALTY_MEMBERS','DUE_INSTALLMENTS','SELECTED_CUSTOMERS'].map((s)=><option key={s}>{s}</option>)}</select></label></div>
          <label>Subject<input value={campaignForm.subject} onChange={(e)=>setCampaignForm({...campaignForm,subject:e.target.value})} /></label>
          <label>Message<textarea value={campaignForm.message} onChange={(e)=>setCampaignForm({...campaignForm,message:e.target.value})} required /></label>
          <small className="hint">Variables: {'{{customerName}}'}, {'{{balance}}'}, {'{{loyaltyPoints}}'}, {'{{businessName}}'}</small>
          <button className="primary-btn" disabled={saving}><Megaphone size={18}/> Save Campaign</button>
        </form>

        <h2><Bell size={20}/> Quick Balance Reminders</h2>
        <form className="form-grid compact" onSubmit={quickBalanceReminders}>
          <div className="form-grid two"><label>Channel<select value={reminderForm.channel} onChange={(e)=>setReminderForm({...reminderForm,channel:e.target.value})}>{['WHATSAPP','SMS','EMAIL','IN_APP'].map((s)=><option key={s}>{s}</option>)}</select></label><label>Min balance<input type="number" min="0" value={reminderForm.minBalance} onChange={(e)=>setReminderForm({...reminderForm,minBalance:e.target.value})} /></label></div>
          <label>Reminder message<textarea value={reminderForm.message} onChange={(e)=>setReminderForm({...reminderForm,message:e.target.value})} /></label>
          <button className="secondary-btn" disabled={saving}><Send size={18}/> Log Reminders</button>
        </form>
      </aside>
    </div>

    <div className="campaign-detail-grid">
      <section className="panel">
        <div className="section-title-row"><h2><Users size={20}/> Recipients</h2><button className="mini-action" onClick={importRecipients} disabled={!selectedCampaignId || saving}>Import audience</button></div>
        {selectedCampaign ? <DataTable columns={recipientColumns} rows={selectedCampaign.recipients || []} empty="No recipients imported yet" /> : <div className="empty-state">Select a campaign to view recipients.</div>}
      </section>

      <aside className="panel campaign-customer-panel">
        <h2><Users size={20}/> Selected Customer Audience</h2>
        <p className="muted-text">Tick customers here, then create/select a campaign with audience type SELECTED_CUSTOMERS and click Import Recipients.</p>
        <div className="customer-check-list">
          {customers.slice(0, 80).map((c) => <label key={c.id} className="check-label"><input type="checkbox" checked={selectedCustomerIds.includes(c.id)} onChange={() => toggleCustomer(c.id)} /> <span><strong>{c.name}</strong><small>{c.phone || c.email || 'No contact'} · Balance LKR {Number(c.balance || 0).toLocaleString()}</small></span></label>)}
        </div>
      </aside>
    </div>

    <div className="campaign-lower-grid">
      <section className="panel">
        <h2><Mail size={20}/> Templates</h2>
        <DataTable columns={templateColumns} rows={templates} empty="No templates found" />
      </section>
      <aside className="panel campaign-form-panel">
        <h2><MessageCircle size={20}/> Create Template</h2>
        <form className="form-grid compact" onSubmit={createTemplate}>
          <label>Name<input value={templateForm.name} onChange={(e)=>setTemplateForm({...templateForm,name:e.target.value})} required /></label>
          <div className="form-grid two"><label>Channel<select value={templateForm.channel} onChange={(e)=>setTemplateForm({...templateForm,channel:e.target.value})}>{['EMAIL','WHATSAPP','SMS','IN_APP'].map((s)=><option key={s}>{s}</option>)}</select></label><label className="check-label"><input type="checkbox" checked={templateForm.isActive} onChange={(e)=>setTemplateForm({...templateForm,isActive:e.target.checked})} /> Active</label></div>
          <label>Subject<input value={templateForm.subject} onChange={(e)=>setTemplateForm({...templateForm,subject:e.target.value})} /></label>
          <label>Body<textarea value={templateForm.body} onChange={(e)=>setTemplateForm({...templateForm,body:e.target.value})} required /></label>
          <button className="primary-btn" disabled={saving}>Save Template</button>
        </form>
      </aside>
    </div>

    <section className="panel campaign-log-panel">
      <h2><Send size={20}/> Communication Logs</h2>
      <DataTable columns={logColumns} rows={logs} empty="No communication logs yet" />
    </section>
  </div>;
}
