/**
 * Execution Report — 30-minute floor execution monitoring
 *
 * Tracks per-person:
 *  - Leads added (total + last 30 min)
 *  - Stage distribution of all their active leads
 *  - Quotations generated (total + last 30 min)
 *  - Activity count (calls, notes, stage changes)
 *  - Last seen / last action timestamp
 *  - Inactivity flag (no actions for > 30 min)
 *  - Stuck-at-stage flag (lead in same stage > 30 min)
 *  - Follow-up actions required
 *
 * GET /api/admin/execution-report
 *   roles: super_admin, manager, admin
 *   query: window_minutes (default 30)
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { UserDoc } from "../../auth/auth.js";
import type { Lead, Tour } from "../../../../src/contracts/entities.js";

const ALLOWED_ROLES = ["super_admin", "manager", "admin"] as const;

// ─── types ────────────────────────────────────────────────────────────────────

interface ActivityDoc {
  _id: string;
  tenantId: string;
  entityType: string;
  entityId: string;
  kind: string;
  subject?: string;
  occurredAt: string;
  actor: string;
  meta?: Record<string, unknown>;
}

interface EventDoc {
  _id: string;
  type: string;
  occurredAt: string;
  actor: string;
  tenantId: string;
  payload?: Record<string, unknown>;
}

interface UserAction {
  userId: string;
  action: string;
  entityId?: string;
  entityType?: string;
  detail?: string;
  occurredAt: string;
}

interface LeadStageEntry {
  leadId: string;
  leadName: string;
  stage: string;
  stageEnteredAt: string;
  minutesInStage: number;
  isStuck: boolean;
  assignedTcmId?: string | null;
}

interface MemberReport {
  userId: string;
  name: string;
  role: string;
  zones: string[];

  // Leads
  totalLeadsAdded: number;
  leadsAddedLast30: number;

  // Stage distribution (active leads)
  stageDistribution: Record<string, number>;
  totalActiveLeads: number;

  // Leads stuck at a stage > window
  stuckLeads: LeadStageEntry[];

  // Quotations
  totalQuotations: number;
  quotationsLast30: number;

  // Activity
  totalActions: number;
  actionsLast30: number;
  mostUsedActions: { action: string; count: number }[];
  recentActions: UserAction[];

  // Inactivity
  lastActionAt: string | null;
  minutesSinceLastAction: number | null;
  isInactive: boolean;

  // Pipeline
  leadsByStage: { stage: string; count: number }[];

  // Follow-ups required
  followUpsRequired: string[];

  // Success criteria progress
  scheduledStageCount: number;
  quotationsMet: boolean;
  allCriteriaMet: boolean;

  // ─── NEW FIELDS FOR COMMAND CENTER ─────────────────────────────────────────
  leadsUpdatedLast30: number;
  propertiesSharedLast30: number;
  followUpsLast30: number;
  scheduledLast30: number;
  visitsLast30: number;
  bookingsLast30: number;

  bookingsToday: number;
  visitsToday: number;
  crmCompletionPct: number;
  missingOwners: number;
  missingNextActions: number;
}

interface ExecutionReport {
  generatedAt: string;
  windowMinutes: number;
  windowStart: string;
  members: MemberReport[];
  summary: {
    totalMembers: number;
    inactiveMembers: number;
    stuckMembers: number;
    behindOnTargets: number;
    criticalAlerts: string[];
  };
  successCriteria: {
    scheduledTarget: number;
    quotationTarget: number;
  };
  rawActivityLog: any[];
  featureUsage: any[];
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const STAGE_ORDER: Record<string, number> = {
  new: 0,
  contacted: 1,
  "tour-scheduled": 2,
  "on-tour": 3,
  "tour-done": 4,
  negotiation: 5,
  "quote-sent": 6,
  "not-responding-3d": 7,
  "not-responding-7d": 8,
  booked: 9,
  dropped: 10,
};

const SCHEDULED_OR_BEYOND = new Set([
  "tour-scheduled",
  "on-tour",
  "tour-done",
  "negotiation",
  "quote-sent",
  "booked",
]);

const ACTIVE_STAGES = new Set(
  Object.keys(STAGE_ORDER).filter((s) => s !== "booked" && s !== "dropped")
);

// ─── route registration ────────────────────────────────────────────────────────

export function registerExecutionReportRoutes(app: FastifyInstance) {
  // ── Main execution report ──────────────────────────────────────────────────
  app.get(
    "/api/admin/execution-report",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!ALLOWED_ROLES.includes(req.user!.role as any)) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
      }

      const q = z
        .object({ window_minutes: z.coerce.number().min(5).max(1440).default(30) })
        .parse(req.query);

      const windowMs = q.window_minutes * 60 * 1000;
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);
      const tenantId = req.user!.tenantId;

      // ── Fetch all active members ──────────────────────────────────────────
      const members = (await col<UserDoc>("users")
        .find({
          tenantId,
          role: { $in: ["member", "tcm"] },
          status: { $in: ["active", "inactive"] },
        })
        .project({ _id: 1, fullName: 1, zones: 1, role: 1 })
        .toArray()) as Pick<UserDoc, "_id" | "fullName" | "zones" | "role">[];

      if (!members.length) {
        return reply.send({
          generatedAt: now.toISOString(),
          windowMinutes: q.window_minutes,
          windowStart: windowStart.toISOString(),
          members: [],
          summary: {
            totalMembers: 0,
            inactiveMembers: 0,
            stuckMembers: 0,
            behindOnTargets: 0,
            criticalAlerts: [],
          },
          successCriteria: { scheduledTarget: 20, quotationTarget: 3 },
          rawActivityLog: [], 
          featureUsage: []
        } as ExecutionReport);
      }

      const memberIds = members.map((m) => m._id);

      // ── Parallel data fetch ───────────────────────────────────────────────
      const dayStart = new Date(now);
      dayStart.setHours(0, 0, 0, 0);

      const [
        allLeads,
        quotationsToday,
        activitiesToday,
        eventsWindow,
        toursToday,
      ] = await Promise.all([
        // All leads assigned to or created by team members
        col<Lead>("leads")
          .find({
            tenantId,
            $or: [
              { assignedTcmId: { $in: memberIds } },
              { createdBy: { $in: memberIds } },
            ],
          })
          .project({
            _id: 1,
            name: 1,
            stage: 1,
            assignedTcmId: 1,
            createdBy: 1,
            createdAt: 1,
            updatedAt: 1,
            nextFollowUpAt: 1,
          })
          .toArray(),

        // Quotations created today
        col("quotations")
          .find({
            tenantId,
            $or: [
              { tcmId: { $in: memberIds } },
              { createdBy: { $in: memberIds } },
            ],
            createdAt: { $gte: dayStart.toISOString() },
          })
          .toArray(),

        // Activities logged today (calls, notes, stage changes)
        col<ActivityDoc>("activities")
          .find({
            tenantId,
            actor: { $in: memberIds },
            occurredAt: { $gte: dayStart.toISOString() },
          })
          .sort({ occurredAt: -1 })
          .limit(2000)
          .toArray(),

        // Events in the window (for last-seen tracking)
        col<EventDoc>("entity_event")
          .find({
            tenantId,
            actor: { $in: memberIds },
            occurredAt: { $gte: windowStart.toISOString() },
          })
          .sort({ occurredAt: -1 })
          .limit(5000)
          .toArray(),

        // Tours scheduled today
        col<Tour>("tours")
          .find({
            tenantId,
            $or: [
              { scheduledBy: { $in: memberIds } },
              { assignedTo: { $in: memberIds } },
            ],
            createdAt: { $gte: dayStart.toISOString() },
          })
          .toArray(),
      ]);

      // ── Index data by member ──────────────────────────────────────────────

      // Leads added today by createdBy
      const leadsAddedToday = new Map<string, number>();
      const leadsAddedWindow = new Map<string, number>();
      for (const l of allLeads) {
        const cid = l.createdBy;
        if (!cid) continue;
        if (l.createdAt >= dayStart.toISOString()) {
          leadsAddedToday.set(cid, (leadsAddedToday.get(cid) ?? 0) + 1);
        }
        if (l.createdAt >= windowStart.toISOString()) {
          leadsAddedWindow.set(cid, (leadsAddedWindow.get(cid) ?? 0) + 1);
        }
      }

      // Quotations by member
      const quotesToday = new Map<string, number>();
      const quotesWindow = new Map<string, number>();
      for (const q of quotationsToday) {
        const uid = q.tcmId || q.createdBy;
        if (!uid) continue;
        quotesToday.set(uid, (quotesToday.get(uid) ?? 0) + 1);
        if (q.createdAt >= windowStart.toISOString()) {
          quotesWindow.set(uid, (quotesWindow.get(uid) ?? 0) + 1);
        }
      }

      // Activities by member
      const actionsToday = new Map<string, ActivityDoc[]>();
      const actionsWindow = new Map<string, ActivityDoc[]>();
      for (const a of activitiesToday) {
        const uid = a.actor;
        if (!actionsToday.has(uid)) actionsToday.set(uid, []);
        actionsToday.get(uid)!.push(a);
        if (a.occurredAt >= windowStart.toISOString()) {
          if (!actionsWindow.has(uid)) actionsWindow.set(uid, []);
          actionsWindow.get(uid)!.push(a);
        }
      }

      // Events in window by member (for last-seen)
      const eventsPerMember = new Map<string, EventDoc[]>();
      for (const e of eventsWindow) {
        if (!e.actor) continue;
        if (!eventsPerMember.has(e.actor)) eventsPerMember.set(e.actor, []);
        eventsPerMember.get(e.actor)!.push(e);
      }

      // Leads by member (grouped by owner, falling back to creator if unowned)
      const leadsByMember = new Map<string, (typeof allLeads)[0][]>();
      for (const l of allLeads) {
        const uid = l.assignedTcmId || l.createdBy;
        if (!uid) continue;
        if (!leadsByMember.has(uid)) leadsByMember.set(uid, []);
        leadsByMember.get(uid)!.push(l);
      }

      // Tours by member
      const toursByMember = new Map<string, Tour[]>();
      for (const t of toursToday) {
        const uid = t.scheduledBy || t.assignedTo;
        if (!uid) continue;
        if (!toursByMember.has(uid)) toursByMember.set(uid, []);
        toursByMember.get(uid)!.push(t);
      }

      // ── Build per-member report ───────────────────────────────────────────
      const memberReports: MemberReport[] = members.map((member) => {
        const uid = member._id;
        const memberLeads = leadsByMember.get(uid) ?? [];
        const memberActivities = actionsToday.get(uid) ?? [];
        const memberActionsWindow = actionsWindow.get(uid) ?? [];
        const memberEvents = eventsPerMember.get(uid) ?? [];

        // Stage distribution
        const stageDist: Record<string, number> = {};
        const stuckLeads: LeadStageEntry[] = [];
        let scheduledCount = 0;

        for (const lead of memberLeads) {
          const stage = lead.stage || "new";
          stageDist[stage] = (stageDist[stage] ?? 0) + 1;

          if (SCHEDULED_OR_BEYOND.has(stage)) scheduledCount++;

          // Compute stuck-at-stage
          if (lead.updatedAt && ACTIVE_STAGES.has(stage)) {
            const minsInStage = Math.floor(
              (now.getTime() - new Date(lead.updatedAt).getTime()) / 60000
            );
            if (minsInStage >= q.window_minutes) {
              stuckLeads.push({
                leadId: lead._id,
                leadName: lead.name,
                stage,
                stageEnteredAt: lead.updatedAt,
                minutesInStage: minsInStage,
                isStuck: true,
                assignedTcmId: lead.assignedTcmId,
              });
            }
          }
        }

        // Sort stuck leads by longest time first
        stuckLeads.sort((a, b) => b.minutesInStage - a.minutesInStage);

        // Most-used actions
        const actionCountMap: Record<string, number> = {};
        for (const a of memberActivities) {
          const k = a.kind || "unknown";
          actionCountMap[k] = (actionCountMap[k] ?? 0) + 1;
        }
        const mostUsedActions = Object.entries(actionCountMap)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([action, count]) => ({ action, count }));

        // Recent actions from window
        const recentActions: UserAction[] = memberActionsWindow
          .slice(0, 10)
          .map((a) => ({
            userId: uid,
            action: a.kind,
            entityId: a.entityId,
            entityType: a.entityType,
            detail: a.subject,
            occurredAt: a.occurredAt,
          }));

        // Last action timestamp — check activities + entity_events
        const allTimestamps = [
          ...memberActivities.map((a) => a.occurredAt),
          ...memberEvents.map((e) => e.occurredAt),
        ].sort().reverse();
        const lastActionAt = allTimestamps[0] ?? null;
        const minutesSinceLastAction = lastActionAt
          ? Math.floor((now.getTime() - new Date(lastActionAt).getTime()) / 60000)
          : null;
        const isInactive =
          minutesSinceLastAction === null || minutesSinceLastAction >= q.window_minutes;

        // Follow-ups required
        const followUpsRequired: string[] = [];
        const staleFollowUps = memberLeads.filter(
          (l) =>
            l.nextFollowUpAt &&
            new Date(l.nextFollowUpAt) <= now &&
            ACTIVE_STAGES.has(l.stage || "new")
        );
        if (staleFollowUps.length > 0) {
          followUpsRequired.push(
            `${staleFollowUps.length} lead(s) with overdue follow-up: ${staleFollowUps
              .slice(0, 3)
              .map((l) => l.name)
              .join(", ")}${staleFollowUps.length > 3 ? "..." : ""}`
          );
        }

        const unownedLeads = memberLeads.filter((l) => !l.assignedTcmId && ACTIVE_STAGES.has(l.stage || "new"));
        if (unownedLeads.length > 0) {
          followUpsRequired.push(`${unownedLeads.length} lead(s) without an owner assigned`);
        }

        if (memberLeads.filter((l) => l.stage === "new").length > 5) {
          followUpsRequired.push(
            `${memberLeads.filter((l) => l.stage === "new").length} leads still in "new" stage — need contact`
          );
        }

        const quotationCount = quotesToday.get(uid) ?? 0;
        const quotationsTarget = 3;
        const scheduledTarget = 20;

        const leadsUpdatedLast30 = memberActionsWindow.filter(a => a.kind === "stage-change" || a.kind === "note").length;
        const propertiesSharedLast30 = memberActionsWindow.filter(a => a.kind === "property-share").length;
        const followUpsLast30 = memberActionsWindow.filter(a => a.kind === "follow-up-logged" || a.kind === "call").length;
        
        let scheduledLast30 = 0;
        let visitsLast30 = 0;
        let bookingsLast30 = 0;
        let bookingsToday = 0;
        let visitsToday = 0;
        
        for (const t of (toursByMember.get(uid) ?? [])) {
          if (t.createdAt >= dayStart.toISOString()) visitsToday++;
          if (t.createdAt >= windowStart.toISOString()) visitsLast30++;
        }
        
        // Count bookings from stage distribution
        bookingsToday = stageDist["booked"] || 0;
        
        const activeLeads = memberLeads.filter(l => ACTIVE_STAGES.has(l.stage || "new"));
        const activeLeadsCount = activeLeads.length;
        const missingOwners = unownedLeads.length;
        const missingNextActions = activeLeads.filter(l => !l.nextFollowUpAt).length;
        
        // Lead is fully compliant if it has an owner AND a next follow-up action
        const compliantLeads = activeLeads.filter(l => l.assignedTcmId && l.nextFollowUpAt).length;
        const crmCompletionPct = activeLeadsCount === 0 ? 100 : Math.round((compliantLeads / activeLeadsCount) * 100);

        return {
          userId: uid,
          name: member.fullName || uid,
          role: member.role === "tcm" ? "tcm" : "member",
          zones: (member.zones ?? []) as string[],

          totalLeadsAdded: leadsAddedToday.get(uid) ?? 0,
          leadsAddedLast30: leadsAddedWindow.get(uid) ?? 0,

          stageDistribution: stageDist,
          totalActiveLeads: memberLeads.filter((l) => ACTIVE_STAGES.has(l.stage || "new")).length,

          stuckLeads: stuckLeads.slice(0, 15),

          totalQuotations: quotationCount,
          quotationsLast30: quotesWindow.get(uid) ?? 0,

          totalActions: memberActivities.length,
          actionsLast30: memberActionsWindow.length,
          mostUsedActions,
          recentActions,

          lastActionAt,
          minutesSinceLastAction,
          isInactive,

          leadsByStage: Object.entries(stageDist)
            .sort((a, b) => (STAGE_ORDER[a[0]] ?? 99) - (STAGE_ORDER[b[0]] ?? 99))
            .map(([stage, count]) => ({ stage, count })),

          followUpsRequired,

          scheduledStageCount: scheduledCount,
          quotationsMet: quotationCount >= quotationsTarget,
          allCriteriaMet: scheduledCount >= scheduledTarget && quotationCount >= quotationsTarget,

          leadsUpdatedLast30,
          propertiesSharedLast30,
          followUpsLast30,
          scheduledLast30,
          visitsLast30,
          bookingsLast30,
          bookingsToday,
          visitsToday,
          crmCompletionPct,
          missingOwners,
          missingNextActions,
        };
      });

      // Sort: active (working) first, then by totalActions desc (most contributed)
      memberReports.sort((a, b) => {
        if (a.isInactive !== b.isInactive) return a.isInactive ? 1 : -1;
        if (b.totalActions !== a.totalActions) return b.totalActions - a.totalActions;
        return b.totalLeadsAdded - a.totalLeadsAdded;
      });

      // ── Summary & critical alerts ─────────────────────────────────────────
      const criticalAlerts: string[] = [];

      const inactiveMembers = memberReports.filter((m) => m.isInactive);
      const stuckMembers = memberReports.filter((m) => m.stuckLeads.length > 0);
      const behindOnTargets = memberReports.filter((m) => !m.allCriteriaMet);

      if (inactiveMembers.length > 0) {
        criticalAlerts.push(
          `🔴 ${inactiveMembers.length} team member(s) inactive for >${q.window_minutes} min: ${inactiveMembers
            .slice(0, 3)
            .map((m) => m.name)
            .join(", ")}`
        );
      }

      const highStuckCount = memberReports.filter((m) => m.stuckLeads.length >= 3);
      if (highStuckCount.length > 0) {
        criticalAlerts.push(
          `⚠️ ${highStuckCount.length} member(s) have 3+ leads stuck in the same stage`
        );
      }

      const zeroLeads = memberReports.filter((m) => m.totalLeadsAdded === 0);
      if (zeroLeads.length > 0) {
        criticalAlerts.push(
          `📭 ${zeroLeads.length} member(s) have added 0 leads today: ${zeroLeads
            .slice(0, 3)
            .map((m) => m.name)
            .join(", ")}`
        );
      }

      return reply.send({
        generatedAt: now.toISOString(),
        windowMinutes: q.window_minutes,
        windowStart: windowStart.toISOString(),
        members: memberReports,
        summary: {
          totalMembers: memberReports.length,
          inactiveMembers: inactiveMembers.length,
          stuckMembers: stuckMembers.length,
          behindOnTargets: behindOnTargets.length,
          criticalAlerts,
        },
        successCriteria: {
          scheduledTarget: 20,
          quotationTarget: 3,
        },
        rawActivityLog: activitiesToday.slice(0, 500).map(a => ({
          time: a.occurredAt,
          employee: members.find(m => m._id === a.actor)?.fullName || a.actor,
          action: a.kind,
          detail: a.subject,
        })),
        featureUsage: Object.entries(
          activitiesToday.reduce((acc, act) => {
            const kind = act.kind || "unknown";
            if (!acc[kind]) acc[kind] = { count: 0, users: new Set() };
            acc[kind].count++;
            acc[kind].users.add(act.actor);
            return acc;
          }, {} as Record<string, { count: number, users: Set<string> }>)
        ).map(([feature, data]) => ({
          feature,
          totalClicks: data.count,
          uniqueUsers: data.users.size,
          avgPerUser: (data.count / data.users.size).toFixed(1)
        })).sort((a, b) => b.totalClicks - a.totalClicks)
      } as ExecutionReport);
    }
  );

  // ── Track user click/action events ────────────────────────────────────────
  app.post(
    "/api/admin/track-action",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      const body = z
        .object({
          action: z.string().max(120),
          entityType: z.string().max(60).optional(),
          entityId: z.string().max(60).optional(),
          detail: z.string().max(500).optional(),
        })
        .parse(req.body);

      await col("entity_event").insertOne({
        _id: `ua_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        type: `evt.user.action`,
        occurredAt: new Date().toISOString(),
        actor: req.user!.sub,
        tenantId: req.user!.tenantId,
        payload: {
          action: body.action,
          entityType: body.entityType ?? null,
          entityId: body.entityId ?? null,
          detail: body.detail ?? null,
          userId: req.user!.sub,
          userName: req.user!.fullName,
          userRole: req.user!.role,
        },
      } as any);

      return reply.send({ ok: true });
    }
  );

  // ── Click/action summary for a specific user ──────────────────────────────
  app.get(
    "/api/admin/user-actions",
    { preHandler: [requireAuth] },
    async (req, reply) => {
      if (!ALLOWED_ROLES.includes(req.user!.role as any)) {
        return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
      }

      const q = z
        .object({
          userId: z.string().optional(),
          limit: z.coerce.number().min(1).max(10000).default(1000),
          since: z.string().optional(),
        })
        .parse(req.query);

      const tenantId = req.user!.tenantId;
      const since = q.since ?? new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const filter: Record<string, unknown> = {
        tenantId,
        type: "evt.user.action",
        occurredAt: { $gte: since },
      };
      if (q.userId) filter.actor = q.userId;

      const items = await col("entity_event")
        .find(filter)
        .sort({ occurredAt: -1 })
        .limit(q.limit)
        .toArray();

      return reply.send({ items });
    }
  );
}
