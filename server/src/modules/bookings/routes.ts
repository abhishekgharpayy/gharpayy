import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { BookingEntity } from "../../../../src/contracts/entities.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";

const ListQuery = z.object({
  status: z.string().optional(),
  propertyId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export function registerBookingsRoutes(app: FastifyInstance) {
  app.get("/api/bookings", { preHandler: [requireAuth, requireScope("booking.read")] }, async (req, reply) => {
    const q = ListQuery.parse(req.query);
    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (q.status) filter.status = q.status;
    if (q.propertyId) filter.propertyId = q.propertyId;
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await col<BookingEntity>("bookings")
      .find(filter)
      .sort({ _id: -1 })
      .limit(q.limit)
      .toArray();
    return reply.send({ items, nextCursor: items.length === q.limit ? items[items.length - 1]._id : null });
  });

  app.get("/api/bookings/:id", { preHandler: [requireAuth, requireScope("booking.read")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const booking = await col<BookingEntity>("bookings").findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!booking) return reply.code(404).send({ code: "NOT_FOUND", message: "Booking not found" });
    return reply.send(booking);
  });
}
