import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Ban,
  BellRing,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Eye,
  Landmark,
  RefreshCw,
  UploadCloud,
  X
} from 'lucide-react';
import { api } from '../api/http.js';
import Pagination, { useClientPagination } from '../components/ui/Pagination.jsx';

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
  return `LKR ${Number(value || 0).toFixed(2)}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function isActionable(status) {
  return !['CLEARED', 'BOUNCED', 'CANCELLED'].includes(String(status || '').toUpperCase());
}

function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'cleared') return 'paid';
  if (s === 'bounced' || s === 'cancelled') return 'cancelled';
  if (s === 'deposited') return 'partial';
  return 'unpaid';
}

function directionLabel(direction) {
  return direction === 'OUT' ? 'Outgoing / Pay' : 'Incoming / Receive';
}

function ModalField({ label, value }) {
  return (
    <div className="cheque-detail-field">
      <span>{label}</span>
      <strong>{value || '-'}</strong>
    </div>
  );
}

function ChequeStatusActions({ cheque, accounts, actionBankAccountId, setActionBankAccountId, onChangeStatus }) {
  if (!cheque) return null;

  if (!isActionable(cheque.status)) {
    return (
      <div className="cheque-modal-completed">
        <CheckCircle2 size={18} />
        This cheque is already completed. No further action is needed.
      </div>
    );
  }

  return (
    <div className="cheque-modal-actions-box">
      <div className="cheque-action-account">
        <label>Action Bank Account</label>
        <select value={actionBankAccountId} onChange={(e) => setActionBankAccountId(e.target.value)}>
          <option value="">Select account for deposit / clearing</option>
          {accounts.map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} — {money(account.currentBalance)}
            </option>
          ))}
        </select>
        <small>Needed when depositing or clearing a cheque.</small>
      </div>

      <div className="cheque-modal-action-buttons">
        {cheque.status === 'PENDING' && (
          <button type="button" className="cheque-action-btn deposit" onClick={() => onChangeStatus(cheque, 'DEPOSITED')}>
            <UploadCloud size={17} /> Deposit
          </button>
        )}
        <button type="button" className="cheque-action-btn clear" onClick={() => onChangeStatus(cheque, 'CLEARED')}>
          <BadgeCheck size={17} /> Clear
        </button>
        <button type="button" className="cheque-action-btn bounce" onClick={() => onChangeStatus(cheque, 'BOUNCED')}>
          <AlertTriangle size={17} /> Bounce
        </button>
        <button type="button" className="cheque-action-btn cancel" onClick={() => onChangeStatus(cheque, 'CANCELLED')}>
          <Ban size={17} /> Cancel
        </button>
      </div>
    </div>
  );
}

function ChequeDetailsModal({ cheque, accounts, actionBankAccountId, setActionBankAccountId, onClose, onChangeStatus }) {
  if (!cheque) return null;

  return (
    <div className="cheque-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div className="cheque-modal-card" role="dialog" aria-modal="true" aria-label="Cheque details" onMouseDown={(event) => event.stopPropagation()}>
        <div className="cheque-modal-head">
          <div>
            <span className="cheque-modal-kicker">Cheque Details</span>
            <h2>{cheque.chequeNo || 'Cheque'}</h2>
            <p>{cheque.partyName || '-'} • {directionLabel(cheque.direction)}</p>
          </div>
          <button type="button" className="cheque-modal-close" onClick={onClose} aria-label="Close cheque details">
            <X size={19} />
          </button>
        </div>

        <div className="cheque-modal-summary">
          <div>
            <span>Amount</span>
            <strong>{money(cheque.amount)}</strong>
          </div>
          <div>
            <span>Due Date</span>
            <strong>{shortDate(cheque.dueDate)}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong><span className={`badge ${statusClass(cheque.status)}`}>{cheque.status || 'PENDING'}</span></strong>
          </div>
        </div>

        <div className="cheque-detail-grid">
          <ModalField label="Party Type" value={cheque.partyType} />
          <ModalField label="Direction" value={directionLabel(cheque.direction)} />
          <ModalField label="Bank" value={cheque.bankName} />
          <ModalField label="Branch" value={cheque.branchName} />
          <ModalField label="Cheque Account Name" value={cheque.accountName} />
          <ModalField label="Cash / Bank Account" value={cheque.bankAccountName} />
          <ModalField label="Issue Date" value={shortDate(cheque.issueDate)} />
          <ModalField label="Received Date" value={shortDate(cheque.receivedDate)} />
          <ModalField label="Reference" value={cheque.reference} />
          <ModalField label="Notes" value={cheque.notes} />
        </div>

        <ChequeStatusActions
          cheque={cheque}
          accounts={accounts}
          actionBankAccountId={actionBankAccountId}
          setActionBankAccountId={setActionBankAccountId}
          onChangeStatus={onChangeStatus}
        />
      </div>
    </div>
  );
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
  const [selectedCheque, setSelectedCheque] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const activePartyList = useMemo(
    () => (form.partyType === 'CUSTOMER' ? customers : suppliers),
    [form.partyType, customers, suppliers]
  );

  const filterKey = useMemo(() => JSON.stringify(filters), [filters]);
  const chequePager = useClientPagination(cheques, {
    initialPageSize: 10,
    resetKey: filterKey
  });

  async function loadAll() {
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [summaryRes, chequesRes, customersRes, suppliersRes, accountsRes] = await Promise.all([
      api.get('/cheques/summary'),
      api.get('/cheques', { params }),
      api.get('/customers'),
      api.get('/suppliers'),
      api.get('/cashbank/accounts')
    ]);

    const chequeRows = Array.isArray(chequesRes.data) ? chequesRes.data : [];
    const accountRows = Array.isArray(accountsRes.data) ? accountsRes.data : [];

    setSummary(summaryRes.data || null);
    setCheques(chequeRows);
    setCustomers(Array.isArray(customersRes.data) ? customersRes.data : []);
    setSuppliers(Array.isArray(suppliersRes.data) ? suppliersRes.data : []);
    setAccounts(accountRows);

    if (!actionBankAccountId && accountRows[0]) setActionBankAccountId(accountRows[0].id);
  }

  useEffect(() => {
    loadAll().catch((e) => setError(e.response?.data?.message || 'Failed to load cheque data'));
  }, []);

  useEffect(() => {
    function closeOnEscape(event) {
      if (event.key === 'Escape') setSelectedCheque(null);
    }

    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  function showSuccess(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function updateFilter(key, value) {
    setFilters((old) => ({ ...old, [key]: value }));
  }

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
    try {
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to apply filters');
    }
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
      showSuccess('Cheque registered successfully');
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to register cheque');
    }
  }

  async function changeStatus(cheque, status) {
    setError('');
    const needsAccount = status === 'CLEARED' || status === 'DEPOSITED';
    const bankAccountId = cheque.bankAccountId || actionBankAccountId || '';
    if (needsAccount && !bankAccountId) {
      setError('Select an action bank account before depositing/clearing a cheque.');
      return;
    }

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
    } catch (e) {
      setError(e.response?.data?.message || `Failed to mark cheque as ${status.toLowerCase()}`);
    }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/cheques/due-alerts');
      showSuccess(`${data.created} cheque notification(s) created from ${data.totalDue} due cheque(s)`);
      await loadAll();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to generate cheque alerts');
    }
  }

  return (
    <div className="page cheques-page">
      <div className="page-head cheques-hero">
        <div>
          <span className="page-kicker">Finance Control</span>
          <h1>Cheque Management</h1>
          <p>Track received cheques, post-dated supplier cheques, reminders, bounced cheques, and clearing into cash/bank book.</p>
        </div>
        <div className="head-actions cheques-head-actions">
          <button className="secondary-btn" type="button" onClick={applyFilters}><RefreshCw size={18} /> Refresh</button>
          <button className="primary-btn" type="button" onClick={generateAlerts}><BellRing size={18} /> Due Alerts</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid cheque-stat-grid">
        <div className="stat-card cheque-stat-card"><span>Pending Cheques</span><strong>{summary?.pendingCount || 0}</strong><small>{money(summary?.pendingAmount)}</small><div className="stat-orb" /></div>
        <div className="stat-card cheque-stat-card tone-blue"><span>Deposited</span><strong>{summary?.depositedCount || 0}</strong><small>{money(summary?.depositedAmount)}</small><div className="stat-orb" /></div>
        <div className="stat-card cheque-stat-card tone-green"><span>Cleared</span><strong>{summary?.clearedCount || 0}</strong><small>{money(summary?.clearedAmount)}</small><div className="stat-orb" /></div>
        <div className="stat-card cheque-stat-card tone-orange"><span>Due Attention</span><strong>{(summary?.dueToday || 0) + (summary?.overdue || 0)}</strong><small>{summary?.overdue || 0} overdue • {summary?.upcoming || 0} upcoming</small><div className="stat-orb" /></div>
      </div>

      <section className="panel cheque-filter-panel">
        <div className="cheque-section-title">
          <div>
            <h2>Find Cheques</h2>
            <p>Filter by status, direction, date risk, or search by cheque number, bank, or party name.</p>
          </div>
        </div>
        <div className="form-grid cheque-filter-grid">
          <label>Status
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)}>
              <option value="">All</option>
              <option value="PENDING">Pending</option>
              <option value="DEPOSITED">Deposited</option>
              <option value="CLEARED">Cleared</option>
              <option value="BOUNCED">Bounced</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>Direction
            <select value={filters.direction} onChange={(e) => updateFilter('direction', e.target.value)}>
              <option value="">All</option>
              <option value="IN">Incoming</option>
              <option value="OUT">Outgoing</option>
            </select>
          </label>
          <label>Due Filter
            <select value={filters.due} onChange={(e) => updateFilter('due', e.target.value)}>
              <option value="">All dates</option>
              <option value="overdue">Overdue</option>
              <option value="today">Due today</option>
              <option value="upcoming">Next 7 days</option>
            </select>
          </label>
          <label>Search
            <input value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} placeholder="Cheque no, bank, party..." />
          </label>
          <label>Action Bank Account
            <select value={actionBankAccountId} onChange={(e) => setActionBankAccountId(e.target.value)}>
              <option value="">Select account</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.currentBalance)}</option>)}
            </select>
          </label>
          <button className="primary-btn filter-apply" type="button" onClick={applyFilters}>Apply Filter</button>
        </div>
      </section>

      <div className="cheque-workspace">
        <section className="panel cheque-register-panel">
          <div className="ledger-toolbar cheque-register-toolbar">
            <div>
              <h2>Cheque Register</h2>
              <p>
                Showing {chequePager.start}–{chequePager.end} of {chequePager.totalItems} cheque(s). Click any row to open details and action buttons.
              </p>
            </div>
          </div>

          <div className="cheque-table-card">
            <div className="cheque-table-scroll">
              <table className="cheque-register-table">
                <thead>
                  <tr>
                    <th>Due Date</th>
                    <th>Cheque No</th>
                    <th>Party</th>
                    <th>Direction</th>
                    <th>Amount</th>
                    <th>Account</th>
                    <th>Status</th>
                    <th>View</th>
                  </tr>
                </thead>
                <tbody>
                  {chequePager.pageItems.length ? chequePager.pageItems.map((cheque) => (
                    <tr
                      key={cheque.id}
                      className="cheque-click-row"
                      tabIndex={0}
                      role="button"
                      onClick={() => setSelectedCheque(cheque)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedCheque(cheque);
                        }
                      }}
                    >
                      <td data-label="Due Date"><span className="cheque-date"><CalendarDays size={15} />{shortDate(cheque.dueDate)}</span></td>
                      <td data-label="Cheque No"><strong>{cheque.chequeNo}</strong><span className="table-subtext">{cheque.bankName || '-'} {cheque.branchName ? `• ${cheque.branchName}` : ''}</span></td>
                      <td data-label="Party"><strong>{cheque.partyName || '-'}</strong><span className="table-subtext">{cheque.partyType || '-'}</span></td>
                      <td data-label="Direction"><span className={`cheque-direction-pill ${cheque.direction === 'OUT' ? 'out' : 'in'}`}>{cheque.direction === 'OUT' ? 'Outgoing' : 'Incoming'}</span></td>
                      <td data-label="Amount"><strong>{money(cheque.amount)}</strong></td>
                      <td data-label="Account"><span className="cheque-account"><Landmark size={15} />{cheque.bankAccountName || '-'}</span></td>
                      <td data-label="Status"><span className={`badge ${statusClass(cheque.status)}`}>{cheque.status}</span></td>
                      <td data-label="View"><button type="button" className="cheque-view-btn" onClick={(event) => { event.stopPropagation(); setSelectedCheque(cheque); }}><Eye size={16} /> View</button></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="8" className="cheque-empty-cell">No cheques found. Try changing filters or register a new cheque.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={chequePager.page}
              setPage={chequePager.setPage}
              pageSize={chequePager.pageSize}
              setPageSize={chequePager.setPageSize}
              totalPages={chequePager.totalPages}
              totalItems={chequePager.totalItems}
              start={chequePager.start}
              end={chequePager.end}
              label="cheques"
              pageSizeOptions={[5, 10, 20, 50]}
            />
          </div>
        </section>

        <section className="panel cheque-form-panel">
          <h2>Register New Cheque</h2>
          <p className="cheque-form-note">Use this form only to add a new cheque. Status actions are handled from the register modal.</p>
          <form className="form-grid cheque-create-form" onSubmit={submitCheque}>
            <div className="form-grid two cheque-form-two">
              <label>Party Type
                <select value={form.partyType} onChange={(e) => updateForm('partyType', e.target.value)}>
                  <option value="CUSTOMER">Customer</option>
                  <option value="SUPPLIER">Supplier</option>
                </select>
              </label>
              <label>Direction
                <select value={form.direction} onChange={(e) => updateForm('direction', e.target.value)}>
                  <option value="IN">Incoming / Receive</option>
                  <option value="OUT">Outgoing / Pay</option>
                </select>
              </label>
            </div>

            <label>{form.partyType === 'CUSTOMER' ? 'Customer' : 'Supplier'}
              <select value={form.partyType === 'CUSTOMER' ? form.customerId : form.supplierId} onChange={(e) => updateForm(form.partyType === 'CUSTOMER' ? 'customerId' : 'supplierId', e.target.value)} required>
                <option value="">Select {form.partyType.toLowerCase()}</option>
                {activePartyList.map((party) => <option key={party.id} value={party.id}>{party.name} — Balance {money(party.balance)}</option>)}
              </select>
            </label>

            <div className="form-grid two cheque-form-two">
              <label>Cheque Number<input value={form.chequeNo} onChange={(e) => updateForm('chequeNo', e.target.value)} required /></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={form.amount} onChange={(e) => updateForm('amount', e.target.value)} required /></label>
            </div>

            <div className="form-grid two cheque-form-two">
              <label>Issue Date<input type="date" value={form.issueDate} onChange={(e) => updateForm('issueDate', e.target.value)} /></label>
              <label>Due Date<input type="date" value={form.dueDate} onChange={(e) => updateForm('dueDate', e.target.value)} required /></label>
            </div>

            <label>Cash/Bank Account
              <select value={form.bankAccountId} onChange={(e) => updateForm('bankAccountId', e.target.value)} required={form.direction === 'OUT'}>
                <option value="">{form.direction === 'OUT' ? 'Select issuing account' : 'Select deposit account later or now'}</option>
                {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} — {money(a.currentBalance)}</option>)}
              </select>
            </label>

            <div className="form-grid two cheque-form-two">
              <label>Cheque Bank<input value={form.bankName} onChange={(e) => updateForm('bankName', e.target.value)} placeholder="Bank name" /></label>
              <label>Branch<input value={form.branchName} onChange={(e) => updateForm('branchName', e.target.value)} placeholder="Branch" /></label>
            </div>

            <label>Account Name<input value={form.accountName} onChange={(e) => updateForm('accountName', e.target.value)} placeholder="Name printed on cheque" /></label>
            <label>Reference<input value={form.reference} onChange={(e) => updateForm('reference', e.target.value)} placeholder="Invoice/GRN/reference" /></label>
            <label>Notes<input value={form.notes} onChange={(e) => updateForm('notes', e.target.value)} placeholder="Optional note" /></label>

            <button className="primary-btn cheque-save-btn" type="submit"><CircleDollarSign size={18} /> Save Cheque</button>
          </form>
        </section>
      </div>

      <div className="report-grid two cheque-bottom-grid">
        <section className="panel">
          <h2><AlertTriangle size={20} /> Due Soon</h2>
          {(summary?.dueSoon || []).length === 0 ? <p>No due cheques for the next 7 days.</p> : (summary?.dueSoon || []).map((c) => (
            <div className="cheque-mini-row" key={c.id}><span>{shortDate(c.dueDate)}</span><strong>{c.chequeNo}</strong><b>{money(c.amount)}</b><small>{c.partyName}</small></div>
          ))}
        </section>
        <section className="panel">
          <h2><CheckCircle2 size={20} /> Outgoing PDC Watch</h2>
          {(summary?.outgoingDue || []).length === 0 ? <p>No outgoing pending cheques.</p> : (summary?.outgoingDue || []).map((c) => (
            <div className="cheque-mini-row" key={c.id}><span>{shortDate(c.dueDate)}</span><strong>{c.chequeNo}</strong><b>{money(c.amount)}</b><small>{c.partyName}</small></div>
          ))}
        </section>
      </div>

      <ChequeDetailsModal
        cheque={selectedCheque}
        accounts={accounts}
        actionBankAccountId={actionBankAccountId}
        setActionBankAccountId={setActionBankAccountId}
        onClose={() => setSelectedCheque(null)}
        onChangeStatus={changeStatus}
      />
    </div>
  );
}
