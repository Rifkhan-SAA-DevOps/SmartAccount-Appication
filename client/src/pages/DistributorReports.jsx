import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Boxes,
  Download,
  FileSpreadsheet,
  LineChart,
  PackageCheck,
  RefreshCcw,
  Route,
  Search,
  Sparkles,
  Store,
  Truck,
  Users,
  WalletCards
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { api } from '../api/http.js';
import PaginationBar, { useClientPagination } from '../components/ui/Pagination.jsx';
import './DistributorReports.css';

const reportTabs = [
  { id: 'route-sales', label: 'Route Sales', short: 'Routes', icon: Route, hint: 'Route sales, collections and target performance.' },
  { id: 'shop-outstanding', label: 'Shop Outstanding', short: 'Outstanding', icon: Store, hint: 'Credit risk and overdue shop balances.' },
  { id: 'collections', label: 'Collections', short: 'Collections', icon: WalletCards, hint: 'Money collected by route, rep and method.' },
  { id: 'product-movement', label: 'Product Movement', short: 'Products', icon: Boxes, hint: 'Supplied, free, returned and net movement.' },
  { id: 'van-closing', label: 'Van Closing', short: 'Van Closing', icon: Truck, hint: 'Daily van closing, returns, damage and variance.' },
  { id: 'rep-performance', label: 'Sales Rep', short: 'Sales Reps', icon: Users, hint: 'Rep sales, visits, collections and return performance.' },
  { id: 'returns', label: 'Returns', short: 'Returns', icon: PackageCheck, hint: 'Damage, expiry, wrong delivery and credit value.' },
  { id: 'offer-usage', label: 'Offer Usage', short: 'Offers', icon: FileSpreadsheet, hint: 'Free item and discount offer redemption.' }
];

function num(value) {
  const number = Number(value || 0);
  return Number.isFinite(number) ? number : 0;
}

function money(value) {
  return num(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortMoney(value) {
  const amount = Math.abs(num(value));
  const sign = num(value) < 0 ? '-' : '';
  if (amount >= 1_000_000) return `${sign}Rs. ${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `${sign}Rs. ${(amount / 1_000).toFixed(1)}K`;
  return `${sign}Rs. ${amount.toFixed(0)}`;
}

function qty(value) {
  return num(value).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function todayInput(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function monthStartInput() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
}

function safeDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleDateString();
}

function csvText(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/<[^>]*>/g, '');
}

function ReportTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="dist-pro-tooltip">
      <strong>{label}</strong>
      {payload.map((item) => (
        <span key={item.dataKey}>
          <i style={{ background: item.fill || item.color }} />
          {item.name}: {shortMoney(item.value)}
        </span>
      ))}
    </div>
  );
}

function reportChartData(tab, rows) {
  const source = Array.isArray(rows) ? rows.slice(0, 8) : [];
  if (tab === 'route-sales') {
    return source.map((row) => ({ name: row.routeName || row.routeNo || 'Route', primary: num(row.sales), secondary: num(row.collections) }));
  }
  if (tab === 'shop-outstanding') {
    return source.map((row) => ({ name: row.shopName || row.shopCode || 'Shop', primary: num(row.outstanding), secondary: num(row.overdueOutstanding) }));
  }
  if (tab === 'collections') {
    return source.map((row) => ({ name: row.shopName || row.collectionNo || 'Receipt', primary: num(row.amount), secondary: 0 }));
  }
  if (tab === 'product-movement') {
    return source.map((row) => ({ name: row.productName || 'Product', primary: num(row.netValue), secondary: num(row.returnedQty) }));
  }
  if (tab === 'van-closing') {
    return source.map((row) => ({ name: row.vanName || row.closingNo || 'Van', primary: num(row.soldValue), secondary: num(row.variance) }));
  }
  if (tab === 'rep-performance') {
    return source.map((row) => ({ name: row.name || 'Rep', primary: num(row.sales), secondary: num(row.collections) }));
  }
  if (tab === 'returns') {
    return source.map((row) => ({ name: row.shopName || row.returnNo || 'Return', primary: num(row.creditAmount), secondary: num(row.qty) }));
  }
  return source.map((row) => ({ name: row.offerName || row.offerNo || 'Offer', primary: num(row.discountAmount), secondary: num(row.freeQty) }));
}

function Table({ columns, rows, emptyText = 'No records found for this period.' }) {
  const pager = useClientPagination(rows, {
    initialPageSize: 10,
    resetKey: `${rows.length}-${columns.map((column) => column.key).join('|')}`
  });

  return (
    <div className="dist-pro-table-card">
      <div className="dist-pro-table-wrap">
        <table className="dist-pro-table">
          <thead>
            <tr>{columns.map((column) => <th key={column.key}>{column.label}</th>)}</tr>
          </thead>
          <tbody>
            {pager.pageItems.length ? pager.pageItems.map((row, index) => (
              <tr key={row.id || row.routeId || row.shopId || row.employeeId || row.productId || `${pager.start}-${index}`}>
                {columns.map((column) => (
                  <td key={`${column.key}-${index}`} data-label={column.label} className={column.align === 'right' ? 'num' : ''}>
                    {column.render ? column.render(row) : row[column.key] ?? '-'}
                  </td>
                ))}
              </tr>
            )) : (
              <tr><td colSpan={columns.length} className="dist-pro-empty-cell">{emptyText}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationBar {...pager} label="rows" pageSizeOptions={[10, 20, 50, 100]} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, helper, tone, trend }) {
  return (
    <div className={`dist-pro-stat ${tone || 'blue'}`}>
      <span className="dist-pro-stat-icon"><Icon size={22} /></span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <p>{helper}</p>
      </div>
      {trend !== undefined && (
        <b className={num(trend) >= 0 ? 'good' : 'bad'}>
          {num(trend) >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
          {Math.abs(num(trend))}%
        </b>
      )}
    </div>
  );
}

export default function DistributorReports() {
  const [from, setFrom] = useState(monthStartInput());
  const [to, setTo] = useState(todayInput());
  const [activeTab, setActiveTab] = useState('route-sales');
  const [query, setQuery] = useState('');
  const [summary, setSummary] = useState(null);
  const [data, setData] = useState({ rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { from, to };
      const [summaryRes, tabRes] = await Promise.all([
        api.get('/distributor-reports/summary', { params }),
        api.get(`/distributor-reports/${activeTab}`, { params })
      ]);
      setSummary(summaryRes.data || null);
      setData(tabRes.data || { rows: [] });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load distributor reports');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [activeTab]);

  const rows = useMemo(() => {
    const source = Array.isArray(data.rows) ? data.rows : [];
    const q = query.trim().toLowerCase();
    if (!q) return source;
    return source.filter((row) => Object.values(row).filter(Boolean).join(' ').toLowerCase().includes(q));
  }, [data, query]);

  const cards = summary?.cards || {};
  const active = reportTabs.find((tab) => tab.id === activeTab) || reportTabs[0];
  const ActiveIcon = active.icon;
  const columns = getColumns(activeTab);
  const chartRows = useMemo(() => reportChartData(activeTab, rows), [activeTab, rows]);

  function exportCsv() {
    if (!rows.length) return;
    const header = columns.map((column) => column.label).join(',');
    const body = rows.map((row) => columns.map((column) => {
      const value = column.csv ? column.csv(row) : (column.render ? column.render(row) : row[column.key]);
      return `"${csvText(value).replace(/"/g, '""')}"`;
    }).join(',')).join('\n');
    const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartledger-${activeTab}-${from}-to-${to}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="dist-pro-page">
      <section className="dist-pro-hero">
        <div className="dist-pro-hero-copy">
          <span className="dist-pro-eyebrow"><Sparkles size={16} /> Distributor intelligence center</span>
          <h1>Professional Distributor Reports</h1>
          <p>Understand route sales, shop credit, collections, van closing, product movement, returns, offers and sales rep performance from one clean workspace.</p>
          <div className="dist-pro-hero-pills">
            <span><Route size={15} /> Route wise</span>
            <span><WalletCards size={15} /> Collection wise</span>
            <span><Store size={15} /> Shop wise</span>
          </div>
        </div>
        <div className="dist-pro-hero-actions">
          <button type="button" onClick={load} disabled={loading}><RefreshCcw size={17} className={loading ? 'spin' : ''} /> Refresh</button>
          <button type="button" className="secondary" onClick={exportCsv} disabled={!rows.length}><Download size={17} /> Export CSV</button>
        </div>
      </section>

      {error && <div className="dist-pro-alert"><AlertTriangle size={17} /> {error}</div>}

      <section className="dist-pro-stats">
        <StatCard icon={LineChart} tone="pink" label="Net route sales" value={`Rs. ${money(cards.netSales)}`} helper="Sales minus returns" />
        <StatCard icon={WalletCards} tone="green" label="Collections" value={`Rs. ${money(cards.totalCollections)}`} helper={`${cards.collectionRate || 0}% of net sales`} />
        <StatCard icon={Store} tone="amber" label="Shop outstanding" value={`Rs. ${money(cards.totalOutstanding)}`} helper={`Overdue: Rs. ${money(cards.overdueOutstanding)}`} />
        <StatCard icon={Route} tone="blue" label="Routes / Shops" value={`${cards.activeRouteCount || 0} / ${cards.activeShopCount || 0}`} helper={`Blocked shops: ${cards.blockedShopCount || 0}`} />
      </section>

      <section className="dist-pro-workspace">
        <div className="dist-pro-toolbar">
          <label>
            <span>From</span>
            <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </label>
          <label>
            <span>To</span>
            <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </label>
          <label className="dist-pro-search">
            <span>Search</span>
            <div><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search current report..." /></div>
          </label>
          <button type="button" onClick={load} disabled={loading}><RefreshCcw size={16} /> Apply Filters</button>
        </div>

        <nav className="dist-pro-tabs" aria-label="Distributor report tabs">
          {reportTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} type="button" className={activeTab === tab.id ? 'active' : ''} onClick={() => setActiveTab(tab.id)} title={tab.hint}>
                <Icon size={17} />
                <span>{tab.short}</span>
              </button>
            );
          })}
        </nav>

        <main className="dist-pro-report-panel">
          <div className="dist-pro-panel-head">
            <div>
              <span><ActiveIcon size={16} /> {active.label}</span>
              <h2>{active.label} Report</h2>
              <p>{active.hint}</p>
            </div>
            <div className="dist-pro-panel-meta">
              <strong>{rows.length}</strong>
              <small>{loading ? 'Loading rows...' : 'filtered rows'}</small>
            </div>
          </div>

          {renderExtraBlocks(activeTab, data)}

          <div className="dist-pro-chart-table-grid">
            <div className="dist-pro-chart-card">
              <div className="dist-pro-chart-head">
                <strong>Quick visual summary</strong>
                <small>Top {Math.min(8, rows.length)} rows</small>
              </div>
              {chartRows.length ? (
                <div className="dist-pro-chart-wrap">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartRows} margin={{ top: 12, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="4 8" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} interval={0} angle={-18} textAnchor="end" height={54} />
                      <YAxis tickLine={false} axisLine={false} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={shortMoney} width={64} />
                      <Tooltip content={<ReportTooltip />} />
                      <Bar dataKey="primary" name="Primary" fill="#7c3aed" radius={[9, 9, 0, 0]} />
                      <Bar dataKey="secondary" name="Secondary" fill="#10b981" radius={[9, 9, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="dist-pro-chart-empty"><BarChart3 size={36} /><strong>No chart data</strong><span>Apply filters or add distribution records.</span></div>
              )}
            </div>

            <Table columns={columns} rows={rows} />
          </div>
        </main>
      </section>
    </div>
  );
}

function getColumns(tab) {
  switch (tab) {
    case 'route-sales':
      return [
        { key: 'routeNo', label: 'Route' },
        { key: 'routeName', label: 'Name' },
        { key: 'area', label: 'Area' },
        { key: 'shops', label: 'Shops', align: 'right' },
        { key: 'sales', label: 'Sales', align: 'right', render: (row) => `Rs. ${money(row.sales)}` },
        { key: 'collections', label: 'Collections', align: 'right', render: (row) => `Rs. ${money(row.collections)}` },
        { key: 'outstanding', label: 'Outstanding', align: 'right', render: (row) => `Rs. ${money(row.outstanding)}` },
        { key: 'targetAchieved', label: 'Target %', align: 'right', render: (row) => `${row.targetAchieved || 0}%` }
      ];
    case 'shop-outstanding':
      return [
        { key: 'shopCode', label: 'Code' },
        { key: 'shopName', label: 'Shop' },
        { key: 'routeName', label: 'Route' },
        { key: 'salesRep', label: 'Rep' },
        { key: 'outstanding', label: 'Outstanding', align: 'right', render: (row) => `Rs. ${money(row.outstanding)}` },
        { key: 'creditLimit', label: 'Limit', align: 'right', render: (row) => `Rs. ${money(row.creditLimit)}` },
        { key: 'overdueOutstanding', label: 'Overdue', align: 'right', render: (row) => `Rs. ${money(row.overdueOutstanding)}` },
        { key: 'risk', label: 'Risk', render: (row) => <span className={`dist-risk ${String(row.risk || 'low').toLowerCase()}`}>{row.risk || 'LOW'}</span>, csv: (row) => row.risk || 'LOW' }
      ];
    case 'collections':
      return [
        { key: 'collectionNo', label: 'Receipt' },
        { key: 'collectedAt', label: 'Date', render: (row) => safeDate(row.collectedAt), csv: (row) => safeDate(row.collectedAt) },
        { key: 'shopName', label: 'Shop' },
        { key: 'routeName', label: 'Route' },
        { key: 'salesRep', label: 'Rep' },
        { key: 'method', label: 'Method' },
        { key: 'amount', label: 'Amount', align: 'right', render: (row) => `Rs. ${money(row.amount)}` }
      ];
    case 'product-movement':
      return [
        { key: 'productName', label: 'Product' },
        { key: 'suppliedQty', label: 'Supplied', align: 'right', render: (row) => qty(row.suppliedQty) },
        { key: 'freeQty', label: 'Free', align: 'right', render: (row) => qty(row.freeQty) },
        { key: 'returnedQty', label: 'Returned', align: 'right', render: (row) => qty(row.returnedQty) },
        { key: 'netQty', label: 'Net Qty', align: 'right', render: (row) => qty(row.netQty) },
        { key: 'netValue', label: 'Net Value', align: 'right', render: (row) => `Rs. ${money(row.netValue)}` }
      ];
    case 'van-closing':
      return [
        { key: 'closingNo', label: 'Closing' },
        { key: 'closingDate', label: 'Date', render: (row) => safeDate(row.closingDate), csv: (row) => safeDate(row.closingDate) },
        { key: 'vanName', label: 'Van' },
        { key: 'routeName', label: 'Route' },
        { key: 'soldValue', label: 'Sold', align: 'right', render: (row) => `Rs. ${money(row.soldValue)}` },
        { key: 'returnedValue', label: 'Returned', align: 'right', render: (row) => `Rs. ${money(row.returnedValue)}` },
        { key: 'damagedValue', label: 'Damaged', align: 'right', render: (row) => `Rs. ${money(row.damagedValue)}` },
        { key: 'variance', label: 'Variance', align: 'right', render: (row) => `Rs. ${money(row.variance)}` }
      ];
    case 'rep-performance':
      return [
        { key: 'name', label: 'Sales Rep' },
        { key: 'invoices', label: 'Invoices', align: 'right' },
        { key: 'sales', label: 'Sales', align: 'right', render: (row) => `Rs. ${money(row.sales)}` },
        { key: 'collections', label: 'Collections', align: 'right', render: (row) => `Rs. ${money(row.collections)}` },
        { key: 'returns', label: 'Returns', align: 'right', render: (row) => `Rs. ${money(row.returns)}` },
        { key: 'visits', label: 'Visits', align: 'right' },
        { key: 'collectionRate', label: 'Collection %', align: 'right', render: (row) => `${row.collectionRate || 0}%` }
      ];
    case 'returns':
      return [
        { key: 'returnNo', label: 'Return No' },
        { key: 'returnDate', label: 'Date', render: (row) => safeDate(row.returnDate), csv: (row) => safeDate(row.returnDate) },
        { key: 'shopName', label: 'Shop' },
        { key: 'returnType', label: 'Type' },
        { key: 'stockAction', label: 'Stock Action' },
        { key: 'qty', label: 'Qty', align: 'right', render: (row) => qty(row.qty) },
        { key: 'creditAmount', label: 'Credit', align: 'right', render: (row) => `Rs. ${money(row.creditAmount)}` }
      ];
    case 'offer-usage':
      return [
        { key: 'redeemedAt', label: 'Date', render: (row) => safeDate(row.redeemedAt), csv: (row) => safeDate(row.redeemedAt) },
        { key: 'offerNo', label: 'Offer No' },
        { key: 'offerName', label: 'Offer' },
        { key: 'shopName', label: 'Shop' },
        { key: 'freeQty', label: 'Free Qty', align: 'right', render: (row) => qty(row.freeQty) },
        { key: 'discountAmount', label: 'Discount', align: 'right', render: (row) => `Rs. ${money(row.discountAmount)}` }
      ];
    default:
      return [];
  }
}

function renderExtraBlocks(tab, data) {
  if (tab === 'collections' && Array.isArray(data.methodSummary) && data.methodSummary.length) {
    return <div className="dist-pro-mini-metrics">{data.methodSummary.map((item) => <span key={item.method}>{item.method}: <b>Rs. {money(item.amount)}</b></span>)}</div>;
  }
  if (tab === 'returns' && Array.isArray(data.typeSummary) && data.typeSummary.length) {
    return <div className="dist-pro-mini-metrics">{data.typeSummary.map((item) => <span key={item.returnType}>{item.returnType}: <b>Rs. {money(item.creditAmount)}</b></span>)}</div>;
  }
  if (tab === 'offer-usage' && Array.isArray(data.offerSummary) && data.offerSummary.length) {
    return <div className="dist-pro-mini-metrics">{data.offerSummary.slice(0, 4).map((item) => <span key={item.offerNo}>{item.offerName}: <b>{item.redemptions}</b></span>)}</div>;
  }
  return null;
}
