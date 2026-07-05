import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import '../styles/stage13-registers-finance-polish.css';

const tabs = [
  { key: 'overview', label: 'Overview' },
  { key: 'sales', label: 'Sales' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'finance', label: 'Finance' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

function money(value) {
  return `LKR ${Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function number(value) {
  return Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
}

function dateText(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

async function downloadReport(type, from, to) {
  const res = await api.get(`/reports/export/${type}`, { params: { from, to }, responseType: 'blob' });
  const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `smartledger-${type}-${today()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function MiniBar({ value, max }) {
  const width = max > 0 ? Math.max(4, Math.min(100, (Number(value || 0) / max) * 100)) : 0;
  return <div className="mini-bar"><span style={{ width: `${width}%` }} /></div>;
}

export default function Reports() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [overview, setOverview] = useState(null);
  const [sales, setSales] = useState(null);
  const [inventory, setInventory] = useState(null);
  const [finance, setFinance] = useState(null);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const params = { from, to };
      const [overviewRes, salesRes, inventoryRes, financeRes] = await Promise.all([
        api.get('/reports/overview', { params }),
        api.get('/reports/sales-advanced', { params }),
        api.get('/reports/inventory-advanced', { params }),
        api.get('/reports/finance-advanced', { params })
      ]);
      setOverview(overviewRes.data);
      setSales(salesRes.data);
      setInventory(inventoryRes.data);
      setFinance(financeRes.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const maxDailySales = useMemo(() => Math.max(...(overview?.dailySales || []).map((row) => Number(row.sales || 0)), 0), [overview]);
  const topProductMax = useMemo(() => Math.max(...(sales?.productWise || []).map((row) => Number(row.sales || 0)), 0), [sales]);

  return (
    <div className="page reports-page">
      <div className="page-head">
        <div>
          <h1>Advanced Reports</h1>
          <p>Sales, stock, profit, tax, payment, customer and supplier reports in one place.</p>
        </div>
        <div className="head-actions no-print">
          <button className="secondary-btn" onClick={() => window.print()}>Print / Save PDF</button>
          <button className="primary-btn" onClick={load}>Refresh</button>
        </div>
      </div>

      <section className="panel report-filter-panel no-print">
        <div className="form-grid four">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Quick Export
            <select onChange={(e) => e.target.value && downloadReport(e.target.value, from, to)} defaultValue="">
              <option value="">Choose CSV export</option>
              <option value="sales">Sales invoices</option>
              <option value="sales-items">Sales items / product profit</option>
              <option value="stock">Stock summary</option>
              <option value="warehouse-stock">Warehouse stock</option>
              <option value="profit-loss">Profit & loss</option>
              <option value="tax">Tax report</option>
              <option value="expenses">Expenses</option>
              <option value="payments">Payments</option>
              <option value="customers-outstanding">Customer outstanding</option>
              <option value="suppliers-outstanding">Supplier outstanding</option>
              <option value="returns">Returns</option>
            </select>
          </label>
          <div className="filter-action"><button className="primary-btn full-width" onClick={load}>Apply Date Filter</button></div>
        </div>
      </section>

      {error && <div className="error-box">{error}</div>}
      {loading && <section className="panel">Loading advanced reports...</section>}

      {!loading && overview && (
        <>
          <div className="stat-grid report-stat-grid">
            <div className="stat-card"><span>Net Sales</span><strong>{money(Number(overview.kpis.salesTotal) - Number(overview.kpis.salesReturnTotal))}</strong><small>Gross: {money(overview.kpis.salesTotal)}</small></div>
            <div className="stat-card tone-green"><span>Gross Profit</span><strong>{money(overview.kpis.grossProfit)}</strong><small>COGS: {money(overview.kpis.cogs)}</small></div>
            <div className="stat-card tone-blue"><span>Net Profit</span><strong>{money(overview.kpis.netProfit)}</strong><small>Expenses: {money(overview.kpis.expenseTotal)}</small></div>
            <div className="stat-card tone-orange"><span>Stock Value</span><strong>{money(overview.kpis.stockValue)}</strong><small>{overview.kpis.lowStockCount} low stock items</small></div>
            <div className="stat-card"><span>Customer Credit</span><strong>{money(overview.kpis.customerOutstanding)}</strong><small>Invoice balance: {money(overview.kpis.salesBalance)}</small></div>
            <div className="stat-card tone-orange"><span>Supplier Payable</span><strong>{money(overview.kpis.supplierOutstanding)}</strong><small>Purchases: {money(overview.kpis.purchaseTotal)}</small></div>
            <div className="stat-card tone-green"><span>Cash/Bank Balance</span><strong>{money(overview.kpis.bankBalance)}</strong><small>In: {money(overview.kpis.paymentIn)} / Out: {money(overview.kpis.paymentOut)}</small></div>
            <div className="stat-card tone-blue"><span>Tax Summary</span><strong>{money(Number(overview.kpis.salesTax) - Number(overview.kpis.purchaseTax))}</strong><small>Sales tax - purchase tax</small></div>
          </div>

          <div className="report-tabs no-print">
            {tabs.map((tab) => <button key={tab.key} className={activeTab === tab.key ? 'active' : ''} onClick={() => setActiveTab(tab.key)}>{tab.label}</button>)}
          </div>

          {activeTab === 'overview' && (
            <div className="report-grid two stage13-report-stack">
              <section className="panel">
                <div className="section-head"><div><h2>Daily Sales Trend</h2><p>Invoice totals for the selected period.</p></div></div>
                <div className="trend-list">
                  {(overview.dailySales || []).map((row) => (
                    <div className="trend-row" key={row.date}>
                      <span>{row.date}</span>
                      <MiniBar value={row.sales} max={maxDailySales} />
                      <b>{money(row.sales)}</b>
                    </div>
                  ))}
                  {!overview.dailySales?.length && <div className="empty-cell">No sales in this period</div>}
                </div>
              </section>
              <section className="panel">
                <h2>Important Alerts</h2>
                <DataTable columns={[{ key: 'name', label: 'Low Stock Product' }, { key: 'stockQty', label: 'Stock', render: (r) => number(r.stockQty) }, { key: 'reorderLevel', label: 'Reorder', render: (r) => number(r.reorderLevel) }]} rows={overview.lowStock || []} />
              </section>
              <section className="panel"><h2>Top Customer Outstanding</h2><DataTable columns={[{ key: 'name', label: 'Customer' }, { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }]} rows={overview.topCustomers || []} /></section>
              <section className="panel"><h2>Top Supplier Payable</h2><DataTable columns={[{ key: 'name', label: 'Supplier' }, { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }]} rows={overview.topSuppliers || []} /></section>
            </div>
          )}

          {activeTab === 'sales' && sales && (
            <div className="page">
              <section className="panel">
                <div className="section-head"><div><h2>Product-wise Sales & Profit</h2><p>Shows best-selling products, cost, sales and estimated gross profit.</p></div><button className="secondary-btn no-print" onClick={() => downloadReport('sales-items', from, to)}>Export Items CSV</button></div>
                <DataTable columns={[{ key: 'product', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'qty', label: 'Qty', render: (r) => number(r.qty) }, { key: 'sales', label: 'Sales', render: (r) => money(r.sales) }, { key: 'cogs', label: 'COGS', render: (r) => money(r.cogs) }, { key: 'profit', label: 'Profit', render: (r) => money(r.profit) }]} rows={sales.productWise || []} />
                <div className="top-bars">
                  {(sales.productWise || []).slice(0, 8).map((row) => <div className="trend-row" key={row.productId || row.product}><span>{row.product}</span><MiniBar value={row.sales} max={topProductMax} /><b>{money(row.sales)}</b></div>)}
                </div>
              </section>
              <div className="report-grid two stage13-report-stack">
                <section className="panel"><h2>Customer-wise Sales</h2><DataTable columns={[{ key: 'customer', label: 'Customer' }, { key: 'invoices', label: 'Invoices' }, { key: 'sales', label: 'Sales', render: (r) => money(r.sales) }, { key: 'paid', label: 'Paid', render: (r) => money(r.paid) }, { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }]} rows={sales.customerWise || []} /></section>
                <section className="panel"><h2>Payment Methods</h2><DataTable columns={[{ key: 'method', label: 'Method' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }]} rows={sales.paymentMethods || []} /></section>
                <section className="panel"><h2>Branch-wise Sales</h2><DataTable columns={[{ key: 'branch', label: 'Branch' }, { key: 'invoices', label: 'Invoices' }, { key: 'sales', label: 'Sales', render: (r) => money(r.sales) }, { key: 'paid', label: 'Paid', render: (r) => money(r.paid) }]} rows={sales.branchWise || []} /></section>
                <section className="panel"><h2>Invoice List</h2><DataTable columns={[{ key: 'invoiceNo', label: 'Invoice' }, { key: 'issueDate', label: 'Date', render: (r) => dateText(r.issueDate) }, { key: 'customer', label: 'Customer', render: (r) => r.customer?.name || 'Walk-in' }, { key: 'status', label: 'Status' }, { key: 'total', label: 'Total', render: (r) => money(r.total) }, { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }]} rows={sales.invoices || []} /></section>
              </div>
            </div>
          )}

          {activeTab === 'inventory' && inventory && (
            <div className="page">
              <div className="stat-grid">
                <div className="stat-card"><span>Products</span><strong>{inventory.summary.products}</strong><small>Active product records</small></div>
                <div className="stat-card tone-orange"><span>Low Stock</span><strong>{inventory.summary.lowStock}</strong><small>{inventory.summary.outOfStock} out of stock</small></div>
                <div className="stat-card tone-green"><span>Stock Value</span><strong>{money(inventory.summary.stockValue)}</strong><small>Warehouse/product stock value</small></div>
                <div className="stat-card tone-blue"><span>Stock Movements</span><strong>{inventory.summary.movements}</strong><small>During selected period</small></div>
              </div>
              <section className="panel"><div className="section-head"><div><h2>Stock Valuation</h2><p>Product quantity × cost price.</p></div><button className="secondary-btn no-print" onClick={() => downloadReport('stock', from, to)}>Export Stock CSV</button></div><DataTable columns={[{ key: 'name', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'stockQty', label: 'Stock', render: (r) => number(r.stockQty) }, { key: 'reorderLevel', label: 'Reorder', render: (r) => number(r.reorderLevel) }, { key: 'costPrice', label: 'Cost', render: (r) => money(r.costPrice) }, { key: 'salePrice', label: 'Sale', render: (r) => money(r.salePrice) }, { key: 'stockValue', label: 'Value', render: (r) => money(r.stockValue) }, { key: 'margin', label: 'Margin', render: (r) => money(r.margin) }]} rows={inventory.products || []} /></section>
              <div className="report-grid two stage13-report-stack">
                <section className="panel"><h2>Warehouse-wise Stock</h2><DataTable columns={[{ key: 'warehouse', label: 'Warehouse' }, { key: 'branch', label: 'Branch' }, { key: 'products', label: 'Products' }, { key: 'quantity', label: 'Qty', render: (r) => number(r.quantity) }, { key: 'value', label: 'Value', render: (r) => money(r.value) }]} rows={inventory.warehouseWise || []} /></section>
                <section className="panel"><h2>Fast Moving Products</h2><DataTable columns={[{ key: 'product', label: 'Product' }, { key: 'sku', label: 'SKU' }, { key: 'qtySold', label: 'Qty Sold', render: (r) => number(r.qtySold) }, { key: 'sales', label: 'Sales', render: (r) => money(r.sales) }]} rows={inventory.fastMoving || []} /></section>
                <section className="panel span-report"><h2>Recent Stock Movements</h2><DataTable columns={[{ key: 'createdAt', label: 'Date', render: (r) => dateText(r.createdAt) }, { key: 'product', label: 'Product', render: (r) => r.product?.name || '-' }, { key: 'type', label: 'Type' }, { key: 'quantity', label: 'Qty', render: (r) => number(r.quantity) }, { key: 'unitCost', label: 'Unit Cost', render: (r) => money(r.unitCost) }, { key: 'refType', label: 'Ref' }]} rows={inventory.movements || []} /></section>
              </div>
            </div>
          )}

          {activeTab === 'finance' && finance && (
            <div className="page">
              <div className="report-grid two stage13-report-stack">
                <section className="panel report-statement">
                  <div className="section-head"><div><h2>Profit & Loss</h2><p>Simple management P&L for the selected period.</p></div><button className="secondary-btn no-print" onClick={() => downloadReport('profit-loss', from, to)}>Export P&L CSV</button></div>
                  {Object.entries(finance.profitLoss || {}).map(([key, value]) => <div className="statement-row" key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><b>{money(value)}</b></div>)}
                </section>
                <section className="panel report-statement">
                  <div className="section-head"><div><h2>Tax Summary</h2><p>Sales tax, purchase tax and return tax foundation.</p></div><button className="secondary-btn no-print" onClick={() => downloadReport('tax', from, to)}>Export Tax CSV</button></div>
                  {Object.entries(finance.tax || {}).map(([key, value]) => <div className="statement-row" key={key}><span>{key.replace(/([A-Z])/g, ' $1')}</span><b>{money(value)}</b></div>)}
                </section>
                <section className="panel"><h2>Expense by Category</h2><DataTable columns={[{ key: 'category', label: 'Category' }, { key: 'count', label: 'Count' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }]} rows={finance.expenseByCategory || []} /></section>
                <section className="panel"><h2>Receivable Aging</h2><DataTable columns={[{ key: 'bucket', label: 'Bucket' }, { key: 'amount', label: 'Amount', render: (r) => money(r.amount) }]} rows={Object.entries(finance.receivableAging || {}).map(([bucket, amount]) => ({ bucket, amount }))} /></section>
                <section className="panel"><h2>Bank / Cash Accounts</h2><DataTable columns={[{ key: 'name', label: 'Account' }, { key: 'type', label: 'Type' }, { key: 'bankName', label: 'Bank' }, { key: 'currentBalance', label: 'Balance', render: (r) => money(r.currentBalance) }]} rows={finance.bankAccounts || []} /></section>
                <section className="panel"><h2>Supplier Outstanding</h2><DataTable columns={[{ key: 'name', label: 'Supplier' }, { key: 'phone', label: 'Phone' }, { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }]} rows={finance.supplierOutstanding?.suppliers || []} /></section>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
