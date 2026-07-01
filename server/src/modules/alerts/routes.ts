import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";
import { emit, newEventId } from "../../realtime/event-bus.js";

interface AlertDoc {
  _id: string;
  tenantId: string;
  type: "rent_overdue" | "booking_approval" | "tenant_exited";
  title: string;
  body: string;
  severity: "info" | "warning" | "critical";
  link: string;
  read: boolean;
  dismissed: boolean;
  expiresAt: string;
  createdAt: string;
}

const alertTypeMap: Record<AlertDoc["type"], string> = {
  rent_overdue: "evt.alert.rent_overdue",
  booking_approval: "evt.alert.booking_approval",
  tenant_exited: "evt.alert.tenant_exited",
};

export async function createAlert(input: {
  tenantId: string;
  type: AlertDoc["type"];
  title: string;
  body: string;
  severity: AlertDoc["severity"];
  link?: string;
  expiresAt?: string;
}) {
  const now = new Date().toISOString();
  const expiresAt = input.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const doc: AlertDoc = {
    _id: ulid(),
    tenantId: input.tenantId,
    type: input.type,
    title: input.title,
    body: input.body,
    severity: input.severity,
    link: input.link || "",
    read: false,
    dismissed: false,
    expiresAt,
    createdAt: now,
  };
  await col<AlertDoc>("alerts").insertOne(doc);

  await emit({
    _id: newEventId(),
    type: alertTypeMap[input.type] as any,
    occurredAt: now,
    actor: "system",
    tenantId: input.tenantId,
    correlationId: ulid(),
    causationId: null,
    version: 1,
    payload: { alertId: doc._id, title: input.title, severity: input.severity },
  });

  return doc;
}

export function registerAlertsRoutes(app: FastifyInstance) {
  const alerts = () => col<AlertDoc>("alerts");

  app.get("/api/alerts", { preHandler: [requireAuth] }, async (req, reply) => {
    const q = z.object({
      type: z.string().optional(),
      severity: z.enum(["info", "warning", "critical"]).optional(),
      includeDismissed: z.coerce.boolean().optional().default(false),
      limit: z.coerce.number().min(1).max(200).default(50),
    }).parse(req.query);

    const filter: Record<string, unknown> = {
      tenantId: req.user!.tenantId,
      expiresAt: { $gt: new Date().toISOString() },
    };
    if (!q.includeDismissed) filter.dismissed = false;
    if (q.type) filter.type = q.type;
    if (q.severity) filter.severity = q.severity;

    const items = await alerts()
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .toArray();

    const unreadCount = await alerts().countDocuments({
      tenantId: req.user!.tenantId,
      read: false,
      dismissed: false,
      expiresAt: { $gt: new Date().toISOString() },
    });

    return reply.send({
      items: items.map((a) => ({
        id: a._id,
        type: a.type,
        title: a.title,
        body: a.body,
        severity: a.severity,
        link: a.link,
        read: a.read,
        createdAt: a.createdAt,
      })),
      unreadCount,
    });
  });

  app.patch("/api/alerts/:id/read", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await alerts().updateOne(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: { read: true } },
    );
    return reply.send({ ok: true });
  });

  app.post("/api/alerts/mark-all-read", { preHandler: [requireAuth] }, async (req, reply) => {
    await alerts().updateMany(
      { tenantId: req.user!.tenantId, read: false, dismissed: false },
      { $set: { read: true } },
    );
    return reply.send({ ok: true });
  });

  app.patch("/api/alerts/:id/dismiss", { preHandler: [requireAuth] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    await alerts().updateOne(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: { dismissed: true } },
    );
    return reply.send({ ok: true });
  });

  app.get("/api/alerts/unread-count", { preHandler: [requireAuth] }, async (req, reply) => {
    const count = await alerts().countDocuments({
      tenantId: req.user!.tenantId,
      read: false,
      dismissed: false,
      expiresAt: { $gt: new Date().toISOString() },
    });
    return reply.send({ unreadCount: count });
  });
}
