import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/http.js';
import StatCard from '../components/ui/StatCard.jsx';
import DataTable from '../components/ui/DataTable.jsx';

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/dashboard/summary').then((r) => setData(r.data)).catch((e) => setError(e.response?.data?.message || 'Failed to load dashboard'));
  }, []);

  const cards = data?.cards || {};

  return (
    <div className="page">
      <div className="page-head">
        <div><h1>Good Morning 👋</h1><p>Here is what is happening with your business today.</p></div>
        <div className="head-actions"><Link className="primary-btn" to="/invoices">New Invoice</Link><Link className="secondary-btn" to="/pos">Open POS</Link></div>
      </div>
      {error && <div className="error-box">{error}</div>}
      <div className="stat-grid">
        <StatCard title="Today Sales" value={`LKR ${cards.todaySales || 0}`} subtitle={`${cards.todayInvoiceCount || 0} invoices`} tone="purple" />
        <StatCard title="Customer Credit" value={`LKR ${cards.customerCredit || 0}`} subtitle="Outstanding balance" tone="orange" />
        <StatCard title="Products" value={cards.products || 0} subtitle={`${cards.lowStock || 0} low stock`} tone="blue" />
        <StatCard title="Customers" value={cards.customers || 0} subtitle={`${cards.suppliers || 0} suppliers`} tone="green" />
      </div>
      <div className="quick-grid">
        <Link to="/invoices" className="quick-card">🧾 New Invoice</Link>
        <Link to="/customers" className="quick-card">👥 Add Customer</Link>
        <Link to="/products" className="quick-card">📦 Add Product</Link>
        <Link to="/reports" className="quick-card">📊 View Reports</Link>
      </div>
      <section className="panel">
        <h2>Recent Invoices</h2>
        <DataTable columns={[
          { key: 'invoiceNo', label: 'Invoice No' },
          { key: 'customer', label: 'Customer', render: (r) => r.customer?.name || 'Walk-in' },
          { key: 'total', label: 'Total', render: (r) => `LKR ${r.total}` },
          { key: 'status', label: 'Status', render: (r) => <span className={`badge ${String(r.status).toLowerCase()}`}>{r.status}</span> }
        ]} rows={data?.recentInvoices || []} />
      </section>
    </div>
  );
}
