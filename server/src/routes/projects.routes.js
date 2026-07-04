import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowProjects', 'task / project management'));

const PROJECT_STATUSES = ['PLANNED', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'REVIEW', 'BLOCKED', 'DONE', 'CANCELLED'];
const PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'];

const projectSchema = z.object({
  name: z.string().trim().min(2).max(180),
  customerId: z.string().uuid().optional().nullable(),
  crmLeadId: z.string().uuid().optional().nullable(),
  serviceJobId: z.string().uuid().optional().nullable(),
  quotationId: z.string().uuid().optional().nullable(),
  salesOrderId: z.string().uuid().optional().nullable(),
  status: z.enum(PROJECT_STATUSES).optional().default('PLANNED'),
  priority: z.enum(PRIORITIES).optional().default('NORMAL'),
  startDate: z.coerce.date().optional().nullable(),
  dueDate: z.coerce.date().optional().nullable(),
  budget: z.coerce.number().nonnegative().optional().default(0),
  progress: z.coerce.number().int().min(0).max(100).optional().default(0),
  notes: z.string().trim().max(2500).optional().nullable()
});

const taskSchema = z.object({
  projectId: z.string().uuid().optional().nullable(),
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().max(3000).optional().nullable(),
  status: z.enum(TASK_STATUSES).optional().default('TODO'),
  priority: z.enum(PRIORITIES).optional().default('NORMAL'),
  assignedUserId: z.string().uuid().optional().nullable(),
  assignedEmployeeId: z.string().uuid().optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  crmLeadId: z.string().uuid().optional().nullable(),
  serviceJobId: z.string().uuid().optional().nullable(),
  quotationId: z.string().uuid().optional().nullable(),
  salesOrderId: z.string().uuid().optional().nullable(),
  startAt: z.coerce.date().optional().nullable(),
  dueAt: z.coerce.date().optional().nullable(),
  estimatedHours: z.coerce.number().nonnegative().optional().default(0),
  actualHours: z.coerce.number().nonnegative().optional().default(0)
});

const taskUpdateSchema = taskSchema.partial();
const projectUpdateSchema = projectSchema.partial();

function nextDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

async function nextNo(tx, tenantId, model, prefix) {
  const count = await tx[model].count({ where: { tenantId } });
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function recalcProjectProgress(tx, tenantId, projectId) {
  if (!projectId) return null;
  const tasks = await tx.projectTask.findMany({ where: { tenantId, projectId }, select: { status: true } });
  if (!tasks.length) return tx.project.update({ where: { id: projectId }, data: { progress: 0 } });
  const done = tasks.filter((t) => ['DONE', 'CANCELLED'].includes(t.status)).length;
  const progress = Math.round((done / tasks.length) * 100);
  const status = progress >= 100 ? 'COMPLETED' : undefined;
  return tx.project.update({ where: { id: projectId }, data: { progress, ...(status ? { status, completedAt: new Date() } : {}) } });
}

async function verifyProject(tx, tenantId, projectId) {
  if (!projectId) return null;
  const project = await tx.project.findFirst({ where: { id: projectId, tenantId } });
  if (!project) throw Object.assign(new Error('Project not found'), { status: 404 });
  return project;
}

async function verifyUser(tx, tenantId, userId) {
  if (!userId) return null;
  const user = await tx.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true, name: true, email: true } });
  if (!user) throw Object.assign(new Error('Assigned user not found'), { status: 404 });
  return user;
}

async function verifyEmployee(tx, tenantId, employeeId) {
  if (!employeeId) return null;
  const employee = await tx.employee.findFirst({ where: { id: employeeId, tenantId, status: 'ACTIVE' }, select: { id: true, name: true, employeeNo: true } });
  if (!employee) throw Object.assign(new Error('Assigned employee not found'), { status: 404 });
  return employee;
}

function clean(data) {
  const out = { ...data };
  ['customerId', 'crmLeadId', 'serviceJobId', 'quotationId', 'salesOrderId', 'projectId', 'assignedUserId', 'assignedEmployeeId', 'startDate', 'dueDate', 'startAt', 'dueAt'].forEach((key) => {
    if (out[key] === '') out[key] = null;
  });
  return out;
}

function normalizeProject(row, taskCounts = null) {
  const overdue = row.dueDate ? new Date(row.dueDate).getTime() < Date.now() && !['COMPLETED', 'CANCELLED'].includes(row.status) : false;
  return {
    ...row,
    budget: money(row.budget),
    taskCount: taskCounts?.total ?? row.tasks?.length ?? 0,
    doneTaskCount: taskCounts?.done ?? row.tasks?.filter?.((t) => t.status === 'DONE').length ?? 0,
    overdue
  };
}

function normalizeTask(row, maps = {}) {
  const overdue = row.dueAt ? new Date(row.dueAt).getTime() < Date.now() && !['DONE', 'CANCELLED'].includes(row.status) : false;
  return {
    ...row,
    projectName: row.project?.name || '',
    assignedUserName: maps.users?.get(row.assignedUserId)?.name || '',
    assignedEmployeeName: maps.employees?.get(row.assignedEmployeeId)?.name || '',
    customerName: maps.customers?.get(row.customerId)?.name || '',
    crmLeadTitle: maps.leads?.get(row.crmLeadId)?.title || '',
    serviceJobTitle: maps.serviceJobs?.get(row.serviceJobId)?.title || '',
    quotationNo: maps.quotations?.get(row.quotationId)?.quoteNo || '',
    salesOrderNo: maps.salesOrders?.get(row.salesOrderId)?.orderNo || '',
    overdue,
    commentCount: row.comments?.length || 0,
    activityCount: row.activities?.length || 0
  };
}

async function resourceMaps(tenantId) {
  const [users, employees, customers, leads, serviceJobs, quotations, salesOrders] = await Promise.all([
    prisma.user.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, email: true, role: true } }),
    prisma.employee.findMany({ where: { tenantId, status: 'ACTIVE' }, select: { id: true, employeeNo: true, name: true, department: true, designation: true } }).catch(() => []),
    prisma.customer.findMany({ where: { tenantId, isActive: true }, select: { id: true, name: true, phone: true } }),
    prisma.crmLead.findMany({ where: { tenantId, status: { notIn: ['ARCHIVED'] } }, select: { id: true, leadNo: true, title: true, contactName: true } }).catch(() => []),
    prisma.serviceJob.findMany({ where: { tenantId, status: { notIn: ['CANCELLED'] } }, select: { id: true, jobNo: true, title: true, status: true } }).catch(() => []),
    prisma.quotation.findMany({ where: { tenantId, status: { notIn: ['REJECTED'] } }, select: { id: true, quoteNo: true, title: true, status: true } }).catch(() => []),
    prisma.salesOrder.findMany({ where: { tenantId, status: { notIn: ['CANCELLED'] } }, select: { id: true, orderNo: true, status: true } }).catch(() => [])
  ]);
  const toMap = (rows) => new Map(rows.map((r) => [r.id, r]));
  return { users, employees, customers, leads, serviceJobs, quotations, salesOrders, maps: { users: toMap(users), employees: toMap(employees), customers: toMap(customers), leads: toMap(leads), serviceJobs: toMap(serviceJobs), quotations: toMap(quotations), salesOrders: toMap(salesOrders) } };
}

router.get('/summary', requirePermission('project:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const now = new Date();
    const soon = nextDate(7);
    const [projects, activeProjects, completedProjects, tasks, todo, inProgress, review, done, overdueTasks, upcomingTasks, highPriority] = await Promise.all([
      prisma.project.count({ where: { tenantId } }),
      prisma.project.count({ where: { tenantId, status: { in: ['PLANNED', 'ACTIVE', 'ON_HOLD'] } } }),
      prisma.project.count({ where: { tenantId, status: 'COMPLETED' } }),
      prisma.projectTask.count({ where: { tenantId } }),
      prisma.projectTask.count({ where: { tenantId, status: 'TODO' } }),
      prisma.projectTask.count({ where: { tenantId, status: 'IN_PROGRESS' } }),
      prisma.projectTask.count({ where: { tenantId, status: 'REVIEW' } }),
      prisma.projectTask.count({ where: { tenantId, status: 'DONE' } }),
      prisma.projectTask.count({ where: { tenantId, dueAt: { lt: now }, status: { notIn: ['DONE', 'CANCELLED'] } } }),
      prisma.projectTask.count({ where: { tenantId, dueAt: { gte: now, lte: soon }, status: { notIn: ['DONE', 'CANCELLED'] } } }),
      prisma.projectTask.count({ where: { tenantId, priority: { in: ['HIGH', 'URGENT'] }, status: { notIn: ['DONE', 'CANCELLED'] } } })
    ]);
    res.json({ projects, activeProjects, completedProjects, tasks, todo, inProgress, review, done, overdueTasks, upcomingTasks, highPriority });
  } catch (e) { next(e); }
});

router.get('/resources', requirePermission('project:read'), async (req, res, next) => {
  try {
    const resources = await resourceMaps(req.user.tenantId);
    delete resources.maps;
    res.json(resources);
  } catch (e) { next(e); }
});

router.get('/', requirePermission('project:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.priority) where.priority = String(req.query.priority).toUpperCase();
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ projectNo: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }, { notes: { contains: q, mode: 'insensitive' } }];
    const rows = await prisma.project.findMany({ where, include: { tasks: { select: { id: true, status: true } } }, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }], take: 300 });
    res.json(rows.map((p) => normalizeProject(p)));
  } catch (e) { next(e); }
});

router.post('/', requirePermission('project:create'), async (req, res, next) => {
  try {
    const data = clean(projectSchema.parse(req.body));
    const project = await prisma.$transaction(async (tx) => tx.project.create({ data: { tenantId: req.user.tenantId, projectNo: await nextNo(tx, req.user.tenantId, 'project', 'PROJ'), createdById: req.user.id, ...data } }));
    await audit(req, 'CREATE', 'Project', project.id, null, project);
    res.status(201).json(normalizeProject(project));
  } catch (e) { next(e); }
});

router.patch('/:id', requirePermission('project:update'), async (req, res, next) => {
  try {
    const before = await prisma.project.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Project not found' });
    const data = clean(projectUpdateSchema.parse(req.body));
    const project = await prisma.project.update({ where: { id: before.id }, data: { ...data, ...(data.status === 'COMPLETED' && !before.completedAt ? { completedAt: new Date(), progress: 100 } : {}) } });
    await audit(req, 'UPDATE', 'Project', project.id, before, project);
    res.json(normalizeProject(project));
  } catch (e) { next(e); }
});

router.get('/tasks', requirePermission('project:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const where = { tenantId };
    if (req.query.projectId) where.projectId = String(req.query.projectId);
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.priority) where.priority = String(req.query.priority).toUpperCase();
    if (req.query.assignedUserId) where.assignedUserId = String(req.query.assignedUserId);
    if (req.query.assignedEmployeeId) where.assignedEmployeeId = String(req.query.assignedEmployeeId);
    if (req.query.overdue === 'true') where.dueAt = { lt: new Date() };
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [{ taskNo: { contains: q, mode: 'insensitive' } }, { title: { contains: q, mode: 'insensitive' } }, { description: { contains: q, mode: 'insensitive' } }];
    const [resources, rows] = await Promise.all([
      resourceMaps(tenantId),
      prisma.projectTask.findMany({ where, include: { project: true, comments: { orderBy: { createdAt: 'desc' }, take: 3 }, activities: { orderBy: { createdAt: 'desc' }, take: 3 } }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }], take: 500 })
    ]);
    res.json(rows.map((t) => normalizeTask(t, resources.maps)));
  } catch (e) { next(e); }
});

router.get('/tasks/:id', requirePermission('project:read'), async (req, res, next) => {
  try {
    const resources = await resourceMaps(req.user.tenantId);
    const task = await prisma.projectTask.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { project: true, comments: { orderBy: { createdAt: 'desc' } }, activities: { orderBy: { createdAt: 'desc' } } } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    res.json(normalizeTask(task, resources.maps));
  } catch (e) { next(e); }
});

router.post('/tasks', requirePermission('project:create'), async (req, res, next) => {
  try {
    const data = clean(taskSchema.parse(req.body));
    const result = await prisma.$transaction(async (tx) => {
      await verifyProject(tx, req.user.tenantId, data.projectId);
      await verifyUser(tx, req.user.tenantId, data.assignedUserId);
      await verifyEmployee(tx, req.user.tenantId, data.assignedEmployeeId);
      const task = await tx.projectTask.create({
        data: { tenantId: req.user.tenantId, taskNo: await nextNo(tx, req.user.tenantId, 'projectTask', 'TASK'), createdById: req.user.id, ...data, activities: { create: { tenantId: req.user.tenantId, action: 'CREATED', toStatus: data.status, notes: 'Task created', createdById: req.user.id } } },
        include: { project: true, comments: true, activities: true }
      });
      await recalcProjectProgress(tx, req.user.tenantId, data.projectId);
      return task;
    });
    if (result.assignedUserId) await createNotification({ tenantId: req.user.tenantId, userId: result.assignedUserId, type: 'INFO', title: 'New task assigned', message: `${result.taskNo}: ${result.title}`, priority: result.priority === 'URGENT' ? 'HIGH' : 'NORMAL', entityType: 'ProjectTask', entityId: result.id, actionUrl: '/projects' });
    await audit(req, 'CREATE', 'ProjectTask', result.id, null, result);
    res.status(201).json(result);
  } catch (e) { next(e); }
});

router.patch('/tasks/:id', requirePermission('project:update'), async (req, res, next) => {
  try {
    const data = clean(taskUpdateSchema.parse(req.body));
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.projectTask.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!before) throw Object.assign(new Error('Task not found'), { status: 404 });
      await verifyProject(tx, req.user.tenantId, data.projectId);
      await verifyUser(tx, req.user.tenantId, data.assignedUserId);
      await verifyEmployee(tx, req.user.tenantId, data.assignedEmployeeId);
      const task = await tx.projectTask.update({ where: { id: before.id }, data, include: { project: true, comments: true, activities: true } });
      if (before.projectId !== task.projectId) {
        await recalcProjectProgress(tx, req.user.tenantId, before.projectId);
        await recalcProjectProgress(tx, req.user.tenantId, task.projectId);
      }
      return { before, task };
    });
    await audit(req, 'UPDATE', 'ProjectTask', result.task.id, result.before, result.task);
    res.json(result.task);
  } catch (e) { next(e); }
});

router.patch('/tasks/:id/status', requirePermission('project:update'), async (req, res, next) => {
  try {
    const data = z.object({ status: z.enum(TASK_STATUSES), actualHours: z.coerce.number().nonnegative().optional(), notes: z.string().trim().max(1500).optional().nullable() }).parse(req.body);
    const result = await prisma.$transaction(async (tx) => {
      const before = await tx.projectTask.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
      if (!before) throw Object.assign(new Error('Task not found'), { status: 404 });
      const task = await tx.projectTask.update({ where: { id: before.id }, data: { status: data.status, ...(data.actualHours !== undefined ? { actualHours: data.actualHours } : {}), ...(data.status === 'DONE' ? { completedAt: new Date() } : {}), ...(data.status !== 'DONE' ? { completedAt: null } : {}) }, include: { project: true, comments: true, activities: true } });
      await tx.projectTaskActivity.create({ data: { tenantId: req.user.tenantId, taskId: task.id, action: 'STATUS_CHANGED', fromStatus: before.status, toStatus: data.status, notes: data.notes || `Status changed to ${data.status}`, createdById: req.user.id } });
      await recalcProjectProgress(tx, req.user.tenantId, task.projectId);
      return { before, task };
    });
    await audit(req, 'STATUS', 'ProjectTask', result.task.id, result.before, result.task);
    res.json(result.task);
  } catch (e) { next(e); }
});

router.post('/tasks/:id/comments', requirePermission('project:comment'), async (req, res, next) => {
  try {
    const data = z.object({ comment: z.string().trim().min(1).max(2500) }).parse(req.body);
    const task = await prisma.projectTask.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!task) return res.status(404).json({ message: 'Task not found' });
    const comment = await prisma.projectTaskComment.create({ data: { tenantId: req.user.tenantId, taskId: task.id, comment: data.comment, createdById: req.user.id } });
    await audit(req, 'COMMENT', 'ProjectTask', task.id, null, comment);
    res.status(201).json(comment);
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('project:read'), async (req, res, next) => {
  try {
    const now = new Date();
    const soon = nextDate(1);
    const rows = await prisma.projectTask.findMany({
      where: { tenantId: req.user.tenantId, dueAt: { lte: soon }, status: { notIn: ['DONE', 'CANCELLED'] } },
      orderBy: { dueAt: 'asc' },
      take: 80
    });
    let created = 0;
    for (const task of rows) {
      const overdue = new Date(task.dueAt).getTime() < now.getTime();
      if (task.assignedUserId) {
        await createNotification({ tenantId: req.user.tenantId, userId: task.assignedUserId, type: overdue ? 'DANGER' : 'WARNING', title: overdue ? 'Overdue task' : 'Task due soon', message: `${task.taskNo}: ${task.title}`, priority: overdue ? 'HIGH' : 'NORMAL', entityType: 'ProjectTask', entityId: task.id, actionUrl: '/projects' });
      } else {
        await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN'], type: overdue ? 'DANGER' : 'WARNING', title: overdue ? 'Overdue unassigned task' : 'Unassigned task due soon', message: `${task.taskNo}: ${task.title}`, priority: overdue ? 'HIGH' : 'NORMAL', entityType: 'ProjectTask', entityId: task.id, actionUrl: '/projects' });
      }
      created += 1;
    }
    res.json({ created, checked: rows.length });
  } catch (e) { next(e); }
});

export default router;
