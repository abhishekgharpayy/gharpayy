import type { FastifyInstance } from "fastify";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import type { Lead } from "../../../../src/contracts/entities.js";

const STAFF_ROLES = ["super_admin", "manager", "admin"] as const;

export function registerAdminRevenueRoutes(app: FastifyInstance) {
  app.get("/api/v1/admin/revenue/leakage", { preHandler: [requireAuth] }, async (req, reply) => {
    if (!STAFF_ROLES.includes(req.user!.role as any)) return reply.code(403).send({ message: "Forbidden" });

    const tenantId = req.user!.tenantId;

    const leads = await col<Lead>("leads").find({ tenantId, stage: "dropped" }).toArray();

    // Map lost leads to specific reasons based on metadata or intent/stage combination
    const leakageMap: Record<string, number> = {
      "Budget Too Low": 0,
      "No Follow-up": 0,
      "Property Unavailable": 0,
      "Lost to Competitor": 0,
      "Other": 0
    };

    leads.forEach(l => {
      const value = l.budget || 10000; // Default budget if not set

      // Simple heuristic for demo purposes based on intent/metadata if reason isn't explicitly set
      // Assuming (l as any).metadata?.lostReason might exist, or inferring from intent.
      const reason = (l as any).metadata?.lostReason || 
                     (l.intent === "cold" ? "No Follow-up" : "Other");

      if (leakageMap[reason] !== undefined) {
        leakageMap[reason] += value;
      } else {
        leakageMap["Other"] += value;
      }
    });

    const leakage = Object.entries(leakageMap)
      .map(([reason, amount]) => ({ reason, amount }))
      .filter(x => x.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    return reply.send({ leakage });
  });
}
