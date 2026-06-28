import type { FastifyInstance } from "fastify";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { UserDoc } from "../../auth/auth.js";
import type { Lead, Tour, BookingEntity, Activity } from "../../../../src/contracts/entities.js";

const STAFF_ROLES = ["super_admin", "manager", "admin"] as const;

// ── Helpers ──────────────────────────────────────────────────────────────────

function avatar(name: string) {
  return `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(name)}`;
}

function daysAgo(iso: string | undefined | null): number {
  if (!iso) return 999;
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function clamp(v: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

// ── Route Registration ───────────────────────────────────────────────────────

export function registerPeople360Routes(app: FastifyInstance) {

  // ── 1. Workload Heatmap ──────────────────────────────────────────────────
  app.get("/api/v1/admin/people360/workload", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [tcms, leads, tours, followUps, todos, bookings] = await Promise.all([
      col<UserDoc>("users").find({
        tenantId,
        status: "active",
        $or: [{ role: "tcm" }, { role: "member", isTcm: true }],
      }).toArray(),
      col<Lead>("leads").find({
        tenantId,
        stage: { $nin: ["booked", "dropped"] },
      }).toArray(),
      col<Tour>("tours").find({
        tenantId,
        status: { $in: ["scheduled", "confirmed"] },
      }).toArray(),
      col("follow_ups").find({ tenantId, done: { $ne: true } }).toArray(),
      col("todos").find({
        tenantId,
        status: { $in: ["open", "pending-accept", "accepted", "in-progress"] },
      }).toArray(),
      col<BookingEntity>("bookings").find({
        tenantId,
        createdAt: { $gte: monthStart },
      }).toArray(),
    ]);

    const nowMs = Date.now();

    const items = tcms.map(tcm => {
      const id = tcm._id;
      const name = tcm.fullName || tcm.username || "Unknown";

      const openLeads = leads.filter(l => l.assignedTcmId === id).length;
      const scheduledTours = tours.filter(t => t.assignedTo === id).length;

      const myFollowUps = followUps.filter((f: any) => f.tcmId === id);
      const pendingFollowUps = myFollowUps.length;
      const overdueFollowUps = myFollowUps.filter((f: any) =>
        f.dueAt && new Date(f.dueAt).getTime() < nowMs
      ).length;

      const openTodos = todos.filter((t: any) => t.assignedTo === id).length;
      const monthlyBookings = bookings.filter(b => b.tcmId === id).length;

      // Workload score: weighted composite (higher = more loaded)
      const workloadScore = clamp(
        (openLeads * 2) +
        (scheduledTours * 5) +
        (pendingFollowUps * 3) +
        (overdueFollowUps * 8) +
        (openTodos * 2) -
        (monthlyBookings * 4) // bookings are a positive output, reduce load perception
      );

      return {
        userId: id,
        name,
        avatar: avatar(name),
        openLeads,
        scheduledTours,
        pendingFollowUps,
        overdueFollowUps,
        openTodos,
        monthlyBookings,
        workloadScore,
      };
    });

    return reply.send({ items });
  });

  // ── 2. Activity Pulse Timeline ───────────────────────────────────────────
  app.get("/api/v1/admin/people360/pulse", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;
    const { limit = "100", kind } = req.query as { limit?: string; kind?: string };
    const parsedLimit = Math.min(Number(limit) || 100, 500);

    const filter: Record<string, unknown> = { tenantId };
    if (kind && kind !== "all") {
      filter.kind = kind;
    }

    const activities = await col<Activity>("activities")
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(parsedLimit)
      .toArray();

    // Batch-fetch actor names
    const actorIds = [...new Set(activities.map(a => a.actor).filter(Boolean))];
    const actors = actorIds.length > 0
      ? await col<UserDoc>("users").find({ _id: { $in: actorIds } }).project({ _id: 1, fullName: 1, username: 1 }).toArray()
      : [];
    const actorMap = new Map(actors.map(a => [a._id, a.fullName || a.username || "Unknown"]));

    // Batch-fetch lead names for lead-type activities
    const leadIds = [...new Set(
      activities.filter(a => a.entityType === "lead").map(a => a.entityId).filter(Boolean)
    )];
    const leadDocs = leadIds.length > 0
      ? await col<Lead>("leads").find({ _id: { $in: leadIds } }).project({ _id: 1, name: 1 }).toArray()
      : [];
    const leadMap = new Map(leadDocs.map(l => [l._id, l.name]));

    const items = activities.map(a => {
      const actorName = actorMap.get(a.actor) || "System";
      let entityName = "";
      if (a.entityType === "lead") {
        entityName = leadMap.get(a.entityId) || a.entityId;
      } else {
        entityName = a.entityId;
      }

      return {
        activityId: a._id,
        kind: a.kind,
        subject: a.subject,
        body: a.body || "",
        actorName,
        actorAvatar: avatar(actorName),
        entityType: a.entityType,
        entityName,
        occurredAt: a.occurredAt || a.createdAt,
        direction: a.direction || "internal",
        outcome: a.outcome || null,
      };
    });

    return reply.send({ items });
  });

  // ── 3. Attrition Risk Radar ──────────────────────────────────────────────
  app.get("/api/v1/admin/people360/risk", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;
    const now = Date.now();
    const DAY = 86_400_000;
    const d7 = new Date(now - 7 * DAY).toISOString();
    const d14 = new Date(now - 14 * DAY).toISOString();
    const d30 = new Date(now - 30 * DAY).toISOString();
    const d60 = new Date(now - 60 * DAY).toISOString();

    const [tcms, recentActivities, olderActivities, recentBookings, olderBookings, followUps, todos, loginActivity] = await Promise.all([
      col<UserDoc>("users").find({
        tenantId,
        status: "active",
        $or: [{ role: "tcm" }, { role: "member", isTcm: true }],
      }).toArray(),

      // Activities in last 7 days
      col<Activity>("activities").find({
        tenantId,
        createdAt: { $gte: d7 },
      }).toArray(),

      // Activities in 7-14 days ago (for trend comparison)
      col<Activity>("activities").find({
        tenantId,
        createdAt: { $gte: d14, $lt: d7 },
      }).toArray(),

      // Bookings in last 30 days
      col<BookingEntity>("bookings").find({
        tenantId,
        createdAt: { $gte: d30 },
      }).toArray(),

      // Bookings in 30-60 days ago
      col<BookingEntity>("bookings").find({
        tenantId,
        createdAt: { $gte: d60, $lt: d30 },
      }).toArray(),

      // Pending follow-ups
      col("follow_ups").find({ tenantId, done: { $ne: true } }).toArray(),

      // Open todos
      col("todos").find({
        tenantId,
        status: { $in: ["open", "pending-accept", "accepted", "in-progress"] },
      }).toArray(),

      // Last login per user
      col("user_activity").find({
        tenantId,
        action: "login",
      }).sort({ ts: -1 }).toArray(),
    ]);

    // Build last-login lookup (pick most recent per user)
    const lastLoginMap = new Map<string, number>();
    for (const entry of loginActivity as any[]) {
      if (!lastLoginMap.has(entry.userId)) {
        lastLoginMap.set(entry.userId, entry.ts);
      }
    }

    const items = tcms.map(tcm => {
      const id = tcm._id;
      const name = tcm.fullName || tcm.username || "Unknown";

      // 1. Activity trend (last 7d vs prev 7d)
      const recentCount = recentActivities.filter(a => a.actor === id).length;
      const olderCount = olderActivities.filter(a => a.actor === id).length;
      // Percentage decline: if older was 10 and recent is 3, decline = 70%
      const activityTrend = olderCount > 0
        ? clamp(((olderCount - recentCount) / olderCount) * 100)
        : (recentCount === 0 ? 80 : 0); // No baseline → high risk if also no recent

      // 2. Conversion trend (last 30d bookings vs prev 30d)
      const recentBk = recentBookings.filter(b => b.tcmId === id).length;
      const olderBk = olderBookings.filter(b => b.tcmId === id).length;
      const conversionTrend = olderBk > 0
        ? clamp(((olderBk - recentBk) / olderBk) * 100)
        : (recentBk === 0 ? 50 : 0);

      // 3. Overdue ratio
      const myFollowUps = followUps.filter((f: any) => f.tcmId === id);
      const myTodos = todos.filter((t: any) => t.assignedTo === id);
      const totalOpen = myFollowUps.length + myTodos.length;
      const overdueCount = myFollowUps.filter((f: any) =>
        f.dueAt && new Date(f.dueAt).getTime() < now
      ).length + myTodos.filter((t: any) =>
        t.dueAt && new Date(t.dueAt).getTime() < now
      ).length;
      const overdueRatio = totalOpen > 0
        ? clamp((overdueCount / totalOpen) * 100)
        : 0;

      // 4. Login recency
      const lastLoginTs = lastLoginMap.get(id);
      const lastLoginDaysAgo = lastLoginTs
        ? Math.floor((now - lastLoginTs) / DAY)
        : daysAgo(tcm.updatedAt || tcm.createdAt);
      // Score: 0 days → 0 risk, 7+ days → 100 risk
      const loginRecency = clamp((lastLoginDaysAgo / 7) * 100);

      // Composite risk score (weighted)
      const riskScore = clamp(
        activityTrend * 0.30 +
        conversionTrend * 0.30 +
        overdueRatio * 0.20 +
        loginRecency * 0.20
      );

      const riskLevel: "low" | "medium" | "high" | "critical" =
        riskScore >= 75 ? "critical" :
        riskScore >= 50 ? "high" :
        riskScore >= 25 ? "medium" :
        "low";

      return {
        userId: id,
        name,
        avatar: avatar(name),
        riskScore,
        riskLevel,
        signals: {
          activityTrend,
          conversionTrend,
          overdueRatio,
          lastLoginDaysAgo,
          loginRecency,
        },
      };
    });

    // Sort by risk score descending
    items.sort((a, b) => b.riskScore - a.riskScore);

    return reply.send({ items });
  });
}
