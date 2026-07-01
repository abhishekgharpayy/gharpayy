import { ulid } from "../../../../src/contracts/ids.js";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import type { UserDoc } from "../../auth/auth.js";
import { TopRole, UserStatus } from "../../../../src/contracts/roles.js";

const UpdateEmployeeBody = z.object({
  role: TopRole.optional(),
  status: UserStatus.optional(),
  department: z.string().max(120).optional(),
  managerId: z.string().nullable().optional(),
});

function employeeOut(u: UserDoc) {
  return {
    id: u._id,
    fullName: u.fullName,
    email: u.email,
    phone: u.phone ?? "",
    role: u.role,
    status: u.status,
    department: u.department ?? "",
    managerId: u.managerId ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

export function registerHrRoutes(app: FastifyInstance) {
  const users = () => col<UserDoc>("users");

  // ---------- LIST ALL EMPLOYEES ----------
  app.get("/api/hr/employees", { preHandler: [requireAuth, requireScope("employee.read")] }, async (req, reply) => {
    // HR can view all users in the tenant, excluding super_admin
    const list = await users()
      .find({ tenantId: req.user!.tenantId, role: { $ne: "super_admin" } })
      .sort({ createdAt: -1 })
      .toArray();
    return reply.send(list.map(employeeOut));
  });

  // ---------- UPDATE EMPLOYEE ----------
  app.patch("/api/hr/employees/:id", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateEmployeeBody.parse(req.body);
    
    const target = await users().findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!target) return reply.code(404).send({ code: "NOT_FOUND", message: "Employee not found" });
    if (target.role === "super_admin") {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Cannot modify Super Admin" });
    }

    const now = new Date().toISOString();
    const patch: Partial<UserDoc> = { updatedAt: now };
    
    if (body.role !== undefined) patch.role = body.role;
    if (body.status !== undefined) {
      patch.status = body.status;
      if (body.status === "deleted") {
        patch.deletedAt = now;
      }
    }
    if (body.department !== undefined) patch.department = body.department;
    if (body.managerId !== undefined) patch.managerId = body.managerId;

    const r = await users().findOneAndUpdate(
      { _id: id },
      { $set: patch },
      { returnDocument: "after" },
    );
    
    return reply.send(employeeOut(r!));
  });

  // ---------- LEAVES ----------
  const leaves = () => col("leaves");

  const RequestLeaveBody = z.object({
    type: z.enum(["casual", "sick", "earned", "unpaid"]),
    startDate: z.string(),
    endDate: z.string(),
    days: z.number().min(0.5),
    reason: z.string().max(2000),
  });

  app.post("/api/hr/leaves", { preHandler: [requireAuth] }, async (req, reply) => {
    // Any authenticated user can request a leave
    const body = RequestLeaveBody.parse(req.body);
    const user = req.user!;
    const now = new Date().toISOString();
    
    // Generate ULID for _id
    

    const leave = {
      _id: ulid(),
      tenantId: user.tenantId,
      employeeId: user.sub,
      employeeName: user.fullName,
      type: body.type,
      status: "pending",
      startDate: body.startDate,
      endDate: body.endDate,
      days: body.days,
      reason: body.reason,
      managerId: null,
      managerNote: null,
      createdAt: now,
      updatedAt: now,
    };

    await leaves().insertOne(leave);
    return reply.code(201).send(leave);
  });

  app.get("/api/hr/leaves", { preHandler: [requireAuth] }, async (req, reply) => {
    // If the user is HR or Super Admin, they can view all leaves.
    // Otherwise, they can only view their own leaves.
    const { employeeId } = req.query as { employeeId?: string };
    const user = req.user!;
    
    const query: any = { tenantId: user.tenantId };
    if (user.role !== "hr" && user.role !== "super_admin") {
      query.employeeId = user.sub; // enforce viewing own leaves
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    const list = await leaves().find(query).sort({ createdAt: -1 }).toArray();
    return reply.send(list);
  });

  const UpdateLeaveBody = z.object({
    status: z.enum(["approved", "rejected", "cancelled"]),
    managerNote: z.string().max(2000).optional(),
  });

  app.patch("/api/hr/leaves/:id", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateLeaveBody.parse(req.body);
    const user = req.user!;
    const now = new Date().toISOString();

    const target = await leaves().findOne({ _id: id, tenantId: user.tenantId });
    if (!target) return reply.code(404).send({ code: "NOT_FOUND", message: "Leave not found" });

    // Cancel logic: an employee can cancel their own pending leave
    if (body.status === "cancelled") {
      if (target.employeeId !== user.sub && user.role !== "hr") {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Cannot cancel others leave" });
      }
      if (target.status !== "pending" && target.status !== "approved") {
         return reply.code(400).send({ code: "BAD_REQUEST", message: "Cannot cancel this leave" });
      }
    }

    const patch: any = { 
      updatedAt: now,
      status: body.status,
    };
    if (body.status === "approved" || body.status === "rejected") {
      patch.managerId = user.sub;
    }
    if (body.managerNote !== undefined) patch.managerNote = body.managerNote;

    const r = await leaves().findOneAndUpdate(
      { _id: id },
      { $set: patch },
      { returnDocument: "after" },
    );
    return reply.send(r);
  });

  // ---------- ATTENDANCE ----------
  const attendance = () => col("attendance");

  // Get attendance for a specific date or month
  app.get("/api/hr/attendance", { preHandler: [requireAuth] }, async (req, reply) => {
    const { date, month, employeeId } = req.query as { date?: string; month?: string; employeeId?: string };
    const user = req.user!;
    
    const query: any = { tenantId: user.tenantId };
    if (user.role !== "hr" && user.role !== "super_admin") {
      query.employeeId = user.sub; // enforce viewing own attendance
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (date) {
      query.date = date; // YYYY-MM-DD
    } else if (month) {
      // month format YYYY-MM
      query.date = { $regex: `^${month}` };
    }

    const list = await attendance().find(query).sort({ date: -1 }).toArray();
    return reply.send(list);
  });

  // Check in/out (upsert for today)
  app.post("/api/hr/attendance/punch", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!;
    const now = new Date();
    // Use local date string in India timezone for simplicity (assuming tenant is in India)
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now);
    const isoString = now.toISOString();

    const existing = await attendance().findOne({ tenantId: user.tenantId, employeeId: user.sub, date: dateStr });
    
    if (!existing) {
      // First punch of the day -> Check In
      
      const record = {
        _id: ulid(),
        tenantId: user.tenantId,
        employeeId: user.sub,
        employeeName: user.fullName,
        date: dateStr,
        checkIn: isoString,
        checkOut: null,
        status: "present",
        workHours: 0,
        createdAt: isoString,
        updatedAt: isoString,
      };
      await attendance().insertOne(record);
      return reply.send(record);
    } else {
      // Subsequent punch -> Check Out (updates workHours)
      if (!existing.checkIn) {
        return reply.code(400).send({ code: "BAD_STATE", message: "Cannot check out without check in" });
      }
      const checkInTime = new Date(existing.checkIn).getTime();
      const checkOutTime = now.getTime();
      const hours = (checkOutTime - checkInTime) / (1000 * 60 * 60);

      const r = await attendance().findOneAndUpdate(
        { _id: existing._id },
        { 
          $set: { 
            checkOut: isoString, 
            workHours: Number(hours.toFixed(2)),
            updatedAt: isoString 
          }
        },
        { returnDocument: "after" }
      );
      return reply.send(r);
    }
  });

  // Manual override by HR
  const OverrideAttendanceBody = z.object({
    status: z.enum(["present", "absent", "half-day", "late", "on-leave"]),
    checkIn: z.string().nullable().optional(),
    checkOut: z.string().nullable().optional(),
  });

  app.patch("/api/hr/attendance/:id", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = OverrideAttendanceBody.parse(req.body);
    const user = req.user!;
    
    const patch: any = { updatedAt: new Date().toISOString(), status: body.status };
    if (body.checkIn !== undefined) patch.checkIn = body.checkIn;
    if (body.checkOut !== undefined) patch.checkOut = body.checkOut;

    // Recalculate hours if both are provided
    if (patch.checkIn && patch.checkOut) {
      const ms = new Date(patch.checkOut).getTime() - new Date(patch.checkIn).getTime();
      patch.workHours = Number((ms / (1000 * 60 * 60)).toFixed(2));
    }

    const r = await attendance().findOneAndUpdate(
      { _id: id, tenantId: user.tenantId },
      { $set: patch },
      { returnDocument: "after" }
    );
    if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Attendance record not found" });
    return reply.send(r);
  });

  // ---------- ATS (CANDIDATES) ----------
  const candidates = () => col("candidates");

  const AddCandidateBody = z.object({
    name: z.string().min(1).max(120),
    email: z.string().email(),
    phone: z.string().min(7).max(20),
    roleAppliedFor: z.string().min(1).max(120),
    resumeUrl: z.string().url().nullable().optional(),
    notes: z.string().max(2000).optional(),
  });

  app.post("/api/hr/candidates", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const body = AddCandidateBody.parse(req.body);
    const user = req.user!;
    const now = new Date().toISOString();
    
    
    const record = {
      _id: ulid(),
      tenantId: user.tenantId,
      name: body.name,
      email: body.email,
      phone: body.phone,
      roleAppliedFor: body.roleAppliedFor,
      resumeUrl: body.resumeUrl || null,
      stage: "applied",
      notes: body.notes || "",
      interviewerId: null,
      interviewDate: null,
      rating: null,
      createdAt: now,
      updatedAt: now,
    };
    await candidates().insertOne(record);
    return reply.code(201).send(record);
  });

  app.get("/api/hr/candidates", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!;
    const list = await candidates().find({ tenantId: user.tenantId }).sort({ createdAt: -1 }).toArray();
    return reply.send(list);
  });

  const UpdateCandidateBody = z.object({
    stage: z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]).optional(),
    interviewerId: z.string().nullable().optional(),
    interviewDate: z.string().nullable().optional(),
    rating: z.number().min(1).max(5).nullable().optional(),
    notes: z.string().max(2000).optional(),
  });

  app.patch("/api/hr/candidates/:id", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = UpdateCandidateBody.parse(req.body);
    const user = req.user!;
    
    const patch: any = { updatedAt: new Date().toISOString() };
    if (body.stage !== undefined) patch.stage = body.stage;
    if (body.interviewerId !== undefined) patch.interviewerId = body.interviewerId;
    if (body.interviewDate !== undefined) patch.interviewDate = body.interviewDate;
    if (body.rating !== undefined) patch.rating = body.rating;
    if (body.notes !== undefined) patch.notes = body.notes;

    const r = await candidates().findOneAndUpdate(
      { _id: id, tenantId: user.tenantId },
      { $set: patch },
      { returnDocument: "after" }
    );
    if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Candidate not found" });
    return reply.send(r);
  });

  // ---------- PAYROLL & COMPENSATION ----------
  const payrollRuns = () => col("payroll_runs");
  const payslips = () => col("payslips");

  app.get("/api/hr/payroll", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const user = req.user!;
    const runs = await payrollRuns().find({ tenantId: user.tenantId }).sort({ month: -1 }).toArray();
    return reply.send(runs);
  });

  const GeneratePayrollBody = z.object({
    month: z.string(), // YYYY-MM
  });

  app.post("/api/hr/payroll/generate", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const body = GeneratePayrollBody.parse(req.body);
    const user = req.user!;
    
    const now = new Date().toISOString();

    const existingRun = await payrollRuns().findOne({ tenantId: user.tenantId, month: body.month });
    if (existingRun) {
      return reply.code(400).send({ code: "ALREADY_EXISTS", message: "Payroll run already exists for this month" });
    }

    // Get all active employees
    const allEmployees = await users().find({ tenantId: user.tenantId, status: "active", isManaged: true }).toArray();
    
    // Generate simple payslips for them (mocked base salary for demo purposes)
    const newSlips = allEmployees.map(emp => {
      const baseSalary = 50000; // Mock base
      const allowances = 5000;
      const deductions = 2000;
      return {
        _id: ulid(),
        tenantId: user.tenantId,
        employeeId: emp._id,
        employeeName: emp.fullName,
        month: body.month,
        baseSalary,
        allowances,
        deductions,
        netPay: baseSalary + allowances - deductions,
        status: "draft",
        createdAt: now,
      };
    });

    const runId = ulid();
    const totalAmount = newSlips.reduce((sum, s) => sum + s.netPay, 0);

    const newRun = {
      _id: runId,
      tenantId: user.tenantId,
      month: body.month,
      status: "draft",
      totalAmount,
      processedAt: null,
      createdAt: now,
    };

    if (newSlips.length > 0) {
      // Link slips to run
      const linkedSlips = newSlips.map(s => ({ ...s, payrollRunId: runId }));
      await payslips().insertMany(linkedSlips);
    }
    await payrollRuns().insertOne(newRun);

    return reply.send(newRun);
  });

  app.get("/api/hr/payroll/:runId/payslips", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const user = req.user!;
    const slips = await payslips().find({ tenantId: user.tenantId, payrollRunId: runId }).toArray();
    return reply.send(slips);
  });

  app.post("/api/hr/payroll/:runId/process", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const { runId } = req.params as { runId: string };
    const user = req.user!;
    const now = new Date().toISOString();

    const run = await payrollRuns().findOne({ _id: runId, tenantId: user.tenantId });
    if (!run) return reply.code(404).send({ code: "NOT_FOUND", message: "Run not found" });

    await payrollRuns().updateOne({ _id: runId }, { $set: { status: "paid", processedAt: now } });
    await payslips().updateMany({ payrollRunId: runId }, { $set: { status: "paid" } });

    return reply.send({ success: true });
  });

  // Get my payslips (for normal employee view)
  app.get("/api/hr/my-payslips", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!;
    const slips = await payslips().find({ tenantId: user.tenantId, employeeId: user.sub }).sort({ month: -1 }).toArray();
    return reply.send(slips);
  });

  // ---------- HR ANALYTICS ----------
  app.get("/api/hr/analytics", { preHandler: [requireAuth, requireScope("employee.write")] }, async (req, reply) => {
    const user = req.user!;
    const tenantId = user.tenantId;

    const [empCount, leaveCount, activeCandidates, thisMonthPayroll] = await Promise.all([
      users().countDocuments({ tenantId, status: "active", isManaged: true }),
      leaves().countDocuments({ tenantId, status: "pending" }),
      candidates().countDocuments({ tenantId, stage: { $in: ["applied", "screening", "interview", "offer"] } }),
      payrollRuns().findOne({ tenantId }, { sort: { month: -1 } })
    ]);

    // Get attendance stats for today
    const dateStr = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
    const [presentCount, onLeaveCount] = await Promise.all([
      attendance().countDocuments({ tenantId, date: dateStr, status: "present" }),
      attendance().countDocuments({ tenantId, date: dateStr, status: "on-leave" })
    ]);

    // Monthly payroll trend
    const recentRuns = await payrollRuns().find({ tenantId }).sort({ month: -1 }).limit(6).toArray();
    const payrollTrend = recentRuns.reverse().map(r => ({
      month: r.month,
      amount: r.totalAmount
    }));

    return reply.send({
      headcount: empCount,
      pendingLeaves: leaveCount,
      activeCandidates,
      monthlyRunRate: thisMonthPayroll ? thisMonthPayroll.totalAmount : 0,
      todayPresent: presentCount,
      todayOnLeave: onLeaveCount,
      payrollTrend,
    });
  });

  // ---------- PERFORMANCE REVIEWS ----------
  const reviews = () => col("reviews");

  const SubmitReviewBody = z.object({
    employeeId: z.string(),
    type: z.enum(["self", "manager", "peer"]),
    cycle: z.string(),
    rating: z.number().min(1).max(5),
    feedback: z.string().max(3000),
  });

  app.post("/api/hr/reviews", { preHandler: [requireAuth] }, async (req, reply) => {
    const body = SubmitReviewBody.parse(req.body);
    const user = req.user!;
    const now = new Date().toISOString();

    const target = await users().findOne({ _id: body.employeeId, tenantId: user.tenantId });
    if (!target) return reply.code(404).send({ code: "NOT_FOUND", message: "Employee not found" });

    // Check if review already submitted by this reviewer for this cycle and type
    const existing = await reviews().findOne({ 
      tenantId: user.tenantId, 
      employeeId: body.employeeId, 
      reviewerId: user.sub, 
      cycle: body.cycle,
      type: body.type
    });

    if (existing) {
      return reply.code(400).send({ code: "ALREADY_EXISTS", message: "You have already submitted this review" });
    }

    
    const record = {
      _id: ulid(),
      tenantId: user.tenantId,
      employeeId: target._id,
      employeeName: target.fullName,
      reviewerId: user.sub,
      reviewerName: user.fullName,
      type: body.type,
      cycle: body.cycle,
      rating: body.rating,
      feedback: body.feedback,
      status: "submitted",
      createdAt: now,
      updatedAt: now,
    };

    await reviews().insertOne(record);
    return reply.send(record);
  });

  app.get("/api/hr/reviews", { preHandler: [requireAuth] }, async (req, reply) => {
    const user = req.user!;
    const { cycle, employeeId } = req.query as { cycle?: string; employeeId?: string };

    const query: any = { tenantId: user.tenantId };
    
    // Only HR or managers can see all reviews. Normal users only see their own (or ones they wrote).
    if (user.role !== "hr" && user.role !== "super_admin") {
      query.$or = [{ employeeId: user.sub }, { reviewerId: user.sub }];
    } else if (employeeId) {
      query.employeeId = employeeId;
    }

    if (cycle) query.cycle = cycle;

    const list = await reviews().find(query).sort({ createdAt: -1 }).toArray();
    return reply.send(list);
  });
}
