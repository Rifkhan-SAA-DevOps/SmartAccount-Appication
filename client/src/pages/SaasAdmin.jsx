import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/http.js';

const STATUS_OPTIONS = ['ALL', 'ACTIVE', 'TRIAL', 'SUSPENDED', 'EXPIRED'];

function platformHeaders() {
  const token = localStorage.getItem('smartledger_platform_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString()}`;
}

function dateOnly(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function endDate(subscription) {
  if (!subscription) return '-';
  return subscription.status === 'trial' ? dateOnly(subscription.trialEndsAt) : dateOnly(subscription.currentPeriodEndsAt);
}

export default function SaasAdmin() {
  const [token, setToken] = useState(localStorage.getItem('smartledger_platform_token') || '');
  const [login, setLogin] = useState({ email: 'owner@smartledger.local', password: 'ChangeMe@12345' });
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [plans, setPlans] = useState([]);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [selected, setSelected] = useState(null);
  const [saving, setSaving] = useState(false);
  const [planForm, setPlanForm] = useState({
    name: '', code: '', monthlyPrice: 0, maxUsers: 1, maxProducts: 50, maxInvoicesPerMonth: 100, maxBranches: 1,
    allowPos: true, allowInventory: true, allowReports: true, allowAdvancedReports: false, allowApi: false, allowMultiWarehouse: false, allowApprovals: false, allowManufacturing: false, allowBatchTracking: false, allowServiceJobs: false, allowCrm: false, allowQuotations: false, allowHrPayroll: false, allowProjects: false, allowInstallments: false, allowBankReconciliation: false, allowFixedAssets: false, allowMultiCurrency: false, allowLoyalty: false, allowDelivery: false, allowBudgeting: false, allowCampaigns: false, allowDashboardBuilder: false
  });

  async function loadAll() {
    if (!localStorage.getItem('smartledger_platform_token')) return;
    const headers = platformHeaders();
    const [overviewRes, tenantsRes, plansRes] = await Promise.all([
      api.get('/saas-admin/overview', { headers }),
      api.get('/saas-admin/tenants', { params: { q, status }, headers }),
      api.get('/saas-admin/plans', { headers })
    ]);
    setOverview(overviewRes.data);
    setTenants(tenantsRes.data);
    setPlans(plansRes.data);
  }

  useEffect(() => { loadAll().catch((e) => setError(e.response?.data?.message || e.message)); }, [token]);

  async function handleLogin(e) {
    e.preventDefault();
    setError('');
    try {
      const { data } = await api.post('/saas-admin/login', login);
      localStorage.setItem('smartledger_platform_token', data.token);
      setToken(data.token);
    } catch (e) {
      setError(e.response?.data?.message || 'Login failed');
    }
  }

  function logout() {
    localStorage.removeItem('smartledger_platform_token');
    setToken('');
    setOverview(null);
    setTenants([]);
    setPlans([]);
  }

  async function reloadTenants() {
    setError('');
    try {
      const { data } = await api.get('/saas-admin/tenants', { params: { q, status }, headers: platformHeaders() });
      setTenants(data);
      const overviewRes = await api.get('/saas-admin/overview', { headers: platformHeaders() });
      setOverview(overviewRes.data);
    } catch (e) { setError(e.response?.data?.message || e.message); }
  }

  async function updateTenantStatus(tenantId, nextStatus) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/saas-admin/tenants/${tenantId}/status`, { status: nextStatus }, { headers: platformHeaders() });
      await reloadTenants();
      if (selected?.id === tenantId) await loadTenantDetail(tenantId);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  async function extendTrial(tenantId, days = 14) {
    setSaving(true);
    setError('');
    try {
      await api.post(`/saas-admin/tenants/${tenantId}/extend-trial`, { days }, { headers: platformHeaders() });
      await reloadTenants();
      if (selected?.id === tenantId) await loadTenantDetail(tenantId);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  async function renew(tenantId, planCode, months = 1) {
    setSaving(true);
    setError('');
    try {
      await api.post(`/saas-admin/tenants/${tenantId}/renew`, { planCode, months }, { headers: platformHeaders() });
      await reloadTenants();
      if (selected?.id === tenantId) await loadTenantDetail(tenantId);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  async function changePlan(tenantId, planCode) {
    setSaving(true);
    setError('');
    try {
      await api.patch(`/saas-admin/tenants/${tenantId}/subscription`, { planCode }, { headers: platformHeaders() });
      await reloadTenants();
      if (selected?.id === tenantId) await loadTenantDetail(tenantId);
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  async function loadTenantDetail(tenantId) {
    setError('');
    try {
      const { data } = await api.get(`/saas-admin/tenants/${tenantId}`, { headers: platformHeaders() });
      setSelected(data.tenant);
    } catch (e) { setError(e.response?.data?.message || e.message); }
  }

  async function createPlan(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/saas-admin/plans', planForm, { headers: platformHeaders() });
      setPlanForm({ ...planForm, name: '', code: '' });
      await loadAll();
    } catch (e) { setError(e.response?.data?.message || e.message); }
    finally { setSaving(false); }
  }

  const defaultPaidPlan = useMemo(() => plans.find((p) => p.code !== 'FREE_TRIAL')?.code || plans[0]?.code, [plans]);

  if (!token) {
    return (
      <div className="auth-page saas-bg">
        <form className="auth-card" onSubmit={handleLogin}>
          <div className="brand big"><div className="brand-mark">SL</div><div><strong>SaaS Owner</strong><span>SmartLedger platform control</span></div></div>
          <h1>Platform admin login</h1>
          <p>Use this panel to manage all companies, trials, subscriptions, suspensions, and plan limits.</p>
          {error && <div className="error-box">{error}</div>}
          <div className="form-grid">
            <label>Email<input value={login.email} onChange={(e)=>setLogin({...login,email:e.target.value})} /></label>
            <label>Password<input type="password" value={login.password} onChange={(e)=>setLogin({...login,password:e.target.value})} /></label>
            <button className="primary-btn">Login to SaaS Admin</button>
          </div>
          <p className="center-text"><Link to="/login">Back to company login</Link></p>
        </form>
      </div>
    );
  }

  return (
    <div className="saas-admin-page">
      <aside className="saas-rail no-print">
        <div className="brand"><div className="brand-mark">SL</div><div><strong>SaaS Admin</strong><span>Owner control panel</span></div></div>
        <a href="#overview">Overview</a>
        <a href="#companies">Companies</a>
        <a href="#plans">Plans</a>
        <Link to="/login">Company Login</Link>
        <button className="ghost-btn" onClick={logout}>Logout</button>
      </aside>
      <main className="saas-main">
        <section id="overview" className="page">
          <div className="page-head">
            <div><h1>SaaS Owner Dashboard</h1><p>Control your customers, free trials, paid plans, limits, and suspended accounts.</p></div>
            <button className="secondary-btn" onClick={loadAll}>Refresh</button>
          </div>
          {error && <div className="error-box">{error}</div>}
          {overview && <div className="stat-grid">
            <div className="stat-card"><span>Total Companies</span><strong>{overview.tenants.total}</strong><small>{overview.tenants.active} active · {overview.tenants.trial} trial</small><div className="stat-orb" /></div>
            <div className="stat-card tone-green"><span>MRR Estimate</span><strong>{money(overview.billing.monthlyRecurringRevenue)}</strong><small>Based on active/paid subscriptions</small><div className="stat-orb" /></div>
            <div className="stat-card tone-orange"><span>Expiring Soon</span><strong>{overview.billing.expiringSoon}</strong><small>Trials/subscriptions ending in 7 days</small><div className="stat-orb" /></div>
            <div className="stat-card tone-blue"><span>Monthly Invoices</span><strong>{overview.usage.invoicesThisMonth}</strong><small>{overview.usage.users} users · {overview.usage.products} products</small><div className="stat-orb" /></div>
          </div>}
        </section>

        <section id="companies" className="panel saas-section">
          <div className="section-head">
            <div><h2>Companies / Tenants</h2><p>Search companies, change plans, extend trials, renew paid access, or suspend accounts.</p></div>
            <div className="actions-row">
              <input placeholder="Search company..." value={q} onChange={(e)=>setQ(e.target.value)} />
              <select value={status} onChange={(e)=>setStatus(e.target.value)}>{STATUS_OPTIONS.map((s)=><option key={s}>{s}</option>)}</select>
              <button className="secondary-btn" onClick={reloadTenants}>Search</button>
            </div>
          </div>
          <div className="table-card">
            <table>
              <thead><tr><th>Company</th><th>Status</th><th>Plan</th><th>Usage</th><th>Ends</th><th>Actions</th></tr></thead>
              <tbody>{tenants.map((t)=>(
                <tr key={t.id}>
                  <td><strong>{t.name}</strong><span className="muted-line">{t.code} · {t.email || '-'}</span></td>
                  <td><span className={`badge ${String(t.status).toLowerCase()}`}>{t.status}</span></td>
                  <td>{t.subscription?.plan?.name || '-'}<span className="muted-line">{t.subscription?.status || 'no subscription'}</span></td>
                  <td>{t._count.users} users · {t._count.products} products<span className="muted-line">{t._count.invoices} invoices · {t._count.documents} docs</span></td>
                  <td>{endDate(t.subscription)}</td>
                  <td><div className="actions-row compact-actions">
                    <button className="ghost-btn" onClick={()=>loadTenantDetail(t.id)}>Open</button>
                    <select value={t.subscription?.plan?.code || ''} onChange={(e)=>changePlan(t.id, e.target.value)} disabled={saving}>{plans.map((p)=><option key={p.id} value={p.code}>{p.code}</option>)}</select>
                    <button className="secondary-btn" disabled={saving} onClick={()=>renew(t.id, t.subscription?.plan?.code || defaultPaidPlan, 1)}>Renew 1M</button>
                    <button className="secondary-btn" disabled={saving} onClick={()=>extendTrial(t.id, 14)}>+14 Trial</button>
                    {t.status === 'SUSPENDED' ? <button className="secondary-btn" disabled={saving} onClick={()=>updateTenantStatus(t.id, 'ACTIVE')}>Activate</button> : <button className="mini-danger" disabled={saving} onClick={()=>updateTenantStatus(t.id, 'SUSPENDED')}>Suspend</button>}
                  </div></td>
                </tr>
              ))}<tr style={{display: tenants.length ? 'none' : undefined}}><td colSpan="6" className="empty-cell">No companies found.</td></tr></tbody>
            </table>
          </div>
        </section>

        {selected && <section className="panel saas-section">
          <div className="section-head"><div><h2>{selected.name}</h2><p>{selected.code} · {selected.email || '-'} · {selected.phone || '-'}</p></div><button className="ghost-btn" onClick={()=>setSelected(null)}>Close</button></div>
          <div className="ledger-summary-grid">
            <div><span>Status</span><strong>{selected.status}</strong></div>
            <div><span>Plan</span><strong>{selected.subscription?.plan?.name || '-'}</strong></div>
            <div><span>Users</span><strong>{selected.users?.length || 0}</strong></div>
            <div><span>Branches</span><strong>{selected.branches?.length || 0}</strong></div>
          </div>
          <h3>Users</h3>
          <div className="table-card"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead><tbody>{selected.users?.map((u)=><tr key={u.id}><td>{u.name}</td><td>{u.email}</td><td>{u.role}</td><td>{u.isActive ? 'Active' : 'Disabled'}</td><td>{dateOnly(u.lastLoginAt)}</td></tr>)}</tbody></table></div>
        </section>}

        <section id="plans" className="panel saas-section">
          <div className="section-head"><div><h2>Subscription Plans</h2><p>Create new pricing plans. Existing plan editing can be done through the backend PATCH endpoint.</p></div></div>
          <div className="plan-grid">{plans.map((plan)=><div className="plan-card" key={plan.id}><h2>{plan.name}</h2><strong>{money(plan.monthlyPrice)}/mo</strong><ul><li>{plan.maxUsers} users</li><li>{plan.maxProducts} products</li><li>{plan.maxInvoicesPerMonth} invoices/month</li><li>{plan.maxBranches} branches</li><li>POS: {plan.allowPos ? 'Yes' : 'No'}</li><li>Advanced reports: {plan.allowAdvancedReports ? 'Yes' : 'No'}</li><li>Multi warehouse: {plan.allowMultiWarehouse ? 'Yes' : 'No'}</li><li>Approvals: {plan.allowApprovals ? 'Yes' : 'No'}</li><li>Manufacturing: {plan.allowManufacturing ? 'Yes' : 'No'}</li><li>Batch/expiry: {plan.allowBatchTracking ? 'Yes' : 'No'}</li><li>Service jobs: {plan.allowServiceJobs ? 'Yes' : 'No'}</li><li>CRM: {plan.allowCrm ? 'Yes' : 'No'}</li><li>Quotations: {plan.allowQuotations ? 'Yes' : 'No'}</li><li>HR/Payroll: {plan.allowHrPayroll ? 'Yes' : 'No'}</li><li>Projects/Tasks: {plan.allowProjects ? 'Yes' : 'No'}</li><li>Installments: {plan.allowInstallments ? 'Yes' : 'No'}</li><li>Bank reconciliation: {plan.allowBankReconciliation ? 'Yes' : 'No'}</li><li>Fixed assets: {plan.allowFixedAssets ? 'Yes' : 'No'}</li><li>Multi-currency: {plan.allowMultiCurrency ? 'Yes' : 'No'}</li><li>Loyalty: {plan.allowLoyalty ? 'Yes' : 'No'}</li><li>Delivery: {plan.allowDelivery ? 'Yes' : 'No'}</li><li>Budgeting: {plan.allowBudgeting ? 'Yes' : 'No'}</li><li>Campaigns: {plan.allowCampaigns ? 'Yes' : 'No'}</li><li>Dashboard builder: {plan.allowDashboardBuilder ? 'Yes' : 'No'}</li></ul></div>)}</div>
          <form className="form-grid four plan-create-form" onSubmit={createPlan}>
            <label>Plan name<input value={planForm.name} onChange={(e)=>setPlanForm({...planForm,name:e.target.value})} placeholder="Premium" /></label>
            <label>Code<input value={planForm.code} onChange={(e)=>setPlanForm({...planForm,code:e.target.value})} placeholder="PREMIUM" /></label>
            <label>Monthly price<input type="number" value={planForm.monthlyPrice} onChange={(e)=>setPlanForm({...planForm,monthlyPrice:Number(e.target.value)})} /></label>
            <label>Max users<input type="number" value={planForm.maxUsers} onChange={(e)=>setPlanForm({...planForm,maxUsers:Number(e.target.value)})} /></label>
            <label>Products<input type="number" value={planForm.maxProducts} onChange={(e)=>setPlanForm({...planForm,maxProducts:Number(e.target.value)})} /></label>
            <label>Invoices/month<input type="number" value={planForm.maxInvoicesPerMonth} onChange={(e)=>setPlanForm({...planForm,maxInvoicesPerMonth:Number(e.target.value)})} /></label>
            <label>Branches<input type="number" value={planForm.maxBranches} onChange={(e)=>setPlanForm({...planForm,maxBranches:Number(e.target.value)})} /></label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowPos} onChange={(e)=>setPlanForm({...planForm,allowPos:e.target.checked})} /> POS</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowAdvancedReports} onChange={(e)=>setPlanForm({...planForm,allowAdvancedReports:e.target.checked})} /> Advanced Reports</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowMultiWarehouse} onChange={(e)=>setPlanForm({...planForm,allowMultiWarehouse:e.target.checked})} /> Multi Warehouse</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowApprovals} onChange={(e)=>setPlanForm({...planForm,allowApprovals:e.target.checked})} /> Approvals</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowManufacturing} onChange={(e)=>setPlanForm({...planForm,allowManufacturing:e.target.checked})} /> Manufacturing</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowBatchTracking} onChange={(e)=>setPlanForm({...planForm,allowBatchTracking:e.target.checked})} /> Batch / Expiry Tracking</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowServiceJobs} onChange={(e)=>setPlanForm({...planForm,allowServiceJobs:e.target.checked})} /> Service Jobs / Appointments</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowCrm} onChange={(e)=>setPlanForm({...planForm,allowCrm:e.target.checked})} /> CRM / Leads</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowQuotations} onChange={(e)=>setPlanForm({...planForm,allowQuotations:e.target.checked})} /> Quotations / Sales Orders</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowHrPayroll} onChange={(e)=>setPlanForm({...planForm,allowHrPayroll:e.target.checked})} /> HR / Payroll / Attendance</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowProjects} onChange={(e)=>setPlanForm({...planForm,allowProjects:e.target.checked})} /> Projects / Tasks</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowInstallments} onChange={(e)=>setPlanForm({...planForm,allowInstallments:e.target.checked})} /> Installments / Hire Purchase</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowBankReconciliation} onChange={(e)=>setPlanForm({...planForm,allowBankReconciliation:e.target.checked})} /> Bank Reconciliation</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowFixedAssets} onChange={(e)=>setPlanForm({...planForm,allowFixedAssets:e.target.checked})} /> Fixed Assets</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowMultiCurrency} onChange={(e)=>setPlanForm({...planForm,allowMultiCurrency:e.target.checked})} /> Multi-currency</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowLoyalty} onChange={(e)=>setPlanForm({...planForm,allowLoyalty:e.target.checked})} /> Loyalty / Rewards</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowDelivery} onChange={(e)=>setPlanForm({...planForm,allowDelivery:e.target.checked})} /> Delivery / Dispatch</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowBudgeting} onChange={(e)=>setPlanForm({...planForm,allowBudgeting:e.target.checked})} /> Budgeting / Forecasting</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowCampaigns} onChange={(e)=>setPlanForm({...planForm,allowCampaigns:e.target.checked})} /> WhatsApp / Email Campaigns</label>
            <label className="check-label"><input type="checkbox" checked={planForm.allowDashboardBuilder} onChange={(e)=>setPlanForm({...planForm,allowDashboardBuilder:e.target.checked})} /> Dashboard Builder</label>
            <button className="primary-btn" disabled={saving}>Create Plan</button>
          </form>
        </section>
      </main>
    </div>
  );
}
