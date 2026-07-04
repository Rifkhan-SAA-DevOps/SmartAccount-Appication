import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

const types = [
  'EXPENSE',
  'PURCHASE_ORDER',
  'STOCK_TRANSFER',
  'DISCOUNT',
  'INVOICE_CANCEL',
  'INVOICE_DELETE',
  'STOCK_ADJUSTMENT',
  'SUPPLIER_PAYMENT',
  'CUSTOMER_CREDIT',
  'OTHER'
];

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

function fmtMoney(value) {
  return `LKR ${Number(value || 0).toLocaleString()}`;
}

export default function Approvals() {
  const [tab, setTab] = useState('requests');
  const [summary, setSummary] = useState(null);
  const [requests, setRequests] = useState([]);
  const [rules, setRules] = useState([]);
  const [filter, setFilter] = useState({ status: 'PENDING', type: 'ALL', mine: false });
  const [requestForm, setRequestForm] = useState(emptyRequest);
  const [ruleForm, setRuleForm] = useState(emptyRule);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const params = {
      status: filter.status,
      type: filter.type,
      ...(filter.mine ? { mine: 'true' } : {})
    };
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

  function showOk(text) {
    setMessage(text);
    setError('');
    setTimeout(() => setMessage(''), 2500);
  }

  const pendingValue = useMemo(() => requests.filter((r) => r.status === 'PENDING').reduce((sum, r) => sum + Number(r.amount || 0), 0), [requests]);

  async function createRequest(e) {
    e.preventDefault();
    try {
      await api.post('/approvals/requests', {
        ...requestForm,
        amount: Number(requestForm.amount || 0),
        entityType: requestForm.entityType || null,
        entityId: requestForm.entityId || null
      });
      setRequestForm(emptyRequest);
      await load();
      showOk('Approval request created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create request'); }
  }

  async function createRule(e) {
    e.preventDefault();
    try {
      await api.post('/approvals/rules', { ...ruleForm, minAmount: Number(ruleForm.minAmount || 0), isActive: Boolean(ruleForm.isActive) });
      setRuleForm(emptyRule);
      await load();
      showOk('Approval rule created');
    } catch (e) { setError(e.response?.data?.message || 'Failed to create rule'); }
  }

  async function toggleRule(rule) {
    try {
      await api.put(`/approvals/rules/${rule.id}`, { isActive: !rule.isActive });
      await load();
      showOk(rule.isActive ? 'Rule disabled' : 'Rule enabled');
    } catch (e) { setError(e.response?.data?.message || 'Failed to update rule'); }
  }

  async function decide(request, action) {
    const note = window.prompt(action === 'approve' ? 'Approval note' : 'Reject reason', action === 'approve' ? 'Approved' : 'Rejected');
    if (note === null) return;
    try {
      await api.post(`/approvals/requests/${request.id}/${action}`, { note });
      await load();
      showOk(action === 'approve' ? 'Request approved' : 'Request rejected');
    } catch (e) { setError(e.response?.data?.message || `Failed to ${action} request`); }
  }

  async function cancel(request) {
    if (!confirm(`Cancel ${request.requestNo}?`)) return;
    try {
      await api.post(`/approvals/requests/${request.id}/cancel`, {});
      await load();
      showOk('Request cancelled');
    } catch (e) { setError(e.response?.data?.message || 'Failed to cancel request'); }
  }

  return (
    <div className="page approvals-page">
      <div className="page-head">
        <div>
          <h1>Approval Workflow</h1>
          <p>Control expenses, purchase orders, stock changes, invoice cancellations and sensitive business actions.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${tab === 'requests' ? 'active' : ''}`} onClick={() => setTab('requests')}>Requests</button>
          <button className={`tab-btn ${tab === 'rules' ? 'active' : ''}`} onClick={() => setTab('rules')}>Rules</button>
          <button className={`tab-btn ${tab === 'new' ? 'active' : ''}`} onClick={() => setTab('new')}>New Request</button>
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

      {tab === 'requests' && (
        <section className="panel">
          <div className="ledger-toolbar approval-toolbar">
            <div>
              <h2>Approval Requests</h2>
              <p>Approve, reject, or cancel requests based on your role and active approval rules.</p>
            </div>
            <div className="approval-filter-row">
              <label>Status<select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })}>
                <option value="ALL">All</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
              </select></label>
              <label>Type<select value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value })}>
                <option value="ALL">All</option>
                {types.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
              </select></label>
              <label className="check-label compact-check"><input type="checkbox" checked={filter.mine} onChange={(e) => setFilter({ ...filter, mine: e.target.checked })} /> Mine</label>
            </div>
          </div>
          <DataTable columns={[
            { key: 'requestNo', label: 'No' },
            { key: 'type', label: 'Type', render: (r) => r.type.replaceAll('_', ' ') },
            { key: 'title', label: 'Title', render: (r) => <div><strong>{r.title}</strong><small className="table-subtext">{r.description || r.entityType || '-'}</small></div> },
            { key: 'amount', label: 'Amount', render: (r) => fmtMoney(r.amount) },
            { key: 'priority', label: 'Priority', render: (r) => <span className={badgeClass(r.priority)}>{r.priority}</span> },
            { key: 'status', label: 'Status', render: (r) => <span className={badgeClass(r.status)}>{r.status}</span> },
            { key: 'requestedBy', label: 'Requested By', render: (r) => r.requestedBy?.name || '-' },
            { key: 'decidedBy', label: 'Decision', render: (r) => r.decidedBy ? <span>{r.decidedBy.name}<small className="table-subtext">{r.decisionNote}</small></span> : '-' },
            { key: 'actions', label: 'Actions', render: (r) => r.status === 'PENDING' ? <div className="actions-row compact-actions">
              <button className="secondary-btn" onClick={() => decide(r, 'approve')}>Approve</button>
              <button className="mini-danger" onClick={() => decide(r, 'reject')}>Reject</button>
              <button className="ghost-btn" onClick={() => cancel(r)}>Cancel</button>
            </div> : '-' }
          ]} rows={requests} empty="No approval requests found" />
        </section>
      )}

      {tab === 'rules' && (
        <div className="two-col-page">
          <section className="panel">
            <h2>Approval Rules</h2>
            <DataTable columns={[
              { key: 'name', label: 'Rule' },
              { key: 'type', label: 'Type', render: (r) => r.type.replaceAll('_', ' ') },
              { key: 'minAmount', label: 'Threshold', render: (r) => fmtMoney(r.minAmount) },
              { key: 'approverRoles', label: 'Approvers' },
              { key: 'isActive', label: 'Status', render: (r) => <span className={r.isActive ? 'badge posted' : 'badge cancelled'}>{r.isActive ? 'ACTIVE' : 'OFF'}</span> },
              { key: 'actions', label: 'Action', render: (r) => <button className="secondary-btn" onClick={() => toggleRule(r)}>{r.isActive ? 'Disable' : 'Enable'}</button> }
            ]} rows={rules} />
          </section>
          <section className="panel">
            <h2>Create Rule</h2>
            <form className="form-grid" onSubmit={createRule}>
              <label>Rule name<input value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} required placeholder="Expense above 10,000" /></label>
              <label>Type<select value={ruleForm.type} onChange={(e) => setRuleForm({ ...ruleForm, type: e.target.value })}>
                <option value="GENERAL">GENERAL</option>
                {types.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
              </select></label>
              <label>Minimum amount<input type="number" min="0" value={ruleForm.minAmount} onChange={(e) => setRuleForm({ ...ruleForm, minAmount: e.target.value })} /></label>
              <label>Approver roles<input value={ruleForm.approverRoles} onChange={(e) => setRuleForm({ ...ruleForm, approverRoles: e.target.value })} placeholder="OWNER,ADMIN" /></label>
              <label className="check-label"><input type="checkbox" checked={ruleForm.isActive} onChange={(e) => setRuleForm({ ...ruleForm, isActive: e.target.checked })} /> Active rule</label>
              <button className="primary-btn">Save Rule</button>
            </form>
            <div className="upload-note">Use comma-separated roles, for example: OWNER,ADMIN,ACCOUNTANT.</div>
          </section>
        </div>
      )}

      {tab === 'new' && (
        <div className="two-col-page">
          <section className="panel approval-help-panel">
            <h2>How this works</h2>
            <div className="approval-steps">
              <div><strong>1</strong><span>User requests approval</span><small>Example: expense, discount, stock adjustment or invoice cancellation.</small></div>
              <div><strong>2</strong><span>Manager decides</span><small>Approver roles are controlled from the rules page.</small></div>
              <div><strong>3</strong><span>Audit trail is saved</span><small>Every approval, rejection and cancellation is recorded.</small></div>
            </div>
          </section>
          <section className="panel">
            <h2>Create Approval Request</h2>
            <form className="form-grid" onSubmit={createRequest}>
              <label>Request type<select value={requestForm.type} onChange={(e) => setRequestForm({ ...requestForm, type: e.target.value })}>
                {types.map((t) => <option key={t} value={t}>{t.replaceAll('_', ' ')}</option>)}
              </select></label>
              <label>Title<input value={requestForm.title} onChange={(e) => setRequestForm({ ...requestForm, title: e.target.value })} required placeholder="Need approval for transport expense" /></label>
              <label>Amount<input type="number" min="0" value={requestForm.amount} onChange={(e) => setRequestForm({ ...requestForm, amount: e.target.value })} /></label>
              <label>Priority<select value={requestForm.priority} onChange={(e) => setRequestForm({ ...requestForm, priority: e.target.value })}>
                {priorities.map((p) => <option key={p} value={p}>{p}</option>)}
              </select></label>
              <label>Linked entity type<input value={requestForm.entityType} onChange={(e) => setRequestForm({ ...requestForm, entityType: e.target.value })} placeholder="Invoice / Expense / StockTransfer" /></label>
              <label>Linked entity ID<input value={requestForm.entityId} onChange={(e) => setRequestForm({ ...requestForm, entityId: e.target.value })} placeholder="Optional" /></label>
              <label>Description<textarea value={requestForm.description} onChange={(e) => setRequestForm({ ...requestForm, description: e.target.value })} rows="4" placeholder="Explain why this needs approval" /></label>
              <button className="primary-btn">Submit Request</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
