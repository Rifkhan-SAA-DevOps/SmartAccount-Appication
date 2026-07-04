import { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, FileText, RefreshCw, Wrench } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyService = { code: '', category: 'General', name: '', unitPrice: 0, costPrice: 0, estimatedMinutes: 0, description: '' };
const emptyAppointment = { customerId: '', title: '', appointmentAt: '', endAt: '', priority: 'NORMAL', status: 'PENDING', location: '', notes: '' };
const emptyLine = { lineType: 'SERVICE', serviceItemId: '', productId: '', description: '', qty: 1, costPrice: 0, unitPrice: 0 };
const emptyJob = { customerId: '', appointmentId: '', warehouseId: '', title: '', description: '', status: 'OPEN', priority: 'NORMAL', scheduledAt: '', dueAt: '', notes: '', lines: [{ ...emptyLine }] };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dt(value) { return value ? new Date(value).toLocaleString() : '-'; }
function isoLocal(value) {
  if (!value) return '';
  const d = new Date(value);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (['completed', 'invoiced', 'confirmed', 'arrived'].includes(s)) return 'paid';
  if (['in_progress', 'waiting_parts', 'pending', 'scheduled'].includes(s)) return 'unpaid';
  if (['cancelled', 'no_show'].includes(s)) return 'cancelled';
  return 'partial';
}

export default function ServiceJobs() {
  const [summary, setSummary] = useState(null);
  const [services, setServices] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [products, setProducts] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [serviceForm, setServiceForm] = useState(emptyService);
  const [appointmentForm, setAppointmentForm] = useState(emptyAppointment);
  const [jobForm, setJobForm] = useState(emptyJob);
  const [filters, setFilters] = useState({ q: '', status: '' });
  const [tab, setTab] = useState('jobs');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, v]) => v));
    const [summaryRes, serviceRes, appointmentRes, jobRes, customerRes, productRes, warehouseRes] = await Promise.all([
      api.get('/services/summary'),
      api.get('/services/catalog', { params: { active: true } }),
      api.get('/services/appointments'),
      api.get('/services/jobs', { params }),
      api.get('/customers'),
      api.get('/products'),
      api.get('/branches/warehouses')
    ]);
    setSummary(summaryRes.data);
    setServices(serviceRes.data || []);
    setAppointments(appointmentRes.data || []);
    setJobs(jobRes.data || []);
    setCustomers(customerRes.data || []);
    setProducts(productRes.data || []);
    setWarehouses(warehouseRes.data || []);
    setJobForm((old) => ({ ...old, warehouseId: old.warehouseId || warehouseRes.data?.[0]?.id || '' }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load service jobs')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const appointmentOptions = useMemo(() => appointments.filter((a) => !['COMPLETED', 'CANCELLED', 'NO_SHOW'].includes(a.status)), [appointments]);

  function selectServiceForLine(index, serviceId) {
    const service = services.find((item) => item.id === serviceId);
    updateLine(index, {
      lineType: 'SERVICE',
      serviceItemId: serviceId,
      productId: '',
      description: service?.name || '',
      costPrice: service?.costPrice || 0,
      unitPrice: service?.unitPrice || 0
    });
  }

  function selectProductForLine(index, productId) {
    const product = products.find((item) => item.id === productId);
    updateLine(index, {
      lineType: 'MATERIAL',
      productId,
      serviceItemId: '',
      description: product?.name || '',
      costPrice: product?.costPrice || 0,
      unitPrice: product?.salePrice || 0
    });
  }

  function updateLine(index, patch) {
    setJobForm((old) => ({ ...old, lines: old.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)) }));
  }

  function addLine(type = 'SERVICE') {
    setJobForm((old) => ({ ...old, lines: [...old.lines, { ...emptyLine, lineType: type }] }));
  }

  function removeLine(index) {
    setJobForm((old) => ({ ...old, lines: old.lines.filter((_, i) => i !== index) }));
  }

  const jobTotal = useMemo(() => jobForm.lines.reduce((sum, line) => sum + Number(line.qty || 0) * Number(line.unitPrice || 0), 0), [jobForm.lines]);

  async function createService(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/services/catalog', { ...serviceForm, unitPrice: Number(serviceForm.unitPrice || 0), costPrice: Number(serviceForm.costPrice || 0), estimatedMinutes: Number(serviceForm.estimatedMinutes || 0) });
      setServiceForm(emptyService);
      flash('Service item saved');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save service item'); }
    finally { setSaving(false); }
  }

  async function createAppointment(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/services/appointments', {
        ...appointmentForm,
        customerId: appointmentForm.customerId || null,
        endAt: appointmentForm.endAt || null
      });
      setAppointmentForm(emptyAppointment);
      flash('Appointment scheduled');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to schedule appointment'); }
    finally { setSaving(false); }
  }

  async function createJob(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/services/jobs', {
        ...jobForm,
        customerId: jobForm.customerId || null,
        appointmentId: jobForm.appointmentId || null,
        warehouseId: jobForm.warehouseId || null,
        scheduledAt: jobForm.scheduledAt || null,
        dueAt: jobForm.dueAt || null,
        lines: jobForm.lines.map((line) => ({ ...line, serviceItemId: line.serviceItemId || null, productId: line.productId || null, qty: Number(line.qty || 0), costPrice: Number(line.costPrice || 0), unitPrice: Number(line.unitPrice || 0) }))
      });
      setJobForm({ ...emptyJob, warehouseId: warehouses[0]?.id || '' });
      flash('Service job / work order created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create service job'); }
    finally { setSaving(false); }
  }

  async function createJobFromAppointment(appointment) {
    setError('');
    try {
      await api.post(`/services/appointments/${appointment.id}/job`, { lines: [], title: appointment.title, warehouseId: warehouses[0]?.id || null });
      flash(`Work order created from ${appointment.appointmentNo}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create work order'); }
  }

  async function updateJobStatus(job, status) {
    setError('');
    try {
      await api.patch(`/services/jobs/${job.id}/status`, { status, notes: `Changed to ${status}`, consumeMaterials: true });
      flash(`${job.jobNo} changed to ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update job'); }
  }

  async function invoiceJob(job) {
    setError('');
    try {
      const { data } = await api.post(`/services/jobs/${job.id}/invoice`);
      flash(`${job.jobNo} invoiced as ${data.invoice.invoiceNo}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create invoice'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/services/alerts');
      flash(`${data.created} service alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate service alerts'); }
  }

  const jobColumns = [
    { key: 'jobNo', label: 'Job', render: (r) => <><strong>{r.jobNo}</strong><span className="table-subtext">{r.title}</span></> },
    { key: 'customerName', label: 'Customer', render: (r) => <>{r.customerName}<span className="table-subtext">{r.customerPhone || '-'}</span></> },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.isOverdue && <span className="table-subtext danger-text">Overdue</span>}</> },
    { key: 'priority', label: 'Priority', render: (r) => <span className={`badge ${r.priority === 'URGENT' || r.priority === 'HIGH' ? 'cancelled' : 'partial'}`}>{r.priority}</span> },
    { key: 'chargeAmount', label: 'Amount', render: (r) => <><strong>{money(r.chargeAmount)}</strong><span className="table-subtext">Profit {money(r.profit)}</span></> },
    { key: 'dueAt', label: 'Due', render: (r) => dt(r.dueAt || r.scheduledAt) },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row">
      {r.status === 'OPEN' || r.status === 'SCHEDULED' ? <button className="mini-action" onClick={() => updateJobStatus(r, 'IN_PROGRESS')}>Start</button> : null}
      {!['COMPLETED', 'INVOICED', 'CANCELLED'].includes(r.status) ? <button className="mini-action" onClick={() => updateJobStatus(r, 'COMPLETED')}>Complete</button> : null}
      {r.status !== 'INVOICED' ? <button className="mini-action" onClick={() => invoiceJob(r)}>Invoice</button> : null}
      {r.status !== 'CANCELLED' ? <button className="mini-danger" onClick={() => updateJobStatus(r, 'CANCELLED')}>Cancel</button> : null}
    </div> }
  ];

  const appointmentColumns = [
    { key: 'appointmentNo', label: 'Appointment', render: (r) => <><strong>{r.appointmentNo}</strong><span className="table-subtext">{r.title}</span></> },
    { key: 'customerName', label: 'Customer', render: (r) => <>{r.customerName}<span className="table-subtext">{r.location || r.customerPhone || '-'}</span></> },
    { key: 'appointmentAt', label: 'Time', render: (r) => <>{dt(r.appointmentAt)}{r.isOverdue && <span className="table-subtext danger-text">Overdue</span>}</> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row"><button className="mini-action" onClick={() => createJobFromAppointment(r)}>Create Job</button></div> }
  ];

  const serviceColumns = [
    { key: 'name', label: 'Service', render: (r) => <><strong>{r.name}</strong><span className="table-subtext">{r.code || '-'} · {r.category}</span></> },
    { key: 'estimatedMinutes', label: 'Time', render: (r) => `${r.estimatedMinutes || 0} min` },
    { key: 'unitPrice', label: 'Price', render: (r) => <><strong>{money(r.unitPrice)}</strong><span className="table-subtext">Cost {money(r.costPrice)}</span></> },
    { key: 'isActive', label: 'Status', render: (r) => <span className={`badge ${r.isActive ? 'paid' : 'cancelled'}`}>{r.isActive ? 'Active' : 'Inactive'}</span> }
  ];

  return <div className="page service-jobs-page">
    <div className="page-head">
      <div><h1>Service Jobs / Appointments</h1><p>Manage appointments, service catalog, work orders, repair jobs, materials, technician workflow and job-to-invoice conversion.</p></div>
      <div className="head-actions"><button className="secondary-btn" onClick={generateAlerts}><CalendarPlus size={18} /> Generate Alerts</button><button className="secondary-btn" onClick={load}><RefreshCw size={18} /> Refresh</button></div>
    </div>

    {error && <div className="error-box">{error}</div>}
    {success && <div className="success-box">{success}</div>}

    <div className="stat-grid service-stat-grid">
      <StatCard title="Open Jobs" value={summary?.openJobs || 0} subtitle="Waiting / scheduled" tone="blue" />
      <StatCard title="In Progress" value={summary?.inProgress || 0} subtitle="Active work orders" tone="orange" />
      <StatCard title="Today Appointments" value={summary?.todaysAppointments || 0} subtitle={`${summary?.pendingAppointments || 0} pending`} tone="purple" />
      <StatCard title="Service Profit" value={money(summary?.profit)} subtitle={`Revenue ${money(summary?.revenue)}`} tone="green" />
    </div>

    <div className="tab-actions">
      {['jobs', 'appointments', 'catalog'].map((item) => <button key={item} className={`tab-btn ${tab === item ? 'active' : ''}`} onClick={() => setTab(item)}>{item === 'jobs' ? 'Work Orders' : item === 'appointments' ? 'Appointments' : 'Service Catalog'}</button>)}
    </div>

    {tab === 'jobs' && <div className="service-grid">
      <div className="panel">
        <div className="section-title-row"><h2><Wrench size={20} /> Work Orders</h2><div className="filters-row compact-service-filter"><input placeholder="Search job/customer" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} /><select value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}><option value="">All status</option>{['OPEN','SCHEDULED','IN_PROGRESS','WAITING_PARTS','COMPLETED','INVOICED','CANCELLED'].map((s)=><option key={s} value={s}>{s}</option>)}</select><button className="secondary-btn" onClick={load}>Apply</button></div></div>
        <DataTable columns={jobColumns} rows={jobs} empty="No service jobs yet" />
      </div>

      <div className="panel service-form-panel">
        <h2>Create Work Order</h2>
        <form className="form-grid compact" onSubmit={createJob}>
          <label>Customer<select value={jobForm.customerId} onChange={(e)=>setJobForm({...jobForm,customerId:e.target.value})}><option value="">Walk-in / select customer</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>Appointment<select value={jobForm.appointmentId} onChange={(e)=>setJobForm({...jobForm,appointmentId:e.target.value})}><option value="">No linked appointment</option>{appointmentOptions.map((a)=><option key={a.id} value={a.id}>{a.appointmentNo} - {a.title}</option>)}</select></label>
          <label>Warehouse<select value={jobForm.warehouseId} onChange={(e)=>setJobForm({...jobForm,warehouseId:e.target.value})}><option value="">Default warehouse</option>{warehouses.map((w)=><option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          <label>Title<input required value={jobForm.title} onChange={(e)=>setJobForm({...jobForm,title:e.target.value})} placeholder="Repair laptop / install CCTV" /></label>
          <div className="form-grid two">
            <label>Priority<select value={jobForm.priority} onChange={(e)=>setJobForm({...jobForm,priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map((s)=><option key={s} value={s}>{s}</option>)}</select></label>
            <label>Status<select value={jobForm.status} onChange={(e)=>setJobForm({...jobForm,status:e.target.value})}>{['OPEN','SCHEDULED','IN_PROGRESS'].map((s)=><option key={s} value={s}>{s}</option>)}</select></label>
          </div>
          <div className="form-grid two">
            <label>Scheduled<input type="datetime-local" value={jobForm.scheduledAt} onChange={(e)=>setJobForm({...jobForm,scheduledAt:e.target.value})} /></label>
            <label>Due<input type="datetime-local" value={jobForm.dueAt} onChange={(e)=>setJobForm({...jobForm,dueAt:e.target.value})} /></label>
          </div>
          <label>Description<input value={jobForm.description} onChange={(e)=>setJobForm({...jobForm,description:e.target.value})} placeholder="Customer complaint / work details" /></label>

          <div className="service-lines">
            <div className="section-title-row small"><strong>Job Lines</strong><span>{money(jobTotal)}</span></div>
            {jobForm.lines.map((line, index) => <div className="service-line-row" key={index}>
              <select value={line.lineType} onChange={(e)=>updateLine(index,{ lineType:e.target.value, serviceItemId:'', productId:'' })}>{['SERVICE','MATERIAL','CUSTOM'].map((s)=><option key={s} value={s}>{s}</option>)}</select>
              {line.lineType === 'SERVICE' ? <select value={line.serviceItemId} onChange={(e)=>selectServiceForLine(index,e.target.value)}><option value="">Select service</option>{services.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}</select> : line.lineType === 'MATERIAL' ? <select value={line.productId} onChange={(e)=>selectProductForLine(index,e.target.value)}><option value="">Select product/material</option>{products.map((p)=><option key={p.id} value={p.id}>{p.name}</option>)}</select> : <input placeholder="Custom line" value={line.description} onChange={(e)=>updateLine(index,{description:e.target.value})} />}
              <input placeholder="Description" value={line.description} onChange={(e)=>updateLine(index,{description:e.target.value})} />
              <input type="number" min="0.001" step="0.001" value={line.qty} onChange={(e)=>updateLine(index,{qty:e.target.value})} />
              <input type="number" min="0" step="0.01" value={line.unitPrice} onChange={(e)=>updateLine(index,{unitPrice:e.target.value})} />
              <button type="button" className="mini-danger" onClick={()=>removeLine(index)}>×</button>
            </div>)}
            <div className="actions-row"><button type="button" className="mini-action" onClick={()=>addLine('SERVICE')}>+ Service</button><button type="button" className="mini-action" onClick={()=>addLine('MATERIAL')}>+ Material</button><button type="button" className="mini-action" onClick={()=>addLine('CUSTOM')}>+ Custom</button></div>
          </div>
          <button className="primary-btn" disabled={saving}>Create Work Order</button>
        </form>
      </div>
    </div>}

    {tab === 'appointments' && <div className="service-grid">
      <div className="panel"><h2>Appointment Calendar List</h2><DataTable columns={appointmentColumns} rows={appointments} empty="No appointments yet" /></div>
      <div className="panel service-form-panel"><h2>Schedule Appointment</h2><form className="form-grid compact" onSubmit={createAppointment}>
        <label>Customer<select value={appointmentForm.customerId} onChange={(e)=>setAppointmentForm({...appointmentForm,customerId:e.target.value})}><option value="">Walk-in / select customer</option>{customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Title<input required value={appointmentForm.title} onChange={(e)=>setAppointmentForm({...appointmentForm,title:e.target.value})} placeholder="Site visit / repair booking" /></label>
        <div className="form-grid two"><label>Start<input required type="datetime-local" value={appointmentForm.appointmentAt} onChange={(e)=>setAppointmentForm({...appointmentForm,appointmentAt:e.target.value})} /></label><label>End<input type="datetime-local" value={appointmentForm.endAt} onChange={(e)=>setAppointmentForm({...appointmentForm,endAt:e.target.value})} /></label></div>
        <div className="form-grid two"><label>Priority<select value={appointmentForm.priority} onChange={(e)=>setAppointmentForm({...appointmentForm,priority:e.target.value})}>{['LOW','NORMAL','HIGH','URGENT'].map((s)=><option key={s} value={s}>{s}</option>)}</select></label><label>Status<select value={appointmentForm.status} onChange={(e)=>setAppointmentForm({...appointmentForm,status:e.target.value})}>{['PENDING','CONFIRMED'].map((s)=><option key={s} value={s}>{s}</option>)}</select></label></div>
        <label>Location<input value={appointmentForm.location} onChange={(e)=>setAppointmentForm({...appointmentForm,location:e.target.value})} /></label>
        <label>Notes<input value={appointmentForm.notes} onChange={(e)=>setAppointmentForm({...appointmentForm,notes:e.target.value})} /></label>
        <button className="primary-btn" disabled={saving}><CalendarPlus size={18} /> Schedule Appointment</button>
      </form></div>
    </div>}

    {tab === 'catalog' && <div className="service-grid">
      <div className="panel"><h2>Service Catalog</h2><DataTable columns={serviceColumns} rows={services} empty="No service items yet" /></div>
      <div className="panel service-form-panel"><h2>Add Service Item</h2><form className="form-grid compact" onSubmit={createService}>
        <div className="form-grid two"><label>Code<input value={serviceForm.code} onChange={(e)=>setServiceForm({...serviceForm,code:e.target.value})} placeholder="SVC-001" /></label><label>Category<input value={serviceForm.category} onChange={(e)=>setServiceForm({...serviceForm,category:e.target.value})} /></label></div>
        <label>Name<input required value={serviceForm.name} onChange={(e)=>setServiceForm({...serviceForm,name:e.target.value})} placeholder="Installation / repair / editing work" /></label>
        <div className="form-grid three"><label>Price<input type="number" min="0" value={serviceForm.unitPrice} onChange={(e)=>setServiceForm({...serviceForm,unitPrice:e.target.value})} /></label><label>Cost<input type="number" min="0" value={serviceForm.costPrice} onChange={(e)=>setServiceForm({...serviceForm,costPrice:e.target.value})} /></label><label>Minutes<input type="number" min="0" value={serviceForm.estimatedMinutes} onChange={(e)=>setServiceForm({...serviceForm,estimatedMinutes:e.target.value})} /></label></div>
        <label>Description<input value={serviceForm.description} onChange={(e)=>setServiceForm({...serviceForm,description:e.target.value})} /></label>
        <button className="primary-btn" disabled={saving}><FileText size={18} /> Save Service</button>
      </form></div>
    </div>}
  </div>;
}
