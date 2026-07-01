import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { TenantEntity } from "../../../../src/contracts/entities.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";

const ListQuery = z.object({
  status: z.string().optional(),
  propertyId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export function registerTenantsRoutes(app: FastifyInstance) {
  app.get("/api/tenants", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const q = ListQuery.parse(req.query);
    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (q.status) filter.status = q.status;
    if (q.propertyId) filter.propertyId = q.propertyId;
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await col<TenantEntity>("tenants")
      .find(filter)
      .sort({ _id: -1 })
      .limit(q.limit)
      .toArray();
    return reply.send({ items, nextCursor: items.length === q.limit ? items[items.length - 1]._id : null });
  });

  app.post("/api/tenants", { preHandler: [requireAuth] }, async (req, reply) => {
    const payload = req.body as Partial<TenantEntity>;
    const tenant: TenantEntity = {
      _id: "tnt_" + Date.now() + Math.random().toString(36).substring(2, 6),
      tenantId: req.user!.tenantId,
      bookingId: payload.bookingId || "",
      leadId: payload.leadId || "",
      propertyId: payload.propertyId || "",
      tcmId: payload.tcmId || "",
      name: payload.name || "Unknown",
      phone: payload.phone || "N/A",
      email: payload.email || "",
      roomNumber: payload.roomNumber || "",
      moveInDate: payload.moveInDate || new Date().toISOString(),
      rent: payload.rent || 0,
      deposit: payload.deposit || 0,
      status: "active",
      noticeGivenAt: null,
      exitDate: null,
      notes: payload.notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await col<TenantEntity>("tenants").insertOne(tenant);
    return reply.send(tenant);
  });

  app.get("/api/tenants/:id", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const tenant = await col<TenantEntity>("tenants").findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!tenant) return reply.code(404).send({ code: "NOT_FOUND", message: "Tenant not found" });
    return reply.send(tenant);
  });
}
