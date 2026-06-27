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
    const memberMap: Record<string, { id: string, name: string, zone: string, open: number, stuck: number, bookings: number }> = {};
    const trendMap: Record<string, { month: string, leads: number, bookings: number, revenue: number }> = {};
    let vaultBookedValue = 0;
    let vaultLostValue = 0;

    leads.forEach(l => {
      const assigned = l.assignedTcmId || l.assigneeId;
      const tcm = tcms.find(t => t._id === assigned);
      const zone = tcm?.zones?.[0] || "Unknown";
      const memberName = tcm?.fullName || "Unassigned";
      
      // Zone map init
      if (!zoneMap[zone]) zoneMap[zone] = { pods: 1, open: 0, stuck: 0, bookings: 0 };
      // Member map init
      if (assigned && !memberMap[assigned]) {
        memberMap[assigned] = { id: assigned, name: memberName, zone, open: 0, stuck: 0, bookings: 0 };
      }

      const isStuck = l.stage !== "booked" && l.stage !== "dropped" && (now - new Date(l.updatedAt).getTime()) / 86400000 > 3;

      if (l.stage === "booked") {
        zoneMap[zone].bookings++;
        if (assigned) memberMap[assigned].bookings++;
        vaultBookedValue += l.budget || 0;
      } else if (l.stage === "dropped") {
        vaultLostValue += l.budget || 0;
      } else {
        zoneMap[zone].open++;
        if (assigned) memberMap[assigned].open++;
        if (isStuck) {
          zoneMap[zone].stuck++;
          if (assigned) memberMap[assigned].stuck++;
        }
      }

      // Trend map
      const leadMonth = new Date(l.createdAt).toISOString().slice(0, 7); // YYYY-MM
      if (!trendMap[leadMonth]) trendMap[leadMonth] = { month: leadMonth, leads: 0, bookings: 0, revenue: 0 };
      trendMap[leadMonth].leads++;
      if (l.stage === "booked") {
        trendMap[leadMonth].bookings++;
        trendMap[leadMonth].revenue += l.budget || 0;
      }
    });

    const scoreboard = Object.entries(zoneMap).map(([zone, data]) => ({
      zone,
      ...data,
      stuckPct: data.open > 0 ? Math.round((data.stuck / data.open) * 100) : 0
    }));

    const members = Object.values(memberMap).map(m => ({
      ...m,
      totalLeads: m.open + m.bookings,
      conversion: (m.open + m.bookings) > 0 ? Math.round((m.bookings / (m.open + m.bookings)) * 100) : 0,
      stuckPct: m.open > 0 ? Math.round((m.stuck / m.open) * 100) : 0
    })).sort((a, b) => b.bookings - a.bookings);

    const trend = Object.values(trendMap)
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-3);

    return reply.send({
      stats: {
        totalLeads,
        toursScheduled,
        toursDone,
        bookings,
        conversion,
        stuck,
        cohorts,
        scoreboard,
        members,
        trend,
        vault: {
          bookedValue: vaultBookedValue,
          lostValue: vaultLostValue
        }
      }
    });
  });
}
