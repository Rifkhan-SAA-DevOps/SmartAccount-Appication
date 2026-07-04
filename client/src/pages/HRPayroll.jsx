import { useEffect, useMemo, useState } from 'react';
import { BellRing, CalendarCheck, RefreshCw, UserPlus, WalletCards } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyEmployee = { name: '', employeeNo: '', phone: '', email: '', nic: '', designation: '', department: '', employmentType: 'FULL_TIME', joinDate: '', basicSalary: 0, hourlyRate: 0, overtimeRate: 0, bankName: '', bankAccountNo: '', address: '', notes: '' };
const emptyAttendance = { employeeId: '', date: new Date().toISOString().slice(0, 10), checkIn: '', checkOut: '', status: 'PRESENT', regularHours: '', overtimeHours: 0, notes: '' };
const emptyAdvance = { employeeId: '', amount: 0, paidAt: new Date().toISOString().slice(0, 10), notes: '' };
const emptyLeave = { employeeId: '', leaveType: 'ANNUAL', startDate: '', endDate: '', days: 1, reason: '' };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function dt(value) { return value ? new Date(value).toLocaleString() : '-'; }
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (['active', 'present', 'approved', 'paid'].includes(s)) return 'paid';
  if (['draft', 'pending', 'half_day'].includes(s)) return 'unpaid';
  if (['absent', 'rejected', 'terminated', 'cancelled'].includes(s)) return 'cancelled';
  return 'partial';
}

export default function HRPayroll() {
  const [summary, setSummary] = useState(null);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendance);
  const [advanceForm, setAdvanceForm] = useState(emptyAdvance);
  const [leaveForm, setLeaveForm] = useState(emptyLeave);
  const [payrollForm, setPayrollForm] = useState({ periodStart: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10), periodEnd: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString().slice(0, 10), defaultAllowances: 0, defaultDeductions: 0, notes: '' });
  const [tab, setTab] = useState('employees');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  const activeEmployees = useMemo(() => employees.filter((e) => e.status === 'ACTIVE'), [employees]);

  async function load() {
    setError('');
    const [summaryRes, empRes, attendanceRes, advancesRes, leavesRes, payrollRes] = await Promise.all([
      api.get('/hr/summary'),
      api.get('/hr/employees'),
      api.get('/hr/attendance'),
      api.get('/hr/advances'),
      api.get('/hr/leaves'),
      api.get('/hr/payroll-runs')
    ]);
    setSummary(summaryRes.data);
    setEmployees(empRes.data || []);
    setAttendance(attendanceRes.data || []);
    setAdvances(advancesRes.data || []);
    setLeaves(leavesRes.data || []);
    setPayrollRuns(payrollRes.data || []);
    const first = empRes.data?.[0]?.id || '';
    setAttendanceForm((old) => ({ ...old, employeeId: old.employeeId || first }));
    setAdvanceForm((old) => ({ ...old, employeeId: old.employeeId || first }));
    setLeaveForm((old) => ({ ...old, employeeId: old.employeeId || first }));
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load HR data')); }, []);

  function flash(message) { setSuccess(message); setTimeout(() => setSuccess(''), 3500); }

  async function createEmployee(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/hr/employees', { ...employeeForm, employeeNo: employeeForm.employeeNo || null, email: employeeForm.email || null, joinDate: employeeForm.joinDate || null, basicSalary: Number(employeeForm.basicSalary || 0), hourlyRate: Number(employeeForm.hourlyRate || 0), overtimeRate: Number(employeeForm.overtimeRate || 0) });
      setEmployeeForm(emptyEmployee); flash('Employee saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save employee'); }
    finally { setSaving(false); }
  }

  async function saveAttendance(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/hr/attendance', { ...attendanceForm, checkIn: attendanceForm.checkIn || null, checkOut: attendanceForm.checkOut || null, regularHours: attendanceForm.regularHours === '' ? null : Number(attendanceForm.regularHours), overtimeHours: Number(attendanceForm.overtimeHours || 0) });
      setAttendanceForm((old) => ({ ...emptyAttendance, employeeId: old.employeeId, date: old.date })); flash('Attendance saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save attendance'); }
    finally { setSaving(false); }
  }

  async function createAdvance(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/hr/advances', { ...advanceForm, amount: Number(advanceForm.amount || 0), paidAt: advanceForm.paidAt || undefined });
      setAdvanceForm((old) => ({ ...emptyAdvance, employeeId: old.employeeId })); flash('Salary advance saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save advance'); }
    finally { setSaving(false); }
  }

  async function createLeave(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/hr/leaves', { ...leaveForm, days: Number(leaveForm.days || 1) });
      setLeaveForm((old) => ({ ...emptyLeave, employeeId: old.employeeId })); flash('Leave request saved'); await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to save leave'); }
    finally { setSaving(false); }
  }

  async function leaveStatus(row, status) {
    setError('');
    try { await api.patch(`/hr/leaves/${row.id}/status`, { status }); flash(`Leave ${status.toLowerCase()}`); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to update leave'); }
  }

  async function generatePayroll(e) {
    e.preventDefault(); setSaving(true); setError('');
    try {
      await api.post('/hr/payroll-runs/generate', { ...payrollForm, defaultAllowances: Number(payrollForm.defaultAllowances || 0), defaultDeductions: Number(payrollForm.defaultDeductions || 0) });
      flash('Payroll generated'); await load(); setTab('payroll');
    } catch (e) { setError(e.response?.data?.message || 'Failed to generate payroll'); }
    finally { setSaving(false); }
  }

  async function payPayroll(row) {
    setError('');
    try { await api.post(`/hr/payroll-runs/${row.id}/pay`); flash(`${row.runNo} paid and journal posted`); await load(); }
    catch (e) { setError(e.response?.data?.message || 'Failed to pay payroll'); }
  }

  async function createAlerts() {
    setError('');
    try { const { data } = await api.post('/hr/alerts'); flash(`${data.created} HR alert(s) created`); }
    catch (e) { setError(e.response?.data?.message || 'Failed to create HR alerts'); }
  }

  const employeeCols = [
    { key: 'employeeNo', label: 'Employee', render: (r) => <><strong>{r.employeeNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'contact', label: 'Contact', render: (r) => <>{r.phone || '-'}<span className="table-subtext">{r.email || r.nic || '-'}</span></> },
    { key: 'department', label: 'Department', render: (r) => <>{r.department || '-'}<span className="table-subtext">{r.designation || '-'}</span></> },
    { key: 'salary', label: 'Salary', render: (r) => <><strong>{money(r.basicSalary)}</strong><span className="table-subtext">OT {money(r.overtimeRate)}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> }
  ];

  const attendanceCols = [
    { key: 'date', label: 'Date', render: (r) => dateOnly(r.date) },
    { key: 'employeeName', label: 'Employee', render: (r) => <>{r.employeeName}<span className="table-subtext">{r.employeeNo}</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'time', label: 'Time', render: (r) => <>{dt(r.checkIn)}<span className="table-subtext">Out: {dt(r.checkOut)}</span></> },
    { key: 'hours', label: 'Hours', render: (r) => <>{Number(r.regularHours || 0).toFixed(2)}<span className="table-subtext">OT {Number(r.overtimeHours || 0).toFixed(2)}</span></> }
  ];

  const leaveCols = [
    { key: 'employeeName', label: 'Employee' },
    { key: 'leaveType', label: 'Type' },
    { key: 'dates', label: 'Dates', render: (r) => <>{dateOnly(r.startDate)} - {dateOnly(r.endDate)}<span className="table-subtext">{Number(r.days || 0)} day(s)</span></> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => r.status === 'PENDING' ? <div className="actions-row"><button className="mini-action" onClick={() => leaveStatus(r, 'APPROVED')}>Approve</button><button className="mini-danger" onClick={() => leaveStatus(r, 'REJECTED')}>Reject</button></div> : '-' }
  ];

  const payrollCols = [
    { key: 'runNo', label: 'Run', render: (r) => <><strong>{r.runNo}</strong><span className="table-subtext">{dateOnly(r.periodStart)} - {dateOnly(r.periodEnd)}</span></> },
    { key: 'grossTotal', label: 'Gross', render: (r) => money(r.grossTotal) },
    { key: 'deductions', label: 'Deductions', render: (r) => <>{money(Number(r.deductionTotal || 0) + Number(r.advanceTotal || 0))}<span className="table-subtext">Advances {money(r.advanceTotal)}</span></> },
    { key: 'netTotal', label: 'Net Pay', render: (r) => <strong>{money(r.netTotal)}</strong> },
    { key: 'status', label: 'Status', render: (r) => <span className={`badge ${statusClass(r.status)}`}>{r.status}</span> },
    { key: 'actions', label: 'Actions', render: (r) => r.status !== 'PAID' ? <button className="mini-action" onClick={() => payPayroll(r)}>Pay + Post Journal</button> : 'Paid' }
  ];

  return (
    <div className="page hr-page">
      <div className="page-head">
        <div><h1>HR / Payroll / Attendance</h1><p>Manage employees, daily attendance, salary advances, leave requests, payroll runs and salary journal posting.</p></div>
        <div className="head-actions"><button className="secondary-btn" onClick={createAlerts}><BellRing size={18}/> HR Alerts</button><button className="secondary-btn" onClick={load}><RefreshCw size={18}/> Refresh</button></div>
      </div>
      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid hr-stat-grid">
        <StatCard title="Employees" value={summary?.activeEmployees || 0} subtitle={`${summary?.employees || 0} total`} />
        <StatCard title="Today Present" value={summary?.attendanceToday || 0} subtitle={`${summary?.absentToday || 0} absent`} tone="green" />
        <StatCard title="Open Advances" value={money(summary?.openAdvanceAmount)} subtitle={`${summary?.openAdvanceCount || 0} advance(s)`} tone="orange" />
        <StatCard title="Pending Leaves" value={summary?.pendingLeaves || 0} subtitle="Need approval" tone="red" />
      </div>

      <div className="tab-actions">{['employees','attendance','advances','leaves','payroll'].map((t)=><button key={t} className={`tab-btn ${tab===t?'active':''}`} onClick={()=>setTab(t)}>{t}</button>)}</div>

      {tab === 'employees' && <div className="hr-grid">
        <section className="panel"><h2><UserPlus size={19}/> Employee Register</h2><DataTable columns={employeeCols} rows={employees} empty="No employees yet" /></section>
        <section className="panel hr-form-panel"><h2>Add Employee</h2><form className="form-grid compact" onSubmit={createEmployee}>
          <label>Employee No<input value={employeeForm.employeeNo} onChange={(e)=>setEmployeeForm({...employeeForm,employeeNo:e.target.value})} placeholder="auto if empty" /></label>
          <label>Name<input required value={employeeForm.name} onChange={(e)=>setEmployeeForm({...employeeForm,name:e.target.value})} /></label>
          <div className="form-grid two"><label>Phone<input value={employeeForm.phone} onChange={(e)=>setEmployeeForm({...employeeForm,phone:e.target.value})} /></label><label>Email<input type="email" value={employeeForm.email} onChange={(e)=>setEmployeeForm({...employeeForm,email:e.target.value})} /></label></div>
          <div className="form-grid two"><label>Department<input value={employeeForm.department} onChange={(e)=>setEmployeeForm({...employeeForm,department:e.target.value})} /></label><label>Designation<input value={employeeForm.designation} onChange={(e)=>setEmployeeForm({...employeeForm,designation:e.target.value})} /></label></div>
          <div className="form-grid two"><label>Basic Salary<input type="number" value={employeeForm.basicSalary} onChange={(e)=>setEmployeeForm({...employeeForm,basicSalary:e.target.value})} /></label><label>OT Rate<input type="number" value={employeeForm.overtimeRate} onChange={(e)=>setEmployeeForm({...employeeForm,overtimeRate:e.target.value})} /></label></div>
          <label>Join date<input type="date" value={employeeForm.joinDate} onChange={(e)=>setEmployeeForm({...employeeForm,joinDate:e.target.value})} /></label>
          <button className="primary-btn" disabled={saving}>Save Employee</button>
        </form></section>
      </div>}

      {tab === 'attendance' && <div className="hr-grid">
        <section className="panel"><h2><CalendarCheck size={19}/> Attendance</h2><DataTable columns={attendanceCols} rows={attendance} empty="No attendance records" /></section>
        <section className="panel hr-form-panel"><h2>Mark Attendance</h2><form className="form-grid compact" onSubmit={saveAttendance}>
          <label>Employee<select value={attendanceForm.employeeId} onChange={(e)=>setAttendanceForm({...attendanceForm,employeeId:e.target.value})} required><option value="">Select employee</option>{activeEmployees.map((e)=><option key={e.id} value={e.id}>{e.employeeNo} - {e.name}</option>)}</select></label>
          <label>Date<input type="date" value={attendanceForm.date} onChange={(e)=>setAttendanceForm({...attendanceForm,date:e.target.value})} required /></label>
          <label>Status<select value={attendanceForm.status} onChange={(e)=>setAttendanceForm({...attendanceForm,status:e.target.value})}>{['PRESENT','ABSENT','HALF_DAY','LEAVE','HOLIDAY'].map((s)=><option key={s}>{s}</option>)}</select></label>
          <div className="form-grid two"><label>Check in<input type="datetime-local" value={attendanceForm.checkIn} onChange={(e)=>setAttendanceForm({...attendanceForm,checkIn:e.target.value})} /></label><label>Check out<input type="datetime-local" value={attendanceForm.checkOut} onChange={(e)=>setAttendanceForm({...attendanceForm,checkOut:e.target.value})} /></label></div>
          <div className="form-grid two"><label>Regular hours<input type="number" step="0.01" value={attendanceForm.regularHours} onChange={(e)=>setAttendanceForm({...attendanceForm,regularHours:e.target.value})} placeholder="auto" /></label><label>OT hours<input type="number" step="0.01" value={attendanceForm.overtimeHours} onChange={(e)=>setAttendanceForm({...attendanceForm,overtimeHours:e.target.value})} /></label></div>
          <button className="primary-btn" disabled={saving}>Save Attendance</button>
        </form></section>
      </div>}

      {tab === 'advances' && <div className="hr-grid">
        <section className="panel"><h2>Salary Advances</h2><DataTable columns={[{key:'employeeName',label:'Employee'},{key:'amount',label:'Amount',render:(r)=>money(r.amount)},{key:'paidAt',label:'Paid at',render:(r)=>dateOnly(r.paidAt)},{key:'status',label:'Status',render:(r)=><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>}]} rows={advances} empty="No advances" /></section>
        <section className="panel hr-form-panel"><h2>New Advance</h2><form className="form-grid compact" onSubmit={createAdvance}>
          <label>Employee<select value={advanceForm.employeeId} onChange={(e)=>setAdvanceForm({...advanceForm,employeeId:e.target.value})} required><option value="">Select employee</option>{activeEmployees.map((e)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>Amount<input type="number" value={advanceForm.amount} onChange={(e)=>setAdvanceForm({...advanceForm,amount:e.target.value})} required /></label>
          <label>Paid at<input type="date" value={advanceForm.paidAt} onChange={(e)=>setAdvanceForm({...advanceForm,paidAt:e.target.value})} /></label>
          <label>Notes<input value={advanceForm.notes} onChange={(e)=>setAdvanceForm({...advanceForm,notes:e.target.value})} /></label>
          <button className="primary-btn" disabled={saving}>Save Advance</button>
        </form></section>
      </div>}

      {tab === 'leaves' && <div className="hr-grid">
        <section className="panel"><h2>Leave Requests</h2><DataTable columns={leaveCols} rows={leaves} empty="No leave requests" /></section>
        <section className="panel hr-form-panel"><h2>Request Leave</h2><form className="form-grid compact" onSubmit={createLeave}>
          <label>Employee<select value={leaveForm.employeeId} onChange={(e)=>setLeaveForm({...leaveForm,employeeId:e.target.value})} required><option value="">Select employee</option>{activeEmployees.map((e)=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
          <label>Type<input value={leaveForm.leaveType} onChange={(e)=>setLeaveForm({...leaveForm,leaveType:e.target.value})} /></label>
          <div className="form-grid two"><label>Start<input type="date" value={leaveForm.startDate} onChange={(e)=>setLeaveForm({...leaveForm,startDate:e.target.value})} required /></label><label>End<input type="date" value={leaveForm.endDate} onChange={(e)=>setLeaveForm({...leaveForm,endDate:e.target.value})} required /></label></div>
          <label>Days<input type="number" step="0.5" value={leaveForm.days} onChange={(e)=>setLeaveForm({...leaveForm,days:e.target.value})} /></label>
          <label>Reason<input value={leaveForm.reason} onChange={(e)=>setLeaveForm({...leaveForm,reason:e.target.value})} /></label>
          <button className="primary-btn" disabled={saving}>Save Leave</button>
        </form></section>
      </div>}

      {tab === 'payroll' && <div className="hr-grid">
        <section className="panel"><h2><WalletCards size={19}/> Payroll Runs</h2><DataTable columns={payrollCols} rows={payrollRuns} empty="No payroll runs" /></section>
        <section className="panel hr-form-panel"><h2>Generate Payroll</h2><form className="form-grid compact" onSubmit={generatePayroll}>
          <div className="form-grid two"><label>Period start<input type="date" value={payrollForm.periodStart} onChange={(e)=>setPayrollForm({...payrollForm,periodStart:e.target.value})} required /></label><label>Period end<input type="date" value={payrollForm.periodEnd} onChange={(e)=>setPayrollForm({...payrollForm,periodEnd:e.target.value})} required /></label></div>
          <div className="form-grid two"><label>Default allowances<input type="number" value={payrollForm.defaultAllowances} onChange={(e)=>setPayrollForm({...payrollForm,defaultAllowances:e.target.value})} /></label><label>Default deductions<input type="number" value={payrollForm.defaultDeductions} onChange={(e)=>setPayrollForm({...payrollForm,defaultDeductions:e.target.value})} /></label></div>
          <label>Notes<input value={payrollForm.notes} onChange={(e)=>setPayrollForm({...payrollForm,notes:e.target.value})} /></label>
          <button className="primary-btn" disabled={saving}>Generate Payroll</button>
        </form></section>
      </div>}
    </div>
  );
}
