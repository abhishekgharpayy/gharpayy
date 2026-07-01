import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import { Queue } from "bullmq";
import { redis } from "../../db/redis.js";

const automationQ = new Queue("automation", { connection: redis });
const webhooksQ = new Queue("webhooks_in", { connection: redis });

export function registerDlqRoutes(app: FastifyInstance) {
  app.get("/api/admin/dlq", { preHandler: [requireAuth] }, async (req, reply) => {
    if (req.user!.role !== "super_admin" && req.user!.role !== "admin") {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
    }
    
    const items = await col("dlq").find().sort({ failedAt: -1 }).limit(100).toArray();
    const total = await col("dlq").estimatedDocumentCount();
    
    return reply.send({ items, total });
  });

  app.post("/api/admin/dlq/:id/retry", { preHandler: [requireAuth] }, async (req, reply) => {
    if (req.user!.role !== "super_admin" && req.user!.role !== "admin") {
      return reply.code(403).send({ code: "FORBIDDEN", message: "Forbidden" });
    }
    
    const { id } = req.params as { id: string };
    
    const dlqItem = await col("dlq").findOne({ _id: id });
    if (!dlqItem) {
      return reply.code(404).send({ error: "DLQ item not found" });
    }
    
    if (dlqItem.queue === "webhooks_in") {
      await webhooksQ.add(dlqItem.eventType || "webhook", dlqItem.data, { jobId: dlqItem.eventId || id });
    } else {
      await automationQ.add(dlqItem.eventType || "automation", dlqItem.data, { jobId: dlqItem.eventId || id });
    }
    
    await col("dlq").deleteOne({ _id: id });
    
    return reply.send({
      ok: true,
      message: `Job ${id} queued for retry`
    });
  });
}
