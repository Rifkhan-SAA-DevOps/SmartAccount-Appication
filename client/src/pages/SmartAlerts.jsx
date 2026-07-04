
import { useEffect, useMemo, useState } from 'react';
import { Activity, AlertTriangle, ArrowRight, BellRing, CheckCircle2, RefreshCw, ShieldAlert, Siren, Sparkles, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../api/http.js';
import StatCard from '../components/ui/StatCard.jsx';
import DataTable from '../components/ui/DataTable.jsx';

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString() : '-';
}

function priorityClass(priority) {
  if (priority === 'critical') return 'badge cancelled';
  if (priority === 'high') return 'badge danger';
  if (priority === 'medium') return 'badge partial';
  return 'badge posted';
}

function priorityIcon(priority) {
  if (priority === 'critical') return Siren;
  if (priority === 'high') return ShieldAlert;
  if (priority === 'medium') return AlertTriangle;
  return CheckCircle2;
}

export default function SmartAlerts() {
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);
  const [from, setFrom] = useState(formatDate(monthStart));
  const [to, setTo] = useState(formatDate(today));
  const [priority, setPriority] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/smart-alerts/summary', { params: { from, to } });
      setData(res.data || null);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load smart alerts');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function createNotifications() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const res = await api.post('/smart-alerts/generate-notifications', { from, to, minPriority: 'high', notifyOwners: true });
      setSuccess(`${res.data?.created || 0} high-priority smart alert notification(s) created`);
      await load();
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to create smart alert notifications');
    } finally {
      setSaving(false);
    }
  }

  const metrics = data?.metrics || {};
  const summary = data?.summary || {};
  const recommendations = data?.recommendations || [];
  const filteredRecommendations = priority === 'all' ? recommendations : recommendations.filter((item) => item.priority === priority);

  return (
    <div className="page smart-alerts-page">
      <div className="assistant-hero smart-alerts-hero">
        <div className="assistant-hero-icon"><BellRing size={34} /></div>
        <div>
          <span className="eyebrow"><Sparkles size={14} /> Version 4.7</span>
          <h1>Smart Alerts & Auto Recommendations</h1>
          <p>Automatically detects business risks from your ERP data and recommends what to do next. This version can also create high-priority notifications for owners and managers.</p>
        </div>
      </div>

      <section className="panel assistant-filter-panel">
        <div>
          <h2>Alert Analysis Period</h2>
          <p>Smart alerts compare sales, expenses, stock, receivables, payables, cash, approvals, CRM follow-ups and operational deadlines.</p>
        </div>
        <div className="assistant-filter-row">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="primary-btn" onClick={load} disabled={loading}><RefreshCw size={16} /> {loading ? 'Checking...' : 'Run Check'}</button>
          <button className="secondary-btn" onClick={createNotifications} disabled={saving}><BellRing size={16} /> {saving ? 'Creating...' : 'Create Notifications'}</button>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <section className="smart-alert-health panel">
        <div>
          <span className="eyebrow"><Activity size={14} /> Business Health Score</span>
          <h2>{summary.healthScore ?? 0}/100 — {summary.headline || 'No alert summary loaded'}</h2>
          <p>{summary.message || 'Run the smart alert check to see your business risk summary.'}</p>
        </div>
        <div className="health-ring"><strong>{summary.healthScore ?? 0}</strong><span>score</span></div>
      </section>

      <div className="stat-grid">
        <StatCard title="Critical Alerts" value={summary.counts?.critical || 0} subtitle={`${summary.counts?.high || 0} high priority`} tone="orange" />
        <StatCard title="Cash Runway" value={metrics.cashRunwayDays === 999 ? 'Safe' : `${metrics.cashRunwayDays || 0} days`} subtitle={`${money(metrics.cashBankBalance)} cash/bank`} tone="blue" />
        <StatCard title="Overdue Amount" value={money(metrics.overdueAmount)} subtitle={`${metrics.overdueInvoiceCount || 0} overdue invoices`} tone="purple" />
        <StatCard title="Low Stock" value={metrics.lowStockCount || 0} subtitle={`${money(metrics.inventoryValue)} inventory value`} tone="green" />
      </div>

      <section className="panel">
        <div className="ledger-toolbar smart-alert-toolbar">
          <div>
            <h2>Auto Recommendations</h2>
            <p>Follow the highest priority actions first. Each recommendation links to the related module.</p>
          </div>
          <div className="approval-filter-row">
            <label>Priority<select value={priority} onChange={(e) => setPriority(e.target.value)}>
              <option value="all">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select></label>
          </div>
        </div>

        <div className="smart-alert-list">
          {filteredRecommendations.map((item) => {
            const Icon = priorityIcon(item.priority);
            return (
              <article key={item.key} className={`smart-alert-card priority-${item.priority}`}>
                <div className="smart-alert-card-icon"><Icon size={22} /></div>
                <div className="smart-alert-card-body">
                  <div className="smart-alert-title-row">
                    <div><span>{item.module}</span><h3>{item.title}</h3></div>
                    <span className={priorityClass(item.priority)}>{item.priority}</span>
                  </div>
                  <p><strong>Problem:</strong> {item.problem}</p>
                  <p><strong>Why:</strong> {item.reason}</p>
                  <p><strong>Action:</strong> {item.action}</p>
                  <div className="smart-alert-foot">
                    <small>{item.impact}</small>
                    <Link className="secondary-btn compact-link" to={item.actionUrl || '/'}>Open module <ArrowRight size={14} /></Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <div className="assistant-grid two smart-alert-tables">
        <section className="panel">
          <h2>Collection Priority</h2>
          <DataTable columns={[
            { key: 'invoiceNo', label: 'Invoice' },
            { key: 'customer', label: 'Customer' },
            { key: 'dueDate', label: 'Due', render: (r) => fmtDate(r.dueDate) },
            { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }
          ]} rows={data?.lists?.overdueInvoices || []} empty="No overdue invoices" />
        </section>

        <section className="panel">
          <h2>Stock Priority</h2>
          <DataTable columns={[
            { key: 'name', label: 'Product' },
            { key: 'sku', label: 'SKU', render: (r) => r.sku || '-' },
            { key: 'stockQty', label: 'Stock' },
            { key: 'reorderLevel', label: 'Reorder' }
          ]} rows={data?.lists?.lowStock || []} empty="No low-stock products" />
        </section>
      </div>

      <div className="assistant-grid two smart-alert-tables">
        <section className="panel">
          <h2>Receivable Customers</h2>
          <DataTable columns={[
            { key: 'name', label: 'Customer' },
            { key: 'phone', label: 'Phone', render: (r) => r.phone || '-' },
            { key: 'balance', label: 'Balance', render: (r) => money(r.balance) },
            { key: 'creditLimit', label: 'Limit', render: (r) => money(r.creditLimit) }
          ]} rows={data?.lists?.highReceivables || []} empty="No customer receivables" />
        </section>

        <section className="panel">
          <h2>Operational Deadlines</h2>
          <div className="deadline-stack">
            <div><TrendingUp size={18} /><strong>{metrics.pendingApprovalCount || 0}</strong><span>Pending approvals</span></div>
            <div><AlertTriangle size={18} /><strong>{metrics.serviceJobDueCount || 0}</strong><span>Service jobs due</span></div>
            <div><BellRing size={18} /><strong>{metrics.crmFollowupDueCount || 0}</strong><span>CRM follow-ups due</span></div>
            <div><ShieldAlert size={18} /><strong>{metrics.expiringBatchCount || 0}</strong><span>Batches expiring soon</span></div>
          </div>
        </section>
      </div>
    </div>
  );
}
