import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, CalendarDays, LineChart, Plus, RefreshCw, TrendingUp } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const currentYear = new Date().getFullYear();
const emptyBudget = { name: `${currentYear} Operating Budget`, fiscalYear: currentYear, periodType: 'MONTHLY', status: 'DRAFT', startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31`, notes: '' };
const emptyLine = { ledgerAccountId: '', lineType: 'EXPENSE', periodMonth: '', periodLabel: '', description: '', budgetAmount: 0, alertPercent: 100, notes: '' };
const emptyScenario = { name: `${currentYear} Cash Flow Forecast`, type: 'CASH_FLOW', status: 'DRAFT', startDate: `${currentYear}-01-01`, endDate: `${currentYear}-12-31`, openingCash: 0, growthRate: 0, collectionDays: 0, paymentDays: 0, notes: '' };
const emptyForecast = { months: 12, monthlySales: 0, monthlyOtherInflows: 0, monthlyPurchases: 0, monthlyPayroll: 0, monthlyExpenses: 0, growthRate: 0 };

function money(v) { return `LKR ${Number(v || 0).toLocaleString()}`; }
function d(v) { return v ? new Date(v).toLocaleDateString() : '-'; }
function pct(v) { return `${Number(v || 0).toFixed(1)}%`; }
function statusClass(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'approved' || s === 'active') return 'paid';
  if (s === 'closed') return 'partial';
  if (s === 'cancelled') return 'cancelled';
  return 'unpaid';
}

export default function BudgetingForecasting() {
  const [summary, setSummary] = useState(null);
  const [budgets, setBudgets] = useState([]);
  const [scenarios, setScenarios] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [selectedBudgetId, setSelectedBudgetId] = useState('');
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [variance, setVariance] = useState(null);
  const [budgetForm, setBudgetForm] = useState(emptyBudget);
  const [lineForm, setLineForm] = useState(emptyLine);
  const [scenarioForm, setScenarioForm] = useState(emptyScenario);
  const [forecastForm, setForecastForm] = useState(emptyForecast);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const [summaryRes, budgetRes, scenarioRes, accountRes] = await Promise.all([
      api.get('/budgeting/summary'),
      api.get('/budgeting/budgets'),
      api.get('/budgeting/scenarios'),
      api.get('/budgeting/accounts')
    ]);
    const budgetRows = budgetRes.data || [];
    const scenarioRows = scenarioRes.data || [];
    setSummary(summaryRes.data);
    setBudgets(budgetRows);
    setScenarios(scenarioRows);
    setAccounts(accountRes.data || []);
    const nextBudgetId = selectedBudgetId || summaryRes.data?.currentBudget?.id || budgetRows[0]?.id || '';
    const nextScenarioId = selectedScenarioId || scenarioRows[0]?.id || '';
    setSelectedBudgetId(nextBudgetId);
    setSelectedScenarioId(nextScenarioId);
    if (nextBudgetId) await loadVariance(nextBudgetId);
  }

  async function loadVariance(id = selectedBudgetId) {
    if (!id) { setVariance(null); return; }
    const { data } = await api.get(`/budgeting/budgets/${id}/variance`);
    setVariance(data);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load budgeting data')); }, []);
  useEffect(() => { if (selectedBudgetId) loadVariance(selectedBudgetId).catch(() => {}); }, [selectedBudgetId]);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  const selectedScenario = useMemo(() => scenarios.find((s) => s.id === selectedScenarioId), [scenarios, selectedScenarioId]);

  async function createBudget(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/budgeting/budgets', budgetForm);
      setBudgetForm(emptyBudget);
      setSelectedBudgetId(data.id);
      flash('Budget created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create budget'); }
    finally { setSaving(false); }
  }

  async function changeBudgetStatus(row, status) {
    setError('');
    try {
      await api.patch(`/budgeting/budgets/${row.id}/status`, { status, notes: `Changed to ${status}` });
      flash(`${row.budgetNo} changed to ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to change budget status'); }
  }

  async function addLine(e) {
    e.preventDefault();
    if (!selectedBudgetId) return setError('Create or select a budget first');
    setSaving(true); setError('');
    try {
      await api.post(`/budgeting/budgets/${selectedBudgetId}/lines`, { ...lineForm, ledgerAccountId: lineForm.ledgerAccountId || null, periodMonth: lineForm.periodMonth || null, budgetAmount: Number(lineForm.budgetAmount || 0), alertPercent: Number(lineForm.alertPercent || 100) });
      setLineForm(emptyLine);
      flash('Budget line added');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to add budget line'); }
    finally { setSaving(false); }
  }

  async function deleteLine(lineId) {
    if (!window.confirm('Remove this budget line?')) return;
    setError('');
    try {
      await api.delete(`/budgeting/budget-lines/${lineId}`);
      flash('Budget line removed');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to remove budget line'); }
  }

  async function generateAlerts() {
    if (!selectedBudgetId) return;
    setError('');
    try {
      const { data } = await api.post(`/budgeting/budgets/${selectedBudgetId}/alerts`);
      flash(`${data.created} budget alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create budget alerts'); }
  }

  async function createScenario(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      const { data } = await api.post('/budgeting/scenarios', scenarioForm);
      setScenarioForm(emptyScenario);
      setSelectedScenarioId(data.id);
      flash('Forecast scenario created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create forecast scenario'); }
    finally { setSaving(false); }
  }

  async function generateForecast(e) {
    e.preventDefault();
    if (!selectedScenarioId) return setError('Create or select a forecast scenario first');
    setSaving(true); setError('');
    try {
      await api.post(`/budgeting/scenarios/${selectedScenarioId}/generate-cash-flow`, forecastForm);
      flash('Cash-flow forecast generated');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate cash-flow forecast'); }
    finally { setSaving(false); }
  }

  const budgetColumns = [
    { key: 'budget', label: 'Budget', render: (r) => <><strong>{r.budgetNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'period', label: 'Period', render: (r) => <>{r.fiscalYear}<span className="table-subtext">{d(r.startDate)} - {d(r.endDate)}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'income', label: 'Income Budget', render: (r) => money(r.totalIncomeBudget) },
    { key: 'expense', label: 'Expense Budget', render: (r) => money(r.totalExpenseBudget) },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row compact-actions"><button className="mini-action" onClick={() => setSelectedBudgetId(r.id)}>View</button>{r.status === 'DRAFT' && <button className="mini-action" onClick={() => changeBudgetStatus(r, 'ACTIVE')}>Activate</button>}{['DRAFT','ACTIVE'].includes(r.status) && <button className="mini-action" onClick={() => changeBudgetStatus(r, 'APPROVED')}>Approve</button>}{!['CLOSED','CANCELLED'].includes(r.status) && <button className="mini-danger" onClick={() => changeBudgetStatus(r, 'CLOSED')}>Close</button>}</div> }
  ];

  const varianceColumns = [
    { key: 'line', label: 'Line', render: (r) => <><strong>{r.description}</strong><span className="table-subtext">{r.ledgerName} · {r.periodLabel || r.periodMonth || 'All year'}</span></> },
    { key: 'type', label: 'Type', render: (r) => <span className="badge partial">{r.lineType}</span> },
    { key: 'budget', label: 'Budget', render: (r) => money(r.budgetAmount) },
    { key: 'actual', label: 'Actual', render: (r) => <>{money(r.actualAmount)}<span className="table-subtext">{pct(r.usedPercent)} used</span></> },
    { key: 'variance', label: 'Variance', render: (r) => <span className={r.isOverBudget ? 'danger-text' : ''}>{money(r.variance)}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <button className="mini-danger" onClick={() => deleteLine(r.id)}>Remove</button> }
  ];

  const scenarioColumns = [
    { key: 'scenario', label: 'Scenario', render: (r) => <><strong>{r.scenarioNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'period', label: 'Period', render: (r) => <>{d(r.startDate)} - {d(r.endDate)}<span className="table-subtext">Growth {pct(r.growthRate)}</span></> },
    { key: 'cash', label: 'Cash', render: (r) => <>{money(r.finalClosingCash)}<span className="table-subtext">Opening {money(r.openingCash)}</span></> },
    { key: 'lines', label: 'Lines', render: (r) => `${r.lineCount || 0} month(s)` },
    { key: 'actions', label: 'Actions', render: (r) => <button className="mini-action" onClick={() => setSelectedScenarioId(r.id)}>Use</button> }
  ];

  const forecastLineColumns = [
    { key: 'period', label: 'Period', render: (r) => <strong>{r.periodLabel}</strong> },
    { key: 'in', label: 'Inflows', render: (r) => money(r.expectedInflows) },
    { key: 'out', label: 'Outflows', render: (r) => money(r.expectedOutflows) },
    { key: 'net', label: 'Net', render: (r) => <span className={Number(r.netCashFlow || 0) < 0 ? 'danger-text' : ''}>{money(r.netCashFlow)}</span> },
    { key: 'closing', label: 'Closing Cash', render: (r) => <strong>{money(r.closingCash)}</strong> }
  ];

  return <div className="page budgeting-page">
    <div className="page-header">
      <div><span className="eyebrow">Budgeting / forecasting</span><h1>Budgeting & Forecasting</h1><p>Plan income and expenses, compare budget vs actual ledger results, and create cash-flow forecasts before cash problems happen.</p></div>
      <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={generateAlerts}><AlertTriangle size={16}/> Budget alerts</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid budgeting-stat-grid">
      <StatCard title="Active Budgets" value={summary?.activeBudgets || 0} subtitle={`${summary?.draftBudgets || 0} draft`} />
      <StatCard title="Current Expense Budget" value={money(summary?.currentBudget?.totalExpenseBudget)} subtitle={summary?.currentBudget?.name || 'No active budget'} tone="orange" />
      <StatCard title="Over Budget Lines" value={summary?.currentBudget?.overBudgetCount || 0} subtitle={`Variance ${money(summary?.currentBudget?.totalVariance)}`} tone="red" />
      <StatCard title="Forecast Closing Cash" value={money(summary?.recentForecast?.closingCash)} subtitle={summary?.recentForecast?.name || 'No forecast'} tone="green" />
    </div>

    <div className="budgeting-grid">
      <section className="panel budget-main-panel">
        <div className="section-title-row"><h2><BarChart3 size={20}/> Budget Register</h2><select value={selectedBudgetId} onChange={(e)=>setSelectedBudgetId(e.target.value)}><option value="">Select budget</option>{budgets.map((b)=><option key={b.id} value={b.id}>{b.budgetNo} · {b.name}</option>)}</select></div>
        <DataTable columns={budgetColumns} rows={budgets} empty="No budgets found" />
      </section>

      <aside className="panel budget-side-panel">
        <h2><Plus size={20}/> Create Budget</h2>
        <form className="form-grid compact" onSubmit={createBudget}>
          <label>Name<input value={budgetForm.name} onChange={(e)=>setBudgetForm({...budgetForm,name:e.target.value})} required /></label>
          <div className="form-grid two"><label>Fiscal year<input type="number" value={budgetForm.fiscalYear} onChange={(e)=>setBudgetForm({...budgetForm,fiscalYear:e.target.value})} /></label><label>Type<select value={budgetForm.periodType} onChange={(e)=>setBudgetForm({...budgetForm,periodType:e.target.value})}>{['MONTHLY','QUARTERLY','YEARLY'].map((s)=><option key={s}>{s}</option>)}</select></label></div>
          <div className="form-grid two"><label>Start<input type="date" value={budgetForm.startDate} onChange={(e)=>setBudgetForm({...budgetForm,startDate:e.target.value})} required /></label><label>End<input type="date" value={budgetForm.endDate} onChange={(e)=>setBudgetForm({...budgetForm,endDate:e.target.value})} required /></label></div>
          <label>Notes<input value={budgetForm.notes} onChange={(e)=>setBudgetForm({...budgetForm,notes:e.target.value})} /></label>
          <button className="primary-btn" disabled={saving}><CalendarDays size={18}/> Save Budget</button>
        </form>

        <h2><TrendingUp size={20}/> Add Budget Line</h2>
        <form className="form-grid compact" onSubmit={addLine}>
          <label>Budget<select value={selectedBudgetId} onChange={(e)=>setSelectedBudgetId(e.target.value)} required><option value="">Select budget</option>{budgets.map((b)=><option key={b.id} value={b.id}>{b.budgetNo} · {b.name}</option>)}</select></label>
          <label>Ledger account<select value={lineForm.ledgerAccountId} onChange={(e)=>setLineForm({...lineForm,ledgerAccountId:e.target.value, description: accounts.find(a=>a.id===e.target.value)?.name || lineForm.description})}><option value="">Manual / no account</option>{accounts.map((a)=><option key={a.id} value={a.id}>{a.code} · {a.name} · {a.type}</option>)}</select></label>
          <div className="form-grid two"><label>Type<select value={lineForm.lineType} onChange={(e)=>setLineForm({...lineForm,lineType:e.target.value})}>{['INCOME','EXPENSE','CASH_INFLOW','CASH_OUTFLOW','OTHER'].map((s)=><option key={s}>{s}</option>)}</select></label><label>Month<input type="number" min="1" max="12" value={lineForm.periodMonth} onChange={(e)=>setLineForm({...lineForm,periodMonth:e.target.value})} /></label></div>
          <label>Description<input value={lineForm.description} onChange={(e)=>setLineForm({...lineForm,description:e.target.value})} required /></label>
          <div className="form-grid two"><label>Budget amount<input type="number" min="0" value={lineForm.budgetAmount} onChange={(e)=>setLineForm({...lineForm,budgetAmount:e.target.value})} /></label><label>Alert %<input type="number" min="1" value={lineForm.alertPercent} onChange={(e)=>setLineForm({...lineForm,alertPercent:e.target.value})} /></label></div>
          <button className="secondary-btn" disabled={saving || !selectedBudgetId}>Add Line</button>
        </form>
      </aside>
    </div>

    <section className="panel budget-variance-panel">
      <div className="section-title-row"><h2><AlertTriangle size={20}/> Budget vs Actual</h2><div className="budget-variance-total"><span>Budget {money(variance?.totalBudget)}</span><span>Actual {money(variance?.totalActual)}</span><span>Variance {money(variance?.totalVariance)}</span></div></div>
      <DataTable columns={varianceColumns} rows={variance?.rows || []} empty="No budget lines yet" />
    </section>

    <div className="forecast-grid">
      <section className="panel">
        <div className="section-title-row"><h2><LineChart size={20}/> Forecast Scenarios</h2><select value={selectedScenarioId} onChange={(e)=>setSelectedScenarioId(e.target.value)}><option value="">Select scenario</option>{scenarios.map((s)=><option key={s.id} value={s.id}>{s.scenarioNo} · {s.name}</option>)}</select></div>
        <DataTable columns={scenarioColumns} rows={scenarios} empty="No forecast scenarios found" />
        {selectedScenario && <div className="forecast-lines"><h3>{selectedScenario.name} lines</h3><DataTable columns={forecastLineColumns} rows={selectedScenario.lines || []} empty="Generate forecast lines to see monthly cash flow" /></div>}
      </section>

      <aside className="panel forecast-side-panel">
        <h2><Plus size={20}/> Create Forecast Scenario</h2>
        <form className="form-grid compact" onSubmit={createScenario}>
          <label>Name<input value={scenarioForm.name} onChange={(e)=>setScenarioForm({...scenarioForm,name:e.target.value})} required /></label>
          <div className="form-grid two"><label>Start<input type="date" value={scenarioForm.startDate} onChange={(e)=>setScenarioForm({...scenarioForm,startDate:e.target.value})} required /></label><label>End<input type="date" value={scenarioForm.endDate} onChange={(e)=>setScenarioForm({...scenarioForm,endDate:e.target.value})} required /></label></div>
          <div className="form-grid two"><label>Opening cash<input type="number" value={scenarioForm.openingCash} onChange={(e)=>setScenarioForm({...scenarioForm,openingCash:e.target.value})} /></label><label>Growth %<input type="number" value={scenarioForm.growthRate} onChange={(e)=>setScenarioForm({...scenarioForm,growthRate:e.target.value})} /></label></div>
          <button className="primary-btn" disabled={saving}>Save Scenario</button>
        </form>

        <h2><LineChart size={20}/> Generate Cash Flow</h2>
        <form className="form-grid compact" onSubmit={generateForecast}>
          <label>Scenario<select value={selectedScenarioId} onChange={(e)=>setSelectedScenarioId(e.target.value)} required><option value="">Select scenario</option>{scenarios.map((s)=><option key={s.id} value={s.id}>{s.scenarioNo} · {s.name}</option>)}</select></label>
          <div className="form-grid two"><label>Months<input type="number" min="1" max="36" value={forecastForm.months} onChange={(e)=>setForecastForm({...forecastForm,months:e.target.value})} /></label><label>Growth %<input type="number" value={forecastForm.growthRate} onChange={(e)=>setForecastForm({...forecastForm,growthRate:e.target.value})} /></label></div>
          <label>Monthly sales inflow<input type="number" min="0" value={forecastForm.monthlySales} onChange={(e)=>setForecastForm({...forecastForm,monthlySales:e.target.value})} /></label>
          <label>Other monthly inflows<input type="number" min="0" value={forecastForm.monthlyOtherInflows} onChange={(e)=>setForecastForm({...forecastForm,monthlyOtherInflows:e.target.value})} /></label>
          <label>Monthly purchases<input type="number" min="0" value={forecastForm.monthlyPurchases} onChange={(e)=>setForecastForm({...forecastForm,monthlyPurchases:e.target.value})} /></label>
          <label>Monthly payroll<input type="number" min="0" value={forecastForm.monthlyPayroll} onChange={(e)=>setForecastForm({...forecastForm,monthlyPayroll:e.target.value})} /></label>
          <label>Other monthly expenses<input type="number" min="0" value={forecastForm.monthlyExpenses} onChange={(e)=>setForecastForm({...forecastForm,monthlyExpenses:e.target.value})} /></label>
          <button className="secondary-btn" disabled={saving || !selectedScenarioId}>Generate Forecast</button>
        </form>
      </aside>
    </div>
  </div>;
}
