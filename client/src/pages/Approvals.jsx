import { useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage9-operations-polish.css';

const types = ['EXPENSE','PURCHASE_ORDER','STOCK_TRANSFER','DISCOUNT','INVOICE_CANCEL','INVOICE_DELETE','STOCK_ADJUSTMENT','SUPPLIER_PAYMENT','CUSTOMER_CREDIT','OTHER'];
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];
const emptyRequest = { type: 'EXPENSE', title: '', description: '', amount: 0, priority: 'NORMAL', entityType: '', entityId: '' };
const emptyRule = { name: '', type: 'EXPENSE', minAmount: 0, approverRoles: 'OWNER,ADMIN', isActive: true };

function badgeClass(value) {
  const key = String(value || '').toLowerCase();
  if (key === 'approved') return 'badge posted';
  if (key === 'pending') return 'badge partial';
  if (key === 'rejected') return 'badge cancelled';
  if (key === 'cancelled') return 'badge unpaid';
  if (key === 'urgent' || key === 'high') return 'badge danger';
  return 'badge info';
}
function fmtMoney(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function nice(value) { return String(value || '').replaceAll('_', ' '); }

export default function Approvals() {
  const [tab, setTab] = useState('requests');
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [filter, setFilter] = useState({ status: 'PENDING', type: 'ALL', mine: false });
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [drawer, setDrawer] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const params = { status: filter.status, type: filter.type, ...(filter.mine ? { mine: 'true' } : {}) };
    const [s, r, ru] = await Promise.all([
      api.get('/approvals/summary'),
      api.get('/approvals/requests', { params }),
      api.get('/approvals/rules')
    ]);
    setSummary(s.data || null);
    setRequests(r.data || []);
    setRules(ru.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load approvals')); }, [filter.status, filter.type, filter.mine]);

  function showOk(text) { setMessage(text); setError(''); setTimeout(() => setMessage(''), 2500); }
  const pendingValue = useMemo(() => requests.filter((r) => r.status === 'PENDING').reduce((sum, r) => sum + Number(r.amount || 0), 0), [requests]);

  async function createRequest(e) {
    e.preventDefault();
    try {
      await api.post('/approvals/requests', { ...requestForm, amount: Number(requestForm.amount || 0), entityType: requestForm.entityType || null, entityId: requestForm.entityId || null });
      setRequestForm(emptyRequest); setDrawer(null); await load(); showOk('Approval request created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create request'); }
  }

  async function createRule(e) {
    e.preventDefault();
    try {
      await api.post('/approvals/rules', { ...ruleForm, minAmount: Number(ruleForm.minAmount || 0), isActive: Boolean(ruleForm.isActive) });
      setRuleForm(emptyRule); setDrawer(null); await load(); showOk('Approval rule created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to save rule'); }
  }

  async function toggleRule(rule) {
    try { await api.put(`/approvals/rules/${rule.id}`, { isActive: !rule.isActive }); await load(); showOk(rule.isActive ? 'Rule disabled' : 'Rule enabled'); }
    catch (e) { setError(e.response?.data?.message || 'Failed to update rule'); }
  }

  async function decide(request, action) {
    const note = window.prompt(action === 'approve' ? 'Approval note' : 'Rejection note', '');
    if (note === null) return;
    try { await api.post(`/approvals/requests/${request.id}/${action}`, { note }); setSelectedRequest(null); await load(); showOk(`Request ${action}d`); }
    catch (e) { setError(e.response?.data?.message || `Failed to ${action}`); }
  }

  async function cancel(request) {
    const note = window.prompt('Cancel reason', 'Cancelled by user');
    if (note === null) return;
    try { await api.post(`/approvals/requests/${request.id}/cancel`, { note }); setSelectedRequest(null); await load(); showOk('Request cancelled'); }
    catch (e) { setError(e.response?.data?.message || 'Failed to cancel'); }
  }

  const requestColumns = [
    { key: 'requestNo', label: 'No', render: (r) => <><strong>{r.requestNo}</strong><span className="table-subtext">{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : '-'}</span></> },
    { key: 'type', label: 'Type', render: (r) => nice(r.type) },
    { key: 'title', label: 'Title', render: (r) => <div><strong>{r.title}</strong><small className="table-subtext">{r.description || r.entityType || '-'}</small></div> },
    { key: 'amount', label: 'Amount', render: (r) => fmtMoney(r.amount) },
    { key: 'priority', label: 'Priority', render: (r) => <span className={badgeClass(r.priority)}>{r.priority}</span> },
    { key: 'status', label: 'Status', render: (r) => <span className={badgeClass(r.status)}>{r.status}</span> },
    { key: 'requestedBy', label: 'Requested By', render: (r) => r.requestedBy?.name || '-' }
  ];

  const ruleColumns = [
    { key: 'name', label: 'Rule' },
    { key: 'type', label: 'Type', render: (r) => nice(r.type) },
    { key: 'minAmount', label: 'Threshold', render: (r) => fmtMoney(r.minAmount) },
    { key: 'approverRoles', label: 'Approvers' },
    { key: 'isActive', label: 'Status', render: (r) => <span className={r.isActive ? 'badge posted' : 'badge cancelled'}>{r.isActive ? 'ACTIVE' : 'OFF'}</span> },
    { key: 'actions', label: 'Action', render: (r) => <button className="secondary-btn" onClick={() => toggleRule(r)}>{r.isActive ? 'Disable' : 'Enable'}</button> }
  ];

  return (
    <div className="page approvals-page stage9-page">
      <div className="page-head approval-hero stage9-hero">
        <div>
          <span className="eyebrow">Approval control</span>
          <h1>Approval Workflow</h1>
          <p>Click an approval request row to review it. Approve, reject and cancel actions are now inside the detail modal.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={load}><RefreshCw size={16} /> Refresh</button>
          <button className="primary-btn" onClick={() => setDrawer('request')}><Plus size={16} /> New Request</button>
          <button className="secondary-btn" onClick={() => setDrawer('rule')}><ShieldCheck size={16} /> New Rule</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {message && <div className="success-box">{message}</div>}

      <section className="stat-grid">
        <div className="stat-card"><span>Pending</span><strong>{summary?.pending || 0}</strong><small>Waiting for manager decision</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>Urgent / High</span><strong>{summary?.urgent || 0}</strong><small>Needs fast attention</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Approved</span><strong>{summary?.approved || 0}</strong><small>Completed approvals</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Pending Value</span><strong>{fmtMoney(pendingValue)}</strong><small>Filtered request amount</small><div className="stat-orb" /></div>
      </section>

      <div className="tab-actions stage9-tabs"><button className={`tab-btn ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Requests</button><button className={`tab-btn ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>Rules</button></div>

      {tab === 'requests' && <section className="panel stage9-register-panel">
        <div className="ledger-toolbar approval-toolbar"><div><h2>Approval Requests</h2><p>Click any row to view details and take actions.</p></div><div className="approval-filter-row"><label>Status<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}><option value="ALL">All</option><option value="PENDING">Pending</option><option value="APPROVED">Approved</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option></select></label><label>Type<select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}><option value="ALL">All</option>{types.map((t) => <option key={t} value={t}>{nice(t)}</option>)}</select></label><label className="check-label compact-check"><input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Mine</label></div></div>
        <DataTable columns={requestColumns} rows={requests} empty="No approval requests found" onRowClick={setSelectedRequest} paginationLabel="requests" />
      </section>}

      {tab === 'rules' && <section className="panel stage9-register-panel"><div className="section-title-row"><div><h2>Approval Rules</h2><p>Rules decide who should approve sensitive business actions.</p></div></div><DataTable columns={ruleColumns} rows={rules} empty="No approval rules yet" paginationLabel="rules" /></section>}

      <ModalDrawer open={Boolean(selectedRequest)} onClose={() => setSelectedRequest(null)} title={selectedRequest ? selectedRequest.requestNo : 'Approval Request'} eyebrow="Approval detail" description="Review the request before taking action." mode="modal" size="lg">
        {selectedRequest && <div className="detail-modal-content"><div className="detail-grid"><div><span>Title</span><strong>{selectedRequest.title}</strong></div><div><span>Type</span><strong>{nice(selectedRequest.type)}</strong></div><div><span>Amount</span><strong>{fmtMoney(selectedRequest.amount)}</strong></div><div><span>Priority</span><strong><span className={badgeClass(selectedRequest.priority)}>{selectedRequest.priority}</span></strong></div><div><span>Status</span><strong><span className={badgeClass(selectedRequest.status)}>{selectedRequest.status}</span></strong></div><div><span>Requested By</span><strong>{selectedRequest.requestedBy?.name || '-'}</strong></div></div><div className="modal-info-block"><strong>Description</strong><p>{selectedRequest.description || 'No description.'}</p></div>{selectedRequest.decisionNote && <div className="modal-info-block"><strong>Decision note</strong><p>{selectedRequest.decisionNote}</p></div>}<div className="modal-action-row">{selectedRequest.status === 'PENDING' && <><button className="primary-btn" onClick={() => decide(selectedRequest, 'approve')}>Approve</button><button className="danger-btn" onClick={() => decide(selectedRequest, 'reject')}>Reject</button><button className="secondary-btn" onClick={() => cancel(selectedRequest)}>Cancel</button></>}</div></div>}
      </ModalDrawer>

      <ModalDrawer open={drawer === 'request'} onClose={() => setDrawer(null)} title="Create Approval Request" eyebrow="New request" description="Create requests from a drawer so the request table stays full width.">
        <form className="form-grid compact" onSubmit={createRequest}><label>Request type<select value={requestForm.type} onChange={(e) => setRequestForm({ ...requestForm, type: e.target.value })}>{types.map((t) => <option key={t} value={t}>{nice(t)}</option>)}</select></label><label>Title<input value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} required /></label><label>Amount<input type="number" min="0" value={requestForm.amount} onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })} /></label><label>Priority<select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}>{priorities.map((p) => <option key={p} value={p}>{p}</option>)}</select></label><label>Linked entity type<input value={requestForm.entityType} onChange={(e) => setRequestForm({ ...requestForm, entityType: e.target.value })} /></label><label>Linked entity ID<input value={requestForm.entityId} onChange={(e) => setRequestForm({ ...requestForm, entityId: e.target.value })} /></label><label className="span-two">Description<textarea value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} rows="4" /></label><button className="primary-btn span-two">Submit Request</button></form>
      </ModalDrawer>

      <ModalDrawer open={drawer === 'rule'} onClose={() => setDrawer(null)} title="Create Approval Rule" eyebrow="Approval rules" description="Create the rule without shrinking the rule list.">
        <form className="form-grid compact" onSubmit={createRule}><label>Rule name<input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} required /></label><label>Type<select value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })}><option value="GENERAL">GENERAL</option>{types.map((t) => <option key={t} value={t}>{nice(t)}</option>)}</select></label><label>Minimum amount<input type="number" min="0" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })} /></label><label>Approver roles<input value={ruleForm.approverRoles} onChange={(e) => setRuleForm({ ...ruleForm, approverRoles: e.target.value })} placeholder="OWNER,ADMIN" /></label><label className="check-label span-two"><input type="checkbox" checked={ruleForm.isActive} onChange={(e) => setRuleForm({ ...ruleForm, isActive: e.target.checked })} /> Active rule</label><button className="primary-btn span-two">Save Rule</button></form>
      </ModalDrawer>
    </div>
  );
}
