import type { FastifyInstance } from "fastify";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { Lead } from "../../../../src/contracts/entities.js";
import type { UserDoc } from "../../auth/auth.js";

const STAFF_ROLES = ["super_admin", "manager", "admin"] as const;

export function registerAdminImpactCommandRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/impact-command", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;

    const [leads, tcms] = await Promise.all([
      col<Lead>("leads").find({ tenantId }).toArray(),
      col<UserDoc>("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
    ]);

    const totalLeads = leads.length;
    const toursScheduled = leads.filter(l => l.stage === "tour-scheduled" || l.stage === "on-tour" || l.stage === "tour-done").length;
    const toursDone = leads.filter(l => l.stage === "tour-done" || l.stage === "negotiation" || l.stage === "quote-sent" || l.stage === "booked").length;
    const bookings = leads.filter(l => l.stage === "booked").length;
    const conversion = totalLeads > 0 ? Math.round((bookings / totalLeads) * 100) : 0;
    
    const now = Date.now();
    const stuck = leads.filter(l => {
      if (l.stage === "booked" || l.stage === "dropped") return false;
      const daysSinceUpdate = (now - new Date(l.updatedAt).getTime()) / 86400000;
      return daysSinceUpdate > 3;
    }).length;

    const cohorts = {
      active: leads.filter(l => ["new", "contacted", "tour-scheduled", "on-tour", "tour-done", "negotiation", "quote-sent"].includes(l.stage)).length,
      awaiting: leads.filter(l => l.stage === "not-responding-3d").length,
      noResponse: leads.filter(l => l.stage === "not-responding-7d").length,
      future: leads.filter(l => l.intent === "cold" && l.stage !== "dropped").length,
      cold: leads.filter(l => l.stage === "dropped").length,
      closed: bookings
    };

    const zoneMap: Record<string, { pods: number, open: number, stuck: number, bookings: number }> = {};
    leads.forEach(l => {
      const assigned = l.assignedTcmId || l.assigneeId;
      const tcm = tcms.find(t => t._id === assigned);
      const zone = tcm?.zones?.[0] || "Unknown";
      if (!zoneMap[zone]) {
        zoneMap[zone] = { pods: 1, open: 0, stuck: 0, bookings: 0 };
      }
      if (l.stage === "booked") {
        zoneMap[zone].bookings++;
      } else if (l.stage !== "dropped") {
        zoneMap[zone].open++;
        const daysSinceUpdate = (now - new Date(l.updatedAt).getTime()) / 86400000;
        if (daysSinceUpdate > 3) zoneMap[zone].stuck++;
      }
    });

    const scoreboard = Object.entries(zoneMap).map(([zone, data]) => ({
      zone,
      ...data,
      stuckPct: data.open > 0 ? Math.round((data.stuck / data.open) * 100) : 0
    }));

    return reply.send({
      stats: {
        totalLeads,
        toursScheduled,
        toursDone,
        bookings,
        conversion,
        stuck,
        cohorts,
        scoreboard
      }
    });
  });
}
