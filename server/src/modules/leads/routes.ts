import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { col } from "../../db/mongo.js";
import { Command } from "../../../../src/contracts/commands.js";
import { Lead } from "../../../../src/contracts/entities.js";
import { dispatch } from "./command-handlers.js";
import { requireAuth, requireScope } from "../../middleware/auth.js";
import {
  getPendingAssignmentsForUser,
  getPassedNotificationsForUser,
} from "./assignment-notification-handlers.js";

const ListQuery = z.object({
  stage: z.string().optional(),
  assignedTcmId: z.string().optional(),
  zoneId: z.string().optional(),
  search: z.string().optional(),
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
      "cmd.lead.accept_assignment": ["lead.read"],
      "cmd.lead.pass_assignment": ["lead.read"],
      "cmd.tour.schedule": ["tour.schedule"],
      "cmd.tour.reschedule": ["tour.schedule"],
      "cmd.tour.update": ["tour.schedule"],
      "cmd.tour.cancel": ["tour.schedule"],
      "cmd.tour.complete": ["tour.complete"],
      "cmd.tour.update_post_tour": ["tour.complete"],
      "cmd.tour.accept_assignment": ["lead.read"],
      "cmd.tour.pass_assignment": ["lead.read"],
      "cmd.todo.create": ["todo.create"],
      "cmd.todo.update": ["todo.update"],
      "cmd.todo.assign": ["todo.assign"],
      "cmd.todo.accept": ["todo.read"],
      "cmd.todo.decline": ["todo.read"],
      "cmd.todo.complete": ["todo.update"],
      "cmd.todo.cancel": ["todo.update"],
      "cmd.booking.create": ["booking.create"],
      "cmd.booking.update": ["booking.update"],
      "cmd.booking.cancel": ["booking.update"],
      "cmd.booking.approve": ["booking.update"],
      "cmd.booking.mark_paid": ["booking.update"],
      "cmd.tenant.create": ["tenant.create"],
      "cmd.tenant.update": ["tenant.update"],
      "cmd.tenant.update_status": ["tenant.update"],
      "cmd.lead.flag_intervention": ["lead.update"],
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
    
    if (q.search) {
      const s = q.search.trim();
      const numS = s.replace(/\D/g, '');
      const searchOr: any[] = [ { name: { $regex: s, $options: "i" } } ];
      if (numS.length > 0) searchOr.push({ phone: { $regex: numS, $options: "i" } });
      
      (filter as any).$and = (filter as any).$and || [];
      (filter as any).$and.push({ $or: searchOr });
    }

    // Role-based visibility:
    //  - super_admin / manager: see everything in tenant
    //  - admin: see leads inside any of their zones (zoneId or zoneCategory match users.zones[])
    //  - member: see leads they created OR are assigned to
    //  - tcm: see assigned leads, created leads, and leads with their tours
    //  - owner: not allowed (no lead.read scope) — handled by requireScope above
    const role = req.user!.role;
    const myId = req.user!.sub;
    const myZones = req.user!.zones ?? [];
    
    let roleOr: any[] = [];
    if (role === "admin") {
      if (myZones.length === 0) {
        return reply.send({ items: [], nextCursor: null });
      }
      
      // Find all members who share a zone with this admin
      const subordinates = await col("users")
        .find({ tenantId: req.user!.tenantId, zones: { $in: myZones } })
        .project({ _id: 1 })
        .toArray();
      const subordinateIds = subordinates.map((u) => u._id);
      subordinateIds.push(myId); // include self

      roleOr = [
        { zoneId: { $in: myZones } },
        { zoneCategory: { $in: myZones } },
        { assignedTcmId: { $in: subordinateIds } },
        { assigneeId: { $in: subordinateIds } },
        { createdBy: { $in: subordinateIds } },
      ];
    } else if (role === "member") {
      roleOr = [
        { assignedTcmId: myId },
        { assigneeId: myId },
        { createdBy: myId },
      ];
    } else if (role === "tcm") {
      // TCM inboxes are assignment-driven. They can see leads assigned to them,
      // leads they created, or leads where a FULLY-ACCEPTED tour is assigned to them.
      // Leads/tours with a PENDING assignment notification are excluded until accepted.
      const myTours = await col("tours")
        .find({ assignedTo: myId, tenantId: req.user!.tenantId })
        .project({ leadId: 1, _id: 1 })
        .toArray();

      // Exclude tours that still have a pending assignment notification
      const pendingTourIds = new Set(
        (await col("assignment_notifications")
          .find({ tenantId: req.user!.tenantId, assignedToId: myId, status: "pending", type: "tour" })
          .project({ entityId: 1 })
          .toArray()
        ).map((n: any) => n.entityId),
      );

      const tourLeadIds = myTours
        .filter((t: any) => !pendingTourIds.has(t._id))
        .map((t: any) => t.leadId);

      roleOr = [
        { assignedTcmId: myId },
        { assigneeId: myId },
        { createdBy: myId },
        { _id: { $in: tourLeadIds } },
      ];
    }
    // super_admin and manager fall through with no extra filter.
    
    if (roleOr.length > 0) {
      (filter as any).$and = (filter as any).$and || [];
      (filter as any).$and.push({ $or: roleOr });
    }

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
    const isTcmOwned = lead.createdBy === myId;
    const inMyZone = myZones.includes(lead.zoneId ?? "") || myZones.includes(lead.zoneCategory ?? "");
    
    // Allow if they have an active tour assigned for this lead
    let hasTour = false;
    if (!isMine && (role === "member" || role === "tcm")) {
      const tour = await col("tours").findOne({ leadId: id, assignedTo: myId, tenantId: req.user!.tenantId });
      if (tour) hasTour = true;
    }

    const allowed =
      role === "super_admin" || role === "manager" ||
      (role === "admin" && (inMyZone || isMine)) ||
      (role === "member" && (isMine || hasTour)) ||
      (role === "tcm" && (isMine || isTcmOwned || hasTour));
    if (!allowed) return reply.code(404).send({ code: "NOT_FOUND", message: "Lead not found" });
    return reply.send(lead);
  });

  // ---------- Assignment Notifications ----------

  // GET /api/assignment-notifications — pending assignments for the current user
  app.get("/api/assignment-notifications", { preHandler: [requireAuth] }, async (req, reply) => {
    const pending = await getPendingAssignmentsForUser(req.user!.sub, req.user!.tenantId);
    return reply.send({ items: pending });
  });
  // GET /api/assignment-notifications/passed — recently passed assignments (so assigner is informed)
  app.get("/api/assignment-notifications/passed", { preHandler: [requireAuth] }, async (req, reply) => {
    const passed = await getPassedNotificationsForUser(req.user!.sub, req.user!.tenantId);
    return reply.send({ items: passed });
  });

  // POST /api/leads/import — bulk import leads from CSV/JSON
  app.post("/api/leads/import", { preHandler: [requireAuth, requireScope("lead.create")] }, async (req, reply) => {
    const { leads: incomingLeads } = req.body as { leads: Array<Record<string, unknown>> };
    if (!Array.isArray(incomingLeads) || incomingLeads.length === 0) {
      return reply.code(400).send({ code: "VALIDATION_FAILED", message: "leads array required" });
    }
    if (incomingLeads.length > 500) {
      return reply.code(400).send({ code: "VALIDATION_FAILED", message: "Max 500 leads per import" });
    }

    const tenantId = req.user!.tenantId;
    const actorId = req.user!.sub;
    const now = new Date().toISOString();

    // Normalize phone to E.164-ish (strip spaces/dashes, ensure +91 prefix for 10-digit Indian numbers)
    function normalizePhone(raw: string): string {
      const digits = (raw || "").replace(/\D/g, "");
      if (digits.length === 10) return `+91${digits}`;
      if (digits.length === 12 && digits.startsWith("91")) return `+${digits}`;
      if (digits.startsWith("+")) return `+${digits.replace(/\D/g, "")}`;
      return `+${digits}`;
    }

    // Check existing phones in DB for dedup
    const phonesToCheck = incomingLeads.map(l => normalizePhone(String(l.phone || l.Phone || ""))).filter(p => p.length > 5);
    const existingDocs = await col("lead_phone_index")
      .find({ tenantId, phoneE164: { $in: phonesToCheck } })
      .project({ phoneE164: 1 })
      .toArray();
    const existingPhones = new Set(existingDocs.map((d: any) => d.phoneE164));

    const created: any[] = [];
    const duplicates: Array<{ phone: string; existingLeadId: string }> = [];
    const rejected: Array<{ phone: string; reason: string }> = [];

    for (const raw of incomingLeads) {
      const phone = normalizePhone(String(raw.phone || raw.Phone || raw.Mobile || raw.mobile || ""));
      if (phone.length < 5) {
        rejected.push({ phone: String(raw.phone || ""), reason: "Invalid phone number" });
        continue;
      }
      if (existingPhones.has(phone)) {
        duplicates.push({ phone, existingLeadId: "exists" });
        continue;
      }

      const name = String(raw.name || raw.Name || raw.Lead || "").trim() || "Lead name not captured";
      const source = String(raw.source || raw.Source || "CSV Import").trim();
      const budget = Number(raw.budget || raw.Budget || 0);
      const preferredArea = String(raw.preferredArea || raw.area || raw.Area || raw.location || raw.Location || "").trim();
      const moveInDate = String(raw.moveInDate || raw["Move-in Date"] || raw.move_in || now).trim();
      const tags = raw.tags ? (Array.isArray(raw.tags) ? raw.tags : String(raw.tags).split(",").map((t: string) => t.trim())) : [];

      const leadId = `upl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const lead = {
        _id: leadId,
        name,
        phone,
        source,
        budget,
        budgetText: budget > 0 ? `₹${budget}` : "",
        moveInDate,
        preferredArea,
        zoneId: null,
        assignedTcmId: null,
        stage: "new",
        intent: "warm",
        confidence: 50,
        tags,
        nextFollowUpAt: null,
        responseSpeedMins: 0,
        email: String(raw.email || raw.Email || ""),
        areas: preferredArea ? [preferredArea] : [],
        fullAddress: String(raw.address || raw.Address || ""),
        type: String(raw.type || raw.Type || ""),
        room: String(raw.room || raw.Room || ""),
        need: String(raw.need || raw.Need || ""),
        inBLR: null,
        quality: null,
        specialReqs: String(raw.specialReqs || raw.notes || ""),
        notes: String(raw.notes || raw.Notes || ""),
        zoneCategory: "",
        assigneeId: null,
        stageLabel: "",
        createdAt: now,
        updatedAt: now,
        createdBy: actorId,
        tenantId,
      };

      // Insert into leads collection
      await col("leads").insertOne(lead);

      // Insert phone index for dedup
      await col("lead_phone_index").insertOne({
        _id: `pi_${leadId}`,
        tenantId,
        phoneE164: phone,
        leadId,
        createdAt: now,
      });

      // Add to existing set so intra-batch dupes are caught
      existingPhones.add(phone);
      created.push({ id: leadId, name, phone });
    }

    return reply.send({
      success: true,
      summary: {
        total: incomingLeads.length,
        created: created.length,
        duplicates: duplicates.length,
        rejected: rejected.length,
      },
      created,
      duplicates,
      rejected,
    });
  });
}
