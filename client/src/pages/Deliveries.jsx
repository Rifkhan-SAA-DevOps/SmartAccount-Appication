import { useEffect, useMemo, useState } from 'react';
import { BellRing, PackageCheck, Plus, RefreshCw, Truck } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import ModalDrawer from '../components/ui/ModalDrawer.jsx';
import '../styles/stage9-operations-polish.css';

const emptyLine = { productId: '', description: '', qty: 1, notes: '' };
const emptyForm = { customerId: '', invoiceId: '', salesOrderId: '', assignedEmployeeId: '', priority: 'NORMAL', scheduledDate: '', contactName: '', phone: '', address: '', deliveryFee: 0, codAmount: 0, notes: '', items: [{ ...emptyLine }] };

function money(v) { return `LKR ${Number(v || 0).toLocaleString()}`; }
function dt(v) { return v ? new Date(v).toLocaleString() : '-'; }
function statusClass(v) {
  const s = String(v || '').toLowerCase();
  if (s === 'delivered') return 'paid';
  if (s === 'returned' || s === 'cancelled') return 'cancelled';
  if (s === 'dispatched' || s === 'packed') return 'unpaid';
  return 'partial';
}

export default function Deliveries() {
  const [summary, setSummary] = useState(null);
  const [deliveries, setDeliveries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [salesOrders, setSalesOrders] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [invoiceQuick, setInvoiceQuick] = useState({ invoiceId: '', scheduledDate: '', deliveryFee: 0, priority: 'NORMAL' });
  const [filters, setFilters] = useState({ q: '', status: '', overdue: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [selectedDelivery, setSelectedDelivery] = useState(null);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, deliveryRes, customerRes, productRes, employeeRes, invoiceRes, soRes] = await Promise.all([
      api.get('/deliveries/summary'),
      api.get('/deliveries', { params }),
      api.get('/customers'),
      api.get('/products'),
      api.get('/hr/employees'),
      api.get('/invoices'),
      api.get('/quotations/sales-orders')
    ]);
    setSummary(summaryRes.data);
    setDeliveries(deliveryRes.data || []);
    setCustomers(customerRes.data || []);
    setProducts(productRes.data || []);
    setEmployees(employeeRes.data || []);
    setInvoices(invoiceRes.data || []);
    setSalesOrders(soRes.data || []);
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load deliveries')); }, []);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  function updateLine(index, patch) {
    setForm((old) => ({ ...old, items: old.items.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  }
  function addLine() { setForm((old) => ({ ...old, items: [...old.items, { ...emptyLine }] })); }
  function removeLine(index) { setForm((old) => ({ ...old, items: old.items.filter((_, i) => i !== index) })); }
  function selectProduct(index, productId) {
    const product = products.find((p) => p.id === productId);
    updateLine(index, { productId, description: product?.name || '' });
  }

  const selectedCustomer = useMemo(() => customers.find((c) => c.id === form.customerId), [customers, form.customerId]);

  async function createDelivery(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/deliveries', {
        ...form,
        customerId: form.customerId || null,
        invoiceId: form.invoiceId || null,
        salesOrderId: form.salesOrderId || null,
        assignedEmployeeId: form.assignedEmployeeId || null,
        scheduledDate: form.scheduledDate || null,
        deliveryFee: Number(form.deliveryFee || 0),
        codAmount: Number(form.codAmount || 0),
        items: form.items.map((item) => ({ ...item, productId: item.productId || null, qty: Number(item.qty || 0) }))
      });
      setForm(emptyForm);
      flash('Delivery order created');
      setDrawer(null);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create delivery'); }
    finally { setSaving(false); }
  }

  async function createFromInvoice(e) {
    e.preventDefault();
    if (!invoiceQuick.invoiceId) return;
    setSaving(true); setError('');
    try {
      await api.post(`/deliveries/from-invoice/${invoiceQuick.invoiceId}`, { scheduledDate: invoiceQuick.scheduledDate || null, deliveryFee: Number(invoiceQuick.deliveryFee || 0), priority: invoiceQuick.priority });
      setInvoiceQuick({ invoiceId: '', scheduledDate: '', deliveryFee: 0, priority: 'NORMAL' });
      flash('Delivery created from invoice');
      setDrawer(null);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create delivery from invoice'); }
    finally { setSaving(false); }
  }

  async function changeStatus(row, status) {
    const payload = { status, notes: `Changed to ${status}` };
    if (status === 'DELIVERED') {
      payload.collectedAmount = Number(window.prompt('Collected COD amount?', row.codAmount || 0) || 0);
      payload.proofName = window.prompt('Received by / proof name?', row.contactName || row.customerName || '') || '';
      payload.proofNote = window.prompt('Proof note?', 'Delivered successfully') || '';
    }
    if (status === 'RETURNED') payload.notes = window.prompt('Return reason?', 'Customer returned / not available') || 'Returned';
    setError('');
    try {
      await api.patch(`/deliveries/${row.id}/status`, payload);
      flash(`${row.deliveryNo} changed to ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update delivery'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/deliveries/alerts');
      flash(`${data.created} overdue delivery alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create delivery alerts'); }
  }

  const columns = [
    { key: 'deliveryNo', label: 'Delivery', render: (r) => <><strong>{r.deliveryNo}</strong><span className="table-subtext">{r.invoiceNo !== '-' ? `Invoice ${r.invoiceNo}` : r.salesOrderNo !== '-' ? `SO ${r.salesOrderNo}` : 'Manual'}</span></> },
    { key: 'customerName', label: 'Customer', render: (r) => <>{r.customerName}<span className="table-subtext">{r.phone || r.address || '-'}</span></> },
    { key: 'assigned', label: 'Assigned', render: (r) => <>{r.employeeName}<span className="table-subtext">{dt(r.scheduledDate)}</span></> },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.isOverdue && <span className="table-subtext danger-text">Overdue</span>}</> },
    { key: 'qty', label: 'Items', render: (r) => <>{r.itemCount} line(s)<span className="table-subtext">Qty {Number(r.totalQty || 0).toFixed(3)}</span></> },
    { key: 'cod', label: 'COD', render: (r) => <><strong>{money(r.codAmount)}</strong><span className="table-subtext">Collected {money(r.collectedAmount)}</span></> }
  ];

  return <div className="page deliveries-page stage8-page">
    <div className="page-header">
      <div><span className="eyebrow">Delivery / dispatch management</span><h1>Deliveries</h1><p>Create delivery orders, assign staff, dispatch goods, record proof of delivery and track returned deliveries.</p></div>
      <div className="head-actions">
        <button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button>
        <button className="secondary-btn" onClick={generateAlerts}><BellRing size={16}/> Overdue alerts</button>
        <button className="primary-btn" onClick={() => setDrawer('delivery')}><Plus size={16}/> Create Delivery</button>
      </div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid delivery-stat-grid">
      <StatCard title="Pending" value={summary?.pending || 0} subtitle={`${summary?.packed || 0} packed`} />
      <StatCard title="Dispatched" value={summary?.dispatched || 0} subtitle={`${summary?.todayDeliveries || 0} due today`} tone="orange" />
      <StatCard title="Delivered" value={summary?.delivered || 0} subtitle={`${summary?.returned || 0} returned`} tone="green" />
      <StatCard title="COD Pending" value={money(summary?.codPending)} subtitle={`${summary?.overdue || 0} overdue`} tone="red" />
    </div>

    <section className="panel delivery-register-panel ops-register-panel">
      <div className="section-title-row"><div><h2><Truck size={20}/> Delivery Register</h2><p>Full-width register with pagination. Actions stay in the table, while creation is moved to a focused drawer.</p></div></div>
      <div className="filters-row delivery-filter-row">
        <input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Search delivery/customer/invoice" />
        <select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All status</option>{['PENDING','PACKED','DISPATCHED','DELIVERED','RETURNED','CANCELLED'].map((s)=><option key={s}>{s}</option>)}</select>
        <select value={filters.overdue} onChange={(e)=>setFilters({...filters,overdue:e.target.value})}><option value="">All</option><option value="true">Overdue only</option></select>
        <button className="secondary-btn" onClick={load}>Apply</button>
      </div>
      <DataTable columns={columns} rows={deliveries} empty="No delivery orders found" onRowClick={setSelectedDelivery} paginationLabel="deliveries" />
    </section>


    <ModalDrawer open={Boolean(selectedDelivery)} onClose={() => setSelectedDelivery(null)} title={selectedDelivery ? `Delivery ${selectedDelivery.deliveryNo}` : 'Delivery Details'} eyebrow="Delivery Register" description="View delivery details and update the delivery status from this modal." mode="modal" size="lg">
      {selectedDelivery && <div className="detail-modal-content">
        <div className="detail-grid">
          <div><span>Customer</span><strong>{selectedDelivery.customerName || '-'}</strong></div>
          <div><span>Status</span><strong><span className={`badge ${statusClass(selectedDelivery.status)}`}>{selectedDelivery.status}</span></strong></div>
          <div><span>Assigned</span><strong>{selectedDelivery.employeeName || '-'}</strong></div>
          <div><span>Scheduled</span><strong>{dt(selectedDelivery.scheduledDate)}</strong></div>
          <div><span>COD</span><strong>{money(selectedDelivery.codAmount)}</strong></div>
          <div><span>Collected</span><strong>{money(selectedDelivery.collectedAmount)}</strong></div>
          <div><span>Items</span><strong>{selectedDelivery.itemCount || 0} line(s)</strong></div>
          <div><span>Total Qty</span><strong>{Number(selectedDelivery.totalQty || 0).toFixed(3)}</strong></div>
        </div>
        <div className="modal-info-block"><strong>Address</strong><p>{selectedDelivery.address || selectedDelivery.phone || 'No address added.'}</p></div>
        <div className="modal-action-row">
          {selectedDelivery.status === 'PENDING' && <button className="secondary-btn" onClick={() => { changeStatus(selectedDelivery, 'PACKED'); setSelectedDelivery(null); }}>Pack</button>}
          {['PENDING','PACKED'].includes(selectedDelivery.status) && <button className="secondary-btn" onClick={() => { changeStatus(selectedDelivery, 'DISPATCHED'); setSelectedDelivery(null); }}>Dispatch</button>}
          {!['DELIVERED','RETURNED','CANCELLED'].includes(selectedDelivery.status) && <button className="primary-btn" onClick={() => { changeStatus(selectedDelivery, 'DELIVERED'); setSelectedDelivery(null); }}>Mark Delivered</button>}
          {!['RETURNED','CANCELLED'].includes(selectedDelivery.status) && <button className="danger-btn" onClick={() => { changeStatus(selectedDelivery, 'RETURNED'); setSelectedDelivery(null); }}>Return</button>}
        </div>
      </div>}
    </ModalDrawer>

    <ModalDrawer open={drawer === 'delivery'} onClose={() => setDrawer(null)} title="Create Delivery" eyebrow="Dispatch" description="Create a delivery order without shrinking the delivery register.">
      <form className="form-grid compact" onSubmit={createDelivery}>
        <label>Customer<select value={form.customerId} onChange={(e)=>setForm({...form,customerId:e.target.value, contactName: customers.find(c=>c.id===e.target.value)?.name || '', phone: customers.find(c=>c.id===e.target.value)?.phone || '', address: customers.find(c=>c.id===e.target.value)?.address || ''})}><option value="">Walk-in / select customer</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Assign employee<select value={form.assignedEmployeeId} onChange={(e)=>setForm({...form,assignedEmployeeId:e.target.value})}><option value="">Unassigned</option>{employees.map((e)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>Invoice<select value={form.invoiceId} onChange={(e)=>setForm({...form,invoiceId:e.target.value})}><option value="">No invoice link</option>{invoices.map((i)=><option key={i.id} value={i.id}>{i.invoiceNo} · {i.customerName || i.customer?.name || ''}</option>)}</select></label>
        <label>Sales order<select value={form.salesOrderId} onChange={(e)=>setForm({...form,salesOrderId:e.target.value})}><option value="">No sales order link</option>{salesOrders.map((s)=><option key={s.id} value={s.id}>{s.orderNo} · {s.customerName || ''}</option>)}</select></label>
        <label>Priority<select value={form.priority} onChange={(e)=>setForm({...form,priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map((s)=><option key={s}>{s}</option>)}</select></label>
        <label>Scheduled<input type="datetime-local" value={form.scheduledDate} onChange={(e)=>setForm({...form,scheduledDate:e.target.value})} /></label>
        <label>Contact name<input value={form.contactName} onChange={(e)=>setForm({...form,contactName:e.target.value})} placeholder={selectedCustomer?.name || 'Receiver'} /></label>
        <label>Phone<input value={form.phone} onChange={(e)=>setForm({...form,phone:e.target.value})} /></label>
        <label className="span-two">Address<input value={form.address} onChange={(e)=>setForm({...form,address:e.target.value})} /></label>
        <label>Delivery fee<input type="number" min="0" value={form.deliveryFee} onChange={(e)=>setForm({...form,deliveryFee:e.target.value})} /></label>
        <label>COD amount<input type="number" min="0" value={form.codAmount} onChange={(e)=>setForm({...form,codAmount:e.target.value})} /></label>
        <div className="delivery-lines">
          <div className="section-title-row small"><strong>Delivery items</strong><button type="button" className="mini-action" onClick={addLine}>+ line</button></div>
          {form.items.map((line, index) => <div className="delivery-line-row" key={index}>
            <select value={line.productId} onChange={(e)=>selectProduct(index,e.target.value)}><option value="">Custom item</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
            <input value={line.description} onChange={(e)=>updateLine(index,{description:e.target.value})} placeholder="Description" required />
            <input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e)=>updateLine(index,{qty:e.target.value})} />
            <button type="button" className="mini-danger" onClick={()=>removeLine(index)} disabled={form.items.length===1}>×</button>
          </div>)}
        </div>
        <label className="span-two">Notes<input value={form.notes} onChange={(e)=>setForm({...form,notes:e.target.value})} /></label>
        <button className="primary-btn span-two" disabled={saving}><PackageCheck size={18}/> Save Delivery</button>
      </form>

      <form className="quick-invoice-box" onSubmit={createFromInvoice}>
        <h3>Create from invoice</h3>
        <select value={invoiceQuick.invoiceId} onChange={(e)=>setInvoiceQuick({...invoiceQuick,invoiceId:e.target.value})}><option value="">Select invoice</option>{invoices.map((i)=><option key={i.id} value={i.id}>{i.invoiceNo} · balance {money(i.balance)}</option>)}</select>
        <input type="datetime-local" value={invoiceQuick.scheduledDate} onChange={(e)=>setInvoiceQuick({...invoiceQuick,scheduledDate:e.target.value})} />
        <div className="form-grid two"><input type="number" min="0" value={invoiceQuick.deliveryFee} onChange={(e)=>setInvoiceQuick({...invoiceQuick,deliveryFee:e.target.value})} placeholder="Delivery fee" /><select value={invoiceQuick.priority} onChange={(e)=>setInvoiceQuick({...invoiceQuick,priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map((s)=><option key={s}>{s}</option>)}</select></div>
        <button className="secondary-btn" disabled={saving || !invoiceQuick.invoiceId}>Create from Invoice</button>
      </form>
    </ModalDrawer>
  </div>;
}
