import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage13-registers-finance-polish.css';

const fmt = (value) => `LKR ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const emptyAccount = { code: '', name: '', type: 'ASSET', normalBalance: 'DEBIT' };
const emptyJournal = {
  description: '',
  reference: '',
  lines: [
    { ledgerAccountId: '', description: '', debit: '', credit: '' },
    { ledgerAccountId: '', description: '', debit: '', credit: '' }
  ]
};

export default function Accounting() {
  const [summary, setSummary] = useState(null);
  const [profitLoss, setProfitLoss] = useState(null);
  const [balanceSheet, setBalanceSheet] = useState(null);
  const [trialBalance, setTrialBalance] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [accountForm, setAccountForm] = useState(emptyAccount);
  const [journalForm, setJournalForm] = useState(emptyJournal);
  const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
  const [selectedJournal, setSelectedJournal] = useState(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const totals = useMemo(() => {
    const debit = journalForm.lines.reduce((sum, line) => sum + Number(line.debit || 0), 0);
    const credit = journalForm.lines.reduce((sum, line) => sum + Number(line.credit || 0), 0);
    return { debit, credit, difference: debit - credit };
  }, [journalForm.lines]);

  async function load() {
    setError('');
    try {
      const [s, p, b, t, a, j] = await Promise.all([
        api.get('/accounting/summary'),
        api.get('/accounting/profit-loss'),
        api.get('/accounting/balance-sheet'),
        api.get('/accounting/trial-balance'),
        api.get('/accounting/chart-of-accounts'),
        api.get('/accounting/journal-entries')
      ]);
      setSummary(s.data);
      setProfitLoss(p.data);
      setBalanceSheet(b.data);
      setTrialBalance(t.data);
      setAccounts(a.data || []);
      setJournalEntries(j.data || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load accounting reports');
    }
  }

  useEffect(() => { load(); }, []);

  async function setupDefaults() {
    setMessage('');
    setError('');
    try {
      const res = await api.post('/accounting/setup-defaults');
      setMessage(res.data.message || 'Default chart of accounts created');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to setup default accounts');
    }
  }

  async function createAccount(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/accounting/chart-of-accounts', accountForm);
      setAccountForm(emptyAccount);
      setAccountDrawerOpen(false);
      setMessage('Ledger account created');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create account');
    }
  }

  function updateJournalLine(index, patch) {
    setJournalForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => i === index ? { ...line, ...patch } : line)
    }));
  }

  function addJournalLine() {
    setJournalForm((prev) => ({
      ...prev,
      lines: [...prev.lines, { ledgerAccountId: '', description: '', debit: '', credit: '' }]
    }));
  }

  function removeJournalLine(index) {
    setJournalForm((prev) => ({
      ...prev,
      lines: prev.lines.filter((_, i) => i !== index)
    }));
  }

  async function createJournalEntry(e) {
    e.preventDefault();
    setMessage('');
    setError('');
    try {
      await api.post('/accounting/journal-entries', {
        description: journalForm.description,
        reference: journalForm.reference || null,
        lines: journalForm.lines.map((line) => ({
          ledgerAccountId: line.ledgerAccountId,
          description: line.description || null,
          debit: Number(line.debit || 0),
          credit: Number(line.credit || 0)
        }))
      });
      setJournalForm(emptyJournal);
      setMessage('Balanced journal entry posted');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to post journal entry');
    }
  }

  return (
    <div className="page accounting-page stage13-page">
      <div className="page-head stage13-hero">
        <div>
          <span className="eyebrow">Finance control</span>
          <h1>Accounting</h1>
          <p>Ledger accounts now open in a drawer, and recent journal entries are a clean clickable register with modal details.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={setupDefaults}>Setup Default Accounts</button>
          <button className="secondary-btn" onClick={load}>Refresh</button>
          <button className="primary-btn" onClick={() => setAccountDrawerOpen(true)}>+ Add Ledger Account</button>
        </div>
      </div>

      {message && <div className="success-box">{message}</div>}
      {error && <div className="error-box">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card"><span>Net Sales</span><strong>{fmt(profitLoss?.netSales)}</strong><small>Sales after returns</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>COGS</span><strong>{fmt(profitLoss?.costOfGoodsSold)}</strong><small>Estimated product cost</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Gross Profit</span><strong>{fmt(profitLoss?.grossProfit)}</strong><small>Net sales minus COGS</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Net Profit</span><strong>{fmt(profitLoss?.netProfit)}</strong><small>After operating expenses</small><div className="stat-orb" /></div>
      </div>

      <div className="stage13-stack-layout">
        <section className="panel">
          <h2>Profit & Loss</h2>
          <div className="statement-box stage13-statement-box">
            <div><span>Gross Sales</span><strong>{fmt(profitLoss?.sales?.grossSales)}</strong></div>
            <div><span>Less: Sales Returns</span><strong>{fmt(profitLoss?.sales?.salesReturns)}</strong></div>
            <div className="statement-total"><span>Net Sales</span><strong>{fmt(profitLoss?.netSales)}</strong></div>
            <div><span>Less: Cost of Goods Sold</span><strong>{fmt(profitLoss?.costOfGoodsSold)}</strong></div>
            <div className="statement-total"><span>Gross Profit</span><strong>{fmt(profitLoss?.grossProfit)}</strong></div>
            <div><span>Less: Operating Expenses</span><strong>{fmt(profitLoss?.operatingExpenses)}</strong></div>
            <div className="statement-final"><span>Net Profit</span><strong>{fmt(profitLoss?.netProfit)}</strong></div>
          </div>
        </section>

        <section className="panel">
          <h2>Balance Sheet Foundation</h2>
          <div className="statement-box compact-statement stage13-statement-box">
            <h3>Assets</h3>
            <div><span>Cash & Bank</span><strong>{fmt(balanceSheet?.assets?.cashAndBank)}</strong></div>
            <div><span>Accounts Receivable</span><strong>{fmt(balanceSheet?.assets?.accountsReceivable)}</strong></div>
            <div><span>Inventory</span><strong>{fmt(balanceSheet?.assets?.inventory)}</strong></div>
            <div className="statement-total"><span>Total Assets</span><strong>{fmt(balanceSheet?.assets?.totalAssets)}</strong></div>
            <h3>Liabilities</h3>
            <div><span>Accounts Payable</span><strong>{fmt(balanceSheet?.liabilities?.accountsPayable)}</strong></div>
            <div className="statement-total"><span>Total Liabilities</span><strong>{fmt(balanceSheet?.liabilities?.totalLiabilities)}</strong></div>
            <h3>Equity</h3>
            <div><span>Current Period Profit</span><strong>{fmt(balanceSheet?.currentPeriodProfit)}</strong></div>
            <div className="statement-final"><span>Estimated Owner Equity</span><strong>{fmt(balanceSheet?.equity?.totalEquity)}</strong></div>
          </div>
        </section>
      </div>

      <section className="panel auto-posting-panel stage13-full-panel">
        <h2>Automatic Double-Entry Posting</h2>
        <p>Every important business transaction now creates a balanced journal entry automatically, so accounting reports become more reliable.</p>
        <div className="auto-posting-grid">
          <span>Invoice → Sales + COGS</span><span>GRN → Inventory + Payable</span><span>Receipt → Cash/Bank + Receivable</span><span>Supplier Payment → Payable + Cash/Bank</span><span>Expense → Expense + Cash/Bank</span><span>Returns → Reverse sales/purchase impact</span>
        </div>
      </section>

      <section className="panel stage13-register-panel">
        <h2>Trial Balance</h2>
        <p>This table includes manual journals and automatic journals posted from operational modules.</p>
        <div className="trial-summary stage13-summary-strip">
          <div><span>Total Debit</span><strong>{fmt(trialBalance?.totalDebit)}</strong></div>
          <div><span>Total Credit</span><strong>{fmt(trialBalance?.totalCredit)}</strong></div>
          <div><span>Difference</span><strong>{fmt(trialBalance?.difference)}</strong></div>
        </div>
        <DataTable columns={[
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Account' },
          { key: 'type', label: 'Type' },
          { key: 'debit', label: 'Debit', render: (r) => fmt(r.debit) },
          { key: 'credit', label: 'Credit', render: (r) => fmt(r.credit) },
          { key: 'balance', label: 'Balance', render: (r) => fmt(r.balance) }
        ]} rows={trialBalance?.rows || []} pagination pageSize={10} paginationLabel="accounts" />
      </section>

      <section className="panel stage13-register-panel">
        <div className="section-title-row">
          <div><h2>Chart of Accounts</h2><p>{summary?.accountCount || accounts.length} active ledger accounts</p></div>
          <button className="primary-btn" onClick={() => setAccountDrawerOpen(true)}>+ Add Ledger Account</button>
        </div>
        <DataTable columns={[
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Name' },
          { key: 'type', label: 'Type' },
          { key: 'normalBalance', label: 'Normal' },
          { key: 'isSystem', label: 'System', render: (r) => r.isSystem ? 'Yes' : 'No' }
        ]} rows={accounts} pagination pageSize={10} paginationLabel="ledger accounts" />
      </section>

      <section className="panel stage13-full-panel">
        <h2>Post Manual Journal Entry</h2>
        <form className="form-grid stage13-form-grid" onSubmit={createJournalEntry}>
          <div className="form-grid two span-two">
            <label>Description<input value={journalForm.description} onChange={(e) => setJournalForm({ ...journalForm, description: e.target.value })} placeholder="Owner capital introduced" required /></label>
            <label>Reference<input value={journalForm.reference} onChange={(e) => setJournalForm({ ...journalForm, reference: e.target.value })} placeholder="REF-001" /></label>
          </div>
          <div className="journal-lines span-two stage13-item-stack">
            {journalForm.lines.map((line, index) => (
              <div className="journal-line stage13-item-row" key={index}>
                <select value={line.ledgerAccountId} onChange={(e) => updateJournalLine(index, { ledgerAccountId: e.target.value })} required>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.code} - {account.name}</option>)}
                </select>
                <input value={line.description} onChange={(e) => updateJournalLine(index, { description: e.target.value })} placeholder="Line note" />
                <input type="number" min="0" step="0.01" value={line.debit} onChange={(e) => updateJournalLine(index, { debit: e.target.value, credit: e.target.value ? '' : line.credit })} placeholder="Debit" />
                <input type="number" min="0" step="0.01" value={line.credit} onChange={(e) => updateJournalLine(index, { credit: e.target.value, debit: e.target.value ? '' : line.debit })} placeholder="Credit" />
                <button type="button" className="mini-danger" onClick={() => removeJournalLine(index)} disabled={journalForm.lines.length <= 2}>×</button>
              </div>
            ))}
          </div>
          <div className="journal-footer span-two stage13-journal-footer">
            <button type="button" className="secondary-btn" onClick={addJournalLine}>Add Line</button>
            <div><strong>Debit:</strong> {fmt(totals.debit)} &nbsp; <strong>Credit:</strong> {fmt(totals.credit)} &nbsp; <strong>Difference:</strong> {fmt(totals.difference)}</div>
            <button className="primary-btn">Post Journal Entry</button>
          </div>
        </form>
      </section>

      <section className="panel stage13-register-panel">
        <div className="section-title-row"><div><h2>Recent Journal Entries</h2><p>Click an entry to see all debit/credit lines. This table is now full width and paginated.</p></div></div>
        <DataTable columns={[
          { key: 'entryNo', label: 'Entry No', render: (r) => <><strong>{r.entryNo}</strong><span className="table-subtext">Click to view lines</span></> },
          { key: 'entryDate', label: 'Date', render: (r) => new Date(r.entryDate).toLocaleDateString() },
          { key: 'description', label: 'Description' },
          { key: 'reference', label: 'Reference', render: (r) => r.reference || '-' },
          { key: 'status', label: 'Type', render: (r) => r.reference?.startsWith('AUTO:') ? 'Auto' : 'Manual' },
          { key: 'lines', label: 'Lines', render: (r) => r.lines?.length || 0 }
        ]} rows={journalEntries} onRowClick={setSelectedJournal} pagination pageSize={10} paginationLabel="journal entries" />
      </section>

      <ModalDrawer open={accountDrawerOpen} onClose={() => setAccountDrawerOpen(false)} title="Add Ledger Account" eyebrow="Chart of accounts" description="Create a new account without shrinking the chart of accounts table." size="md" mode="drawer" footer={<button type="submit" form="ledger-account-create-form" className="primary-btn">Create Account</button>}>
        <form id="ledger-account-create-form" className="form-grid stage13-form-grid" onSubmit={createAccount}>
          <label>Code<input value={accountForm.code} onChange={(e) => setAccountForm({ ...accountForm, code: e.target.value })} placeholder="6050" required /></label>
          <label>Name<input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Internet Expense" required /></label>
          <label>Type<select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value })}><option value="ASSET">Asset</option><option value="LIABILITY">Liability</option><option value="EQUITY">Equity</option><option value="INCOME">Income</option><option value="EXPENSE">Expense</option><option value="COST_OF_GOODS_SOLD">Cost of Goods Sold</option></select></label>
          <label>Normal Balance<select value={accountForm.normalBalance} onChange={(e) => setAccountForm({ ...accountForm, normalBalance: e.target.value })}><option value="DEBIT">Debit</option><option value="CREDIT">Credit</option></select></label>
        </form>
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedJournal)} onClose={() => setSelectedJournal(null)} title={selectedJournal?.entryNo || 'Journal Entry'} eyebrow="Journal register" description="Review journal header and debit/credit lines." size="lg" mode="modal">
        {selectedJournal && <>
          <div className="stage13-detail-grid">
            <div><span>Date</span><strong>{new Date(selectedJournal.entryDate).toLocaleDateString()}</strong></div>
            <div><span>Type</span><strong>{selectedJournal.reference?.startsWith('AUTO:') ? 'Auto' : 'Manual'}</strong></div>
            <div className="span-two"><span>Description</span><strong>{selectedJournal.description}</strong></div>
            <div className="span-two"><span>Reference</span><strong>{selectedJournal.reference || '-'}</strong></div>
          </div>
          <DataTable columns={[
            { key: 'account', label: 'Account', render: (r) => r.ledgerAccount?.name || r.account?.name || r.accountName || '-' },
            { key: 'description', label: 'Description', render: (r) => r.description || '-' },
            { key: 'debit', label: 'Debit', render: (r) => fmt(r.debit) },
            { key: 'credit', label: 'Credit', render: (r) => fmt(r.credit) }
          ]} rows={selectedJournal.lines || []} pagination={false} empty="No journal lines" />
        </>}
      </ModalDrawer>
    </div>
  );
}
