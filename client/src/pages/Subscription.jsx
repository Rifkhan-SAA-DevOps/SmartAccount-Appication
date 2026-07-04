import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function usagePercent(used, limit) {
  if (!Number(limit)) return 0;
  return Math.min(100, Math.round((Number(used || 0) / Number(limit || 1)) * 100));
}

export default function Subscription() {
  const [plans, setPlans] = useState([]);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  async function load() {
    setError('');
    try {
      const [p, c] = await Promise.all([api.get('/subscriptions/plans'), api.get('/subscriptions/current')]);
      setPlans(p.data);
      setSummary(c.data);
    } catch (e) { setError(e.response?.data?.message || e.message); }
  }

  useEffect(()=>{ load(); },[]);

  const current = summary?.subscription;
  const plan = current?.plan;
  const endDate = current?.status === 'trial' ? current?.trialEndsAt : current?.currentPeriodEndsAt;
  const daysLeft = useMemo(() => {
    if (!endDate) return null;
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  }, [endDate]);

  return <div className="page subscription-page">
    <div className="page-head">
      <div>
        <h1>Subscription</h1>
        <p>Your plan controls users, products, invoices, POS, inventory, branches, warehouses, reports, manufacturing, expiry/batch tracking, service jobs, campaigns, dashboard builder, and API access.</p>
      </div>
      <button className="secondary-btn" onClick={load}>Refresh Usage</button>
    </div>

    {error && <div className="error-box">{error}</div>}
    {summary?.blocked && <div className="warning-box"><strong>Access limited:</strong> {summary.blockMessage}</div>}

    {current && <div className="panel current-plan-panel">
      <div className="section-title-row">
        <div><h2>{plan?.name || 'Current Plan'}</h2><p>Subscription status: <strong>{current.status}</strong> · Company status: <strong>{current.tenant?.status}</strong></p></div>
        <div className="plan-expiry"><span>{current.status === 'trial' ? 'Trial Ends' : 'Period Ends'}</span><strong>{dateOnly(endDate)}</strong><small>{daysLeft === null ? 'No end date' : daysLeft < 0 ? 'Expired' : `${daysLeft} days left`}</small></div>
      </div>
      <div className="usage-grid">
        {summary.limits && Object.entries(summary.limits).map(([key, item]) => (
          <div className="usage-card" key={key}>
            <span>{key.replace(/([A-Z])/g, ' $1')}</span>
            <strong>{item.used} / {item.limit}</strong>
            {typeof item.limit === 'number' && <div className="usage-bar"><i style={{ width: `${usagePercent(item.used, item.limit)}%` }} /></div>}
            {item.reached && <small className="danger-text">Limit reached</small>}
          </div>
        ))}
      </div>
      {summary.features && <div className="feature-grid">
        {Object.entries(summary.features).map(([feature, allowed]) => <div className={`feature-pill ${allowed ? 'on' : 'off'}`} key={feature}>{allowed ? '✓' : '×'} {feature.replace(/([A-Z])/g, ' $1')}</div>)}
      </div>}
    </div>}

    <div className="plan-grid">{plans.map(planItem=><div className={`plan-card ${current?.planId===planItem.id?'selected':''}`} key={planItem.id}>
      <h2>{planItem.name}</h2>
      <strong>{money(planItem.monthlyPrice)}/month</strong>
      <ul>
        <li>{planItem.maxUsers} users</li>
        <li>{planItem.maxProducts} products</li>
        <li>{planItem.maxInvoicesPerMonth} invoices/month</li>
        <li>{planItem.maxBranches} branches</li>
        <li>POS: {planItem.allowPos?'Yes':'No'}</li>
        <li>Inventory: {planItem.allowInventory?'Yes':'No'}</li>
        <li>Advanced reports: {planItem.allowAdvancedReports?'Yes':'No'}</li>
        <li>Multi warehouse: {planItem.allowMultiWarehouse?'Yes':'No'}</li>
        <li>Approval workflow: {planItem.allowApprovals?'Yes':'No'}</li>
        <li>Manufacturing: {planItem.allowManufacturing?'Yes':'No'}</li>
        <li>Batch/expiry tracking: {planItem.allowBatchTracking?'Yes':'No'}</li>
        <li>Service jobs: {planItem.allowServiceJobs?'Yes':'No'}</li><li>CRM / leads: {planItem.allowCrm?'Yes':'No'}</li><li>Quotations / sales orders: {planItem.allowQuotations?'Yes':'No'}</li><li>HR / payroll: {planItem.allowHrPayroll?'Yes':'No'}</li><li>Projects / tasks: {planItem.allowProjects?'Yes':'No'}</li><li>Installments / hire purchase: {planItem.allowInstallments?'Yes':'No'}</li><li>Bank reconciliation: {planItem.allowBankReconciliation?'Yes':'No'}</li><li>Fixed assets: {planItem.allowFixedAssets?'Yes':'No'}</li><li>Multi-currency: {planItem.allowMultiCurrency?'Yes':'No'}</li><li>Loyalty / rewards: {planItem.allowLoyalty?'Yes':'No'}</li><li>Delivery / dispatch: {planItem.allowDelivery?'Yes':'No'}</li><li>Budgeting / forecasting: {planItem.allowBudgeting?'Yes':'No'}</li><li>WhatsApp / email campaigns: {planItem.allowCampaigns?'Yes':'No'}</li><li>Dashboard builder: {planItem.allowDashboardBuilder?'Yes':'No'}</li>
      </ul>
      <button className="secondary-btn">Contact Owner to Upgrade</button>
    </div>)}</div>
  </div>;
}
