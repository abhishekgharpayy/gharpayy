import type { FastifyInstance } from "fastify";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { Lead, Tour } from "../../../../src/contracts/entities.js";
import type { PropertyDoc } from "../properties/routes.js";
import type { UserDoc } from "../../auth/auth.js";

const STAFF_ROLES = ["super_admin", "manager", "admin"] as const;

export function registerAdminWatchdogRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/watchdog", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;

    const [leads, tours, properties, tcms] = await Promise.all([
      col<Lead>("leads").find({ tenantId, stage: { $nin: ["booked", "dropped"] } }).toArray(),
      col<Tour>("tours").find({ tenantId, status: "scheduled" }).toArray(),
      col<PropertyDoc>("properties").find({ tenantId, vacancy: { $gt: 0 } }).toArray(),
      col<UserDoc>("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
    ]);

    const anomalies: { type: string; severity: "high" | "medium" | "low"; message: string; timestamp: string }[] = [];
    const now = Date.now();

    // 1. Scheduling Conflicts (Multiple tours at same time for same TCM)
    const tcmTourMap: Record<string, string[]> = {};
    for (const t of tours) {
      if (!t.assignedTo) continue;
      if (!tcmTourMap[t.assignedTo]) tcmTourMap[t.assignedTo] = [];
      const timeStr = new Date(t.scheduledAt).toISOString(); // simplified time bucketing
      tcmTourMap[t.assignedTo].push(timeStr);
    }

    for (const [tcmId, times] of Object.entries(tcmTourMap)) {
      const counts = times.reduce((acc, time) => { acc[time] = (acc[time] || 0) + 1; return acc; }, {} as Record<string, number>);
      for (const [time, count] of Object.entries(counts)) {
        if (count > 1) {
          const tcmName = tcms.find(t => t._id === tcmId)?.fullName || "Unknown TCM";
          anomalies.push({
            type: "scheduling_conflict",
            severity: "high",
            message: `Scheduling Conflict: ${tcmName} has ${count} tours scheduled exactly at ${new Date(time).toLocaleString()}`,
            timestamp: new Date().toISOString()
          });
        }
      }
    }

    // 2. Stale On-Tour Leads (> 4 hours)
    for (const l of leads) {
      if (l.stage === "on-tour") {
        const hoursSinceUpdate = (now - new Date(l.updatedAt).getTime()) / 3600000;
        if (hoursSinceUpdate > 4) {
          const tcmName = tcms.find(t => t._id === l.assignedTcmId)?.fullName || "Unknown";
          anomalies.push({
            type: "stale_tour",
            severity: "medium",
            message: `Stale Check-in: Lead ${l.name} has been marked as "On Tour" by ${tcmName} for over ${Math.floor(hoursSinceUpdate)} hours.`,
            timestamp: l.updatedAt
          });
        }
      }
    }

    // 3. Stale Properties
    for (const p of properties) {
      const daysSinceCreated = (now - new Date(p.createdAt).getTime()) / 86400000;
      if (daysSinceCreated > 60) {
        anomalies.push({
          type: "stale_inventory",
          severity: "low",
          message: `Stale Inventory: Property ${p.name || p._id} has been vacant for over ${Math.floor(daysSinceCreated)} days. Review pricing or condition.`,
          timestamp: new Date().toISOString()
        });
      }
    }

    const severityScore = { high: 3, medium: 2, low: 1 };
    anomalies.sort((a, b) => severityScore[b.severity] - severityScore[a.severity]);

    return reply.send({ anomalies });
  });
}
