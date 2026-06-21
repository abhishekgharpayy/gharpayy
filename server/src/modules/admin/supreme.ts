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

    const [leads, tours, tcms, bookings, followUps, activities] = await Promise.all([
      col<Lead>("leads").find({ tenantId }).toArray(),
      col<Tour>("tours").find({ tenantId }).toArray(),
      col<UserDoc>("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
      col<BookingEntity>("bookings").find({ tenantId }).toArray(),
      col<FollowUpDoc>("follow_ups").find({ tenantId }).toArray(),
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

    return reply.send({ leads, tours, tcms: mappedTcms, bookings, followUps, activities });
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
        col("entity_events")
          .find({ tenantId, action: { $regex: "error", $options: "i" }, ts: { $gte: Date.now() - 24 * 3600_000 } })
          .limit(10)
          .toArray(),
        col("tenant_config").findOne({ tenantId }),
      ]);

    return reply.send({
      counts: { leads: leadCount, tours: tourCount, bookings: bookingCount, users: userCount, activities: activityCount },
      sequencesPaused: tenantConfig?.sequencesPaused ?? false,
      pausedAt: tenantConfig?.pausedAt ?? null,
      recentErrors,
      serverTime: new Date().toISOString(),
      uptime: Math.round(process.uptime()),
    });
  });
}
