import type { FastifyInstance } from "fastify";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { Lead, Tour, BookingEntity } from "../../../../src/contracts/entities.js";
import type { UserDoc } from "../../auth/auth.js";

// Local shape for follow_ups collection (no shared contract for this collection)
interface FollowUpDoc { _id: string; tenantId: string; [key: string]: unknown; }

const STAFF_ROLES = ["super_admin", "manager", "admin"] as const;
const SUPER_ADMIN_ROLES = ["super_admin"] as const;

export function registerAdminSupremeRoutes(app: FastifyInstance) {
  // ── Supreme Metrics ───────────────────────────────────────────────────────
  app.get("/api/v1/admin/supreme/metrics", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden: Super Admin/Manager only" });
    }

    const tenantId = req.user!.tenantId;

    const [leads, tours, tcms, bookings, followUps, activities, properties] = await Promise.all([
      col<Lead>("leads").find({ tenantId }).toArray(),
      col<Tour>("tours").find({ tenantId }).toArray(),
      col<UserDoc>("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
      col<BookingEntity>("bookings").find({ tenantId }).toArray(),
      col<FollowUpDoc>("follow_ups").find({ tenantId }).toArray(),
      col("activities").find({ tenantId }).toArray(),
      col("properties").find({ tenantId }).toArray(),
    ]);

    const mappedTcms = tcms.map(u => ({
      id: u._id,
      name: u.fullName || u.username || "Unknown",
      role: u.role,
      zones: u.zones || [],
      phone: u.phone,
      email: u.email,
    }));

    return reply.send({ leads, tours, tcms: mappedTcms, bookings, followUps, activities, properties });
  });

  // ── Coaching Notes ────────────────────────────────────────────────────────
  app.post("/api/v1/admin/coaching-notes", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
    }

    const { leadId, tcmId, note } = req.body as { leadId: string; tcmId: string; note: string };
    if (!leadId || !tcmId || !note) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Missing required fields" });
    }

    const activity = {
      _id: "cn_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      tenantId: req.user!.tenantId,
      kind: "coaching_note",
      leadId,
      tcmId,
      note,
      createdBy: req.user!.sub,
      createdAt: new Date().toISOString(),
    };

    await col("activities").insertOne(activity);
    return reply.send({ success: true, activity });
  });

  app.get("/api/v1/tcm/coaching-notes", { preHandler: [requireAuth] }, async (req, reply) => {
    const notes = await col("activities")
      .find({ tenantId: req.user!.tenantId, tcmId: req.user!.sub, kind: "coaching_note" })
      .toArray();
    return reply.send({ notes });
  });

  // ── Command Terminal ────────────────────────────────────────────────────────
  app.post("/api/v1/admin/command", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
    }

    const { command, args } = req.body as { command: string; args: string };
    const now = new Date().toISOString();

    if (command === "broadcast") {
      await col("entity_events").insertOne({
        _id: "evt_" + Date.now(),
        tenantId: req.user!.tenantId,
        type: "admin.broadcast",
        action: "admin.broadcast",
        summary: `Admin Broadcast: ${args}`,
        actor: req.user!.sub,
        actorName: req.user!.fullName,
        ts: Date.now(),
        occurredAt: now,
      });
      return reply.send({ success: true, message: `Broadcasted to entire team: ${args}` });
    }

    if (command === "kill-switch") {
      await col("entity_events").insertOne({
        _id: "evt_" + Date.now(),
        tenantId: req.user!.tenantId,
        type: "admin.kill_switch",
        action: "admin.kill_switch",
        summary: `Admin activated KILL-SWITCH: ${args}`,
        actor: req.user!.sub,
        actorName: req.user!.fullName,
        ts: Date.now(),
        occurredAt: now,
      });
      return reply.send({ success: true, message: `System Kill-Switch activated for ${args}` });
    }

    return reply.code(400).send({ code: "BAD_COMMAND", message: `Unknown command: ${command}` });
  });

  // ── Server-Side Audit Log ─────────────────────────────────────────────────
  app.get("/api/v1/admin/audit", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!SUPER_ADMIN_ROLES.includes(role as (typeof SUPER_ADMIN_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Super admin only" });
    }

    const tenantId = req.user!.tenantId;
    const { limit = "200", skip = "0", q = "" } = req.query as Record<string, string>;

    const filter: Record<string, unknown> = { tenantId };
    if (q) {
      filter["$or"] = [
        { actorName: { $regex: q, $options: "i" } },
        { action: { $regex: q, $options: "i" } },
        { summary: { $regex: q, $options: "i" } },
      ];
    }

    const entries = await col("entity_events")
      .find(filter)
      .sort({ ts: -1 })
      .skip(Number(skip))
      .limit(Number(limit))
      .toArray();

    const total = await col("entity_events").countDocuments(filter);
    return reply.send({ entries, total });
  });

  // ── Broadcast to All TCMs ─────────────────────────────────────────────────
  app.post("/api/v1/admin/broadcast", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!SUPER_ADMIN_ROLES.includes(role as (typeof SUPER_ADMIN_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Super admin only" });
    }

    const { message } = req.body as { message: string };
    if (!message?.trim()) {
      return reply.code(400).send({ code: "BAD_REQUEST", message: "Message required" });
    }

    const tenantId = req.user!.tenantId;
    const tcms = await col<UserDoc>("users")
      .find({ tenantId, role: { $in: ["tcm", "member"] } })
      .toArray();

    const broadcastId = "bc_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5);
    await col("broadcasts").insertOne({
      _id: broadcastId,
      tenantId,
      kind: "broadcast",
      message: message.trim(),
      sentBy: req.user!.sub,
      recipientCount: tcms.length,
      recipientIds: tcms.map(t => t._id),
      createdAt: new Date().toISOString(),
      readBy: [] as string[],
    });

    // Write audit event
    await col("entity_events").insertOne({
      _id: "ae_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      tenantId,
      actorId: req.user!.sub,
      actorName: (req.user as any).name || "Admin",
      entityType: "broadcast",
      entityId: broadcastId,
      action: "admin.broadcast",
      summary: `Broadcast → ${tcms.length} TCMs: ${message.slice(0, 80)}`,
      ts: Date.now(),
    });

    return reply.send({ success: true, recipientCount: tcms.length, broadcastId });
  });

  // ── Kill Switch (pause / resume all org sequences) ────────────────────────
  app.post("/api/v1/admin/kill-switch", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!SUPER_ADMIN_ROLES.includes(role as (typeof SUPER_ADMIN_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Super admin only" });
    }

    const { paused } = req.body as { paused: boolean };
    const tenantId = req.user!.tenantId;

    await col("tenant_config").updateOne(
      { tenantId },
      {
        $set: {
          sequencesPaused: paused,
          pausedAt: paused ? new Date().toISOString() : null,
          pausedBy: paused ? req.user!.sub : null,
        },
      },
      { upsert: true }
    );

    await col("entity_events").insertOne({
      _id: "ae_" + Date.now() + "_" + Math.random().toString(36).substr(2, 5),
      tenantId,
      actorId: req.user!.sub,
      actorName: (req.user as any).name || "Admin",
      entityType: "system",
      entityId: tenantId,
      action: paused ? "admin.kill.on" : "admin.kill.off",
      summary: paused ? "Paused all sequences org-wide" : "Resumed all sequences",
      ts: Date.now(),
    });

    return reply.send({ success: true, sequencesPaused: paused });
  });

  // ── Admin Leads (pre-joined) ──────────────────────────────────────────────
  app.get("/api/v1/admin/leads", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!STAFF_ROLES.includes(role as (typeof STAFF_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden: Super Admin/Manager only" });
    }

    const tenantId = req.user!.tenantId;
    const DAY = 86_400_000;
    const now = Date.now();

    const [leads, tours, tcms, bookings, followUps, activities] = await Promise.all([
      col<Lead>("leads").find({ tenantId }).toArray(),
      col<Tour>("tours").find({ tenantId }).toArray(),
      col<UserDoc>("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
      col<BookingEntity>("bookings").find({ tenantId }).toArray(),
      col("follow_ups").find({ tenantId }).toArray(),
      col("activities").find({ tenantId }).toArray(),
    ]);

    const mappedTcms = tcms.map(u => ({
      id: u._id,
      name: u.fullName || u.username || "Unknown",
      role: u.role,
      zones: u.zones || [],
      phone: u.phone,
      email: u.email,
    }));

    // Build lookup maps
    const toursByLead = new Map<string, Tour[]>();
    tours.forEach(t => { const arr = toursByLead.get(t.leadId) || []; arr.push(t); toursByLead.set(t.leadId, arr); });
    const bookingsByLead = new Map<string, BookingEntity[]>();
    bookings.forEach(b => { const leadId = (b as any).leadId; if (leadId) { const arr = bookingsByLead.get(leadId) || []; arr.push(b); bookingsByLead.set(leadId, arr); } });
    const fuByLead = new Map<string, any[]>();
    followUps.forEach((f: any) => { if (f.leadId) { const arr = fuByLead.get(f.leadId) || []; arr.push(f); fuByLead.set(f.leadId, arr); } });
    const activitiesByLead = new Map<string, any[]>();
    activities.forEach((a: any) => { if (a.leadId) { const arr = activitiesByLead.get(a.leadId) || []; arr.push(a); activitiesByLead.set(a.leadId, arr); } });

    // Compute derived fields per lead
    const rows = leads.map(lead => {
      const leadTours = toursByLead.get(lead._id) || [];
      const leadBookings = bookingsByLead.get(lead._id) || [];
      const leadFollowUps = fuByLead.get(lead._id) || [];
      const leadActivities = activitiesByLead.get(lead._id) || [];
      const tcm = mappedTcms.find(t => t.id === lead.assignedTcmId);

      // Compute probability
      let probability = (lead as any).confidence ?? 0;
      if (lead.stage === "booked") probability = 100;
      else if (lead.stage === "dropped") probability = 0;
      else {
        if (lead.stage === "negotiation") probability = Math.max(probability, 70);
        if (lead.stage === "tour-done") probability = Math.max(probability, 55);
        if (lead.stage === "tour-scheduled") probability = Math.max(probability, 40);
        if (leadTours.some((t: any) => t.decision === "booked")) probability = 100;
        if (leadTours.some((t: any) => t.postTour?.outcome === "thinking")) probability = Math.max(probability, 60);
        if (leadTours.some((t: any) => t.postTour?.outcome === "not-interested")) probability = 5;
      }
      probability = Math.max(0, Math.min(100, Math.round(probability)));

      // Expected value (MRR weighted by probability)
      const expectedValue = Math.round(((lead as any).budget || 0) * (probability / 100));

      // Status
      const booked = lead.stage === "booked" || leadBookings.length > 0;
      const lastTouchTs = Math.max(
        +new Date((lead as any).updatedAt || (lead as any).createdAt),
        ...leadTours.map((t: any) => +new Date(t.updatedAt || t.createdAt)),
        ...leadActivities.map((a: any) => +new Date(a.occurredAt || a.createdAt)),
      );
      const ageDays = Math.floor((now - lastTouchTs) / DAY);
      const dormantBucket: "30d" | "60d" | "90d" | null =
        ageDays >= 90 ? "90d" : ageDays >= 60 ? "60d" : ageDays >= 30 ? "30d" : null;
      const status = booked ? "booked" : lead.stage === "dropped" ? "lost" : dormantBucket ? "dormant" : "open";

      // Why not closed
      let whyNotClosed = "";
      if (booked) whyNotClosed = "—";
      else if (lead.stage === "dropped") whyNotClosed = "Dropped";
      else if (lead.stage === "negotiation") whyNotClosed = "Stuck in negotiation";
      else if (lead.stage === "tour-done") whyNotClosed = "Post-tour follow-up overdue";
      else if (lead.stage === "tour-scheduled") whyNotClosed = "Awaiting tour";
      else if (lead.stage === "new" && ageDays > 1) whyNotClosed = `New for ${ageDays}d — never contacted`;
      else whyNotClosed = "Active — keep nurturing";

      return {
        lead: { ...lead, id: (lead as any)._id },
        tcm,
        tours: leadTours,
        bookings: leadBookings,
        followUps: leadFollowUps,
        lastTouchTs,
        probability,
        expectedValue,
        status,
        whyNotClosed,
        dormantBucket,
        hasVisit: leadTours.length > 0,
        booked,
        // ── New: Stage aging & intervention ──
        intervention: (lead as any).intervention ?? null,
        currentStageAgeDays: (() => {
          const stageTs = +new Date((lead as any).updatedAt || (lead as any).createdAt);
          return Math.floor((now - stageTs) / DAY);
        })(),
        isStuck: (() => {
          const stageTs = +new Date((lead as any).updatedAt || (lead as any).createdAt);
          const days = Math.floor((now - stageTs) / DAY);
          const thresholds: Record<string, number> = {
            new: 1, contacted: 3, "tour-scheduled": 5, "tour-done": 3, negotiation: 3,
          };
          const threshold = thresholds[lead.stage] ?? 999;
          return days > threshold && !booked && lead.stage !== "dropped";
        })(),
      };
    });

    return reply.send({ rows, tcms: mappedTcms });
  });

  // ── System Diagnostics ────────────────────────────────────────────────────
  app.get("/api/v1/admin/diagnostics", { preHandler: [requireAuth] }, async (req, reply) => {
    const role = req.user!.role;
    if (!SUPER_ADMIN_ROLES.includes(role as (typeof SUPER_ADMIN_ROLES)[number])) {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Super admin only" });
    }

    const tenantId = req.user!.tenantId;

    const [leadCount, tourCount, bookingCount, userCount, activityCount, recentErrors, tenantConfig] =
      await Promise.all([
        col("leads").countDocuments({ tenantId }),
        col("tours").countDocuments({ tenantId }),
        col("bookings").countDocuments({ tenantId }),
        col("users").countDocuments({ tenantId }),
        col("activities").countDocuments({ tenantId }),
        col("dlq")
          .find()
          .sort({ failedAt: -1 })
          .limit(10)
          .toArray(),
        col("tenant_config").findOne({ tenantId }),
      ]);

    return reply.send({
      counts: { leads: leadCount, tours: tourCount, bookings: bookingCount, users: userCount, activities: activityCount },
      sequencesPaused: tenantConfig?.sequencesPaused ?? false,
      pausedAt: tenantConfig?.pausedAt ?? null,
      recentErrors: recentErrors.map((e: any) => ({
        action: e.eventType || "dlq.error",
        summary: e.error?.message || e.message || "Unknown error",
      })),
      serverTime: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    });
  });
}
