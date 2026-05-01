import { z } from "zod";
import { Lead, LeadStage, Intent, Todo, TodoEntityType, TodoPriority, Activity, ActivityKind, ActivityEntityType, ActivityDirection, ActivityOutcome } from "./entities.js";

// Command registry — every state-changing intent. Validated client + server.
export const CommandType = z.enum([
  "cmd.lead.create",
  "cmd.lead.update",
  "cmd.lead.assign",
  "cmd.lead.change_stage",
  "cmd.lead.delete",
  // Todos
  "cmd.todo.create",
  "cmd.todo.update",
  "cmd.todo.assign",
  "cmd.todo.accept",
  "cmd.todo.decline",
  "cmd.todo.complete",
  "cmd.todo.cancel",
  // Activities
  "cmd.activity.log",
  "cmd.activity.update",
  "cmd.activity.delete",
]);
export type CommandType = z.infer<typeof CommandType>;

const Base = z.object({
  _id: z.string(),                       // command ULID — used as Idempotency-Key
  issuedAt: z.string(),
  actor: z.string().optional(),          // server fills from JWT
  tenantId: z.string().optional(),       // server fills from JWT
});

// ---------- Leads ----------
export const CreateLeadCmd = Base.extend({
  type: z.literal("cmd.lead.create"),
  payload: Lead.pick({
    name: true,
    phone: true,
    source: true,
    budget: true,
    moveInDate: true,
    preferredArea: true,
    zoneId: true,
  }).extend({
    intent: Intent.optional(),
    tags: z.array(z.string()).max(10).optional(),
    // Extended Quick-Add fields — all optional, server fills defaults.
    email: z.string().max(160).optional(),
    areas: z.array(z.string().max(80)).max(20).optional(),
    fullAddress: z.string().max(1000).optional(),
    type: z.string().max(60).optional(),
    room: z.string().max(60).optional(),
    need: z.string().max(60).optional(),
    inBLR: z.boolean().nullable().optional(),
    quality: z.enum(["hot", "good", "bad"]).nullable().optional(),
    specialReqs: z.string().max(2000).optional(),
    notes: z.string().max(2000).optional(),
    zoneCategory: z.string().max(80).optional(),
    assigneeId: z.string().nullable().optional(),
    stageLabel: z.string().max(120).optional(),
  }),
});

export const UpdateLeadCmd = Base.extend({
  type: z.literal("cmd.lead.update"),
  payload: z.object({
    leadId: z.string(),
    patch: Lead.partial().omit({ _id: true, tenantId: true, createdBy: true, createdAt: true }),
  }),
});

export const AssignLeadCmd = Base.extend({
  type: z.literal("cmd.lead.assign"),
  payload: z.object({ leadId: z.string(), tcmId: z.string() }),
});

export const ChangeStageCmd = Base.extend({
  type: z.literal("cmd.lead.change_stage"),
  payload: z.object({ leadId: z.string(), to: LeadStage }),
});

export const DeleteLeadCmd = Base.extend({
  type: z.literal("cmd.lead.delete"),
  payload: z.object({ leadId: z.string() }),
});

// ---------- Todos ----------
export const CreateTodoCmd = Base.extend({
  type: z.literal("cmd.todo.create"),
  payload: Todo.pick({
    title: true,
    notes: true,
    entityType: true,
    entityId: true,
    priority: true,
    dueAt: true,
  }).partial({ notes: true, priority: true, dueAt: true, entityType: true, entityId: true }).extend({
    assignTo: z.string().nullable().optional(), // null/undefined = self
  }),
});

export const UpdateTodoCmd = Base.extend({
  type: z.literal("cmd.todo.update"),
  payload: z.object({
    todoId: z.string(),
    patch: z.object({
      title: z.string().min(1).max(200).optional(),
      notes: z.string().max(2000).optional(),
      priority: TodoPriority.optional(),
      dueAt: z.string().nullable().optional(),
      entityType: TodoEntityType.optional(),
      entityId: z.string().nullable().optional(),
    }),
  }),
});

export const AssignTodoCmd = Base.extend({
  type: z.literal("cmd.todo.assign"),
  payload: z.object({ todoId: z.string(), assignTo: z.string() }),
});

export const AcceptTodoCmd = Base.extend({
  type: z.literal("cmd.todo.accept"),
  payload: z.object({ todoId: z.string() }),
});

export const DeclineTodoCmd = Base.extend({
  type: z.literal("cmd.todo.decline"),
  payload: z.object({ todoId: z.string(), reason: z.string().max(500).optional() }),
});

export const CompleteTodoCmd = Base.extend({
  type: z.literal("cmd.todo.complete"),
  payload: z.object({ todoId: z.string() }),
});

export const CancelTodoCmd = Base.extend({
  type: z.literal("cmd.todo.cancel"),
  payload: z.object({ todoId: z.string() }),
});

// ---------- Activities ----------
export const LogActivityCmd = Base.extend({
  type: z.literal("cmd.activity.log"),
  payload: Activity.pick({
    entityType: true, entityId: true, kind: true, subject: true,
  }).extend({
    body: z.string().max(5000).optional(),
    direction: ActivityDirection.optional(),
    outcome: ActivityOutcome.nullable().optional(),
    durationSec: z.number().int().min(0).optional(),
    occurredAt: z.string().optional(),
    scheduledFor: z.string().nullable().optional(),
    relatedTodoId: z.string().nullable().optional(),
    meta: z.record(z.string(), z.unknown()).optional(),
  }),
});

export const UpdateActivityCmd = Base.extend({
  type: z.literal("cmd.activity.update"),
  payload: z.object({
    activityId: z.string(),
    patch: z.object({
      subject: z.string().min(1).max(200).optional(),
      body: z.string().max(5000).optional(),
      outcome: ActivityOutcome.nullable().optional(),
      durationSec: z.number().int().min(0).optional(),
      scheduledFor: z.string().nullable().optional(),
    }),
  }),
});

export const DeleteActivityCmd = Base.extend({
  type: z.literal("cmd.activity.delete"),
  payload: z.object({ activityId: z.string() }),
});

export const Command = z.discriminatedUnion("type", [
  CreateLeadCmd,
  UpdateLeadCmd,
  AssignLeadCmd,
  ChangeStageCmd,
  DeleteLeadCmd,
  CreateTodoCmd,
  UpdateTodoCmd,
  AssignTodoCmd,
  AcceptTodoCmd,
  DeclineTodoCmd,
  CompleteTodoCmd,
  CancelTodoCmd,
  LogActivityCmd,
  UpdateActivityCmd,
  DeleteActivityCmd,
]);
export type Command = z.infer<typeof Command>;
