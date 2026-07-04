import { useEffect, useMemo, useState } from 'react';
import { BellRing, CheckCircle2, KanbanSquare, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api/http.js';
import DataTable from '../components/ui/DataTable.jsx';
import StatCard from '../components/ui/StatCard.jsx';

const emptyProject = { name: '', customerId: '', crmLeadId: '', serviceJobId: '', quotationId: '', salesOrderId: '', status: 'PLANNED', priority: 'NORMAL', startDate: '', dueDate: '', budget: 0, progress: 0, notes: '' };
const emptyTask = { projectId: '', title: '', description: '', status: 'TODO', priority: 'NORMAL', assignedUserId: '', assignedEmployeeId: '', customerId: '', crmLeadId: '', serviceJobId: '', quotationId: '', salesOrderId: '', startAt: '', dueAt: '', estimatedHours: 0, actualHours: 0 };

function money(value) { return `LKR ${Number(value || 0).toLocaleString()}`; }
function dt(value) { return value ? new Date(value).toLocaleString() : '-'; }
function dateOnly(value) { return value ? new Date(value).toLocaleDateString() : '-'; }
function statusClass(value) {
  const s = String(value || '').toLowerCase();
  if (['done', 'completed'].includes(s)) return 'paid';
  if (['cancelled'].includes(s)) return 'cancelled';
  if (['blocked', 'on_hold'].includes(s)) return 'unpaid';
  if (['in_progress', 'review', 'active'].includes(s)) return 'partial';
  return 'draft';
}

const taskStatuses = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'];
const projectStatuses = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const priorities = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

export default function ProjectsTasks() {
  const [summary, setSummary] = useState(null);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [resources, setResources] = useState({ users: [], employees: [], customers: [], leads: [], serviceJobs: [], quotations: [], salesOrders: [] });
  const [projectForm, setProjectForm] = useState(emptyProject);
  const [taskForm, setTaskForm] = useState(emptyTask);
  const [filters, setFilters] = useState({ q: '', status: '', projectId: '', overdue: '' });
  const [tab, setTab] = useState('board');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value));
    const [summaryRes, projectRes, taskRes, resourceRes] = await Promise.all([
      api.get('/projects/summary'),
      api.get('/projects'),
      api.get('/projects/tasks', { params }),
      api.get('/projects/resources')
    ]);
    setSummary(summaryRes.data);
    setProjects(projectRes.data || []);
    setTasks(taskRes.data || []);
    setResources(resourceRes.data || { users: [], employees: [], customers: [], leads: [], serviceJobs: [], quotations: [], salesOrders: [] });
  }

  useEffect(() => { load().catch((e) => setError(e.response?.data?.message || 'Failed to load projects')); }, []);

  function flash(message) {
    setSuccess(message);
    setTimeout(() => setSuccess(''), 3500);
  }

  const boardGroups = useMemo(() => taskStatuses.map((status) => ({ status, tasks: tasks.filter((task) => task.status === status) })), [tasks]);
  const activeProjects = useMemo(() => projects.filter((project) => !['COMPLETED', 'CANCELLED'].includes(project.status)), [projects]);

  function cleanPayload(data) {
    const payload = { ...data };
    Object.keys(payload).forEach((key) => { if (payload[key] === '') payload[key] = null; });
    return payload;
  }

  async function createProject(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/projects', { ...cleanPayload(projectForm), budget: Number(projectForm.budget || 0), progress: Number(projectForm.progress || 0) });
      setProjectForm(emptyProject);
      flash('Project created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create project'); }
    finally { setSaving(false); }
  }

  async function createTask(e) {
    e.preventDefault();
    setSaving(true); setError('');
    try {
      await api.post('/projects/tasks', { ...cleanPayload(taskForm), estimatedHours: Number(taskForm.estimatedHours || 0), actualHours: Number(taskForm.actualHours || 0) });
      setTaskForm({ ...emptyTask, projectId: taskForm.projectId });
      flash('Task created');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to create task'); }
    finally { setSaving(false); }
  }

  async function updateTaskStatus(task, status) {
    setError('');
    try {
      await api.patch(`/projects/tasks/${task.id}/status`, { status, notes: `Changed to ${status}` });
      flash(`${task.taskNo} moved to ${status}`);
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to update task'); }
  }

  async function addComment(task) {
    const comment = window.prompt(`Comment for ${task.taskNo}`, '');
    if (!comment) return;
    setError('');
    try {
      await api.post(`/projects/tasks/${task.id}/comments`, { comment });
      flash('Comment added');
      await load();
    } catch (e) { setError(e.response?.data?.message || 'Failed to add comment'); }
  }

  async function generateAlerts() {
    setError('');
    try {
      const { data } = await api.post('/projects/alerts');
      flash(`${data.created} project/task alert(s) created`);
    } catch (e) { setError(e.response?.data?.message || 'Failed to create alerts'); }
  }

  const projectColumns = [
    { key: 'projectNo', label: 'Project', render: (r) => <><strong>{r.projectNo}</strong><span className="table-subtext">{r.name}</span></> },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.overdue && <span className="table-subtext danger-text">Overdue</span>}</> },
    { key: 'progress', label: 'Progress', render: (r) => <div className="progress-cell"><div><span style={{ width: `${r.progress || 0}%` }} /></div><strong>{r.progress || 0}%</strong></div> },
    { key: 'tasks', label: 'Tasks', render: (r) => `${r.doneTaskCount || 0}/${r.taskCount || 0}` },
    { key: 'dueDate', label: 'Due', render: (r) => dateOnly(r.dueDate) },
    { key: 'budget', label: 'Budget', render: (r) => money(r.budget) }
  ];

  const taskColumns = [
    { key: 'taskNo', label: 'Task', render: (r) => <><strong>{r.taskNo}</strong><span className="table-subtext">{r.title}</span></> },
    { key: 'projectName', label: 'Project', render: (r) => r.projectName || '-' },
    { key: 'status', label: 'Status', render: (r) => <><span className={`badge ${statusClass(r.status)}`}>{r.status}</span>{r.overdue && <span className="table-subtext danger-text">Overdue</span>}</> },
    { key: 'priority', label: 'Priority', render: (r) => <span className={`badge ${r.priority === 'HIGH' || r.priority === 'URGENT' ? 'cancelled' : 'partial'}`}>{r.priority}</span> },
    { key: 'assigned', label: 'Assigned', render: (r) => r.assignedUserName || r.assignedEmployeeName || 'Unassigned' },
    { key: 'dueAt', label: 'Due', render: (r) => dt(r.dueAt) },
    { key: 'actions', label: 'Actions', render: (r) => <div className="actions-row project-actions"><select value={r.status} onChange={(e)=>updateTaskStatus(r, e.target.value)}>{taskStatuses.map((s)=><option key={s}>{s}</option>)}</select><button className="mini-action" onClick={()=>addComment(r)}>Comment</button></div> }
  ];

  return (
    <div className="page projects-page">
      <div className="page-header">
        <div>
          <span className="eyebrow">Task / project management</span>
          <h1>Projects & Tasks</h1>
          <p>Track internal work, client projects, deadlines, assignees, comments, task board and overdue alerts.</p>
        </div>
        <div className="head-actions"><button className="ghost-btn" onClick={load}><RefreshCw size={16}/> Refresh</button><button className="primary-btn" onClick={generateAlerts}><BellRing size={16}/> Create alerts</button></div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {success && <div className="success-box">{success}</div>}

      <div className="stat-grid project-stat-grid">
        <StatCard title="Active Projects" value={summary?.activeProjects || 0} subtitle={`${summary?.projects || 0} total projects`} />
        <StatCard title="Tasks" value={summary?.tasks || 0} subtitle={`${summary?.done || 0} done`} tone="green" />
        <StatCard title="In Progress" value={summary?.inProgress || 0} subtitle={`${summary?.review || 0} in review`} tone="orange" />
        <StatCard title="Overdue" value={summary?.overdueTasks || 0} subtitle={`${summary?.upcomingTasks || 0} due soon`} tone="red" />
      </div>

      <div className="tab-actions">
        {['board', 'tasks', 'projects', 'create'].map((key) => <button key={key} className={`tab-btn ${tab === key ? 'active' : ''}`} onClick={() => setTab(key)}>{key === 'board' ? 'Task Board' : key}</button>)}
      </div>

      {tab === 'board' && <div className="task-board">
        {boardGroups.map((group) => <div className="task-column" key={group.status}>
          <div className="task-column-head"><strong>{group.status.replace('_', ' ')}</strong><span>{group.tasks.length}</span></div>
          {group.tasks.length ? group.tasks.map((task) => <div className={`task-card priority-${String(task.priority).toLowerCase()}`} key={task.id}>
            <div className="task-card-top"><strong>{task.taskNo}</strong><span className={`badge ${statusClass(task.status)}`}>{task.status}</span></div>
            <h3>{task.title}</h3>
            <p>{task.projectName || task.customerName || task.crmLeadTitle || 'General task'}</p>
            <div className="task-meta"><span>{task.assignedUserName || task.assignedEmployeeName || 'Unassigned'}</span><b>{dateOnly(task.dueAt)}</b></div>
            {task.overdue && <small className="danger-text">Overdue</small>}
            <div className="actions-row"><button className="mini-action" onClick={()=>addComment(task)}>Comment</button>{task.status !== 'DONE' && <button className="mini-action" onClick={()=>updateTaskStatus(task, 'DONE')}>Done</button>}</div>
          </div>) : <div className="task-empty">No tasks</div>}
        </div>)}
      </div>}

      {tab === 'tasks' && <>
        <div className="panel project-filter-panel"><div className="project-filter-grid">
          <input value={filters.q} onChange={(e)=>setFilters({...filters,q:e.target.value})} placeholder="Search task" />
          <select value={filters.status} onChange={(e)=>setFilters({...filters,status:e.target.value})}><option value="">All status</option>{taskStatuses.map((s)=><option key={s}>{s}</option>)}</select>
          <select value={filters.projectId} onChange={(e)=>setFilters({...filters,projectId:e.target.value})}><option value="">All projects</option>{projects.map((p)=><option key={p.id} value={p.id}>{p.projectNo} - {p.name}</option>)}</select>
          <select value={filters.overdue} onChange={(e)=>setFilters({...filters,overdue:e.target.value})}><option value="">All due</option><option value="true">Overdue only</option></select>
          <button className="primary-btn" onClick={load}>Apply</button>
        </div></div>
        <DataTable columns={taskColumns} rows={tasks} empty="No tasks found" />
      </>}

      {tab === 'projects' && <DataTable columns={projectColumns} rows={projects} empty="No projects found" />}

      {tab === 'create' && <div className="project-create-grid">
        <form className="panel form-grid" onSubmit={createProject}>
          <h2><KanbanSquare size={18}/> Create project</h2>
          <label>Project name<input required value={projectForm.name} onChange={(e)=>setProjectForm({...projectForm,name:e.target.value})} placeholder="Website redesign / shop renovation" /></label>
          <label>Customer<select value={projectForm.customerId} onChange={(e)=>setProjectForm({...projectForm,customerId:e.target.value})}><option value="">Not linked</option>{resources.customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>CRM lead<select value={projectForm.crmLeadId} onChange={(e)=>setProjectForm({...projectForm,crmLeadId:e.target.value})}><option value="">Not linked</option>{resources.leads.map((l)=><option key={l.id} value={l.id}>{l.leadNo} - {l.title}</option>)}</select></label>
          <label>Service job<select value={projectForm.serviceJobId} onChange={(e)=>setProjectForm({...projectForm,serviceJobId:e.target.value})}><option value="">Not linked</option>{resources.serviceJobs.map((j)=><option key={j.id} value={j.id}>{j.jobNo} - {j.title}</option>)}</select></label>
          <label>Quotation<select value={projectForm.quotationId} onChange={(e)=>setProjectForm({...projectForm,quotationId:e.target.value})}><option value="">Not linked</option>{resources.quotations.map((q)=><option key={q.id} value={q.id}>{q.quoteNo}</option>)}</select></label>
          <label>Sales order<select value={projectForm.salesOrderId} onChange={(e)=>setProjectForm({...projectForm,salesOrderId:e.target.value})}><option value="">Not linked</option>{resources.salesOrders.map((o)=><option key={o.id} value={o.id}>{o.orderNo}</option>)}</select></label>
          <label>Status<select value={projectForm.status} onChange={(e)=>setProjectForm({...projectForm,status:e.target.value})}>{projectStatuses.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={projectForm.priority} onChange={(e)=>setProjectForm({...projectForm,priority:e.target.value})}>{priorities.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Start date<input type="date" value={projectForm.startDate} onChange={(e)=>setProjectForm({...projectForm,startDate:e.target.value})} /></label>
          <label>Due date<input type="date" value={projectForm.dueDate} onChange={(e)=>setProjectForm({...projectForm,dueDate:e.target.value})} /></label>
          <label>Budget<input type="number" min="0" value={projectForm.budget} onChange={(e)=>setProjectForm({...projectForm,budget:e.target.value})} /></label>
          <label className="span-two">Notes<textarea value={projectForm.notes} onChange={(e)=>setProjectForm({...projectForm,notes:e.target.value})} /></label>
          <button className="primary-btn span-two" disabled={saving}><Plus size={16}/> Save project</button>
        </form>

        <form className="panel form-grid" onSubmit={createTask}>
          <h2><CheckCircle2 size={18}/> Create task</h2>
          <label>Project<select value={taskForm.projectId} onChange={(e)=>setTaskForm({...taskForm,projectId:e.target.value})}><option value="">General task</option>{activeProjects.map((p)=><option key={p.id} value={p.id}>{p.projectNo} - {p.name}</option>)}</select></label>
          <label>Title<input required value={taskForm.title} onChange={(e)=>setTaskForm({...taskForm,title:e.target.value})} placeholder="Call client / prepare quotation / finish design" /></label>
          <label>Assign user<select value={taskForm.assignedUserId} onChange={(e)=>setTaskForm({...taskForm,assignedUserId:e.target.value})}><option value="">Unassigned</option>{resources.users.map((u)=><option key={u.id} value={u.id}>{u.name} · {u.role}</option>)}</select></label>
          <label>Assign employee<select value={taskForm.assignedEmployeeId} onChange={(e)=>setTaskForm({...taskForm,assignedEmployeeId:e.target.value})}><option value="">No employee</option>{resources.employees.map((emp)=><option key={emp.id} value={emp.id}>{emp.employeeNo} - {emp.name}</option>)}</select></label>
          <label>Status<select value={taskForm.status} onChange={(e)=>setTaskForm({...taskForm,status:e.target.value})}>{taskStatuses.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Priority<select value={taskForm.priority} onChange={(e)=>setTaskForm({...taskForm,priority:e.target.value})}>{priorities.map((s)=><option key={s}>{s}</option>)}</select></label>
          <label>Customer<select value={taskForm.customerId} onChange={(e)=>setTaskForm({...taskForm,customerId:e.target.value})}><option value="">Not linked</option>{resources.customers.map((c)=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label>CRM lead<select value={taskForm.crmLeadId} onChange={(e)=>setTaskForm({...taskForm,crmLeadId:e.target.value})}><option value="">Not linked</option>{resources.leads.map((l)=><option key={l.id} value={l.id}>{l.leadNo} - {l.title}</option>)}</select></label>
          <label>Start<input type="datetime-local" value={taskForm.startAt} onChange={(e)=>setTaskForm({...taskForm,startAt:e.target.value})} /></label>
          <label>Due<input type="datetime-local" value={taskForm.dueAt} onChange={(e)=>setTaskForm({...taskForm,dueAt:e.target.value})} /></label>
          <label>Estimated hours<input type="number" min="0" step="0.25" value={taskForm.estimatedHours} onChange={(e)=>setTaskForm({...taskForm,estimatedHours:e.target.value})} /></label>
          <label>Actual hours<input type="number" min="0" step="0.25" value={taskForm.actualHours} onChange={(e)=>setTaskForm({...taskForm,actualHours:e.target.value})} /></label>
          <label className="span-two">Description<textarea value={taskForm.description} onChange={(e)=>setTaskForm({...taskForm,description:e.target.value})} /></label>
          <button className="primary-btn span-two" disabled={saving}><Plus size={16}/> Save task</button>
        </form>
      </div>}
    </div>
  );
}
