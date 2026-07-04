import { useEffect, useMemo, useState } from 'react';
import { BadgeCheck, FileInput, Link2, RefreshCw, ShieldCheck } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyStatement = { bankAccountId: '', name: '', statementDate: new Date().toISOString().slice(0, 10), periodFrom: '', periodTo: '', openingBalance: 0, closingBalance: 0, notes: '', csvText: '' };
const emptyRecon = { bankAccountId: '', periodFrom: '', periodTo: '', statementClosingBalance: 0, notes: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'closed' || s === 'matched') return 'paid';
  if (s === 'open' || s === 'draft') return 'unpaid';
  if (s === 'cancelled') return 'cancelled';
  return 'partial';
}

export default function BankReconciliation() {
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [statements, setStatements] = useState([]);
  const [lines, setLines] = useState([]);
  const [systemTx, setSystemTx] = useState([]);
  const [reconciliations, setReconciliations] = useState([]);
  const [statementForm, setStatementForm] = useState(emptyStatement);
  const [reconForm, setReconForm] = useState(emptyRecon);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [matchMap, setMatchMap] = useState({});
  const [tab, setTab] = useState('match');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load(accountId = selectedAccountId) {
    setError('');
    const [summaryRes, accountsRes] = await Promise.all([
      api.get('/bank-reconciliation/summary'),
      api.get('/cashbank/accounts')
    ]);
    const firstAccount = accountId || accountsRes.data?.[0]?.id || '';
    setSummary(summaryRes.data);
    setAccounts(accountsRes.data || []);
    setSelectedAccountId(firstAccount);
    setStatementForm((old) => ({ ...old, bankAccountId: old.bankAccountId || firstAccount }));
    setReconForm((old) => ({ ...old, bankAccountId: old.bankAccountId || firstAccount }));

    if (firstAccount) {
      const [statementRes, lineRes, txRes, reconciliationRes] = await Promise.all([
        api.get('/bank-reconciliation/statements', { params: { bankAccountId: firstAccount } }),
        api.get('/bank-reconciliation/lines', { params: { bankAccountId: firstAccount, matched: 'false', ignored: 'false' } }),
        api.get('/bank-reconciliation/transactions/unmatched', { params: { bankAccountId: firstAccount } }),
        api.get('/bank-reconciliation/reconciliations', { params: { bankAccountId: firstAccount } })
      ]);
      setStatements(statementRes.data || []);
      setLines(lineRes.data || []);
      setSystemTx(txRes.data || []);
      setReconciliations(reconciliationRes.data || []);
    }
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load bank reconciliation')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  function changeAccount(id) {
    setSelectedAccountId(id);
    setStatementForm((old) => ({ ...old, bankAccountId: id }));
    setReconForm((old) => ({ ...old, bankAccountId: id }));
    load(id).catch((e) => setError(e.response?.data?.message || 'Failed to load account reconciliation'));
  }

  const currentAccount = useMemo(() => accounts.find((a) => a.id === selectedAccountId), [accounts, selectedAccountId]);

  async function createStatement(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/bank-reconciliation/statements', {
        ...statementForm,
        bankAccountId: statementForm.bankAccountId || selectedAccountId,
        statementDate: statementForm.statementDate || undefined,
        periodFrom: statementForm.periodFrom || null,
        periodTo: statementForm.periodTo || null,
        openingBalance: Number(statementForm.openingBalance || 0),
        closingBalance: Number(statementForm.closingBalance || 0)
      });
      setStatementForm({ ...emptyStatement, bankAccountId: selectedAccountId });
      flash('Bank statement imported');
      await load(selectedAccountId);
    } catch (e) { setError(e.response?.data?.message || 'Failed to import statement'); }
    finally { setSaving(false); }
  }

  async function autoMatch(statement) {
    setError('');
    try {
      const { data } = await api.post(`/bank-reconciliation/statements/${statement.id}/auto-match`, { daysTolerance: 3, amountTolerance: 0 });
      flash(`${data.created} transaction(s) auto matched`);
      await load(selectedAccountId);
    } catch (e) { setError(e.response?.data?.message || 'Failed to auto match'); }
  }

  async function manualMatch(line) {
    const bankTransactionId = matchMap[line.id];
    if (!bankTransactionId) { setError('Select a system transaction to match'); return; }
    setError('');
    try {
      await api.post(`/bank-reconciliation/lines/${line.id}/match`, { bankTransactionId, notes: 'Manual match from reconciliation page' });
      flash('Statement line matched');
      setMatchMap((old) => ({ ...old, [line.id]: '' }));
      await load(selectedAccountId);
    } catch (e) { setError(e.response?.data?.message || 'Failed to match transaction'); }
  }

  async function ignoreLine(line) {
    setError('');
    try {
      await api.post(`/bank-reconciliation/lines/${line.id}/ignore`);
      flash(line.ignored ? 'Statement line restored' : 'Statement line ignored');
      await load(selectedAccountId);
    } catch (e) { setError(e.response?.data?.message || 'Failed to ignore line'); }
  }

  async function createReconciliation(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/bank-reconciliation/reconciliations', {
        ...reconForm,
        bankAccountId: reconForm.bankAccountId || selectedAccountId,
        periodFrom: reconForm.periodFrom || null,
        periodTo: reconForm.periodTo || null,
        statementClosingBalance: Number(reconForm.statementClosingBalance || 0)
      });
      setReconForm({ ...emptyRecon, bankAccountId: selectedAccountId });
      flash('Reconciliation snapshot created');
      await load(selectedAccountId);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create reconciliation'); }
    finally { setSaving(false); }
  }

  const statementColumns = [
    { key: 'importNo', label: 'Statement', render: (r) => <><strong>{r.importNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'period', label: 'Period', render: (r) => <>{dateOnly(r.periodFrom)} → {dateOnly(r.periodTo)}</> },
    { key: 'lines', label: 'Lines', render: (r) => <><strong>{r.matchedLines}/{r.lineCount}</strong><span className="table-subtext">{r.matchPercent}% matched</span></> },
    { key: 'amount', label: 'Debit / Credit', render: (r) => <>{money(r.totalDebit)} / {money(r.totalCredit)}</> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row"><button className="mini-action" onClick={() => autoMatch(r)}>Auto-match</button></div> }
  ];

  const lineColumns = [
    { key: 'transactionDate', label: 'Bank Line', render: (r) => <><strong>{dateOnly(r.transactionDate)}</strong><span className="table-subtext">{r.description}</span></> },
    { key: 'reference', label: 'Reference', render: (r) => r.reference || '-' },
    { key: 'direction', label: 'Type', render: (r) => <span className={`badge ${r.direction === 'IN' ? 'paid' : 'unpaid'}`}>{r.direction}</span> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'match', label: 'Match System Tx', render: (r) => <select value={matchMap[r.id] || ''} onChange={(e) => setMatchMap({ ...matchMap, [r.id]: e.target.value })}><option value="">Select transaction</option>{systemTx.filter((t) => t.direction === r.direction && Number(t.amount) === Number(r.amount)).map((t) => <option key={t.id} value={t.id}>{dateOnly(t.transactionDate)} · {t.description} · {money(t.amount)}</option>)}</select> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row"><button className="mini-action" onClick={() => manualMatch(r)}>Match</button><button className="mini-danger" onClick={() => ignoreLine(r)}>Ignore</button></div> }
  ];

  const txColumns = [
    { key: 'transactionDate', label: 'System Tx', render: (r) => <><strong>{dateOnly(r.transactionDate)}</strong><span className="table-subtext">{r.description}</span></> },
    { key: 'type', label: 'Type', render: (r) => r.type },
    { key: 'direction', label: 'Direction', render: (r) => <span className={`badge ${r.direction === 'IN' ? 'paid' : 'unpaid'}`}>{r.direction}</span> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'ref', label: 'Reference', render: (r) => `${r.refType || '-'} ${r.refId || ''}` }
  ];

  const reconciliationColumns = [
    { key: 'reconciliationNo', label: 'No' },
    { key: 'period', label: 'Period', render: (r) => <>{dateOnly(r.periodFrom)} → {dateOnly(r.periodTo)}</> },
    { key: 'statementClosingBalance', label: 'Statement', render: (r) => money(r.statementClosingBalance) },
    { key: 'systemClosingBalance', label: 'System', render: (r) => money(r.systemClosingBalance) },
    { key: 'difference', label: 'Difference', render: (r) => money(r.difference) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  return (
    <div className="page bank-recon-page">
      <div className="page-head">
        <div>
          <h1>Bank Reconciliation</h1>
          <p>Import bank statement lines, match them with system bank book transactions, and close monthly reconciliation differences.</p>
        </div>
        <div className="actions-row"><button className="secondary-btn" onClick={() => load(selectedAccountId)}><RefreshCw size={18} /> Refresh</button></div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="bank-recon-toolbar panel">
        <label>Bank/Cash Account<select value={selectedAccountId} onChange={(e) => changeAccount(e.target.value)}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name} · {money(a.currentBalance)}</option>)}</select></label>
        <div><span>Selected balance</span><strong>{money(currentAccount?.currentBalance)}</strong></div>
        <div><span>Match rate</span><strong>{summary?.matchPercent || 0}%</strong></div>
      </div>

      <div className="stat-grid bank-recon-stat-grid">
        <StatCard title="Statements" value={summary?.statements || 0} subtitle={`${summary?.lines || 0} imported lines`} />
        <StatCard title="Matched Lines" value={summary?.matchedLines || 0} subtitle={`${summary?.matchPercent || 0}% completed`} tone="green" />
        <StatCard title="Unmatched Lines" value={summary?.unmatchedLines || 0} subtitle={`${summary?.ignoredLines || 0} ignored`} tone="orange" />
        <StatCard title="Reconciliations" value={reconciliations.length || 0} subtitle="Saved snapshots" tone="blue" />
      </div>

      <div className="tab-actions">
        {['match', 'import', 'close'].map((item) => <button key={item} className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{item === 'match' ? 'Match' : item === 'import' ? 'Import Statement' : 'Close Reconciliation'}</button>)}
      </div>

      {tab === 'match' && <>
        <section className="panel">
          <div className="section-title-row"><h2><Link2 size={20} /> Unmatched Bank Statement Lines</h2><p>Auto-match first, then manually match remaining lines.</p></div>
          <DataTable columns={lineColumns} rows={lines} empty="No unmatched bank statement lines" />
        </section>
        <div className="bank-recon-grid">
          <section className="panel"><h2>Imported Statements</h2><DataTable columns={statementColumns} rows={statements} empty="No statements imported" /></section>
          <section className="panel"><h2>Unmatched System Transactions</h2><DataTable columns={txColumns} rows={systemTx} empty="No unmatched system transactions" /></section>
        </div>
      </>}

      {tab === 'import' && <div className="bank-recon-grid">
        <form className="panel form-grid" onSubmit={createStatement}>
          <h2><FileInput size={20} /> Import Bank Statement</h2>
          <label>Statement name<input required value={statementForm.name} onChange={(e) => setStatementForm({ ...statementForm, name: e.target.value })} placeholder="Commercial Bank July statement" /></label>
          <label>Bank account<select required value={statementForm.bankAccountId || selectedAccountId} onChange={(e) => setStatementForm({ ...statementForm, bankAccountId: e.target.value })}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="form-grid two"><label>From<input type="date" value={statementForm.periodFrom} onChange={(e) => setStatementForm({ ...statementForm, periodFrom: e.target.value })} /></label><label>To<input type="date" value={statementForm.periodTo} onChange={(e) => setStatementForm({ ...statementForm, periodTo: e.target.value })} /></label></div>
          <div className="form-grid two"><label>Opening balance<input type="number" value={statementForm.openingBalance} onChange={(e) => setStatementForm({ ...statementForm, openingBalance: e.target.value })} /></label><label>Closing balance<input type="number" value={statementForm.closingBalance} onChange={(e) => setStatementForm({ ...statementForm, closingBalance: e.target.value })} /></label></div>
          <label>CSV statement lines<textarea value={statementForm.csvText} onChange={(e) => setStatementForm({ ...statementForm, csvText: e.target.value })} placeholder="date,description,reference,direction,amount,balance&#10;2026-07-01,Customer deposit,REF001,IN,15000,65000&#10;2026-07-02,Bank charge,CHG001,OUT,500,64500" /></label>
          <label>Notes<input value={statementForm.notes} onChange={(e) => setStatementForm({ ...statementForm, notes: e.target.value })} /></label>
          <button className="primary-btn" disabled={saving}>Import Statement</button>
        </form>
        <section className="panel bank-csv-help">
          <h2>CSV format</h2>
          <p>Paste bank statement rows using this format:</p>
          <pre>date,description,reference,direction,amount,balance{`\n`}2026-07-01,Customer deposit,REF001,IN,15000,65000{`\n`}2026-07-02,Bank charge,CHG001,OUT,500,64500</pre>
          <p>You can also paste debit/credit format:</p>
          <pre>date,description,reference,debit,credit,balance</pre>
        </section>
      </div>}

      {tab === 'close' && <div className="bank-recon-grid">
        <form className="panel form-grid" onSubmit={createReconciliation}>
          <h2><ShieldCheck size={20} /> Close / Save Reconciliation</h2>
          <label>Bank account<select required value={reconForm.bankAccountId || selectedAccountId} onChange={(e) => setReconForm({ ...reconForm, bankAccountId: e.target.value })}><option value="">Select account</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
          <div className="form-grid two"><label>From<input type="date" value={reconForm.periodFrom} onChange={(e) => setReconForm({ ...reconForm, periodFrom: e.target.value })} /></label><label>To<input type="date" value={reconForm.periodTo} onChange={(e) => setReconForm({ ...reconForm, periodTo: e.target.value })} /></label></div>
          <label>Statement closing balance<input type="number" required value={reconForm.statementClosingBalance} onChange={(e) => setReconForm({ ...reconForm, statementClosingBalance: e.target.value })} /></label>
          <label>Notes<input value={reconForm.notes} onChange={(e) => setReconForm({ ...reconForm, notes: e.target.value })} /></label>
          <button className="primary-btn" disabled={saving}><BadgeCheck size={18} /> Save Reconciliation</button>
        </form>
        <section className="panel"><h2>Reconciliation History</h2><DataTable columns={reconciliationColumns} rows={reconciliations} empty="No reconciliations yet" /></section>
      </div>}
    </div>
  );
}
