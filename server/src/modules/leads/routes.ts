import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { Command } from "../../../../src/contracts/commands.js";
import { Lead } from "../../../../src/contracts/entities.js";
import { dispatch } from "./command-handlers.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";

const ListQuery = z.object({
  stage: z.string().optional(),
  assignedTcmId: z.string().optional(),
  zoneId: z.string().optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  cursor: z.string().optional(),       // ULID cursor (createdAt-sorted)
});

export function registerLeadsRoutes(app: FastifyInstance) {
  // POST /api/commands — single command bus endpoint.
  app.post("/api/commands", { preHandler: [requireAuth] }, async (req, reply) => {
    const idem = req.headers["idempotency-key"];
    if (typeof idem !== "string" || idem.length < 10) {
      return reply.code(400).send({ code: "VALIDATION_FAILED", message: "Idempotency-Key header required" });
    }
    const parsed = Command.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ code: "VALIDATION_FAILED", message: "Invalid command", details: parsed.error.flatten() });
    }
    const cmd = parsed.data;
    if (cmd._id !== idem) {
      return reply.code(400).send({ code: "VALIDATION_FAILED", message: "Idempotency-Key must match command._id" });
    }
    // Scope check per command type.
    const scopeMap: Record<string, string[]> = {
      "cmd.lead.create": ["lead.create"],
      "cmd.lead.update": ["lead.update"],
      "cmd.lead.assign": ["lead.assign"],
      "cmd.lead.change_stage": ["lead.update"],
      "cmd.lead.delete": ["lead.update"],
      "cmd.todo.create": ["todo.create"],
      "cmd.todo.update": ["todo.update"],
      "cmd.todo.assign": ["todo.assign"],
      "cmd.todo.accept": ["todo.read"],
      "cmd.todo.decline": ["todo.read"],
      "cmd.todo.complete": ["todo.update"],
      "cmd.todo.cancel": ["todo.update"],
    };
    const need = scopeMap[cmd.type] ?? [];
    if (!need.every((s) => req.user!.scopes.includes(s as never))) {
      return reply.code(403).send({ code: "FORBIDDEN", message: `Missing scope: ${need.join(",")}` });
    }
    const result = await dispatch(cmd, req.user!);
    return reply.send(result);
  });

  // GET /api/leads — list + filter, with role-based visibility.
  app.get("/api/leads", { preHandler: [requireAuth, requireScope("lead.read")] }, async (req, reply) => {
    const q = ListQuery.parse(req.query);
    const filter: Record<string, unknown> = { tenantId: req.user!.tenantId };
    if (q.stage) filter.stage = q.stage;
    if (q.assignedTcmId) filter.assignedTcmId = q.assignedTcmId;
    if (q.zoneId) filter.zoneId = q.zoneId;
    if (q.cursor) filter._id = { $lt: q.cursor };

    // Role-based visibility:
    //  - super_admin / manager: see everything in tenant
    //  - admin: see leads inside any of their zones (zoneId or zoneCategory match users.zones[])
    //  - member: see leads they created OR are assigned to
    //  - owner: not allowed (no lead.read scope) — handled by requireScope above
    const role = req.user!.role;
    const myId = req.user!.sub;
    const myZones = req.user!.zones ?? [];
    if (role === "admin") {
      if (myZones.length === 0) {
        return reply.send({ items: [], nextCursor: null });
      }
      filter.$or = [
        { zoneId: { $in: myZones } },
        { zoneCategory: { $in: myZones } },
        { assignedTcmId: myId },
        { assigneeId: myId },
        { createdBy: myId },
      ];
    } else if (role === "member") {
      filter.$or = [
        { assignedTcmId: myId },
        { assigneeId: myId },
        { createdBy: myId },
      ];
    }
    // super_admin and manager fall through with no extra filter.

    const items = await col<Lead>("leads")
      .find(filter)
      .sort({ _id: -1 })
      .limit(q.limit)
      .toArray();
    return reply.send({ items, nextCursor: items.length === q.limit ? items[items.length - 1]._id : null });
  });

  app.get("/api/leads/:id", { preHandler: [requireAuth, requireScope("lead.read")] }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const lead = await col<Lead>("leads").findOne({ _id: id, tenantId: req.user!.tenantId });
    if (!lead) return reply.code(404).send({ code: "NOT_FOUND", message: "Lead not found" });
    // Re-apply visibility — return 404 (not 403) so id-enumeration leaks nothing.
    const role = req.user!.role;
    const myId = req.user!.sub;
    const myZones = req.user!.zones ?? [];
    const isMine = lead.createdBy === myId || lead.assignedTcmId === myId || lead.assigneeId === myId;
    const inMyZone = myZones.includes(lead.zoneId ?? "") || myZones.includes(lead.zoneCategory ?? "");
    const allowed =
      role === "super_admin" || role === "manager" ||
      (role === "admin" && (inMyZone || isMine)) ||
      (role === "member" && isMine);
    if (!allowed) return reply.code(404).send({ code: "NOT_FOUND", message: "Lead not found" });
    return reply.send(lead);
  });
}
