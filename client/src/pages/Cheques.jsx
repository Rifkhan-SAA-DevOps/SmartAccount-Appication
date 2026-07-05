import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BellRing, CheckCircle2, CircleDollarSign, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';

const initialForm = {
  partyType: 'CUSTOMER',
  direction: 'IN',
  customerId: '',
  supplierId: '',
  bankAccountId: '',
  chequeNo: '',
  bankName: '',
  branchName: '',
  accountName: '',
  amount: '',
  issueDate: '',
  dueDate: '',
  receivedDate: '',
  reference: '',
  notes: ''
};

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function isActionable(status) {
  return !['CLEARED', 'BOUNCED', 'CANCELLED'].includes(status);
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'cleared') return 'paid';
  if (s === 'bounced' || s === 'cancelled') return 'cancelled';
  if (s === 'deposited') return 'partial';
  return 'unpaid';
}

export default function Cheques() {
  const [summary, setSummary] = useState(null);
  const [cheques, setCheques] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ status: '', direction: '', partyType: '', due: '', q: '' });
  const [actionBankAccountId, setActionBankAccountId] = useState('');
  const [form, setForm] = useState(initialForm);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedCheque, setSelectedCheque] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activePartyList = useMemo(() => form.partyType === 'CUSTOMER' ? customers : suppliers, [form.partyType, customers, suppliers]);

  async function loadAll() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [summaryRes, chequesRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
      api.get('/cheques/summary'),
      api.get('/cheques', { params }),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/cashbank/accounts')
    ]);
    setSummary(summaryRes.data);
    setCheques(chequesRes.data || []);
    setCustomers(customersRes.data || []);
    setSuppliers(suppliersRes.data || []);
    setAccounts(accountsRes.data || []);
    if (!actionBankAccountId && accountsRes.data?.[0]) setActionBankAccountId(accountsRes.data[0].id);
  }

  useEffect(() => { loadAll().catch((e) => setError(e.response?.data?.message || 'Failed to load cheque data')); }, []);

  function showSuccess(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function updateFilter(key, value) { setFilters((old) => ({ ...old, [key]: value })); }

  function updateForm(key, value) {
    setForm((old) => {
      const next = { ...old, [key]: value };
      if (key === 'partyType') {
        next.customerId = '';
        next.supplierId = '';
        next.direction = value === 'CUSTOMER' ? 'IN' : 'OUT';
      }
      return next;
    });
  }

  async function applyFilters() {
    setError('');
    try { await loadAll(); } catch (e) { setError(e.response?.data?.message || 'Failed to apply filters'); }
  }

  async function submitCheque(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/cheques', {
        ...form,
        customerId: form.partyType === 'CUSTOMER' ? form.customerId : null,
        supplierId: form.partyType === 'SUPPLIER' ? form.supplierId : null,
        bankAccountId: form.bankAccountId || null,
        amount: Number(form.amount),
        issueDate: form.issueDate || null,
        dueDate: form.dueDate,
        receivedDate: form.receivedDate || undefined
      });
      setForm(initialForm);
      setCreateOpen(false);
      showSuccess('Cheque registered successfully');
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to register cheque'); }
  }

  async function changeStatus(cheque, status) {
    setError('');
    const needsAccount = status === 'CLEARED' || status === 'DEPOSITED';
    const bankAccountId = cheque.bankAccountId || actionBankAccountId || '';
    if (needsAccount && !bankAccountId) return setError('Select an action bank account before depositing/clearing a cheque.');

    let notes = '';
    if (status === 'BOUNCED') notes = window.prompt('Reason for bounced cheque?', 'Insufficient funds') || 'Cheque bounced';
    if (status === 'CANCELLED') notes = window.prompt('Reason for cancelling cheque?', 'Cancelled by user') || 'Cheque cancelled';
    if (status === 'CLEARED') notes = `Cheque ${cheque.chequeNo} cleared`;
    if (status === 'DEPOSITED') notes = `Cheque ${cheque.chequeNo} deposited`;

    try {
      await api.patch(`/cheques/${cheque.id}/status`, { status, bankAccountId, notes });
      showSuccess(`Cheque marked as ${status.toLowerCase()}`);
      setSelectedCheque(null);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || `Failed to mark cheque as ${status.toLowerCase()}`); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/cheques/due-alerts');
      showSuccess(`${data.created} cheque notification(s) created from ${data.totalDue} due cheque(s)`);
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate cheque alerts'); }
  }

  const columns = [
    { key: 'dueDate', label: 'Due Date', render: (r) => shortDate(r.dueDate) },
    { key: 'chequeNo', label: 'Cheque No', render: (r) => <><strong>{r.chequeNo}</strong><span className="table-subtext">{r.bankName || '-'} {r.branchName ? `• ${r.branchName}` : ''}</span></> },
    { key: 'partyName', label: 'Party', render: (r) => <>{r.partyName}<span className="table-subtext">{r.partyType} • {r.direction === 'IN' ? 'Receive' : 'Pay'}</span></> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'bankAccountName', label: 'Account', render: (r) => r.bankAccountName || '-' },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  return (
    <div className="page stage6-list-page cheques-page">
      <div className="stage6-hero">
        <div>
          <h1>Cheque Management</h1>
          <p>The cheque register is now the main view. Registering a new cheque opens in a drawer, and cheque status actions are inside the row detail modal.</p>
        </div>
        <div className="stage6-actions">
          <button className="secondary-btn" onClick={applyFilters}><RefreshCw size={18} /> Refresh</button>
          <button className="secondary-btn" onClick={generateAlerts}><BellRing size={18} /> Due Alerts</button>
          <button className="primary-btn" onClick={() => setCreateOpen(true)}><Plus size={18} /> Register New Cheque</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stage6-kpi-grid">
        <div className="stage6-kpi-card"><span>Pending Cheques</span><strong>{summary?.pendingCount || 0}</strong><small>{money(summary?.pendingAmount)}</small></div>
        <div className="stage6-kpi-card"><span>Deposited</span><strong>{summary?.depositedCount || 0}</strong><small>{money(summary?.depositedAmount)}</small></div>
        <div className="stage6-kpi-card"><span>Cleared</span><strong>{summary?.clearedCount || 0}</strong><small>{money(summary?.clearedAmount)}</small></div>
        <div className="stage6-kpi-card"><span>Due Attention</span><strong>{(summary?.dueToday || 0) + (summary?.overdue || 0)}</strong><small>{summary?.overdue || 0} overdue • {summary?.upcoming || 0} upcoming</small></div>
      </div>

      <section className="panel">
        <div className="form-grid cheque-filter-grid">
          <label>Status<select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}><option value="">All</option><option value="PENDING">Pending</option><option value="DEPOSITED">Deposited</option><option value="CLEARED">Cleared</option><option value="BOUNCED">Bounced</option><option value="CANCELLED">Cancelled</option></select></label>
          <label>Direction<select value={filters.direction} onChange={(e) => updateFilter('direction', e.target.value)}><option value="">All</option><option value="IN">Incoming</option><option value="OUT">Outgoing</option></select></label>
          <label>Due Filter<select value={filters.due} onChange={(e) => updateFilter('due', e.target.value)}><option value="">All dates</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="upcoming">Next 7 days</option></select></label>
          <label>Search<input value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} placeholder="Cheque no, bank, party..." /></label>
          <label>Action Bank Account<select value={actionBankAccountId} onChange={(e) => setActionBankAccountId(e.target.value)}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.currentBalance)}</option>)}</select></label>
          <button className="primary-btn filter-apply" onClick={applyFilters}>Apply Filter</button>
        </div>
      </section>

      <section className="panel stage6-table-panel">
        <div className="section-title-row"><div><h2>Cheque Register</h2><p>{cheques.length} cheque(s) found. Click a row to view details and perform actions.</p></div></div>
        <DataTable columns={columns} rows={cheques} pageSize={10} onRowClick={setSelectedCheque} empty="No cheques found" />
      </section>

      <div className="report-grid two cheque-bottom-grid">
        <section className="panel"><h2><AlertTriangle size={20} /> Due Soon</h2>{(summary?.dueSoon || []).length === 0 ? <p>No due cheques for the next 7 days.</p> : (summary?.dueSoon || []).map((c) => <div className="cheque-mini-row" key={c.id}><span>{shortDate(c.dueDate)}</span><strong>{c.chequeNo}</strong><b>{money(c.amount)}</b><small>{c.partyName}</small></div>)}</section>
        <section className="panel"><h2><CheckCircle2 size={20} /> Outgoing PDC Watch</h2>{(summary?.outgoingDue || []).length === 0 ? <p>No outgoing pending cheques.</p> : (summary?.outgoingDue || []).map((c) => <div className="cheque-mini-row" key={c.id}><span>{shortDate(c.dueDate)}</span><strong>{c.chequeNo}</strong><b>{money(c.amount)}</b><small>{c.partyName}</small></div>)}</section>
      </div>

      <ModalDrawer open={createOpen} title="Register New Cheque" description="Save incoming customer cheques or outgoing supplier post-dated cheques without shrinking the register table." onClose={() => setCreateOpen(false)} size="lg">
        <form className="form-grid" onSubmit={submitCheque}>
          <div className="form-grid two"><label>Party Type<select value={form.partyType} onChange={(e) => updateForm('partyType', e.target.value)}><option value="CUSTOMER">Customer</option><option value="SUPPLIER">Supplier</option></select></label><label>Direction<select value={form.direction} onChange={(e) => updateForm('direction', e.target.value)}><option value="IN">Incoming / Receive</option><option value="OUT">Outgoing / Pay</option></select></label></div>
          <label>{form.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'}<select value={form.partyType === 'CUSTOMER' ? form.customerId : form.supplierId} onChange={(e) => updateForm(form.partyType === 'CUSTOMER' ? 'customerId' : 'supplierId', e.target.value)} required><option value="">Select {form.partyType.toLowerCase()}</option>{activePartyList.map((party) => <option key={party.id} value={party.id}>{party.name} — Balance {money(party.balance)}</option>)}</select></label>
          <div className="form-grid two"><label>Cheque Number<input value={form.chequeNo} onChange={(e) => updateForm('chequeNo', e.target.value)} required /></label><label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => updateForm('amount', e.target.value)} required /></label></div>
          <div className="form-grid two"><label>Issue Date<input type="date" value={form.issueDate} onChange={(e) => updateForm('issueDate', e.target.value)} /></label><label>Due Date<input type="date" value={form.dueDate} onChange={(e) => updateForm('dueDate', e.target.value)} required /></label></div>
          <label>Cash/Bank Account<select value={form.bankAccountId} onChange={(e) => updateForm('bankAccountId', e.target.value)} required={form.direction === 'OUT'}><option value="">{form.direction === 'OUT' ? 'Select issuing account' : 'Select deposit account later or now'}</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.currentBalance)}</option>)}</select></label>
          <div className="form-grid two"><label>Cheque Bank<input value={form.bankName} onChange={(e) => updateForm('bankName', e.target.value)} placeholder="Bank name" /></label><label>Branch<input value={form.branchName} onChange={(e) => updateForm('branchName', e.target.value)} placeholder="Branch" /></label></div>
          <label>Account Name<input value={form.accountName} onChange={(e) => updateForm('accountName', e.target.value)} placeholder="Name printed on cheque" /></label>
          <label>Reference<input value={form.reference} onChange={(e) => updateForm('reference', e.target.value)} placeholder="Invoice/GRN/reference" /></label>
          <label>Notes<input value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Optional note" /></label>
          <div className="stage6-form-actions"><button type="button" className="secondary-btn" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-btn" type="submit"><CircleDollarSign size={18} /> Save Cheque</button></div>
        </form>
      </ModalDrawer>

      <ModalDrawer open={!!selectedCheque} mode="modal" size="lg" title="Cheque Details" description="Actions are kept here so the register table stays clean and responsive." onClose={() => setSelectedCheque(null)}>
        {selectedCheque && <>
          <div className="stage6-detail-grid">
            <div className="stage6-detail-item"><span>Cheque No</span><strong>{selectedCheque.chequeNo}</strong></div>
            <div className="stage6-detail-item"><span>Status</span><strong>{selectedCheque.status}</strong></div>
            <div className="stage6-detail-item"><span>Party</span><strong>{selectedCheque.partyName}</strong></div>
            <div className="stage6-detail-item"><span>Amount</span><strong>{money(selectedCheque.amount)}</strong></div>
            <div className="stage6-detail-item"><span>Due Date</span><strong>{shortDate(selectedCheque.dueDate)}</strong></div>
            <div className="stage6-detail-item"><span>Bank</span><strong>{selectedCheque.bankName || '-'}</strong></div>
          </div>
          <div className="stage6-form-actions">
            {isActionable(selectedCheque.status) ? <>
              {selectedCheque.status === 'PENDING' && <button className="secondary-btn" onClick={() => changeStatus(selectedCheque, 'DEPOSITED')}>Deposit</button>}
              <button className="primary-btn" onClick={() => changeStatus(selectedCheque, 'CLEARED')}>Clear</button>
              <button className="secondary-btn" onClick={() => changeStatus(selectedCheque, 'BOUNCED')}>Bounce</button>
              <button className="danger-btn" onClick={() => changeStatus(selectedCheque, 'CANCELLED')}>Cancel</button>
            </> : <span className="muted">This cheque is completed.</span>}
          </div>
        </>}
      </ModalDrawer>
    </div>
  );
}
