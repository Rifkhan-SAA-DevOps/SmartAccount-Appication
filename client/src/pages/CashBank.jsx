import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';
import '../styles/stage13-registers-finance-polish.css';

const methodOptions = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];
const accountInitial = { name: '', type: 'cash', bankName: '', accountNumber: '', openingBalance: '', isCashAccount: false };
const expenseInitial = { bankAccountId: '', title: '', category: '', amount: '', method: 'CASH', reference: '', spentAt: '', notes: '' };
const transferInitial = { fromAccountId: '', toAccountId: '', amount: '', transactionDate: '', notes: '' };
const adjustInitial = { accountId: '', direction: 'IN', amount: '', description: '' };

function money(value) { return `LKR ${Number(value || 0).toFixed(2)}`; }
function shortDate(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function shortDateTime(value) { return value ? new Date(value).toLocaleString() : '-'; }

export default function CashBank() {
  const [activeTab, setActiveTab] = useState('book');
  const [summary, setSummary] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [accountForm, setAccountForm] = useState(accountInitial);
  const [expenseForm, setExpenseForm] = useState(expenseInitial);
  const [transferForm, setTransferForm] = useState(transferInitial);
  const [adjustForm, setAdjustForm] = useState(adjustInitial);
  const [receiptFile, setReceiptFile] = useState(null);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);
  const [selectedCashAccount, setSelectedCashAccount] = useState(null);
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const selectedAccount = useMemo(() => accounts.find((a) => a.id === selectedAccountId), [accounts, selectedAccountId]);

  async function loadAll(accountId = selectedAccountId) {
    const [summaryRes, accountRes, expenseRes, transactionRes] = await Promise.all([
      api.get('/cashbank/summary'),
      api.get('/cashbank/accounts'),
      api.get('/cashbank/expenses'),
      api.get('/cashbank/transactions', { params: accountId ? { accountId } : {} })
    ]);
    setSummary(summaryRes.data);
    setAccounts(accountRes.data || []);
    setExpenses(expenseRes.data || []);
    setTransactions(transactionRes.data || []);
    if (!selectedAccountId && accountRes.data?.[0]) {
      setSelectedAccountId(accountRes.data[0].id);
      setExpenseForm((old) => ({ ...old, bankAccountId: accountRes.data[0].id }));
      setTransferForm((old) => ({ ...old, fromAccountId: accountRes.data[0].id }));
      setAdjustForm((old) => ({ ...old, accountId: accountRes.data[0].id }));
    }
  }

  useEffect(() => {
    loadAll().catch((e) => setError(e.response?.data?.message || 'Failed to load cash/bank data'));
  }, []);

  useEffect(() => {
    if (selectedAccountId) {
      api.get('/cashbank/transactions', { params: { accountId: selectedAccountId } })
        .then(({ data }) => setTransactions(data || []))
        .catch((e) => setError(e.response?.data?.message || 'Failed to load account transactions'));
    }
  }, [selectedAccountId]);

  function showMessage(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  async function submitAccount(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/cashbank/accounts', {
        ...accountForm,
        openingBalance: Number(accountForm.openingBalance || 0),
        isCashAccount: Boolean(accountForm.isCashAccount)
      });
      setAccountForm(accountInitial);
      setAccountOpen(false);
      showMessage('Account created successfully');
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create account'); }
  }

  async function submitExpense(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/cashbank/expenses', {
        ...expenseForm,
        bankAccountId: expenseForm.bankAccountId || null,
        amount: Number(expenseForm.amount),
        spentAt: expenseForm.spentAt || undefined
      });
      let receiptUploaded = false;
      if (receiptFile && data?.expense?.id) {
        try {
          await uploadBusinessFile(receiptFile, {
            purpose: 'EXPENSE_RECEIPT',
            folder: 'expenses',
            entityType: 'Expense',
            entityId: data.expense.id
          });
          receiptUploaded = true;
        } catch (uploadError) {
          setError(uploadError.response?.data?.message || uploadError.message || 'Expense saved, but receipt upload failed.');
        }
      }
      setExpenseForm({ ...expenseInitial, bankAccountId: expenseForm.bankAccountId });
      setReceiptFile(null);
      setExpenseOpen(false);
      showMessage(receiptFile ? (receiptUploaded ? 'Expense saved and receipt uploaded to S3' : 'Expense saved, but receipt was not uploaded') : 'Expense saved and cash/bank balance updated');
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save expense'); }
  }

  async function submitTransfer(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post('/cashbank/transfers', {
        ...transferForm,
        amount: Number(transferForm.amount),
        transactionDate: transferForm.transactionDate || undefined
      });
      setTransferForm({ ...transferInitial, fromAccountId: transferForm.fromAccountId });
      showMessage('Money transferred successfully');
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to transfer money'); }
  }

  async function submitAdjustment(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/cashbank/accounts/${adjustForm.accountId}/adjust`, {
        direction: adjustForm.direction,
        amount: Number(adjustForm.amount),
        description: adjustForm.description
      });
      setAdjustForm({ ...adjustInitial, accountId: adjustForm.accountId });
      showMessage('Balance adjustment recorded');
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || 'Failed to adjust balance'); }
  }

  const accountColumns = [
    { key: 'name', label: 'Account', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">Click to view details</span></> },
    { key: 'type', label: 'Type' },
    { key: 'bankName', label: 'Bank', render: (r) => r.bankName || '-' },
    { key: 'accountNumber', label: 'Account No', render: (r) => r.accountNumber || '-' },
    { key: 'openingBalance', label: 'Opening', render: (r) => money(r.openingBalance) },
    { key: 'currentBalance', label: 'Current Balance', render: (r) => money(r.currentBalance) }
  ];

  const expenseColumns = [
    { key: 'spentAt', label: 'Date', render: (r) => shortDate(r.spentAt) },
    { key: 'expenseNo', label: 'No', render: (r) => r.expenseNo || '-' },
    { key: 'title', label: 'Expense', render: (r) => <><strong>{r.title}</strong><span className="table-subtext">{r.notes || 'Click to view details'}</span></> },
    { key: 'category', label: 'Category', render: (r) => r.category || '-' },
    { key: 'bankAccount', label: 'Paid From', render: (r) => r.bankAccount?.name || '-' },
    { key: 'method', label: 'Method', render: (r) => r.method?.replace('_', ' ') || '-' },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }
  ];

  const transactionColumns = [
    { key: 'transactionDate', label: 'Date', render: (r) => shortDateTime(r.transactionDate) },
    { key: 'bankAccount', label: 'Account', render: (r) => r.bankAccount?.name || '-' },
    { key: 'type', label: 'Type', render: (r) => r.type?.replaceAll('_', ' ') },
    { key: 'description', label: 'Description' },
    { key: 'direction', label: 'In/Out', render: (r) => <span className={`badge ${r.direction === 'IN' ? 'paid' : 'cancelled'}`}>{r.direction}</span> },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }
  ];

  return (
    <div className="page cash-bank-page stage13-page">
      <div className="page-head stage13-hero">
        <div>
          <span className="eyebrow">Finance control</span>
          <h1>Expenses + Cash / Bank Book</h1>
          <p>Tables stay full width. Add Expense and Create Account now open in drawers instead of shrinking the page.</p>
        </div>
        <div className="head-actions">
          <button className="secondary-btn" onClick={() => setAccountOpen(true)}>+ Create Account</button>
          <button className="primary-btn" onClick={() => setExpenseOpen(true)}>+ Add Expense</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid">
        <div className="stat-card"><span>Total Cash/Bank Balance</span><strong>{money(summary?.totalBalance)}</strong><small>{summary?.accountCount || 0} active accounts</small><div className="stat-orb" /></div>
        <div className="stat-card tone-orange"><span>This Month Expenses</span><strong>{money(summary?.monthlyExpenses)}</strong><small>Rent, salary, bills, transport</small><div className="stat-orb" /></div>
        <div className="stat-card tone-green"><span>Monthly Cash In</span><strong>{money(summary?.monthlyCashIn)}</strong><small>Opening, deposits, transfers in</small><div className="stat-orb" /></div>
        <div className="stat-card tone-blue"><span>Monthly Cash Out</span><strong>{money(summary?.monthlyCashOut)}</strong><small>Expenses, withdrawals, transfers out</small><div className="stat-orb" /></div>
      </div>

      <div className="report-tabs stage13-tabs no-print">
        <button className={activeTab === 'book' ? 'active' : ''} onClick={() => setActiveTab('book')}>Cash/Bank Book</button>
        <button className={activeTab === 'expenses' ? 'active' : ''} onClick={() => setActiveTab('expenses')}>Expenses</button>
        <button className={activeTab === 'accounts' ? 'active' : ''} onClick={() => setActiveTab('accounts')}>Accounts</button>
        <button className={activeTab === 'transfer' ? 'active' : ''} onClick={() => setActiveTab('transfer')}>Transfer</button>
      </div>

      {activeTab === 'book' && (
        <div className="stage13-stack-layout">
          <section className="panel stage13-register-panel">
            <div className="ledger-toolbar section-title-row">
              <div><h2>Cash / Bank Book</h2><p>Filter one account and see every money movement like a real book.</p></div>
              <label className="inline-filter">Account
                <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                  <option value="">All accounts</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
            </div>
            <DataTable columns={transactionColumns} rows={transactions} empty="No cash/bank transactions yet" onRowClick={setSelectedTransaction} pagination pageSize={10} paginationLabel="transactions" />
          </section>
          <section className="panel stage13-full-panel">
            <div className="section-title-row"><div><h2>Account Snapshot</h2><p>Quick view of all cash and bank balances.</p></div></div>
            <div className="stage13-card-list">
              {accounts.map((account) => <button className="stage13-info-card as-button" type="button" key={account.id} onClick={() => setSelectedCashAccount(account)}>
                <strong>{account.name}</strong><span>{account.bankName || account.type}</span><b>{money(account.currentBalance)}</b>
              </button>)}
              {!accounts.length && <p className="muted-text">No cash/bank accounts yet.</p>}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'expenses' && (
        <section className="panel stage13-register-panel">
          <div className="section-title-row"><div><h2>Expense List</h2><p>Click an expense row to view full details. Use + Add Expense to record a new cost.</p></div><button className="primary-btn" onClick={() => setExpenseOpen(true)}>+ Add Expense</button></div>
          <DataTable columns={expenseColumns} rows={expenses} empty="No expenses recorded yet" onRowClick={setSelectedExpense} pagination pageSize={10} paginationLabel="expenses" />
        </section>
      )}

      {activeTab === 'accounts' && (
        <section className="panel stage13-register-panel">
          <div className="section-title-row"><div><h2>Cash & Bank Accounts</h2><p>Create accounts in the drawer and keep the register full width.</p></div><button className="primary-btn" onClick={() => setAccountOpen(true)}>+ Create Account</button></div>
          <DataTable columns={accountColumns} rows={accounts} empty="No cash/bank accounts yet" onRowClick={setSelectedCashAccount} pagination pageSize={10} paginationLabel="accounts" />
        </section>
      )}

      {activeTab === 'transfer' && (
        <div className="stage13-stack-layout">
          <section className="panel">
            <h2>Transfer Money</h2>
            <form onSubmit={submitTransfer} className="form-grid two stage13-form-grid">
              <label>From Account<select value={transferForm.fromAccountId} onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}</select></label>
              <label>To Account<select value={transferForm.toAccountId} onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}</select></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} required /></label>
              <label>Date<input type="date" value={transferForm.transactionDate} onChange={(e) => setTransferForm({ ...transferForm, transactionDate: e.target.value })} /></label>
              <label className="span-two">Notes<input value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Optional transfer note" /></label>
              <button className="primary-btn span-two">Transfer Money</button>
            </form>
          </section>

          <section className="panel">
            <h2>Balance Adjustment</h2>
            <p>Use this only for corrections like cash count difference or bank opening correction.</p>
            <form onSubmit={submitAdjustment} className="form-grid two stage13-form-grid">
              <label>Account<select value={adjustForm.accountId} onChange={(e) => setAdjustForm({ ...adjustForm, accountId: e.target.value })} required><option value="">Select account</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}</select></label>
              <label>Direction<select value={adjustForm.direction} onChange={(e) => setAdjustForm({ ...adjustForm, direction: e.target.value })}><option value="IN">Increase balance</option><option value="OUT">Decrease balance</option></select></label>
              <label>Amount<input type="number" min="0.01" step="0.01" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} required /></label>
              <label>Description<input value={adjustForm.description} onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })} placeholder="Reason for adjustment" required /></label>
              <button className="secondary-btn span-two">Save Adjustment</button>
            </form>
          </section>
        </div>
      )}

      <ModalDrawer open={expenseOpen} onClose={() => setExpenseOpen(false)} title="Add Expense" eyebrow="Cash / Bank" description="Record business spending without shrinking the expense list." size="lg" mode="drawer" footer={<button type="submit" form="expense-create-form" className="primary-btn">Save Expense</button>}>
        <form id="expense-create-form" onSubmit={submitExpense} className="form-grid two stage13-form-grid">
          <label>Paid From<select value={expenseForm.bankAccountId} onChange={(e) => setExpenseForm({ ...expenseForm, bankAccountId: e.target.value })}><option value="">Do not update account balance</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}</select></label>
          <label>Expense Title<input value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} placeholder="Rent, salary, transport" required /></label>
          <label>Category<input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} placeholder="Office / Salary / Utility" /></label>
          <label>Amount<input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required /></label>
          <label>Method<select value={expenseForm.method} onChange={(e) => setExpenseForm({ ...expenseForm, method: e.target.value })}>{methodOptions.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}</select></label>
          <label>Reference<input value={expenseForm.reference} onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })} placeholder="Bill/cheque/bank ref" /></label>
          <label>Date<input type="date" value={expenseForm.spentAt} onChange={(e) => setExpenseForm({ ...expenseForm, spentAt: e.target.value })} /></label>
          <label>Notes<input value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} placeholder="Optional note" /></label>
          <label className="file-drop span-two compact-upload"><input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} /><strong>{receiptFile ? receiptFile.name : 'Attach receipt / bill'}</strong><span>Optional: JPG, PNG or PDF will upload to S3 after saving expense.</span></label>
        </form>
      </ModalDrawer>

      <ModalDrawer open={accountOpen} onClose={() => setAccountOpen(false)} title="Create Account" eyebrow="Cash / Bank" description="Create cash, bank, card or online wallet account." size="md" mode="drawer" footer={<button type="submit" form="cash-account-create-form" className="primary-btn">Create Account</button>}>
        <form id="cash-account-create-form" onSubmit={submitAccount} className="form-grid stage13-form-grid">
          <label>Account Name<input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Cash in Hand / BOC Bank" required /></label>
          <label>Type<select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value, isCashAccount: e.target.value === 'cash' })}><option value="cash">Cash</option><option value="bank">Bank</option><option value="card">Card / POS Machine</option><option value="online">Online Wallet</option></select></label>
          <label>Bank Name<input value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} placeholder="Optional" /></label>
          <label>Account Number<input value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} placeholder="Optional" /></label>
          <label>Opening Balance<input type="number" step="0.01" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} /></label>
          <label className="check-label"><input type="checkbox" checked={accountForm.isCashAccount} onChange={(e) => setAccountForm({ ...accountForm, isCashAccount: e.target.checked })} /> Main cash account</label>
        </form>
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedExpense)} onClose={() => setSelectedExpense(null)} title={selectedExpense?.expenseNo || 'Expense details'} eyebrow="Expense register" size="md" mode="modal">
        {selectedExpense && <div className="stage13-detail-grid"><div><span>Title</span><strong>{selectedExpense.title}</strong></div><div><span>Amount</span><strong>{money(selectedExpense.amount)}</strong></div><div><span>Date</span><strong>{shortDate(selectedExpense.spentAt)}</strong></div><div><span>Method</span><strong>{selectedExpense.method?.replace('_', ' ')}</strong></div><div><span>Category</span><strong>{selectedExpense.category || '-'}</strong></div><div><span>Paid From</span><strong>{selectedExpense.bankAccount?.name || '-'}</strong></div><div className="span-two"><span>Reference</span><strong>{selectedExpense.reference || '-'}</strong></div></div>}
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedCashAccount)} onClose={() => setSelectedCashAccount(null)} title={selectedCashAccount?.name || 'Account details'} eyebrow="Cash / Bank" size="md" mode="modal">
        {selectedCashAccount && <div className="stage13-detail-grid"><div><span>Type</span><strong>{selectedCashAccount.type}</strong></div><div><span>Current Balance</span><strong>{money(selectedCashAccount.currentBalance)}</strong></div><div><span>Opening Balance</span><strong>{money(selectedCashAccount.openingBalance)}</strong></div><div><span>Bank</span><strong>{selectedCashAccount.bankName || '-'}</strong></div><div className="span-two"><span>Account No</span><strong>{selectedCashAccount.accountNumber || '-'}</strong></div></div>}
      </ModalDrawer>

      <ModalDrawer open={Boolean(selectedTransaction)} onClose={() => setSelectedTransaction(null)} title="Transaction Details" eyebrow="Cash / Bank book" size="md" mode="modal">
        {selectedTransaction && <div className="stage13-detail-grid"><div><span>Date</span><strong>{shortDateTime(selectedTransaction.transactionDate)}</strong></div><div><span>Amount</span><strong>{money(selectedTransaction.amount)}</strong></div><div><span>Account</span><strong>{selectedTransaction.bankAccount?.name || '-'}</strong></div><div><span>Direction</span><strong>{selectedTransaction.direction}</strong></div><div className="span-two"><span>Description</span><strong>{selectedTransaction.description || '-'}</strong></div></div>}
      </ModalDrawer>
    </div>
  );
}
