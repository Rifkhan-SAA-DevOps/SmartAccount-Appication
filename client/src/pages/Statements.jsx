import { useEffect, useMemo, useState } from 'react';
import { FileDown, MessageCircle, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';

function money(value) {
  return `LKR ${Number(value || 0).toFixed(2)}`;
}

function shortDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function startOfMonth() {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

function today() {
  return isoDate(new Date());
}

function partyPhoneForWhatsapp(phone = '') {
  const digits = String(phone).replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('94')) return digits;
  if (digits.startsWith('0')) return `94${digits.slice(1)}`;
  return digits;
}

export default function Statements() {
  const [activeType, setActiveType] = useState('customers');
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [from, setFrom] = useState(startOfMonth());
  const [to, setTo] = useState(today());
  const [statement, setStatement] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadParties() {
    const [customerRes, supplierRes] = await Promise.all([
      api.get('/customers'),
      api.get('/suppliers')
    ]);
    setCustomers(customerRes.data);
    setSuppliers(supplierRes.data);

    const currentList = activeType === 'customers' ? customerRes.data : supplierRes.data;
    if (!selectedId && currentList[0]) setSelectedId(currentList[0].id);
  }

  useEffect(() => {
    loadParties().catch((e) => setError(e.response?.data?.message || 'Failed to load customers and suppliers'));
  }, []);

  useEffect(() => {
    const list = activeType === 'customers' ? customers : suppliers;
    setStatement(null);
    setSelectedId(list[0]?.id || '');
  }, [activeType]);

  const parties = activeType === 'customers' ? customers : suppliers;
  const selectedParty = useMemo(() => parties.find((p) => p.id === selectedId), [parties, selectedId]);
  const partyLabel = activeType === 'customers' ? 'Customer' : 'Supplier';
  const endpointType = activeType;

  async function loadStatement() {
    setError('');
    setSuccess('');
    if (!selectedId) return setError(`Select a ${partyLabel.toLowerCase()} first`);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const { data } = await api.get(`/statements/${endpointType}/${selectedId}?${params.toString()}`);
      setStatement(data);
    } catch (e) { setError(e.response?.data?.message || 'Failed to load statement'); }
  }

  useEffect(() => {
    if (selectedId) loadStatement();
  }, [selectedId]);

  async function openPrintableStatement() {
    setError('');
    if (!selectedId) return setError(`Select a ${partyLabel.toLowerCase()} first`);
    try {
      const params = new URLSearchParams();
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      const { data } = await api.get(`/statements/${endpointType}/${selectedId}/print?${params.toString()}`, { responseType: 'text' });
      const win = window.open('', '_blank');
      if (!win) return setError('Popup blocked. Allow popups to open statement print preview.');
      win.document.open();
      win.document.write(data);
      win.document.close();
    } catch (e) { setError(e.response?.data?.message || 'Failed to open printable statement'); }
  }

  function statementText() {
    if (!statement) return '';
    const label = statement.partyType === 'SUPPLIER' ? 'Supplier Statement' : 'Customer Statement';
    const balanceLabel = statement.partyType === 'SUPPLIER' ? 'Payable balance' : 'Outstanding balance';
    return `${label}\n${statement.party?.name || '-'}\nPeriod: ${from || 'Start'} to ${to || 'Today'}\nOpening: ${money(statement.openingBalance)}\nDebit: ${money(statement.totalDebit)}\nCredit: ${money(statement.totalCredit)}\n${balanceLabel}: ${money(statement.closingBalance)}\n\nPlease contact us if you have any questions about this statement.`;
  }

  async function copyStatementText() {
    setError('');
    setSuccess('');
    if (!statement) return setError('Generate a statement first');
    try {
      await navigator.clipboard.writeText(statementText());
      setSuccess('Statement summary copied. You can paste it to WhatsApp, email, or SMS.');
    } catch {
      setError('Could not copy text. Please use the WhatsApp button or print preview.');
    }
  }

  function openWhatsApp() {
    if (!statement) return setError('Generate a statement first');
    const phone = partyPhoneForWhatsapp(statement.party?.phone || selectedParty?.phone || '');
    const text = encodeURIComponent(statementText());
    const url = phone ? `https://wa.me/${phone}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  const columns = [
    { key: 'date', label: 'Date', render: (r) => shortDate(r.date) },
    { key: 'type', label: 'Type' },
    { key: 'ref', label: 'Reference' },
    { key: 'description', label: 'Description' },
    { key: 'debit', label: 'Debit', render: (r) => money(r.debit) },
    { key: 'credit', label: 'Credit', render: (r) => money(r.credit) },
    { key: 'balance', label: 'Balance', render: (r) => money(r.balance) }
  ];

  return (
    <div className="page statements-page">
      <div className="page-head">
        <div>
          <h1>Customer & Supplier Statements</h1>
          <p>Generate monthly credit/outstanding statements, print to PDF, and share summaries by WhatsApp.</p>
        </div>
        <div className="tab-actions">
          <button className={`tab-btn ${activeType === 'customers' ? 'active' : ''}`} onClick={() => setActiveType('customers')}>Customer Statement</button>
          <button className={`tab-btn ${activeType === 'suppliers' ? 'active' : ''}`} onClick={() => setActiveType('suppliers')}>Supplier Statement</button>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <section className="panel statement-filter-panel">
        <div className="form-grid four statement-filter-grid">
          <label>{partyLabel}
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              <option value="">Select {partyLabel.toLowerCase()}</option>
              {parties.map((party) => <option key={party.id} value={party.id}>{party.name} — {money(party.balance)}</option>)}
            </select>
          </label>
          <label>From
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label>To
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="statement-actions">
            <button className="primary-btn" onClick={loadStatement}><RefreshCw size={18} /> Generate</button>
            <button className="secondary-btn" onClick={openPrintableStatement}><FileDown size={18} /> Print / PDF</button>
          </div>
        </div>
      </section>

      {statement && (
        <>
          <section className="panel statement-party-card">
            <div>
              <span>{statement.partyType === 'SUPPLIER' ? 'Supplier' : 'Customer'}</span>
              <h2>{statement.party?.name}</h2>
              <p>{[statement.party?.phone, statement.party?.email, statement.party?.address].filter(Boolean).join(' • ') || 'No contact details added'}</p>
            </div>
            <div className="statement-share-actions">
              <button className="secondary-btn" onClick={copyStatementText}>Copy Summary</button>
              <button className="primary-btn" onClick={openWhatsApp}><MessageCircle size={18} /> WhatsApp</button>
            </div>
          </section>

          <div className="stat-grid statement-stat-grid">
            <div className="stat-card"><span>Opening Balance</span><strong>{money(statement.openingBalance)}</strong><small>Before selected period</small><div className="stat-orb" /></div>
            <div className="stat-card tone-blue"><span>Total Debit</span><strong>{money(statement.totalDebit)}</strong><small>Invoices / GRN debit side</small><div className="stat-orb" /></div>
            <div className="stat-card tone-green"><span>Total Credit</span><strong>{money(statement.totalCredit)}</strong><small>Payments / returns credit side</small><div className="stat-orb" /></div>
            <div className="stat-card tone-orange"><span>Closing Balance</span><strong>{money(statement.closingBalance)}</strong><small>Stored balance: {money(statement.storedBalance)}</small><div className="stat-orb" /></div>
          </div>

          <section className="panel">
            <div className="ledger-toolbar statement-table-head">
              <div>
                <h2>Statement Transactions</h2>
                <p>{statement.entries.length} transaction(s) from {from || 'beginning'} to {to || 'today'}.</p>
              </div>
              <button className="secondary-btn" onClick={openPrintableStatement}>Open Printable Statement</button>
            </div>
            <DataTable columns={columns} rows={statement.entries || []} empty="No statement transactions for this period" />
          </section>
        </>
      )}
    </div>
  );
}
