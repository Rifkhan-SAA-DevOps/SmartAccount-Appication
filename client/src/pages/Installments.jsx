import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CalendarDays, CircleDollarSign, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyForm = { customerId: '', invoiceId: '', title: '', principalAmount: 0, downPayment: 0, interestRate: 0, installmentCount: 6, frequency: 'MONTHLY', startDate: new Date().toISOString().slice(0, 10), penaltyRate: 0, notes: '', downPaymentMethod: 'CASH', downPaymentBankAccountId: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'completed' || s === 'paid') return 'paid';
  if (s === 'overdue' || s === 'defaulted' || s === 'cancelled') return 'cancelled';
  if (s === 'partial') return 'unpaid';
  return 'partial';
}

export default function Installments() {
  const [summary, setSummary] = useState(null);
  const [plans, setPlans] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [filters, setFilters] = useState({ q: '', status: '', customerId: '' });
  const [selected, setSelected] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentAccountId, setPaymentAccountId] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, plansRes, customersRes, invoicesRes, accountsRes] = await Promise.all([
      api.get('/installments/summary'),
      api.get('/installments/plans', { params }),
      api.get('/customers'),
      api.get('/invoices'),
      api.get('/cashbank/accounts')
    ]);
    setSummary(summaryRes.data);
    setPlans(plansRes.data || []);
    setCustomers(customersRes.data || []);
    setInvoices(invoicesRes.data || []);
    setAccounts(accountsRes.data || []);
    setPaymentAccountId((old) => old || accountsRes.data?.[0]?.id || '');
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load installments')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const payableInvoices = useMemo(() => invoices.filter((i) => Number(i.balance || 0) > 0 && i.customerId), [invoices]);
  const projected = useMemo(() => {
    const principal = Number(form.principalAmount || 0);
    const down = Number(form.downPayment || 0);
    const financed = Math.max(0, principal - down);
    const interest = financed * Number(form.interestRate || 0) / 100;
    const total = financed + interest;
    return { financed, interest, total, per: Number(form.installmentCount || 1) > 0 ? total / Number(form.installmentCount || 1) : 0 };
  }, [form]);

  function selectInvoice(id) {
    const invoice = invoices.find((i) => i.id === id);
    setForm((old) => ({
      ...old,
      invoiceId: id,
      customerId: invoice?.customerId || old.customerId,
      principalAmount: Number(invoice?.balance || old.principalAmount || 0),
      title: invoice ? `Installment plan for ${invoice.invoiceNo}` : old.title
    }));
  }

  async function createPlan(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/installments/plans', {
        ...form,
        invoiceId: form.invoiceId || null,
        principalAmount: Number(form.principalAmount || 0),
        downPayment: Number(form.downPayment || 0),
        interestRate: Number(form.interestRate || 0),
        installmentCount: Number(form.installmentCount || 1),
        penaltyRate: Number(form.penaltyRate || 0),
        downPaymentBankAccountId: form.downPaymentBankAccountId || null
      });
      setForm({ ...emptyForm, downPaymentBankAccountId: accounts[0]?.id || '' });
      flash('Installment plan created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create installment plan'); }
    finally { setSaving(false); }
  }

  async function openPlan(row) {
    setError('');
    try {
      const { data } = await api.get(`/installments/plans/${row.id}`);
      setSelected(data);
    } catch (e) { setError(e.response?.data?.message || 'Failed to open plan'); }
  }

  async function payPlan(row) {
    const amount = window.prompt(`Payment amount for ${row.planNo}`, row.nextDue?.balance || row.balance || 0);
    if (amount === null) return;
    setError('');
    try {
      const { data } = await api.post(`/installments/plans/${row.id}/pay`, { amount: Number(amount), method: paymentMethod, bankAccountId: paymentAccountId || null, notes: `Installment payment for ${row.planNo}` });
      flash(`Payment received for ${row.planNo}`);
      setSelected(data.plan);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to receive payment'); }
  }

  async function markStatus(row, status) {
    setError('');
    try {
      await api.patch(`/installments/plans/${row.id}/status`, { status });
      flash(`${row.planNo} changed to ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to change status'); }
  }

  async function createAlerts() {
    setError('');
    try {
      const { data } = await api.post('/installments/alerts/overdue');
      flash(`${data.created} overdue installment alert(s) created`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate alerts'); }
  }

  const columns = [
    { key: 'planNo', label: 'Plan', render: (r) => <><strong>{r.planNo}</strong><span className="table-subtext">{r.title}</span></> },
    { key: 'customerName', label: 'Customer', render: (r) => <>{r.customerName}<span className="table-subtext">{r.customerPhone || r.invoiceNo}</span></> },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.overdueCount > 0 && <span className="table-subtext danger-text">{r.overdueCount} overdue</span>}</> },
    { key: 'totalPayable', label: 'Total', render: (r) => <><strong>{money(r.totalPayable)}</strong><span className="table-subtext">Paid {money(r.paidAmount)}</span></> },
    { key: 'balance', label: 'Balance', render: (r) => <><strong>{money(r.balance)}</strong><span className="table-subtext">{r.progress || 0}% paid</span></> },
    { key: 'nextDue', label: 'Next Due', render: (r) => <>{r.nextDue ? `${dateOnly(r.nextDue.dueDate)} · ${money(r.nextDue.balance)}` : '-'}</> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row installment-actions"><button className="mini-action" onClick={() => openPlan(r)}>Open</button>{r.status === 'ACTIVE' && <button className="mini-action" onClick={() => payPlan(r)}>Pay</button>}{r.status === 'ACTIVE' && <button className="mini-danger" onClick={() => markStatus(r, 'DEFAULTED')}>Default</button>}</div> }
  ];

  const scheduleColumns = [
    { key: 'installmentNo', label: '#' },
    { key: 'dueDate', label: 'Due Date', render: (r) => dateOnly(r.dueDate) },
    { key: 'principal', label: 'Principal', render: (r) => money(r.principal) },
    { key: 'interest', label: 'Interest', render: (r) => money(r.interest) },
    { key: 'amount', label: 'Amount', render: (r) => money(r.amount) },
    { key: 'paidAmount', label: 'Paid', render: (r) => money(r.paidAmount) },
    { key: 'balance', label: 'Balance', render: (r) => money(r.balance) },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  return (
    <div className="page installments-page">
      <div className="page-header">
        <div><span className="eyebrow">Installment / hire purchase</span><h1>Installment Management</h1><p>Manage down payments, installment schedules, due dates, collections, overdue alerts and invoice-linked hire purchase plans.</p></div>
        <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={createAlerts}><AlertTriangle size={16}/> Overdue Alerts</button></div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid installment-stat-grid">
        <StatCard title="Active Plans" value={summary?.active || 0} subtitle={`${summary?.completed || 0} completed`} />
        <StatCard title="Outstanding" value={money(summary?.outstanding)} subtitle="Installment balance" tone="orange" />
        <StatCard title="Collected" value={money(summary?.collected)} subtitle="Received payments" tone="green" />
        <StatCard title="Overdue" value={summary?.overdueCount || 0} subtitle={`${summary?.dueThisWeek || 0} due this week`} tone="red" />
      </div>

      <div className="installment-grid">
        <section className="panel installment-list-panel">
          <div className="section-title-row"><h2><CircleDollarSign size={20}/> Installment Plans</h2><div className="filters-row installment-filter"><input placeholder="Search plan/customer" value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})}/><select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All statuses</option><option>ACTIVE</option><option>COMPLETED</option><option>DEFAULTED</option><option>CANCELLED</option></select><select value={filters.customerId} onChange={(e)=>setFilters({...filters,customerId:e.target.value})}><option value="">All customers</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select><button className="secondary-btn" onClick={load}>Apply</button></div></div>
          <div className="installment-payment-bar"><label>Receive method<select value={paymentMethod} onChange={(e)=>setPaymentMethod(e.target.value)}>{['CASH','CARD','BANK_TRANSFER','CHEQUE','ONLINE'].map((m)=><option key={m}>{m}</option>)}</select></label><label>Cash/Bank account<select value={paymentAccountId} onChange={(e)=>setPaymentAccountId(e.target.value)}><option value="">No account</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
          <DataTable columns={columns} rows={plans} empty="No installment plans yet" />
        </section>

        <section className="panel installment-form-panel">
          <h2><CalendarDays size={20}/> Create Plan</h2>
          <form className="form-grid compact" onSubmit={createPlan}>
            <label>Customer<select value={form.customerId} onChange={(e)=>setForm({...form,customerId:e.target.value})} required><option value="">Select customer</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name} · balance {money(c.balance)}</option>)}</select></label>
            <label>Invoice<select value={form.invoiceId} onChange={(e)=>selectInvoice(e.target.value)}><option value="">Manual / no invoice</option>{payableInvoices.map((i)=><option key={i.id} value={i.id}>{i.invoiceNo} · {i.customer?.name || ''} · bal {money(i.balance)}</option>)}</select></label>
            <label>Title<input required value={form.title} onChange={(e)=>setForm({...form,title:e.target.value})} placeholder="Phone installment / hire purchase" /></label>
            <div className="form-grid two"><label>Principal<input type="number" min="0" value={form.principalAmount} onChange={(e)=>setForm({...form,principalAmount:e.target.value})} required /></label><label>Down payment<input type="number" min="0" value={form.downPayment} onChange={(e)=>setForm({...form,downPayment:e.target.value})} /></label></div>
            <div className="form-grid two"><label>Interest %<input type="number" min="0" value={form.interestRate} onChange={(e)=>setForm({...form,interestRate:e.target.value})} /></label><label>Installments<input type="number" min="1" max="120" value={form.installmentCount} onChange={(e)=>setForm({...form,installmentCount:e.target.value})} required /></label></div>
            <div className="form-grid two"><label>Frequency<select value={form.frequency} onChange={(e)=>setForm({...form,frequency:e.target.value})}><option>MONTHLY</option><option>WEEKLY</option><option>DAILY</option></select></label><label>Start date<input type="date" value={form.startDate} onChange={(e)=>setForm({...form,startDate:e.target.value})} required /></label></div>
            <div className="installment-preview"><div><span>Financed</span><strong>{money(projected.financed)}</strong></div><div><span>Interest</span><strong>{money(projected.interest)}</strong></div><div><span>Total</span><strong>{money(projected.total)}</strong></div><div><span>Per installment</span><strong>{money(projected.per)}</strong></div></div>
            <label>Down payment account<select value={form.downPaymentBankAccountId} onChange={(e)=>setForm({...form,downPaymentBankAccountId:e.target.value})}><option value="">No account</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            <label>Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></label>
            <button className="primary-btn" disabled={saving}>Create Installment Plan</button>
          </form>
        </section>
      </div>

      {selected && <section className="panel installment-detail-panel">
        <div className="section-title-row"><div><h2>{selected.planNo} · {selected.title}</h2><p>{selected.customerName} · Invoice {selected.invoiceNo} · Balance {money(selected.balance)}</p></div><div className="actions-row"><button className="secondary-btn" onClick={() => payPlan(selected)}>Receive Payment</button><button className="ghost-btn" onClick={() => setSelected(null)}>Close</button></div></div>
        <DataTable columns={scheduleColumns} rows={selected.schedules || []} empty="No schedule" />
      </section>}
    </div>
  );
}
