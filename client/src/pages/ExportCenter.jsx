import { useState } from 'react';
import { api } from '../api/http.js';

const exportOptions = [
  { type: 'sales', title: 'Sales Invoice Report', desc: 'Invoice header data with customer, branch, tax, paid and balance.' },
  { type: 'sales-items', title: 'Product Profit Report', desc: 'Line item sales with quantity, cost, sale value and profit.' },
  { type: 'stock', title: 'Stock Valuation Report', desc: 'Product stock, reorder level, cost, sale price and stock value.' },
  { type: 'warehouse-stock', title: 'Warehouse Stock Report', desc: 'Warehouse and branch-wise product quantity and value.' },
  { type: 'customers-outstanding', title: 'Customer Outstanding Report', desc: 'Customers with unpaid balances and credit limits.' },
  { type: 'suppliers-outstanding', title: 'Supplier Outstanding Report', desc: 'Suppliers with unpaid payable balances.' },
  { type: 'expenses', title: 'Expense Report', desc: 'Expense entries by date, category, account, method and reference.' },
  { type: 'payments', title: 'Payment Receipt Report', desc: 'Customer receipts and supplier payments by method and account.' },
  { type: 'profit-loss', title: 'Profit & Loss Summary', desc: 'Sales, returns, COGS, expenses, gross profit and net profit.' },
  { type: 'tax', title: 'Tax Summary', desc: 'Sales tax, purchase tax, return tax and estimated net tax.' },
  { type: 'returns', title: 'Sales & Purchase Returns', desc: 'Return documents, party, reference, total and refund amount.' }
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

async function downloadReport(type, from, to, setStatus) {
  setStatus(`Preparing ${type} export...`);
  try {
    const res = await api.get(`/reports/export/${type}`, { params: { from, to }, responseType: 'blob' });
    const url = URL.createObjectURL(new Blob([res.data], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `smartledger-${type}-${today()}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setStatus(`Downloaded ${type} export.`);
  } catch (e) {
    setStatus(e.response?.data?.message || `Failed to export ${type}.`);
  }
}

export default function ExportCenter() {
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(today());
  const [status, setStatus] = useState('Choose a report and download it as CSV. You can open CSV files in Excel or Google Sheets.');

  return (
    <div className="page export-center-page">
      <div className="page-head">
        <div>
          <h1>Export Center</h1>
          <p>Download clean business reports for accountants, auditors, owners and managers.</p>
        </div>
      </div>

      <section className="panel report-filter-panel">
        <div className="form-grid three">
          <label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <label>Export Status<input value={status} readOnly /></label>
        </div>
      </section>

      <div className="export-grid">
        {exportOptions.map((option) => (
          <section className="export-card" key={option.type}>
            <div>
              <span>CSV</span>
              <h2>{option.title}</h2>
              <p>{option.desc}</p>
            </div>
            <button className="primary-btn" onClick={() => downloadReport(option.type, from, to, setStatus)}>Download</button>
          </section>
        ))}
      </div>

      <section className="panel upload-note">
        <strong>Real-world use:</strong> Export monthly reports and send them to an accountant, compare branch performance, check slow stock, prepare supplier/customer statements, and keep tax records.
      </section>
    </div>
  );
}
