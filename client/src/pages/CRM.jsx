import { useEffect, useMemo, useState } from 'react';
import { BellRing, Filter, Handshake, Megaphone, PhoneCall, RefreshCw, UserPlus } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage9-operations-polish.css';

const emptyLead = { title: '', companyName: '', contactName: '', phone: '', email: '', source: 'Walk-in', stageId: '', status: 'OPEN', priority: 'NORMAL', probability: 10, expectedValue: 0, expectedCloseDate: '', nextFollowUpAt: '', customerId: '', notes: '' };
const emptyStage = { name: '', sortOrder: 10, probability: 10, color: '', isWon: false, isLost: false, isActive: true };
const emptyActivity = { type: 'CALL', subject: '', notes: '', dueAt: '', outcome: '', completed: false };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dt(value) { return value ? new Date(value).toLocaleString() : '-'; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (s === 'won') return 'paid';
  if (s === 'lost' || s === 'archived') return 'cancelled';
  if (s === 'quoted' || s === 'follow_up') return 'unpaid';
  return 'partial';
}
function isoLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function isoDate(value) {
  if (!value) return '';
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

export default function CRM() {
  const [summary, setSummary] = useState(null);
  const [leads, setLeads] = useState([]);
  const [stages, setStages] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [leadForm, setLeadForm] = useState(emptyLead);
  const [stageForm, setStageForm] = useState(emptyStage);
  const [activityForm, setActivityForm] = useState(emptyActivity);
  const [selectedLead, setSelectedLead] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', stageId: '', followup: '' });
  const [tab, setTab] = useState('pipeline');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(null);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, leadRes, stageRes, customerRes] = await Promise.all([
      api.get('/crm/summary'),
      api.get('/crm/leads', { params }),
      api.get('/crm/stages'),
      api.get('/customers')
    ]);
    setSummary(summaryRes.data);
    setLeads(leadRes.data || []);
    setStages(stageRes.data || []);
    setCustomers(customerRes.data || []);
    setLeadForm((old) => ({ ...old, stageId: old.stageId || stageRes.data?.[0]?.id || '', probability: old.probability || stageRes.data?.[0]?.probability || 10 }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load CRM')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const selectedStage = useMemo(() => stages.find((s) => s.id === leadForm.stageId), [stages, leadForm.stageId]);
  const pipelineGroups = useMemo(() => stages.filter((s) => s.isActive).map((stage) => ({ ...stage, leads: leads.filter((lead) => lead.stageId === stage.id) })), [stages, leads]);
  const overdueFollowUps = useMemo(() => leads.filter((lead) => lead.overdueFollowUp), [leads]);

  function chooseStage(stageId) {
    const stage = stages.find((s) => s.id === stageId);
    setLeadForm((old) => ({ ...old, stageId, probability: stage?.probability ?? old.probability }));
  }

  async function createLead(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/crm/leads', {
        ...leadForm,
        customerId: leadForm.customerId || null,
        stageId: leadForm.stageId || null,
        email: leadForm.email || null,
        expectedValue: Number(leadForm.expectedValue || 0),
        probability: Number(leadForm.probability || selectedStage?.probability || 0),
        expectedCloseDate: leadForm.expectedCloseDate || null,
        nextFollowUpAt: leadForm.nextFollowUpAt || null
      });
      setLeadForm({ ...emptyLead, stageId: stages[0]?.id || '', probability: stages[0]?.probability || 10 });
      flash('Lead created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create lead'); }
    finally { setSaving(false); }
  }

  async function createStage(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/crm/stages', { ...stageForm, sortOrder: Number(stageForm.sortOrder || 0), probability: Number(stageForm.probability || 0) });
      setStageForm(emptyStage);
      flash('Pipeline stage saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save stage'); }
    finally { setSaving(false); }
  }

  async function updateLead(lead, patch) {
    setError('');
    try {
      const payload = { ...patch };
      if (patch.stageId) {
        const stage = stages.find((s) => s.id === patch.stageId);
        if (stage) payload.probability = stage.probability;
      }
      await api.patch(`/crm/leads/${lead.id}`, payload);
      flash(`${lead.leadNo} updated`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update lead'); }
  }

  async function convertCustomer(lead) {
    setError('');
    try {
      const { data } = await api.post(`/crm/leads/${lead.id}/convert-customer`);
      flash(`${lead.leadNo} converted to customer: ${data.customer.name}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to convert lead'); }
  }

  async function addActivity(e) {
    e.preventDefault();
    if (!selectedLead) return;
    setSaving(true); setError('');
    try {
      await api.post(`/crm/leads/${selectedLead.id}/activities`, { ...activityForm, dueAt: activityForm.dueAt || null });
      setActivityForm(emptyActivity);
      flash('Follow-up / activity added');
      const { data } = await api.get(`/crm/leads/${selectedLead.id}`);
      setSelectedLead(data);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to add activity'); }
    finally { setSaving(false); }
  }

  async function completeActivity(activity) {
    setError('');
    try {
      await api.patch(`/crm/activities/${activity.id}/complete`, { outcome: activity.outcome || 'Completed' });
      flash('Activity completed');
      const { data } = await api.get(`/crm/leads/${selectedLead.id}`);
      setSelectedLead(data);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to complete activity'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/crm/alerts');
      flash(`${data.created} CRM alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create CRM alerts'); }
  }

  const columns = [
    { key: 'leadNo', label: 'Lead', render: (r) => <><strong>{r.leadNo}</strong><span className="table-subtext">{r.title}</span></> },
    { key: 'contact', label: 'Contact', render: (r) => <>{r.contactName}<span className="table-subtext">{r.companyName || r.phone || r.email || '-'}</span></> },
    { key: 'stageName', label: 'Stage', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span><span className="table-subtext">{r.stageName} · {r.probability}%</span></> },
    { key: 'expectedValue', label: 'Value', render: (r) => <><strong>{money(r.expectedValue)}</strong><span className="table-subtext">Weighted {money(r.weightedValue)}</span></> },
    { key: 'followup', label: 'Follow-up', render: (r) => <>{dt(r.nextFollowUpAt)}{r.overdueFollowUp && <span className="table-subtext danger-text">Overdue</span>}</> }
  ];

  return (
    <div className="page crm-page stage8-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">CRM / leads / follow-up pipeline</span>
          <h1>CRM Pipeline</h1>
          <p>Track leads, follow-ups, stages, sales probability, expected value and customer conversion.</p>
        </div>
        <div className="head-actions">
          <button className="ghost-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
          <button className="secondary-btn" onClick={generateAlerts}><BellRing size={16} /> Create follow-up alerts</button>
          <button className="primary-btn" onClick={() => setDrawer('lead')}><UserPlus size={16} /> Add Lead</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid crm-stat-grid">
        <StatCard title="Open Leads" value={summary?.openLeads || 0} subtitle={`${summary?.leads || 0} total`} />
        <StatCard title="Pipeline Value" value={money(summary?.pipelineValue || 0)} subtitle="Expected total" tone="green" />
        <StatCard title="Weighted Value" value={money(summary?.weightedValue || 0)} subtitle="Probability adjusted" tone="purple" />
        <StatCard title="Overdue Follow-ups" value={summary?.overdueFollowUps || 0} subtitle={`${summary?.dueToday || 0} due today`} tone="red" />
      </div>

      <div className="tab-actions">
        {['pipeline', 'leads', 'followups', 'stages'].map((key) => <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{key === 'pipeline' ? 'Vertical Pipeline' : key}</button>)}
      </div>

      {tab === 'pipeline' && <section className="panel crm-pipeline-table-panel">
        <div className="section-title-row"><div><h2><Handshake size={20}/> Pipeline by Stage</h2><p>Stage cards were changed into a vertical table-style format. Click any lead row to open details.</p></div></div>
        <div className="crm-pipeline-table">
          {pipelineGroups.map((stage) => <div className="crm-pipeline-stage-table" key={stage.id}>
            <div className="crm-pipeline-stage-head">
              <div><strong>{stage.name}</strong><span>{stage.leads.length} lead(s) · {stage.probability || 0}% probability</span></div>
              <b>{money(stage.leads.reduce((sum, lead) => sum + Number(lead.expectedValue || 0), 0))}</b>
            </div>
            <div className="crm-pipeline-stage-body">
              {stage.leads.length ? stage.leads.map((lead) => <button type="button" className="crm-pipeline-lead-row" key={lead.id} onClick={() => setSelectedLead(lead)}>
                <span><strong>{lead.leadNo}</strong><small>{lead.title}</small></span>
                <span>{lead.contactName || lead.companyName || 'No contact'}</span>
                <span>{money(lead.expectedValue)}</span>
                <span>{dt(lead.nextFollowUpAt)}</span>
                <span className={`badge ${statusClass(lead.status)}`}>{lead.status}</span>
              </button>) : <div className="pipeline-empty">No leads here</div>}
            </div>
          </div>)}
        </div>
      </section>}

      {tab === 'leads' && <section className="panel ops-register-panel">
        <div className="section-title-row"><div><h2><Filter size={20}/> Lead Register</h2><p>Search and manage leads in a full-width paginated table.</p></div></div>
        <div className="filters-row crm-filter-row">
          <input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Search title/company/contact" />
          <select value={filters.stageId} onChange={(e)=>setFilters({...filters,stageId:e.target.value})}><option value="">All stages</option>{stages.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All status</option>{['OPEN','FOLLOW_UP','QUOTED','WON','LOST','ARCHIVED'].map((s)=><option key={s}>{s}</option>)}</select>
          <button className="primary-btn" onClick={load}>Apply</button>
        </div>
        <DataTable columns={columns} rows={leads} empty="No CRM leads found" onRowClick={setSelectedLead} paginationLabel="leads" />
      </section>}

      {tab === 'followups' && <section className="panel ops-register-panel">
        <div className="section-title-row"><div><h2><PhoneCall size={20}/> Overdue / Due Follow-ups</h2><p>Click a lead to add call notes, meeting notes or close the follow-up.</p></div></div>
        <DataTable columns={columns} rows={overdueFollowUps} empty="No overdue follow-ups" onRowClick={setSelectedLead} paginationLabel="follow-ups" />
      </section>}

      {tab === 'stages' && <section className="panel ops-register-panel">
        <div className="section-title-row"><div><h2><Megaphone size={20}/> Pipeline Stages</h2><p>Keep stage creation in a drawer so the stage register stays readable.</p></div><button className="primary-btn" onClick={() => setDrawer('stage')}>+ Add Stage</button></div>
        <DataTable columns={[{key:'name',label:'Stage'},{key:'probability',label:'Probability',render:(r)=>`${r.probability}%`},{key:'sortOrder',label:'Order'},{key:'type',label:'Type',render:(r)=><>{r.isWon?'Won':r.isLost?'Lost':'Open'}</>}]} rows={stages} empty="No stages" />
      </section>}

      <ModalDrawer open={drawer === 'lead'} onClose={() => setDrawer(null)} title="Add New Lead" eyebrow="CRM" description="Create a lead using a responsive drawer instead of a crowded page form.">
        <form className="form-grid" onSubmit={createLead}>
          <label>Title<input required value={leadForm.title} onChange={(e)=>setLeadForm({...leadForm,title:e.target.value})} placeholder="New CCTV enquiry / wholesale customer" /></label>
          <label>Company<input value={leadForm.companyName} onChange={(e)=>setLeadForm({...leadForm,companyName:e.target.value})} /></label>
          <label>Contact name<input value={leadForm.contactName} onChange={(e)=>setLeadForm({...leadForm,contactName:e.target.value})} /></label>
          <label>Phone<input value={leadForm.phone} onChange={(e)=>setLeadForm({...leadForm,phone:e.target.value})} /></label>
          <label>Email<input value={leadForm.email} onChange={(e)=>setLeadForm({...leadForm,email:e.target.value})} /></label>
          <label>Source<input value={leadForm.source} onChange={(e)=>setLeadForm({...leadForm,source:e.target.value})} /></label>
          <label>Stage<select value={leadForm.stageId} onChange={(e)=>setLeadForm({...leadForm,stageId:e.target.value})}><option value="">Select stage</option>{stages.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          <label>Status<select value={leadForm.status} onChange={(e)=>setLeadForm({...leadForm,status:e.target.value})}>{['OPEN','FOLLOW_UP','QUOTED','WON','LOST','ARCHIVED'].map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={leadForm.priority} onChange={(e)=>setLeadForm({...leadForm,priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Probability %<input type="number" min="0" max="100" value={leadForm.probability} onChange={(e)=>setLeadForm({...leadForm,probability:e.target.value})} /></label>
          <label>Expected value<input type="number" value={leadForm.expectedValue} onChange={(e)=>setLeadForm({...leadForm,expectedValue:e.target.value})} /></label>
          <label>Expected close<input type="date" value={leadForm.expectedCloseDate} onChange={(e)=>setLeadForm({...leadForm,expectedCloseDate:e.target.value})} /></label>
          <label>Next follow-up<input type="datetime-local" value={leadForm.nextFollowUpAt} onChange={(e)=>setLeadForm({...leadForm,nextFollowUpAt:e.target.value})} /></label>
          <label>Customer<select value={leadForm.customerId} onChange={(e)=>setLeadForm({...leadForm,customerId:e.target.value})}><option value="">Not linked</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="span-two">Notes<textarea value={leadForm.notes} onChange={(e)=>setLeadForm({...leadForm,notes:e.target.value})} /></label>
          <button className="primary-btn span-two" disabled={saving}>Save Lead</button>
        </form>
      </ModalDrawer>

      <ModalDrawer open={drawer === 'stage'} onClose={() => setDrawer(null)} title="Add Pipeline Stage" eyebrow="CRM setup" description="Add stages like Demo, Quoted, Negotiation, Won or Lost.">
        <form className="form-grid" onSubmit={createStage}>
          <label>Name<input required value={stageForm.name} onChange={(e)=>setStageForm({...stageForm,name:e.target.value})} placeholder="Demo / Quoted / Negotiation" /></label>
          <label>Sort order<input type="number" value={stageForm.sortOrder} onChange={(e)=>setStageForm({...stageForm,sortOrder:e.target.value})} /></label>
          <label>Probability %<input type="number" min="0" max="100" value={stageForm.probability} onChange={(e)=>setStageForm({...stageForm,probability:e.target.value})} /></label>
          <label>Color<input value={stageForm.color} onChange={(e)=>setStageForm({...stageForm,color:e.target.value})} placeholder="#7c3aed" /></label>
          <label className="check-label"><input type="checkbox" checked={stageForm.isWon} onChange={(e)=>setStageForm({...stageForm,isWon:e.target.checked,isLost:false})} /> Won stage</label>
          <label className="check-label"><input type="checkbox" checked={stageForm.isLost} onChange={(e)=>setStageForm({...stageForm,isLost:e.target.checked,isWon:false})} /> Lost stage</label>
          <button className="primary-btn span-two" disabled={saving}>Add stage</button>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selectedLead} onClose={() => setSelectedLead(null)} title={selectedLead?.title || 'Lead details'} eyebrow={selectedLead?.leadNo} mode="modal" size="lg" description="View lead information and add follow-up activity.">
        {selectedLead && <>
          <div className="crm-detail-grid">
            <div className="lead-detail-card"><span>Contact</span><strong>{selectedLead.contactName}</strong><small>{selectedLead.companyName || selectedLead.phone || selectedLead.email || '-'}</small></div>
            <div className="lead-detail-card"><span>Value</span><strong>{money(selectedLead.expectedValue)}</strong><small>Weighted {money(selectedLead.weightedValue)}</small></div>
            <div className="lead-detail-card"><span>Follow-up</span><strong>{dt(selectedLead.nextFollowUpAt)}</strong><small>{selectedLead.overdueFollowUp ? 'Overdue' : 'Scheduled'}</small></div>
          </div>
          <div className="modal-action-row">
            <select value={selectedLead.stageId || ''} onChange={(e) => updateLead(selectedLead, { stageId: e.target.value || null })}>
              <option value="">No stage</option>
              {stages.filter((s) => s.isActive).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            {selectedLead.status !== 'WON' && <button className="primary-btn" onClick={() => convertCustomer(selectedLead)}>Convert Customer</button>}
            {selectedLead.status !== 'LOST' && <button className="danger-btn" onClick={() => updateLead(selectedLead, { status: 'LOST', lostReason: 'Marked lost from CRM page' })}>Mark Lost</button>}
          </div>
          <form className="form-grid" onSubmit={addActivity}>
            <h3 className="span-two">Add follow-up / activity</h3>
            <label>Type<select value={activityForm.type} onChange={(e)=>setActivityForm({...activityForm,type:e.target.value})}>{['NOTE','CALL','EMAIL','WHATSAPP','MEETING','TASK','QUOTE','OTHER'].map((t)=><option key={t}>{t}</option>)}</select></label>
            <label>Subject<input required value={activityForm.subject} onChange={(e)=>setActivityForm({...activityForm,subject:e.target.value})} /></label>
            <label>Due at<input type="datetime-local" value={activityForm.dueAt} onChange={(e)=>setActivityForm({...activityForm,dueAt:e.target.value})} /></label>
            <label>Outcome<input value={activityForm.outcome} onChange={(e)=>setActivityForm({...activityForm,outcome:e.target.value})} /></label>
            <label className="span-two">Notes<textarea value={activityForm.notes} onChange={(e)=>setActivityForm({...activityForm,notes:e.target.value})} /></label>
            <label className="check-label"><input type="checkbox" checked={activityForm.completed} onChange={(e)=>setActivityForm({...activityForm,completed:e.target.checked})} /> Mark completed now</label>
            <button className="primary-btn" disabled={saving}>Add activity</button>
          </form>
          <div className="activity-list">
            {(selectedLead.activities || []).map((activity) => <div className="activity-card" key={activity.id}>
              <div><strong>{activity.subject}</strong><span>{activity.type} · Due {dt(activity.dueAt)} · {activity.completedAt ? `Done ${dateOnly(activity.completedAt)}` : 'Pending'}</span></div>
              <p>{activity.notes || activity.outcome || '-'}</p>
              {!activity.completedAt && <button className="mini-action" onClick={() => completeActivity(activity)}>Complete</button>}
            </div>)}
          </div>
        </>}
      </ModalDrawer>
    </div>
  );
}
