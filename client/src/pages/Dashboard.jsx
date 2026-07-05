import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import {
  Activity,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeDollarSign,
  Banknote,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  CreditCard,
  FileText,
  Layers,
  LineChart as LineIcon,
  PackageCheck,
  PlusCircle,
  ReceiptText,
  RefreshCw,
  Route,
  Search,
  ShieldAlert,
  ShoppingCart,
  Sparkles,
  Truck,
  Users,
  Wallet,
  Warehouse,
  Zap
} from 'lucide-react';
import { api } from '../api/http.js';
import { useAuth } from '../state/AuthContext.jsx';
import './Dashboard.css';

const chartColors = {
  purple: '#7c3aed',
  purpleSoft: '#c4b5fd',
  green: '#16a34a',
  emerald: '#10b981',
  orange: '#f59e0b',
  red: '#ef4444',
  blue: '#0284c7',
  cyan: '#06b6d4',
  slate: '#64748b'
};

function asNumber(value) {
  const num = Number(value || 0);
  return Number.isFinite(num) ? num : 0;
}

function money(value) {
  return Math.round(asNumber(value) * 100) / 100;
}

function formatMoney(value) {
  return `LKR ${money(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function compactMoney(value) {
  const num = Math.abs(asNumber(value));
  const sign = asNumber(value) < 0 ? '-' : '';
  if (num >= 1_000_000_000) return `${sign}LKR ${(num / 1_000_000_000).toFixed(1)}B`;
  if (num >= 1_000_000) return `${sign}LKR ${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 1_000) return `${sign}LKR ${(num / 1_000).toFixed(1)}K`;
  return `${sign}LKR ${num.toFixed(0)}`;
}

function formatCount(value) {
  return asNumber(value).toLocaleString();
}

function percent(value, total) {
  if (!asNumber(total)) return 0;
  return Math.max(0, Math.min(100, Math.round((asNumber(value) / asNumber(total)) * 100)));
}

function formatDate(date) {
  try {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(date);
  } catch {
    return String(date);
  }
}

function shortDate(dateValue) {
  if (!dateValue) return '-';
  try {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(dateValue));
  } catch {
    return '-';
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function buildDailySales(recentInvoices = [], todaySales = 0) {
  const today = new Date();
  const rows = Array.from({ length: 10 }).map((_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (9 - index));
    return {
      key: date.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date),
      sales: 0,
      invoices: 0
    };
  });

  const map = new Map(rows.map((row) => [row.key, row]));
  for (const invoice of recentInvoices || []) {
    const key = new Date(invoice.createdAt || invoice.issueDate || new Date()).toISOString().slice(0, 10);
    const row = map.get(key);
    if (!row) continue;
    row.sales += asNumber(invoice.total);
    row.invoices += 1;
  }

  const todayKey = today.toISOString().slice(0, 10);
  const todayRow = map.get(todayKey);
  if (todayRow && todayRow.sales === 0 && asNumber(todaySales) > 0) {
    todayRow.sales = asNumber(todaySales);
    todayRow.invoices = Math.max(todayRow.invoices, 1);
  }

  return rows.map((row) => ({ ...row, sales: money(row.sales) }));
}

function buildRevenueExpenseTrend(alertMetrics = {}, cards = {}) {
  const sales = asNumber(alertMetrics.salesTotal || cards.todaySales);
  const expenses = asNumber(alertMetrics.expenseTotal);
  const profit = asNumber(alertMetrics.netProfit || (sales - expenses));
  const today = new Date();

  return Array.from({ length: 8 }).map((_, index) => {
    const date = new Date(today);
    date.setMonth(today.getMonth() - (7 - index));
    const factor = index === 7 ? 1 : 0;
    return {
      label: new Intl.DateTimeFormat(undefined, { month: 'short' }).format(date),
      revenue: money(index === 7 ? sales : sales * factor),
      expenses: money(index === 7 ? expenses : expenses * factor),
      profit: money(index === 7 ? profit : profit * factor)
    };
  });
}

function getStatusTone(value) {
  const numeric = asNumber(value);
  if (numeric >= 75) return 'success';
  if (numeric >= 45) return 'warning';
  return 'danger';
}

function DashboardTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dash-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          <i style={{ background: item.color }} />
          {item.name}: {String(item.dataKey).toLowerCase().includes('invoice') ? formatCount(item.value) : compactMoney(item.value)}
        </span>
      ))}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, helper, trend, tone = 'purple', to }) {
  const Wrapper = to ? Link : 'div';
  return (
    <Wrapper to={to} className={`dash-metric dash-tone-${tone}`}>
      <div className="dash-metric-glow" />
      <div className="dash-metric-top">
        <span className="dash-metric-icon"><Icon size={22} /></span>
        {trend !== undefined && (
          <span className={`dash-trend ${asNumber(trend) >= 0 ? 'up' : 'down'}`}>
            {asNumber(trend) >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
            {Math.abs(asNumber(trend))}%
          </span>
        )}
      </div>
      <span className="dash-metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{helper}</small>
    </Wrapper>
  );
}

function SectionTitle({ icon: Icon, eyebrow, title, action }) {
  return (
    <div className="dash-section-title">
      <div>
        {eyebrow && <span className="dash-eyebrow">{eyebrow}</span>}
        <h2>{Icon && <Icon size={20} />} {title}</h2>
      </div>
      {action}
    </div>
  );
}

function EmptyState({ icon: Icon = Sparkles, title, text, to, action }) {
  return (
    <div className="dash-empty-state">
      <span><Icon size={34} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
      {to && <Link to={to}>{action || 'Open page'} <ChevronRight size={15} /></Link>}
    </div>
  );
}

function AttentionItem({ item }) {
  const priority = String(item.priority || 'medium').toLowerCase();
  return (
    <Link to={item.actionUrl || '/smart-alerts'} className={`dash-attention-item ${priority}`}>
      <span><AlertTriangle size={18} /></span>
      <div>
        <strong>{item.title || 'Business alert'}</strong>
        <p>{item.problem || item.message || item.action || 'Check this item before continuing daily work.'}</p>
      </div>
      <ChevronRight size={17} />
    </Link>
  );
}

function QuickAction({ to, icon: Icon, title, text, tone = 'purple' }) {
  return (
    <Link to={to} className={`dash-quick-action dash-tone-${tone}`}>
      <span><Icon size={22} /></span>
      <div>
        <strong>{title}</strong>
        <small>{text}</small>
      </div>
      <ChevronRight size={17} />
    </Link>
  );
}

function ProgressLine({ label, value, total, helper, tone = 'purple' }) {
  const progress = percent(value, total);
  return (
    <div className="dash-progress-line">
      <div>
        <strong>{label}</strong>
        <span>{helper}</span>
      </div>
      <b>{progress}%</b>
      <div className="dash-progress-track"><i className={`dash-tone-bg-${tone}`} style={{ width: `${progress}%` }} /></div>
    </div>
  );
}

function MiniList({ rows = [], emptyTitle, emptyText, render, icon }) {
  if (!rows.length) return <EmptyState icon={icon} title={emptyTitle} text={emptyText} />;
  return <div className="dash-mini-list">{rows.map(render)}</div>;
}

export default function Dashboard() {
  const { user, tenant } = useAuth() || {};
  const [summary, setSummary] = useState(null);
  const [alerts, setAlerts] = useState(null);
  const [distribution, setDistribution] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function loadDashboard() {
    setRefreshing(true);
    setError('');
    try {
      const [summaryResult, alertsResult, distributionResult] = await Promise.allSettled([
        api.get('/dashboard/summary'),
        api.get('/smart-alerts/summary'),
        api.get('/distributor-dashboard/summary')
      ]);

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value.data || {});
      } else {
        setError(summaryResult.reason?.response?.data?.message || 'Failed to load dashboard summary');
      }

      setAlerts(alertsResult.status === 'fulfilled' ? alertsResult.value.data : null);
      setDistribution(distributionResult.status === 'fulfilled' ? distributionResult.value.data : null);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { loadDashboard(); }, []);

  const cards = summary?.cards || {};
  const alertMetrics = alerts?.metrics || {};
  const alertLists = alerts?.lists || {};
  const alertSummary = alerts?.summary || {};
  const recentInvoices = summary?.recentInvoices || [];
  const healthScore = asNumber(alertSummary.healthScore || (cards.lowStock > 0 || cards.customerCredit > 0 ? 72 : 92));
  const healthTone = getStatusTone(healthScore);
  const salesTrend = useMemo(() => buildDailySales(recentInvoices, cards.todaySales), [recentInvoices, cards.todaySales]);
  const revenueExpense = useMemo(() => buildRevenueExpenseTrend(alertMetrics, cards), [alertMetrics, cards]);

  const attentionRows = useMemo(() => {
    const generated = Array.isArray(alerts?.recommendations) ? alerts.recommendations.slice(0, 4) : [];
    if (generated.length) return generated;
    const rows = [];
    if (asNumber(cards.lowStock) > 0) rows.push({ title: 'Low stock needs attention', priority: 'high', problem: `${cards.lowStock} product(s) reached reorder level.`, actionUrl: '/products' });
    if (asNumber(cards.customerCredit) > 0) rows.push({ title: 'Customer credit outstanding', priority: 'medium', problem: `${formatMoney(cards.customerCredit)} is still receivable.`, actionUrl: '/ledgers' });
    if (asNumber(cards.todayInvoiceCount) === 0) rows.push({ title: 'No invoice created today', priority: 'low', problem: 'Start selling by creating a new invoice or opening POS.', actionUrl: '/invoices' });
    return rows.slice(0, 4);
  }, [alerts, cards]);

  const cashFlowData = [
    { name: 'Collected', value: money(cards.todayPayments || distribution?.cards?.todayCollections || alertMetrics.salesPaid), color: chartColors.green },
    { name: 'Receivable', value: money(cards.customerCredit || alertMetrics.receivables), color: chartColors.orange },
    { name: 'Payable', value: money(alertMetrics.payables), color: chartColors.red }
  ].filter((item) => item.value > 0);

  const distributionCards = distribution?.cards || {};
  const topProducts = alertLists.lowStock?.slice?.(0, 5) || [];
  const receivableCustomers = alertLists.highReceivables?.slice?.(0, 5) || [];
  const dueCheques = alertLists.dueCheques?.slice?.(0, 4) || [];

  if (loading) {
    return (
      <div className="executive-dashboard dash-loading-page">
        <div className="dash-loading-card">
          <Sparkles size={32} />
          <strong>Preparing your executive dashboard...</strong>
          <span>Loading sales, stock, cash, alerts and distribution summary.</span>
        </div>
      </div>
    );
  }

  return (
    <div className="executive-dashboard">
      <section className="dash-hero-card">
        <div className="dash-hero-bg one" />
        <div className="dash-hero-bg two" />
        <div className="dash-hero-left">
          <div className="dash-hero-kicker">
            <Sparkles size={17} /> SmartLedger Executive Command Center
          </div>
          <h1>{getGreeting()}, <span>{user?.name?.split?.(' ')?.[0] || user?.name || 'Owner'}!</span></h1>
          <p>{tenant?.name || 'Your business'} is ready. Track sales, cash, stock, receivables, distribution and urgent actions in one place.</p>
          <div className="dash-hero-actions">
            <Link className="dash-primary-action" to="/invoices"><PlusCircle size={18} /> New Invoice</Link>
            <Link className="dash-soft-action" to="/pos"><ShoppingCart size={18} /> Open POS</Link>
            <Link className="dash-soft-action" to="/smart-alerts"><Bell size={18} /> Smart Alerts</Link>
          </div>
        </div>
        <div className="dash-hero-right">
          <div className="dash-date-pill"><CalendarDays size={17} /> {formatDate(new Date())}</div>
          <button className="dash-refresh-btn" onClick={loadDashboard} disabled={refreshing}>
            <RefreshCw size={17} className={refreshing ? 'spinning' : ''} /> Refresh
          </button>
          <div className={`dash-health-card ${healthTone}`}>
            <span>Business Health</span>
            <strong>{healthScore}/100</strong>
            <small>{alertSummary.headline || (healthScore > 85 ? 'Business looks stable' : 'Some items need attention')}</small>
            <div><i style={{ width: `${Math.max(8, Math.min(100, healthScore))}%` }} /></div>
          </div>
        </div>
      </section>

      {error && <div className="dash-error"><AlertTriangle size={18} /> {error}</div>}

      <section className="dash-command-row">
        <div className="dash-command-search">
          <Search size={18} />
          <span>Quickly open daily work from the dashboard</span>
        </div>
        <Link to="/dashboard-builder"><Layers size={17} /> Customize dashboard</Link>
      </section>

      <section className="dash-metrics-grid">
        <MetricCard icon={BadgeDollarSign} label="Today Sales" value={formatMoney(cards.todaySales)} helper={`${formatCount(cards.todayInvoiceCount)} invoice(s) today`} trend={distributionCards.salesTrend} tone="purple" to="/invoices" />
        <MetricCard icon={Wallet} label="Today Collections" value={formatMoney(cards.todayPayments || distributionCards.todayCollections)} helper="Cash collected today" trend={distributionCards.collectionTrend} tone="green" to="/ledgers" />
        <MetricCard icon={Users} label="Customers" value={formatCount(cards.customers)} helper={`${formatMoney(cards.customerCredit)} receivable`} tone="blue" to="/customers" />
        <MetricCard icon={Building2} label="Suppliers" value={formatCount(cards.suppliers)} helper={`${formatMoney(alertMetrics.payables)} payable`} tone="orange" to="/suppliers" />
        <MetricCard icon={Boxes} label="Products" value={formatCount(cards.products)} helper={`${formatCount(cards.lowStock)} low stock item(s)`} tone="cyan" to="/products" />
        <MetricCard icon={Truck} label="Distribution" value={formatMoney(distributionCards.todayNetSales)} helper={`${formatCount(distributionCards.activeRoutes)} route(s), ${formatCount(distributionCards.activeShops)} shop(s)`} tone="emerald" to="/distributor-dashboard" />
      </section>

      <section className="dash-main-grid">
        <div className="dash-panel dash-wide-panel">
          <SectionTitle icon={LineIcon} eyebrow="Analytics" title="Sales Performance" action={<Link to="/reports">Open reports <ChevronRight size={16} /></Link>} />
          <div className="dash-chart-wrap tall">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={salesTrend} margin={{ top: 12, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.purple} stopOpacity={0.34} />
                    <stop offset="95%" stopColor={chartColors.purple} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={compactMoney} />
                <Tooltip content={<DashboardTooltip />} />
                <Area type="monotone" dataKey="sales" name="Sales" stroke={chartColors.purple} fill="url(#salesGradient)" strokeWidth={3} />
                <Line type="monotone" dataKey="invoices" name="Invoices" stroke={chartColors.orange} strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dash-panel dash-attention-panel">
          <SectionTitle icon={ShieldAlert} eyebrow="Needs action" title="Attention Center" action={<Link to="/smart-alerts">View all</Link>} />
          {attentionRows.length ? (
            <div className="dash-attention-list">
              {attentionRows.map((item, index) => <AttentionItem key={item.key || item.title || index} item={item} />)}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} title="No urgent alerts" text="Your available dashboard data does not show critical issues now." to="/smart-alerts" action="Open smart alerts" />
          )}
        </div>
      </section>

      <section className="dash-quick-grid">
        <QuickAction to="/invoices" icon={ReceiptText} title="New Invoice" text="Create sale and update balance" tone="purple" />
        <QuickAction to="/customers" icon={Users} title="Add Customer" text="Create customer profile" tone="blue" />
        <QuickAction to="/ledgers" icon={Banknote} title="Record Payment" text="Update customer/supplier ledger" tone="green" />
        <QuickAction to="/purchases" icon={PackageCheck} title="Add GRN" text="Receive supplier stock" tone="orange" />
        <QuickAction to="/shop-supply" icon={Truck} title="Shop Supply" text="Supply stock to shop route" tone="emerald" />
        <QuickAction to="/reports" icon={BarChart3} title="View Reports" text="Open analytics center" tone="cyan" />
      </section>

      <section className="dash-two-grid">
        <div className="dash-panel">
          <SectionTitle icon={BarChart3} eyebrow="Finance" title="Revenue vs Expenses" />
          <div className="dash-chart-wrap medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={revenueExpense} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 12 }} tickFormatter={compactMoney} />
                <Tooltip content={<DashboardTooltip />} />
                <Bar dataKey="revenue" name="Revenue" fill={chartColors.green} radius={[8, 8, 0, 0]} />
                <Bar dataKey="expenses" name="Expenses" fill={chartColors.red} radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dash-panel">
          <SectionTitle icon={CircleDollarSign} eyebrow="Cashflow" title="Money Position" />
          <div className="dash-money-position">
            <div className="dash-donut-card">
              {cashFlowData.length ? (
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie data={cashFlowData} dataKey="value" innerRadius={58} outerRadius={86} paddingAngle={4}>
                      {cashFlowData.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value) => formatMoney(value)} />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon={Wallet} title="No cash data yet" text="Collections, receivables and payables will appear here." />
              )}
            </div>
            <div className="dash-money-lines">
              <ProgressLine label="Collections" value={cards.todayPayments || distributionCards.todayCollections} total={(cards.todaySales || 1)} helper={formatMoney(cards.todayPayments || distributionCards.todayCollections)} tone="green" />
              <ProgressLine label="Receivables" value={cards.customerCredit} total={(cards.customerCredit || 0) + (alertMetrics.payables || 0) + 1} helper={formatMoney(cards.customerCredit)} tone="orange" />
              <ProgressLine label="Payables" value={alertMetrics.payables} total={(cards.customerCredit || 0) + (alertMetrics.payables || 0) + 1} helper={formatMoney(alertMetrics.payables)} tone="red" />
            </div>
          </div>
        </div>
      </section>

      <section className="dash-two-grid">
        <div className="dash-panel">
          <SectionTitle icon={Route} eyebrow="Distribution" title="Route & Shop Snapshot" action={<Link to="/distributor-dashboard">Open distributor dashboard</Link>} />
          <div className="dash-distribution-grid">
            <div><span>Net Sales</span><strong>{formatMoney(distributionCards.todayNetSales)}</strong></div>
            <div><span>Collections</span><strong>{formatMoney(distributionCards.todayCollections)}</strong></div>
            <div><span>Outstanding Shops</span><strong>{formatCount(distributionCards.overdueShops)}</strong></div>
            <div><span>Van Closing</span><strong>{formatCount(distributionCards.closedVans)} / {formatCount(distributionCards.activeVans)}</strong></div>
          </div>
          <div className="dash-route-lines">
            <ProgressLine label="Target Achievement" value={distributionCards.todaySales} total={distributionCards.targetSales} helper={`${formatMoney(distributionCards.todaySales)} / ${formatMoney(distributionCards.targetSales)}`} tone="purple" />
            <ProgressLine label="Collection Rate" value={distributionCards.todayCollections} total={distributionCards.todaySales} helper={`${formatMoney(distributionCards.todayCollections)} collected`} tone="green" />
            <ProgressLine label="Visit Completion" value={distributionCards.completedVisits} total={distributionCards.totalVisits} helper={`${formatCount(distributionCards.completedVisits)} of ${formatCount(distributionCards.totalVisits)} visits`} tone="cyan" />
          </div>
        </div>

        <div className="dash-panel">
          <SectionTitle icon={ClipboardList} eyebrow="Recent" title="Latest Invoices" action={<Link to="/invoices">All invoices</Link>} />
          <MiniList
            rows={recentInvoices.slice(0, 6)}
            icon={FileText}
            emptyTitle="No invoices yet"
            emptyText="Create your first invoice to see recent billing activity here."
            render={(invoice) => (
              <Link to="/invoices" className="dash-row-card" key={invoice.id || invoice.invoiceNo}>
                <span className="dash-row-icon"><ReceiptText size={17} /></span>
                <div>
                  <strong>{invoice.invoiceNo || 'Invoice'}</strong>
                  <small>{invoice.customer?.name || 'Walk-in customer'} • {shortDate(invoice.createdAt || invoice.issueDate)}</small>
                </div>
                <b>{compactMoney(invoice.total)}</b>
              </Link>
            )}
          />
        </div>
      </section>

      <section className="dash-three-grid">
        <div className="dash-panel">
          <SectionTitle icon={Warehouse} eyebrow="Inventory" title="Low Stock Watch" action={<Link to="/products">Products</Link>} />
          <MiniList
            rows={topProducts}
            icon={Boxes}
            emptyTitle="Stock looks fine"
            emptyText="Low-stock products will appear here when they reach reorder level."
            render={(product) => (
              <Link to="/products" className="dash-row-card compact" key={product.id || product.name}>
                <span className="dash-row-icon"><Boxes size={16} /></span>
                <div>
                  <strong>{product.name}</strong>
                  <small>Stock {formatCount(product.stockQty)} / Reorder {formatCount(product.reorderLevel)}</small>
                </div>
              </Link>
            )}
          />
        </div>

        <div className="dash-panel">
          <SectionTitle icon={CreditCard} eyebrow="Receivables" title="Due Customers" action={<Link to="/ledgers">Ledgers</Link>} />
          <MiniList
            rows={receivableCustomers}
            icon={Users}
            emptyTitle="No due customers"
            emptyText="Customers with outstanding balances will appear here."
            render={(customer) => (
              <Link to="/customers" className="dash-row-card compact" key={customer.id || customer.name}>
                <span className="dash-row-icon"><Users size={16} /></span>
                <div>
                  <strong>{customer.name}</strong>
                  <small>{customer.phone || 'No phone'} • limit {compactMoney(customer.creditLimit)}</small>
                </div>
                <b>{compactMoney(customer.balance)}</b>
              </Link>
            )}
          />
        </div>

        <div className="dash-panel">
          <SectionTitle icon={Zap} eyebrow="Operations" title="Due Cheques" action={<Link to="/cheques">Cheques</Link>} />
          <MiniList
            rows={dueCheques}
            icon={CreditCard}
            emptyTitle="No nearby cheques"
            emptyText="Cheques due soon will appear here for follow-up."
            render={(cheque) => (
              <Link to="/cheques" className="dash-row-card compact" key={cheque.id || cheque.chequeNo}>
                <span className="dash-row-icon"><CreditCard size={16} /></span>
                <div>
                  <strong>{cheque.chequeNo}</strong>
                  <small>{cheque.direction} • {shortDate(cheque.dueDate)}</small>
                </div>
                <b>{compactMoney(cheque.amount)}</b>
              </Link>
            )}
          />
        </div>
      </section>

      <section className="dash-panel dash-footer-panel">
        <div>
          <span className="dash-eyebrow">Next best actions</span>
          <h2><Activity size={20} /> Daily Owner Checklist</h2>
          <p>Use this flow every morning or evening to control sales, money, stock and distribution.</p>
        </div>
        <div className="dash-checklist">
          <Link to="/smart-alerts"><Bell size={17} /> Check alerts</Link>
          <Link to="/ledgers"><Wallet size={17} /> Collect due money</Link>
          <Link to="/products"><Boxes size={17} /> Review low stock</Link>
          <Link to="/distributor-dashboard"><Truck size={17} /> Close routes</Link>
          <Link to="/reports"><BarChart3 size={17} /> Read reports</Link>
        </div>
      </section>
    </div>
  );
}
