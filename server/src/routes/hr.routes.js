import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authRequired } from '../middleware/auth.js';
import { requirePermission } from '../middleware/permission.js';
import { planFeatureGuard } from '../middleware/planGuard.js';
import { audit } from '../utils/audit.js';
import { money } from '../utils/number.js';
import { ACCOUNT_CODES, createAutoJournalEntry } from '../utils/accountingPost.js';
import { createNotification, notifyTenantRoles } from '../utils/notifications.js';

const router = Router();
router.use(authRequired);
router.use(planFeatureGuard('allowHrPayroll', 'HR / payroll / attendance'));

const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'TERMINATED'];
const ATTENDANCE_STATUSES = ['PRESENT', 'ABSENT', 'HALF_DAY', 'LEAVE', 'HOLIDAY'];
const PAYROLL_STATUSES = ['DRAFT', 'APPROVED', 'PAID', 'CANCELLED'];

const employeeSchema = z.object({
  employeeNo: z.string().trim().min(1).max(40).optional().nullable(),
  name: z.string().trim().min(2).max(160),
  email: z.string().trim().email().optional().nullable().or(z.literal('')),
  phone: z.string().trim().max(40).optional().nullable(),
  nic: z.string().trim().max(60).optional().nullable(),
  designation: z.string().trim().max(120).optional().nullable(),
  department: z.string().trim().max(120).optional().nullable(),
  employmentType: z.string().trim().max(40).optional().default('FULL_TIME'),
  joinDate: z.coerce.date().optional().nullable(),
  basicSalary: z.coerce.number().nonnegative().default(0),
  hourlyRate: z.coerce.number().nonnegative().default(0),
  overtimeRate: z.coerce.number().nonnegative().default(0),
  bankName: z.string().trim().max(120).optional().nullable(),
  bankAccountNo: z.string().trim().max(80).optional().nullable(),
  address: z.string().trim().max(300).optional().nullable(),
  status: z.enum(EMPLOYEE_STATUSES).optional().default('ACTIVE'),
  notes: z.string().trim().max(1500).optional().nullable()
});

const attendanceSchema = z.object({
  employeeId: z.string().uuid(),
  date: z.coerce.date(),
  checkIn: z.coerce.date().optional().nullable(),
  checkOut: z.coerce.date().optional().nullable(),
  status: z.enum(ATTENDANCE_STATUSES).optional().default('PRESENT'),
  regularHours: z.coerce.number().nonnegative().optional().nullable(),
  overtimeHours: z.coerce.number().nonnegative().optional().default(0),
  notes: z.string().trim().max(1000).optional().nullable()
});

const advanceSchema = z.object({
  employeeId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paidAt: z.coerce.date().optional(),
  notes: z.string().trim().max(1000).optional().nullable()
});

const leaveSchema = z.object({
  employeeId: z.string().uuid(),
  leaveType: z.string().trim().max(60).optional().default('ANNUAL'),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  days: z.coerce.number().positive().optional().default(1),
  reason: z.string().trim().max(1000).optional().nullable()
});

const leaveStatusSchema = z.object({ status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED']), notes: z.string().optional().nullable() });

const payrollGenerateSchema = z.object({
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  notes: z.string().trim().max(1000).optional().nullable(),
  defaultAllowances: z.coerce.number().nonnegative().optional().default(0),
  defaultDeductions: z.coerce.number().nonnegative().optional().default(0)
});

function startOfDay(value) {
  const d = new Date(value);
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfDay(value) {
  const d = new Date(value);
  d.setHours(23, 59, 59, 999);
  return d;
}

function monthStart() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthEnd() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

function workDaysBetween(start, end) {
  const s = startOfDay(start);
  const e = startOfDay(end);
  let days = 0;
  for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
    const day = d.getDay();
    if (day !== 0) days += 1;
  }
  return days || 1;
}

function hoursFromTimes(checkIn, checkOut) {
  if (!checkIn || !checkOut) return 0;
  const diff = (new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 36e5;
  return Math.max(0, Number(diff.toFixed(2)));
}

async function nextNo(tx, tenantId, model, prefix) {
  const count = await tx[model].count({ where: { tenantId } });
  return `${prefix}${String(count + 1001).padStart(4, '0')}`;
}

async function verifyEmployee(tx, tenantId, employeeId) {
  const employee = await tx.employee.findFirst({ where: { id: employeeId, tenantId } });
  if (!employee) throw Object.assign(new Error('Employee not found'), { status: 404 });
  return employee;
}

function normalizeEmployee(row) {
  return {
    ...row,
    basicSalary: money(row.basicSalary),
    hourlyRate: money(row.hourlyRate),
    overtimeRate: money(row.overtimeRate),
    advanceBalance: money((row.advances || []).filter((a) => a.status === 'OPEN').reduce((sum, a) => sum + Number(a.amount || 0), 0))
  };
}

function normalizePayrollRun(row) {
  return {
    ...row,
    grossTotal: money(row.grossTotal),
    allowanceTotal: money(row.allowanceTotal),
    deductionTotal: money(row.deductionTotal),
    advanceTotal: money(row.advanceTotal),
    netTotal: money(row.netTotal)
  };
}

router.get('/summary', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const tenantId = req.user.tenantId;
    const today = startOfDay(new Date());
    const [employees, activeEmployees, attendanceToday, absentToday, openAdvances, pendingLeaves, payroll] = await Promise.all([
      prisma.employee.count({ where: { tenantId } }),
      prisma.employee.count({ where: { tenantId, status: 'ACTIVE' } }),
      prisma.attendanceRecord.count({ where: { tenantId, date: today, status: { in: ['PRESENT', 'HALF_DAY'] } } }),
      prisma.attendanceRecord.count({ where: { tenantId, date: today, status: 'ABSENT' } }),
      prisma.salaryAdvance.aggregate({ where: { tenantId, status: 'OPEN' }, _sum: { amount: true }, _count: true }),
      prisma.leaveRequest.count({ where: { tenantId, status: 'PENDING' } }),
      prisma.payrollRun.findMany({ where: { tenantId }, include: { items: { include: { employee: true } } }, orderBy: { periodStart: 'desc' }, take: 5 })
    ]);
    res.json({ employees, activeEmployees, attendanceToday, absentToday, openAdvanceCount: openAdvances._count, openAdvanceAmount: money(openAdvances._sum.amount || 0), pendingLeaves, recentPayroll: payroll.map(normalizePayrollRun) });
  } catch (e) { next(e); }
});

router.get('/employees', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.department) where.department = String(req.query.department);
    const q = String(req.query.q || '').trim();
    if (q) where.OR = [
      { employeeNo: { contains: q, mode: 'insensitive' } },
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
      { designation: { contains: q, mode: 'insensitive' } }
    ];
    const rows = await prisma.employee.findMany({ where, include: { advances: { orderBy: { paidAt: 'desc' }, take: 10 } }, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(rows.map(normalizeEmployee));
  } catch (e) { next(e); }
});

router.post('/employees', requirePermission('hr:create'), async (req, res, next) => {
  try {
    const data = employeeSchema.parse(req.body);
    const employee = await prisma.$transaction(async (tx) => {
      const employeeNo = data.employeeNo || await nextNo(tx, req.user.tenantId, 'employee', 'EMP');
      return tx.employee.create({ data: { tenantId: req.user.tenantId, createdById: req.user.id, ...data, email: data.email || null, employeeNo } });
    });
    await audit(req, 'CREATE', 'Employee', employee.id, null, employee);
    res.status(201).json(normalizeEmployee({ ...employee, advances: [] }));
  } catch (e) { next(e); }
});

router.patch('/employees/:id', requirePermission('hr:update'), async (req, res, next) => {
  try {
    const before = await prisma.employee.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Employee not found' });
    const data = employeeSchema.partial().parse(req.body);
    if (data.email === '') data.email = null;
    const employee = await prisma.employee.update({ where: { id: before.id }, data });
    await audit(req, 'UPDATE', 'Employee', employee.id, before, employee);
    res.json(normalizeEmployee({ ...employee, advances: [] }));
  } catch (e) { next(e); }
});

router.get('/attendance', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const from = req.query.from ? startOfDay(req.query.from) : monthStart();
    const to = req.query.to ? endOfDay(req.query.to) : monthEnd();
    const where = { tenantId: req.user.tenantId, date: { gte: from, lte: to } };
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const rows = await prisma.attendanceRecord.findMany({ where, include: { employee: true }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 500 });
    res.json(rows.map((r) => ({ ...r, employeeName: r.employee?.name, employeeNo: r.employee?.employeeNo })));
  } catch (e) { next(e); }
});

router.post('/attendance', requirePermission('hr:create'), async (req, res, next) => {
  try {
    const data = attendanceSchema.parse(req.body);
    const row = await prisma.$transaction(async (tx) => {
      await verifyEmployee(tx, req.user.tenantId, data.employeeId);
      const date = startOfDay(data.date);
      const regularHours = data.regularHours ?? Math.min(8, hoursFromTimes(data.checkIn, data.checkOut));
      return tx.attendanceRecord.upsert({
        where: { tenantId_employeeId_date: { tenantId: req.user.tenantId, employeeId: data.employeeId, date } },
        update: { ...data, date, regularHours, overtimeHours: data.overtimeHours || 0 },
        create: { tenantId: req.user.tenantId, createdById: req.user.id, ...data, date, regularHours, overtimeHours: data.overtimeHours || 0 }
      });
    });
    await audit(req, 'UPSERT', 'AttendanceRecord', row.id, null, row);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.post('/advances', requirePermission('hr:create'), async (req, res, next) => {
  try {
    const data = advanceSchema.parse(req.body);
    const advance = await prisma.$transaction(async (tx) => {
      await verifyEmployee(tx, req.user.tenantId, data.employeeId);
      return tx.salaryAdvance.create({ data: { tenantId: req.user.tenantId, createdById: req.user.id, ...data, amount: money(data.amount), paidAt: data.paidAt || new Date() }, include: { employee: true } });
    });
    await audit(req, 'CREATE', 'SalaryAdvance', advance.id, null, advance);
    res.status(201).json(advance);
  } catch (e) { next(e); }
});

router.get('/advances', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
    const rows = await prisma.salaryAdvance.findMany({ where, include: { employee: true }, orderBy: { paidAt: 'desc' }, take: 300 });
    res.json(rows.map((r) => ({ ...r, employeeName: r.employee?.name, amount: money(r.amount) })));
  } catch (e) { next(e); }
});

router.get('/leaves', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const where = { tenantId: req.user.tenantId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const rows = await prisma.leaveRequest.findMany({ where, include: { employee: true }, orderBy: { createdAt: 'desc' }, take: 300 });
    res.json(rows.map((r) => ({ ...r, employeeName: r.employee?.name })));
  } catch (e) { next(e); }
});

router.post('/leaves', requirePermission('hr:create'), async (req, res, next) => {
  try {
    const data = leaveSchema.parse(req.body);
    const leave = await prisma.$transaction(async (tx) => {
      await verifyEmployee(tx, req.user.tenantId, data.employeeId);
      return tx.leaveRequest.create({ data: { tenantId: req.user.tenantId, createdById: req.user.id, ...data } });
    });
    await audit(req, 'CREATE', 'LeaveRequest', leave.id, null, leave);
    res.status(201).json(leave);
  } catch (e) { next(e); }
});

router.patch('/leaves/:id/status', requirePermission('hr:update'), async (req, res, next) => {
  try {
    const data = leaveStatusSchema.parse(req.body);
    const before = await prisma.leaveRequest.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Leave request not found' });
    const leave = await prisma.leaveRequest.update({ where: { id: before.id }, data: { status: data.status, decidedAt: ['APPROVED', 'REJECTED'].includes(data.status) ? new Date() : null, reason: data.notes || before.reason } });
    await audit(req, 'STATUS', 'LeaveRequest', leave.id, before, leave);
    res.json(leave);
  } catch (e) { next(e); }
});

router.get('/payroll-runs', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const rows = await prisma.payrollRun.findMany({ where: { tenantId: req.user.tenantId }, include: { items: { include: { employee: true } } }, orderBy: { periodStart: 'desc' }, take: 100 });
    res.json(rows.map(normalizePayrollRun));
  } catch (e) { next(e); }
});

router.get('/payroll-runs/:id', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const row = await prisma.payrollRun.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: { include: { employee: true } }, advances: { include: { employee: true } } } });
    if (!row) return res.status(404).json({ message: 'Payroll run not found' });
    res.json(normalizePayrollRun(row));
  } catch (e) { next(e); }
});

router.post('/payroll-runs/generate', requirePermission('hr:payroll'), async (req, res, next) => {
  try {
    const data = payrollGenerateSchema.parse(req.body);
    const run = await prisma.$transaction(async (tx) => {
      const employees = await tx.employee.findMany({ where: { tenantId: req.user.tenantId, status: 'ACTIVE' } });
      if (!employees.length) throw Object.assign(new Error('No active employees found'), { status: 400 });
      const runNo = await nextNo(tx, req.user.tenantId, 'payrollRun', 'PAY');
      const periodStart = startOfDay(data.periodStart);
      const periodEnd = endOfDay(data.periodEnd);
      const workingDays = workDaysBetween(periodStart, periodEnd);
      const items = [];
      let grossTotal = 0, allowanceTotal = 0, deductionTotal = 0, advanceTotal = 0, netTotal = 0;

      for (const employee of employees) {
        const attendance = await tx.attendanceRecord.findMany({ where: { tenantId: req.user.tenantId, employeeId: employee.id, date: { gte: periodStart, lte: periodEnd } } });
        const presentDays = attendance.reduce((sum, a) => sum + (a.status === 'PRESENT' ? 1 : a.status === 'HALF_DAY' ? 0.5 : 0), 0);
        const overtimeHours = attendance.reduce((sum, a) => sum + Number(a.overtimeHours || 0), 0);
        const advances = await tx.salaryAdvance.aggregate({ where: { tenantId: req.user.tenantId, employeeId: employee.id, status: 'OPEN', paidAt: { lte: periodEnd } }, _sum: { amount: true } });
        const baseSalary = money(employee.basicSalary || 0);
        const overtimePay = money(overtimeHours * Number(employee.overtimeRate || 0));
        const allowances = money(data.defaultAllowances || 0);
        const deductions = money(data.defaultDeductions || 0);
        const advanceDeduction = money(advances._sum.amount || 0);
        const grossPay = money(baseSalary + overtimePay + allowances);
        const netPay = money(Math.max(0, grossPay - deductions - advanceDeduction));
        grossTotal = money(grossTotal + grossPay);
        allowanceTotal = money(allowanceTotal + allowances);
        deductionTotal = money(deductionTotal + deductions);
        advanceTotal = money(advanceTotal + advanceDeduction);
        netTotal = money(netTotal + netPay);
        items.push({ tenantId: req.user.tenantId, employeeId: employee.id, basicSalary: baseSalary, workingDays, presentDays, overtimeHours, overtimePay, allowances, deductions, advances: advanceDeduction, grossPay, netPay, notes: `Generated for ${employee.name}` });
      }

      const payrollRun = await tx.payrollRun.create({
        data: { tenantId: req.user.tenantId, runNo, periodStart, periodEnd, status: 'DRAFT', grossTotal, allowanceTotal, deductionTotal, advanceTotal, netTotal, notes: data.notes || null, createdById: req.user.id, items: { create: items } },
        include: { items: { include: { employee: true } } }
      });
      return payrollRun;
    });
    await audit(req, 'GENERATE', 'PayrollRun', run.id, null, run);
    res.status(201).json(normalizePayrollRun(run));
  } catch (e) { next(e); }
});

router.patch('/payroll-runs/:id/status', requirePermission('hr:payroll'), async (req, res, next) => {
  try {
    const data = z.object({ status: z.enum(PAYROLL_STATUSES), notes: z.string().optional().nullable() }).parse(req.body);
    const before = await prisma.payrollRun.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId } });
    if (!before) return res.status(404).json({ message: 'Payroll run not found' });
    const run = await prisma.payrollRun.update({ where: { id: before.id }, data: { status: data.status, notes: data.notes ?? before.notes } });
    await audit(req, 'STATUS', 'PayrollRun', run.id, before, run);
    res.json(normalizePayrollRun(run));
  } catch (e) { next(e); }
});

router.post('/payroll-runs/:id/pay', requirePermission('hr:payroll'), async (req, res, next) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: req.params.id, tenantId: req.user.tenantId }, include: { items: true } });
      if (!run) throw Object.assign(new Error('Payroll run not found'), { status: 404 });
      if (run.status === 'PAID') throw Object.assign(new Error('Payroll is already paid'), { status: 400 });
      await tx.payrollItem.updateMany({ where: { payrollRunId: run.id }, data: { status: 'PAID' } });
      await tx.salaryAdvance.updateMany({ where: { tenantId: req.user.tenantId, status: 'OPEN', employeeId: { in: run.items.map((i) => i.employeeId) }, paidAt: { lte: run.periodEnd } }, data: { status: 'DEDUCTED', payrollRunId: run.id } });
      const updated = await tx.payrollRun.update({ where: { id: run.id }, data: { status: 'PAID', paidAt: new Date() }, include: { items: { include: { employee: true } } } });
      await createAutoJournalEntry(tx, { tenantId: req.user.tenantId, entryDate: new Date(), description: `Payroll ${run.runNo} paid`, reference: `PayrollRun:${run.id}:paid`, createdById: req.user.id, lines: [
        { code: ACCOUNT_CODES.OPERATING_EXPENSES, debit: run.netTotal, description: 'Payroll salaries paid' },
        { code: ACCOUNT_CODES.CASH, credit: run.netTotal, description: 'Cash/bank salary payment' }
      ] });
      return { before: run, updated };
    });
    await notifyTenantRoles({ tenantId: req.user.tenantId, roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'], type: 'SUCCESS', title: 'Payroll paid', message: `${result.updated.runNo} paid. Net total LKR ${Number(result.updated.netTotal || 0).toFixed(2)}.`, priority: 'NORMAL', entityType: 'PayrollRun', entityId: result.updated.id, actionUrl: '/hr-payroll' });
    await audit(req, 'PAY', 'PayrollRun', result.updated.id, result.before, result.updated);
    res.json(normalizePayrollRun(result.updated));
  } catch (e) { next(e); }
});

router.post('/alerts', requirePermission('hr:read'), async (req, res, next) => {
  try {
    const pendingLeaves = await prisma.leaveRequest.findMany({ where: { tenantId: req.user.tenantId, status: 'PENDING' }, include: { employee: true }, take: 50 });
    let created = 0;
    for (const leave of pendingLeaves) {
      await createNotification({ tenantId: req.user.tenantId, type: 'INFO', title: 'Pending leave request', message: `${leave.employee?.name || 'Employee'} requested ${leave.leaveType} leave.`, priority: 'NORMAL', entityType: 'LeaveRequest', entityId: leave.id, actionUrl: '/hr-payroll' });
      created += 1;
    }
    res.json({ created, pendingLeaves: pendingLeaves.length });
  } catch (e) { next(e); }
});

export default router;
