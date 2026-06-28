import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";

export interface AgreementDoc {
  _id: string;
  tenantId: string;
  bookingId: string;
  leadId: string;
  tenantName: string;
  tenantPhone: string;
  propertyName: string;
  propertyAddress: string;
  roomNumber: string;
  rent: number;
  deposit: number;
  moveInDate: string;
  duration: number;
  noticePeriod: number;
  status: "draft" | "sent" | "signed" | "expired";
  signedByTenantAt: string;
  signedByOwnerAt: string;
  pdfData: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

const CreateBody = z.object({
  bookingId: z.string().min(1),
  leadId: z.string().min(1),
  tenantName: z.string().min(1),
  tenantPhone: z.string().min(7),
  propertyName: z.string().min(1),
  propertyAddress: z.string().min(1),
  roomNumber: z.string().default(""),
  rent: z.number().int().min(0),
  deposit: z.number().int().min(0),
  moveInDate: z.string().min(1),
  duration: z.number().int().min(1).default(11),
  noticePeriod: z.number().int().min(0).default(30),
});

const UpdateBody = z.object({
  tenantName: z.string().min(1).optional(),
  tenantPhone: z.string().min(7).optional(),
  propertyName: z.string().min(1).optional(),
  propertyAddress: z.string().min(1).optional(),
  roomNumber: z.string().optional(),
  rent: z.number().int().min(0).optional(),
  deposit: z.number().int().min(0).optional(),
  moveInDate: z.string().optional(),
  duration: z.number().int().min(1).optional(),
  noticePeriod: z.number().int().min(0).optional(),
  status: z.enum(["draft", "sent", "signed", "expired"]).optional(),
});

export function registerAgreementsRoutes(app: FastifyInstance) {
  const agreements = () => col<AgreementDoc>("agreements");

  app.get("/api/agreements", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const q = z.object({
      status: z.string().optional(),
      search: z.string().optional(),
      limit: z.coerce.number().min(1).max(200).default(100),
      cursor: z.string().optional(),
    }).parse(req.query);

    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (q.status) filter.status = q.status;
    if (q.search) {
      filter.$or = [
        { tenantName: { $regex: q.search, $options: "i" } },
        { propertyName: { $regex: q.search, $options: "i" } },
      ];
    }
    if (q.cursor) filter._id = { $lt: q.cursor };

    const items = await agreements()
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(q.limit)
      .toArray();

    return reply.send({
      items: items.map((a) => ({
        id: a._id,
        bookingId: a.bookingId,
        tenantName: a.tenantName,
        tenantPhone: a.tenantPhone,
        propertyName: a.propertyName,
        rent: a.rent,
        deposit: a.deposit,
        status: a.status,
        signedByTenantAt: a.signedByTenantAt,
        signedByOwnerAt: a.signedByOwnerAt,
        createdAt: a.createdAt,
      })),
      nextCursor: items.length === q.limit ? items[items.length - 1]._id : null,
    });
  });

  app.get("/api/agreements/:id", { preHandler: [requireAuth, requireScope("tenant.read")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const doc = await agreements().findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!doc) return reply.code(404).send({ code: "NOT_FOUND", message: "Agreement not found" });
    return reply.send({
      id: doc._id,
      bookingId: doc.bookingId,
      leadId: doc.leadId,
      tenantName: doc.tenantName,
      tenantPhone: doc.tenantPhone,
      propertyName: doc.propertyName,
      propertyAddress: doc.propertyAddress,
      roomNumber: doc.roomNumber,
      rent: doc.rent,
      deposit: doc.deposit,
      moveInDate: doc.moveInDate,
      duration: doc.duration,
      noticePeriod: doc.noticePeriod,
      status: doc.status,
      signedByTenantAt: doc.signedByTenantAt,
      signedByOwnerAt: doc.signedByOwnerAt,
      pdfData: doc.pdfData,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    });
  });

  app.post("/api/agreements", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    try {
      const body = CreateBody.parse(req.body);
      const now = new Date().toISOString();
      const doc: AgreementDoc = {
        _id: ulid(),
        tenantId: req.user!.tenantId,
        bookingId: body.bookingId,
        leadId: body.leadId,
        tenantName: body.tenantName,
        tenantPhone: body.tenantPhone,
        propertyName: body.propertyName,
        propertyAddress: body.propertyAddress,
        roomNumber: body.roomNumber,
        rent: body.rent,
        deposit: body.deposit,
        moveInDate: body.moveInDate,
        duration: body.duration,
        noticePeriod: body.noticePeriod,
        status: "draft",
        signedByTenantAt: "",
        signedByOwnerAt: "",
        pdfData: "",
        createdBy: req.user!.sub,
        createdAt: now,
        updatedAt: now,
      };
      await agreements().insertOne(doc);
      return reply.code(201).send({
        id: doc._id,
        bookingId: doc.bookingId,
        tenantName: doc.tenantName,
        status: doc.status,
        createdAt: doc.createdAt,
      });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  app.put("/api/agreements/:id", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = UpdateBody.parse(req.body);
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      if (body.tenantName !== undefined) patch.tenantName = body.tenantName;
      if (body.tenantPhone !== undefined) patch.tenantPhone = body.tenantPhone;
      if (body.propertyName !== undefined) patch.propertyName = body.propertyName;
      if (body.propertyAddress !== undefined) patch.propertyAddress = body.propertyAddress;
      if (body.roomNumber !== undefined) patch.roomNumber = body.roomNumber;
      if (body.rent !== undefined) patch.rent = body.rent;
      if (body.deposit !== undefined) patch.deposit = body.deposit;
      if (body.moveInDate !== undefined) patch.moveInDate = body.moveInDate;
      if (body.duration !== undefined) patch.duration = body.duration;
      if (body.noticePeriod !== undefined) patch.noticePeriod = body.noticePeriod;
      if (body.status !== undefined) patch.status = body.status;

      const r = await agreements().findOneAndUpdate(
        { _id: id, tenantId: req.user!.tenantId },
        { $set: patch },
        { returnDocument: "after" },
      );
      if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Agreement not found" });
      return reply.send({ ok: true });
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  app.patch("/api/agreements/:id/pdf", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { pdfData } = req.body as { pdfData: string };
    const r = await agreements().findOneAndUpdate(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: { pdfData, updatedAt: new Date().toISOString() } },
      { returnDocument: "after" },
    );
    if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Agreement not found" });
    return reply.send({ ok: true });
  });

  app.patch("/api/agreements/:id/sign", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { role } = req.body as { role: "tenant" | "owner" };
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: "signed", updatedAt: now };
    if (role === "tenant") patch.signedByTenantAt = now;
    else patch.signedByOwnerAt = now;

    const r = await agreements().findOneAndUpdate(
      { _id: id, tenantId: req.user!.tenantId },
      { $set: patch },
      { returnDocument: "after" },
    );
    if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Agreement not found" });
    return reply.send({ ok: true, status: "signed" });
  });

  app.delete("/api/agreements/:id", { preHandler: [requireAuth, requireScope("tenant.write")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await agreements().deleteOne({ _id: id, tenantId: req.user!.tenantId });
    if (r.deletedCount === 0) return reply.code(404).send({ code: "NOT_FOUND", message: "Agreement not found" });
    return reply.send({ ok: true });
  });
}
