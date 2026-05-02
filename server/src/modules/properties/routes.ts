import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import { ulid } from "../../../../src/contracts/ids.js";

export interface PropertyDoc {
  _id: string;
  tenantId: string;
  name: string;
  zoneId: string;
  area: string;
  address: string;
  totalBeds: number;
  vacantBeds: number;
  pricePerBed: number;
  createdAt: string;
  updatedAt: string;
}

const PropertyFields = {
  name: z.string().min(1).max(120),
  zoneId: z.string().min(1),
  area: z.string().max(120),
  address: z.string().max(250).optional().default(""),
  totalBeds: z.number().int().min(0).default(0),
  vacantBeds: z.number().int().min(0).default(0),
  pricePerBed: z.number().int().min(0).default(0),
};

const CreateBody = z.object(PropertyFields);
const UpdateBody = z.object(PropertyFields);

function propertyOut(p: PropertyDoc) {
  return {
    id: p._id,
    name: p.name,
    zoneId: p.zoneId,
    area: p.area,
    address: p.address,
    totalBeds: p.totalBeds,
    vacantBeds: p.vacantBeds,
    pricePerBed: p.pricePerBed,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  };
}

export function registerPropertyRoutes(app: FastifyInstance) {
  const properties = () => col<PropertyDoc>("properties");

  // List properties
  app.get("/api/properties", { preHandler: [requireAuth] }, async (req, reply) => {
    const list = await properties()
      .find({ tenantId: req.user!.tenantId })
      .sort({ name: 1 })
      .toArray();
    return reply.send(list.map(propertyOut));
  });

  // Create property
  app.post("/api/properties", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    try {
      const body = CreateBody.parse(req.body);
      const name = body.name.trim();
      const exists = await properties().findOne({ tenantId: req.user!.tenantId, name });
      if (exists) return reply.code(409).send({ code: "CONFLICT", message: "Property name already exists" });
      
      const now = new Date().toISOString();
      const doc: PropertyDoc = {
        _id: ulid(),
        tenantId: req.user!.tenantId,
        name,
        zoneId: body.zoneId,
        area: body.area.trim(),
        address: body.address.trim(),
        totalBeds: body.totalBeds,
        vacantBeds: body.vacantBeds,
        pricePerBed: body.pricePerBed,
        createdAt: now,
        updatedAt: now,
      };
      await properties().insertOne(doc);
      return reply.code(201).send(propertyOut(doc));
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  // Update property
  app.put("/api/properties/:id", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    try {
      const { id } = req.params as { id: string };
      const body = UpdateBody.parse(req.body);
      const name = body.name.trim();
      
      const dupe = await properties().findOne({ tenantId: req.user!.tenantId, name, _id: { $ne: id } });
      if (dupe) return reply.code(409).send({ code: "CONFLICT", message: "Property name already exists" });
      
      const r = await properties().findOneAndUpdate(
        { _id: id, tenantId: req.user!.tenantId },
        {
          $set: {
            name,
            zoneId: body.zoneId,
            area: body.area.trim(),
            address: body.address.trim(),
            totalBeds: body.totalBeds,
            vacantBeds: body.vacantBeds,
            pricePerBed: body.pricePerBed,
            updatedAt: new Date().toISOString(),
          },
        },
        { returnDocument: "after" },
      );
      if (!r) return reply.code(404).send({ code: "NOT_FOUND", message: "Property not found" });
      return reply.send(propertyOut(r));
    } catch (e) {
      const err = e as Error;
      return reply.code(400).send({ code: "BAD_REQUEST", message: err.message });
    }
  });

  // Delete property
  app.delete("/api/properties/:id", { preHandler: [requireAuth, requireScope("inventory.block")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const r = await properties().deleteOne({ _id: id, tenantId: req.user!.tenantId });
    if (r.deletedCount === 0) return reply.code(404).send({ code: "NOT_FOUND", message: "Property not found" });
    return reply.send({ ok: true });
  });
}
