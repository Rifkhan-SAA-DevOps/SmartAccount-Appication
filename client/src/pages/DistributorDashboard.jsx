import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Boxes,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Loader2,
  PackageCheck,
  RefreshCcw,
  Route,
  Store,
  Truck,
  UserRoundCheck,
  WalletCards
} from 'lucide-react';
import { api } from '../api/http.js';
import './DistributorDashboard.css';

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function money(value) {
  return Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function qty(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function dateTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

function trendLabel(value) {
  const n = Number(value || 0);
  if (n > 0) return `+${n}% vs yesterday`;
  if (n < 0) return `${n}% vs yesterday`;
  return 'No change vs yesterday';
}

function Card({ icon: Icon, label, value, hint, tone = 'blue', trend }) {
  return (
    <div className={`dd-card tone-${tone}`}>
      <div className="dd-card-icon"><Icon size={21} /></div>
      <div className="dd-card-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{hint}</small>
      </div>
      {trend !== undefined && <em className={Number(trend) >= 0 ? 'positive' : 'negative'}>{trendLabel(trend)}</em>}
    </div>
  );
}

function ProgressBar({ value }) {
  const safeValue = Math.max(0, Math.min(100, Number(value || 0)));
  return <div className="dd-progress"><span style={{ width: `${safeValue}%` }} /></div>;
}

function Empty({ text = 'No records found.' }) {
  return <div className="dd-empty">{text}</div>;
}

export default function DistributorDashboard() {
  const [date, setDate] = useState(todayInput());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/distributor-dashboard/summary', { params: { date } });
      setData(res.data || null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load distributor dashboard');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const cards = data?.cards || {};
  const routes = data?.routes || [];
  const reps = data?.reps || [];
  const vans = data?.vans || [];
  const actions = data?.actions || [];
  const timeline = data?.timeline || [];
  const products = data?.topProducts || [];
  const stockWarnings = data?.stockWarnings || [];
  const collectionMethods = data?.methodBreakdown || [];

  const bestRoute = useMemo(() => routes[0] || null, [routes]);

  return (
    <div className="distributor-dashboard-page">
      <section className="dd-hero">
        <div>
          <span className="dd-eyebrow"><BarChart3 size={16} /> Version 6.6</span>
          <h1>Distributor Owner Dashboard</h1>
          <p>One-page daily closing view for route sales, collections, vans, shop outstanding, returns, products and owner action items.</p>
        </div>
        <div className="dd-controls">
          <label>
            <CalendarDays size={16} />
            <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </label>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="spin" size={17} /> : <RefreshCcw size={17} />}
            Refresh
          </button>
        </div>
      </section>

      {error && <div className="dd-error"><AlertTriangle size={18} /> {error}</div>}

      <section className="dd-grid dd-card-grid">
        <Card icon={Route} label="Today Route Sales" value={`Rs. ${money(cards.todaySales)}`} hint={`Target achievement ${cards.targetAchievement || 0}%`} tone="pink" trend={cards.salesTrend} />
        <Card icon={WalletCards} label="Today Collections" value={`Rs. ${money(cards.todayCollections)}`} hint={`Collection rate ${cards.collectionRate || 0}%`} tone="green" trend={cards.collectionTrend} />
        <Card icon={Store} label="Total Shop Outstanding" value={`Rs. ${money(cards.outstanding)}`} hint={`${cards.overdueShops || 0} credit-risk shops`} tone="amber" />
        <Card icon={Truck} label="Van Closing" value={`${cards.closedVans || 0}/${cards.activeVans || 0}`} hint="Closed vans today" tone="blue" />
      </section>

      <section className="dd-main-layout">
        <div className="dd-left-stack">
          <div className="dd-panel dd-owner-panel">
            <div className="dd-panel-title">
              <div><h2>Owner Daily Closing</h2><p>Important numbers to verify before closing the business day.</p></div>
              <CheckCircle2 size={22} />
            </div>
            <div className="dd-closing-grid">
              <div><span>Net sales</span><strong>Rs. {money(cards.todayNetSales)}</strong></div>
              <div><span>Returns / credit notes</span><strong>Rs. {money(cards.todayReturns)}</strong></div>
              <div><span>Route expenses</span><strong>Rs. {money(cards.routeExpenses)}</strong></div>
              <div><span>Pending visits</span><strong>{cards.pendingVisits || 0}</strong></div>
              <div><span>Completed visits</span><strong>{cards.completedVisits || 0}/{cards.totalVisits || 0}</strong></div>
              <div><span>Blocked shops</span><strong>{cards.blockedShops || 0}</strong></div>
            </div>
            <div className="dd-target-line">
              <span>Daily sales target</span>
              <b>{cards.targetAchievement || 0}%</b>
              <ProgressBar value={cards.targetAchievement || 0} />
            </div>
          </div>

          <div className="dd-panel">
            <div className="dd-panel-title">
              <div><h2>Route Performance</h2><p>Today sales, collections and target achievement by route.</p></div>
              <Route size={22} />
            </div>
            <div className="dd-route-list">
              {routes.length ? routes.slice(0, 8).map((route) => (
                <div className="dd-route-row" key={route.routeId}>
                  <div>
                    <strong>{route.routeName}</strong>
                    <small>{route.area} • {route.salesRep} • {route.shops} shops</small>
                  </div>
                  <div className="dd-route-metrics">
                    <span>Rs. {money(route.sales)}</span>
                    <b>{route.achievement}%</b>
                    <ProgressBar value={route.achievement} />
                  </div>
                </div>
              )) : <Empty text="No route sales found for selected day." />}
            </div>
          </div>

          <div className="dd-panel">
            <div className="dd-panel-title">
              <div><h2>Van & Route Stock Closing</h2><p>Check vans that are not closed and stock remaining inside vehicles.</p></div>
              <Truck size={22} />
            </div>
            <div className="dd-table-wrap">
              <table className="dd-table">
                <thead><tr><th>Van</th><th>Route</th><th>Stock Qty</th><th>Stock Value</th><th>Status</th></tr></thead>
                <tbody>
                  {vans.length ? vans.slice(0, 8).map((van) => (
                    <tr key={van.vanId}>
                      <td><b>{van.vanName}</b><small>{van.vehicleNo}</small></td>
                      <td>{van.routeName}</td>
                      <td className="num">{qty(van.stockQty)}</td>
                      <td className="num">Rs. {money(van.stockValue)}</td>
                      <td><span className={van.closingStatus === 'Closed today' ? 'dd-pill ok' : 'dd-pill warn'}>{van.closingStatus}</span></td>
                    </tr>
                  )) : <tr><td colSpan="5"><Empty text="No van records found." /></td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside className="dd-right-stack">
          <div className="dd-panel dd-action-panel">
            <div className="dd-panel-title compact">
              <div><h2>Owner Action List</h2><p>What needs attention now.</p></div>
              <AlertTriangle size={22} />
            </div>
            {actions.length ? actions.map((action, index) => (
              <div className={`dd-action priority-${String(action.priority || '').toLowerCase()}`} key={`${action.type}-${index}`}>
                <span>{action.priority}</span>
                <strong>{action.title}</strong>
                <p>{action.detail}</p>
                <small>{action.routeName}</small>
              </div>
            )) : <Empty text="No urgent action found." />}
          </div>

          <div className="dd-panel">
            <div className="dd-panel-title compact"><div><h2>Top Sales Reps</h2><p>Sales and collections today.</p></div><UserRoundCheck size={22} /></div>
            <div className="dd-mini-list">
              {reps.length ? reps.slice(0, 6).map((rep) => (
                <div className="dd-mini-item" key={rep.employeeId}>
                  <div><strong>{rep.name}</strong><small>{rep.visits} visits • {rep.invoices} invoices</small></div>
                  <b>Rs. {money(rep.netSales)}</b>
                </div>
              )) : <Empty text="No sales rep activity found." />}
            </div>
          </div>

          <div className="dd-panel">
            <div className="dd-panel-title compact"><div><h2>Collection Methods</h2><p>Cash, bank, cheque and card.</p></div><WalletCards size={22} /></div>
            <div className="dd-method-list">
              {collectionMethods.length ? collectionMethods.map((item) => (
                <div className="dd-method" key={item.method}><span>{item.method}</span><strong>Rs. {money(item.amount)}</strong><small>{item.count} receipt(s)</small></div>
              )) : <Empty text="No collections today." />}
            </div>
          </div>
        </aside>
      </section>

      <section className="dd-bottom-grid">
        <div className="dd-panel">
          <div className="dd-panel-title compact"><div><h2>Top Products Moved</h2><p>Product quantity and value from shop supply invoices.</p></div><PackageCheck size={22} /></div>
          <div className="dd-mini-list">
            {products.length ? products.map((product) => (
              <div className="dd-mini-item" key={product.productId}>
                <div><strong>{product.productName}</strong><small>Qty {qty(product.qty)} • Free {qty(product.freeQty)}</small></div>
                <b>Rs. {money(product.value)}</b>
              </div>
            )) : <Empty text="No products moved today." />}
          </div>
        </div>

        <div className="dd-panel">
          <div className="dd-panel-title compact"><div><h2>Stock Warnings</h2><p>Products at or below reorder level.</p></div><Boxes size={22} /></div>
          <div className="dd-mini-list">
            {stockWarnings.length ? stockWarnings.map((product) => (
              <div className="dd-mini-item warning" key={product.productId}>
                <div><strong>{product.productName}</strong><small>Stock {qty(product.stockQty)} • Reorder {qty(product.reorderLevel)}</small></div>
                <b>Rs. {money(product.estimatedValue)}</b>
              </div>
            )) : <Empty text="No low-stock warning found." />}
          </div>
        </div>

        <div className="dd-panel">
          <div className="dd-panel-title compact"><div><h2>Today Activity Timeline</h2><p>Latest supply, collection and return activity.</p></div><ClipboardList size={22} /></div>
          <div className="dd-timeline">
            {timeline.length ? timeline.map((item) => (
              <div className="dd-timeline-item" key={item.id}>
                <span>{item.type}</span>
                <div><strong>{item.title}</strong><small>{dateTime(item.time)} • {item.status}</small></div>
                <b>Rs. {money(item.amount)}</b>
              </div>
            )) : <Empty text="No activity found today." />}
          </div>
        </div>
      </section>

      {bestRoute && (
        <section className="dd-highlight">
          <div><ArrowUpRight size={22} /><strong>Best route today</strong><span>{bestRoute.routeName}</span></div>
          <p>Sales Rs. {money(bestRoute.sales)}, collections Rs. {money(bestRoute.collections)}, target achievement {bestRoute.achievement}%.</p>
        </section>
      )}
    </div>
  );
}
