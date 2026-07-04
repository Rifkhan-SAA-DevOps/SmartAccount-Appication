import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import { uploadBusinessFile } from '../utils/uploadFile.js';

const methodOptions = ['CASH', 'CARD', 'BANK_TRANSFER', 'CHEQUE', 'ONLINE'];
const accountInitial = { name: '', type: 'cash', bankName: '', accountNumber: '', openingBalance: '', isCashAccount: false };
const expenseInitial = { bankAccountId: '', title: '', category: '', amount: '', method: 'CASH', reference: '', spentAt: '', notes: '' };
const transferInitial = { fromAccountId: '', toAccountId: '', amount: '', transactionDate: '', notes: '' };
const adjustInitial = { accountId: '', direction: 'IN', amount: '', description: '' };

function money(value) {
  return `LKR ${Number(value || 0).toFixed(2)}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function shortDateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}

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
    setAccounts(accountRes.data);
    setExpenses(expenseRes.data);
    setTransactions(transactionRes.data);
    if (!selectedAccountId && accountRes.data[0]) {
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
        .then(({ data }) => setTransactions(data))
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
    { key: 'name', label: 'Account' },
    { key: 'type', label: 'Type' },
    { key: 'bankName', label: 'Bank', render: (r) => r.bankName || '-' },
    { key: 'accountNumber', label: 'Account No', render: (r) => r.accountNumber || '-' },
    { key: 'openingBalance', label: 'Opening', render: (r) => money(r.openingBalance) },
    { key: 'currentBalance', label: 'Current Balance', render: (r) => money(r.currentBalance) }
  ];

  const expenseColumns = [
    { key: 'spentAt', label: 'Date', render: (r) => shortDate(r.spentAt) },
    { key: 'expenseNo', label: 'No', render: (r) => r.expenseNo || '-' },
    { key: 'title', label: 'Expense' },
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
    <div className="page cash-bank-page">
      <div className="page-head">
        <div>
          <h1>Expenses + Cash / Bank Book</h1>
          <p>Manage cash accounts, bank accounts, business expenses, transfers, adjustments, and transaction history.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${activeTab === 'book' ? 'active' : ''}`} onClick={() => setActiveTab('book')}>Cash/Bank Book</button>
          <button className={`tab-btn ${activeTab === 'expenses' ? 'active' : ''}`} onClick={() => setActiveTab('expenses')}>Expenses</button>
          <button className={`tab-btn ${activeTab === 'accounts' ? 'active' : ''}`} onClick={() => setActiveTab('accounts')}>Accounts</button>
          <button className={`tab-btn ${activeTab === 'transfer' ? 'active' : ''}`} onClick={() => setActiveTab('transfer')}>Transfer</button>
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

      {activeTab === 'book' && (
        <div className="ledger-layout small-side">
          <section className="panel">
            <div className="ledger-toolbar">
              <div>
                <h2>Cash / Bank Book</h2>
                <p>Filter one account and see every money movement like a real cash book.</p>
              </div>
              <label>Account Filter
                <select value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                  <option value="">All accounts</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
            </div>
            <DataTable columns={transactionColumns} rows={transactions} empty="No cash/bank transactions yet" />
          </section>

          <section className="panel account-focus-card">
            <h2>Selected Account</h2>
            {selectedAccount ? (
              <>
                <div className="focus-balance">{money(selectedAccount.currentBalance)}</div>
                <p><b>{selectedAccount.name}</b></p>
                <p>{selectedAccount.bankName || selectedAccount.type} {selectedAccount.accountNumber ? `• ${selectedAccount.accountNumber}` : ''}</p>
              </>
            ) : <p>Select an account to view balance.</p>}
            <div className="mini-list">
              {accounts.slice(0, 6).map((account) => <div key={account.id}><span>{account.name}</span><strong>{money(account.currentBalance)}</strong></div>)}
            </div>
          </section>
        </div>
      )}

      {activeTab === 'expenses' && (
        <div className="ledger-layout">
          <section className="panel">
            <h2>Expense List</h2>
            <DataTable columns={expenseColumns} rows={expenses} empty="No expenses recorded yet" />
          </section>
          <section className="panel">
            <h2>Add Expense</h2>
            <form onSubmit={submitExpense} className="form-grid">
              <label>Paid From
                <select value={expenseForm.bankAccountId} onChange={(e) => setExpenseForm({ ...expenseForm, bankAccountId: e.target.value })}>
                  <option value="">Do not update account balance</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
              <label>Expense Title
                <input value={expenseForm.title} onChange={(e) => setExpenseForm({ ...expenseForm, title: e.target.value })} placeholder="Rent, salary, transport" required />
              </label>
              <label>Category
                <input value={expenseForm.category} onChange={(e) => setExpenseForm({ ...expenseForm, category: e.target.value })} placeholder="Office / Salary / Utility" />
              </label>
              <label>Amount
                <input type="number" min="0.01" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} required />
              </label>
              <label>Method
                <select value={expenseForm.method} onChange={(e) => setExpenseForm({ ...expenseForm, method: e.target.value })}>
                  {methodOptions.map((method) => <option key={method} value={method}>{method.replace('_', ' ')}</option>)}
                </select>
              </label>
              <label>Reference
                <input value={expenseForm.reference} onChange={(e) => setExpenseForm({ ...expenseForm, reference: e.target.value })} placeholder="Bill/cheque/bank ref" />
              </label>
              <label>Date
                <input type="date" value={expenseForm.spentAt} onChange={(e) => setExpenseForm({ ...expenseForm, spentAt: e.target.value })} />
              </label>
              <label>Notes
                <input value={expenseForm.notes} onChange={(e) => setExpenseForm({ ...expenseForm, notes: e.target.value })} placeholder="Optional note" />
              </label>
              <label className="file-drop span-two compact-upload">
                <input type="file" accept="image/*,.pdf" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
                <strong>{receiptFile ? receiptFile.name : 'Attach receipt / bill'}</strong>
                <span>Optional: JPG, PNG or PDF will upload to S3 after saving expense.</span>
              </label>
              <button className="primary-btn">Save Expense</button>
            </form>
          </section>
        </div>
      )}

      {activeTab === 'accounts' && (
        <div className="ledger-layout">
          <section className="panel">
            <h2>Cash & Bank Accounts</h2>
            <DataTable columns={accountColumns} rows={accounts} empty="No cash/bank accounts yet" />
          </section>
          <section className="panel">
            <h2>Create Account</h2>
            <form onSubmit={submitAccount} className="form-grid">
              <label>Account Name
                <input value={accountForm.name} onChange={(e) => setAccountForm({ ...accountForm, name: e.target.value })} placeholder="Cash in Hand / BOC Bank" required />
              </label>
              <label>Type
                <select value={accountForm.type} onChange={(e) => setAccountForm({ ...accountForm, type: e.target.value, isCashAccount: e.target.value === 'cash' })}>
                  <option value="cash">Cash</option>
                  <option value="bank">Bank</option>
                  <option value="card">Card / POS Machine</option>
                  <option value="online">Online Wallet</option>
                </select>
              </label>
              <label>Bank Name
                <input value={accountForm.bankName} onChange={(e) => setAccountForm({ ...accountForm, bankName: e.target.value })} placeholder="Optional" />
              </label>
              <label>Account Number
                <input value={accountForm.accountNumber} onChange={(e) => setAccountForm({ ...accountForm, accountNumber: e.target.value })} placeholder="Optional" />
              </label>
              <label>Opening Balance
                <input type="number" step="0.01" value={accountForm.openingBalance} onChange={(e) => setAccountForm({ ...accountForm, openingBalance: e.target.value })} />
              </label>
              <label className="check-label">
                <input type="checkbox" checked={accountForm.isCashAccount} onChange={(e) => setAccountForm({ ...accountForm, isCashAccount: e.target.checked })} />
                Main cash account
              </label>
              <button className="primary-btn">Create Account</button>
            </form>
          </section>
        </div>
      )}

      {activeTab === 'transfer' && (
        <div className="ledger-layout">
          <section className="panel">
            <h2>Transfer Money</h2>
            <form onSubmit={submitTransfer} className="form-grid two">
              <label>From Account
                <select value={transferForm.fromAccountId} onChange={(e) => setTransferForm({ ...transferForm, fromAccountId: e.target.value })} required>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
              <label>To Account
                <select value={transferForm.toAccountId} onChange={(e) => setTransferForm({ ...transferForm, toAccountId: e.target.value })} required>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
              <label>Amount
                <input type="number" min="0.01" step="0.01" value={transferForm.amount} onChange={(e) => setTransferForm({ ...transferForm, amount: e.target.value })} required />
              </label>
              <label>Date
                <input type="date" value={transferForm.transactionDate} onChange={(e) => setTransferForm({ ...transferForm, transactionDate: e.target.value })} />
              </label>
              <label className="span-two">Notes
                <input value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} placeholder="Optional transfer note" />
              </label>
              <button className="primary-btn span-two">Transfer Money</button>
            </form>
          </section>

          <section className="panel">
            <h2>Balance Adjustment</h2>
            <p>Use this only for corrections like cash count difference or bank opening correction.</p>
            <form onSubmit={submitAdjustment} className="form-grid">
              <label>Account
                <select value={adjustForm.accountId} onChange={(e) => setAdjustForm({ ...adjustForm, accountId: e.target.value })} required>
                  <option value="">Select account</option>
                  {accounts.map((account) => <option key={account.id} value={account.id}>{account.name} — {money(account.currentBalance)}</option>)}
                </select>
              </label>
              <label>Direction
                <select value={adjustForm.direction} onChange={(e) => setAdjustForm({ ...adjustForm, direction: e.target.value })}>
                  <option value="IN">Increase balance</option>
                  <option value="OUT">Decrease balance</option>
                </select>
              </label>
              <label>Amount
                <input type="number" min="0.01" step="0.01" value={adjustForm.amount} onChange={(e) => setAdjustForm({ ...adjustForm, amount: e.target.value })} required />
              </label>
              <label>Description
                <input value={adjustForm.description} onChange={(e) => setAdjustForm({ ...adjustForm, description: e.target.value })} placeholder="Reason for adjustment" required />
              </label>
              <button className="secondary-btn">Save Adjustment</button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
