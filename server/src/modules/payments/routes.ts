import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";
import { PaymentRecord } from "../../../../src/contracts/entities.js";
import { emit } from "../../realtime/event-bus.js";

type PaymentDoc = z.infer<typeof PaymentRecord> & { _id: string; tenantId_scope: string };

const CreatePaymentBody = z.object({
  tenantId: z.string().min(1),
  bookingId: z.string().optional().default(""),
  tenantName: z.string().min(1).max(120),
  propertyName: z.string().max(120).optional().default(""),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Month must be YYYY-MM"),
  amount: z.number().int().min(0),
  method: z.enum(["UPI", "Cash", "Bank", "Card"]).nullable().optional().default(null),
  ref: z.string().max(200).nullable().optional().default(null),
  type: z.enum(["token", "rent", "deposit", "maintenance", "other"]).optional().default("rent"),
  notes: z.string().max(2000).optional().default(""),
  paidAt: z.string().nullable().optional().default(null),
  dueAt: z.string().nullable().optional().default(null),
});

const UpdatePaymentBody = z.object({
  amount: z.number().int().min(0).optional(),
  status: z.enum(["paid", "pending", "overdue", "partial"]).optional(),
  method: z.enum(["UPI", "Cash", "Bank", "Card"]).nullable().optional(),
  ref: z.string().max(200).nullable().optional(),
  notes: z.string().max(2000).optional(),
  paidAt: z.string().nullable().optional(),
});

const ListQuery = z.object({
  tenantId: z.string().optional(),
  month: z.string().optional(),
  status: z.string().optional(),
  type: z.string().optional(),
  limit: z.coerce.number().min(1).max(500).default(100),
  cursor: z.string().optional(),
});

function paymentOut(d: PaymentDoc) {
  return {
    id: d._id,
    tenantId: d.tenantId,
    bookingId: d.bookingId ?? "",
    tenantName: d.tenantName,
    propertyName: d.propertyName ?? "",
    month: d.month,
    amount: d.amount,
    status: d.status,
    method: d.method ?? null,
    ref: d.ref ?? null,
    type: d.type ?? "rent",
    notes: d.notes ?? "",
    paidAt: d.paidAt ?? null,
    dueAt: d.dueAt ?? null,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
  };
}

export function registerPaymentsRoutes(app: FastifyInstance) {
  const payments = () => col<PaymentDoc>("payments");

  // ---- List payments ----
  app.get("/api/payments", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const q = ListQuery.parse(req.query);
    const filter: Record<string, unknown> = { tenantId_scope: req.user!.tenantId };
    if (q.tenantId) filter.tenantId = q.tenantId;
    if (q.month) filter.month = q.month;
    if (q.status) filter.status = q.status;
    if (q.type) filter.type = q.type;
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await payments()
      .find(filter)
      .sort({ month: -1, createdAt: -1 })
      .limit(q.limit)
      .toArray();
    return reply.send({
      items: items.map(paymentOut),
      nextCursor: items.length === q.limit ? items[items.length - 1]._id : null,
    });
  });

  // ---- Get single payment ----
  app.get("/api/payments/:id", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await payments().findOne({ _id: id, tenantId_scope: req.user!.tenantId });
    if (!doc) return reply.code(404).send({ code: "NOT_FOUND", message: "Payment not found" });
    return reply.send(paymentOut(doc));
  });

  // ---- Record a payment ----
  app.post("/api/payments", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    try {
      const body = CreatePaymentBody.parse(req.body);
      const now = new Date().toISOString();
      const doc: PaymentDoc = {
        _id: ulid(),
        tenantId: body.tenantId,
        bookingId: body.bookingId,
        tenantName: body.tenantName,
        propertyName: body.propertyName,
        month: body.month,
        amount: body.amount,
        status: body.paidAt ? "paid" : "pending",
        method: body.method ?? null,
        ref: body.ref ?? null,
        type: body.type,
        notes: body.notes,
        paidAt: body.paidAt ?? null,
        dueAt: body.dueAt ?? null,
        createdAt: now,
        updatedAt: now,
        tenantId_scope: req.user!.tenantId,
      };
      await payments().insertOne(doc);

      await emit({
        type: "evt.payment.recorded",
        payload: { payment: paymentOut(doc) as any },
        actor: req.user!.sub,
        tenantId: req.user!.tenantId,
      });

      return reply.code(201).send(paymentOut(doc));
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  // ---- Update a payment ----
  app.patch("/api/payments/:id", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = UpdatePaymentBody.parse(req.body);
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.amount !== undefined) patch.amount = body.amount;
      if (body.status !== undefined) patch.status = body.status;
      if (body.method !== undefined) patch.method = body.method;
      if (body.ref !== undefined) patch.ref = body.ref;
      if (body.notes !== undefined) patch.notes = body.notes;
      if (body.paidAt !== undefined) patch.paidAt = body.paidAt;
      if (body.status === "paid" && !body.paidAt) patch.paidAt = new Date().toISOString();

      const r = await payments().findOneAndUpdate(
        { _id: id, tenantId_scope: req.user!.tenantId },
        { $set: patch },
        { returnDocument: "after" },
      );
      if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Payment not found" });

      await emit({
        type: "evt.payment.updated",
        payload: { paymentId: id, patch },
        actor: req.user!.sub,
        tenantId: req.user!.tenantId,
      });

      return reply.send(paymentOut(r));
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  // ---- Delete a payment ----
  app.delete("/api/payments/:id", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await payments().deleteOne({ _id: id, tenantId_scope: req.user!.tenantId });
    if (r.deletedCount === 0) return reply.code(404).send({ code: "NOT_FOUND", message: "Payment not found" });

    await emit({
      type: "evt.payment.deleted",
      payload: { paymentId: id, tenantId: "" },
      actor: req.user!.sub,
      tenantId: req.user!.tenantId,
    });

    return reply.send({ ok: true });
  });

  // ---- Generate monthly rent records for all active tenants ----
  app.post("/api/payments/generate-rents", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    try {
      const { month } = (req.body as any) ?? {};
      if (!month || !/^\d{4}-\d{2}$/.test(month)) {
        return reply.code(400).send({ code: "BAD_REQUEST", message: "month (YYYY-MM) required" });
      }

      const tenants = await col<any>("tenants")
        .find({ tenantId: req.user!.tenantId, status: "active" })
        .toArray();

      let created = 0;
      const now = new Date().toISOString();
      const dueDate = new Date(`${month}-05T23:59:59.000Z`).toISOString(); // Due on 5th of each month

      for (const t of tenants) {
        // Skip if rent already exists for this tenant+month
        const existing = await payments().findOne({
          tenantId: t._id,
          month,
          type: "rent",
          tenantId_scope: req.user!.tenantId,
        });
        if (existing) continue;

        const doc: PaymentDoc = {
          _id: ulid(),
          tenantId: t._id,
          bookingId: t.bookingId ?? "",
          tenantName: t.name,
          propertyName: "",
          month,
          amount: t.rent,
          status: "pending",
          method: null,
          ref: null,
          type: "rent",
          notes: "",
          paidAt: null,
          dueAt: dueDate,
          createdAt: now,
          updatedAt: now,
          tenantId_scope: req.user!.tenantId,
        };
        await payments().insertOne(doc);
        created++;
      }

      await emit({
        type: "evt.rents.generated",
        payload: { month, count: created },
        actor: req.user!.sub,
        tenantId: req.user!.tenantId,
      });

      return reply.send({ ok: true, generated: created, total: tenants.length });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  // ---- Rent collection stats ----
  app.get("/api/payments/stats", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const tenantScope = req.user!.tenantId;
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonth = `${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, "0")}`;

    const allPayments = await payments()
      .find({ tenantId_scope: tenantScope, type: "rent" })
      .toArray();

    const current = allPayments.filter((p) => p.month === currentMonth);
    const previous = allPayments.filter((p) => p.month === prevMonth);

    const totalExpected = current.reduce((s, p) => s + p.amount, 0);
    const totalCollected = current.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);
    const pendingCount = current.filter((p) => p.status === "pending" || p.status === "overdue").length;
    const overdueCount = current.filter((p) => p.status === "overdue").length;

    const prevCollected = previous.filter((p) => p.status === "paid").reduce((s, p) => s + p.amount, 0);

    return reply.send({
      currentMonth,
      totalExpected,
      totalCollected,
      collectionRate: totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0,
      pendingCount,
      overdueCount,
      previousMonthCollected: prevCollected,
      tenantCount: new Set(current.map((p) => p.tenantId)).size,
    });
  });
}
