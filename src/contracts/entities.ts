import { z } from "zod";

export const LeadStage = z.enum([
  "new",
  "contacted",
  "tour-scheduled",
  "on-tour",
  "tour-done",
  "negotiation",
  "quote-sent",
  "not-responding-3d",
  "not-responding-7d",
  "booked",
  "dropped",
]);

export const Intent = z.enum(["hot", "warm", "cold"]);

export const LeadQuality = z.enum(["hot", "good", "bad"]);
export type LeadQuality = z.infer<typeof LeadQuality>;

export const Lead = z.object({
  _id: z.string(),                       // ULID
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  source: z.string().max(60).default("manual"),
  budget: z.number().int().min(0),
  budgetText: z.string().max(80).default(""),
  moveInDate: z.string(),                // ISO date
  preferredArea: z.string().max(120),
  zoneId: z.string().nullable().default(null),
  assignedTcmId: z.string().nullable().default(null),
  stage: LeadStage.default("new"),
  intent: Intent.default("warm"),
  confidence: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string().max(30)).max(10).default([]),
  nextFollowUpAt: z.string().nullable().default(null),
  responseSpeedMins: z.number().int().min(0).default(0),
  // ---- Extended Quick-Add fields (additive, all optional with defaults) ----
  email: z.string().max(160).default(""),
  areas: z.array(z.string().max(80)).max(20).default([]),
  fullAddress: z.string().max(1000).default(""),
  type: z.string().max(60).default(""),         // student / working / family ...
  room: z.string().max(60).default(""),         // single / double / triple ...
  need: z.string().max(60).default(""),         // boys / girls / coliving ...
  inBLR: z.boolean().nullable().default(null),
  quality: LeadQuality.nullable().default(null),
  specialReqs: z.string().max(2000).default(""),
  notes: z.string().max(2000).default(""),
  zoneCategory: z.string().max(80).default(""), // bucket label
  assigneeId: z.string().nullable().default(null), // mirror of assignedTcmId for UI
  stageLabel: z.string().max(120).default(""),  // long stage label e.g. "MYT [TENANT]"
  createdAt: z.string(),
  updatedAt: z.string(),
  // Audit
  createdBy: z.string(),
  tenantId: z.string(),
});
export type Lead = z.infer<typeof Lead>;

// ------------------- TODO ENTITY -------------------
// A todo can be standalone (entityType = "none") OR attached to any entity.
export const TodoEntityType = z.enum(["none", "lead", "tour", "deal", "owner", "unit"]);
export type TodoEntityType = z.infer<typeof TodoEntityType>;

export const TodoStatus = z.enum([
  "open",          // created, awaiting acceptance if assigned
  "pending-accept",// assigned to someone other than creator, not yet accepted
  "accepted",      // assignee accepted, now actively owned
  "in-progress",   // marked started
  "done",
  "declined",      // assignee declined; bounces back to creator
  "cancelled",
]);
export type TodoStatus = z.infer<typeof TodoStatus>;

export const TodoPriority = z.enum(["low", "med", "high", "urgent"]);

export const Todo = z.object({
  _id: z.string(),                                     // ULID
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).default(""),
  // Attachment to a parent entity (or "none" for standalone My Tasks)
  entityType: TodoEntityType.default("none"),
  entityId: z.string().nullable().default(null),
  // People
  createdBy: z.string(),                               // userId
  assignedTo: z.string().nullable().default(null),     // userId, null = unassigned (My Tasks for creator)
  // State
  status: TodoStatus.default("open"),
  priority: TodoPriority.default("med"),
  dueAt: z.string().nullable().default(null),          // ISO
  completedAt: z.string().nullable().default(null),
  // Audit
  tenantId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Todo = z.infer<typeof Todo>;

// ------------------- ACTIVITY ENTITY (Salesforce-style timeline) -------------------
// Every touchpoint with a lead/tour/deal/owner/unit. Drives the activity timeline,
// conversion analytics, and SLA timers. Some are user-logged (call, email, note,
// meeting, sms, whatsapp, task), others are auto-logged by the system on commands
// (created, stage_changed, assigned, field_changed).
export const ActivityEntityType = z.enum(["lead", "tour", "deal", "owner", "unit"]);
export type ActivityEntityType = z.infer<typeof ActivityEntityType>;

export const ActivityKind = z.enum([
  // System-logged
  "created",
  "stage_changed",
  "assigned",
  "field_changed",
  "todo_linked",
  "tour_scheduled",
  // User-logged
  "call",
  "email",
  "sms",
  "whatsapp",
  "meeting",
  "note",
  "site_visit",
  "follow_up",
  "quote_sent",
  "document_shared",
  "payment_recorded",
]);
export type ActivityKind = z.infer<typeof ActivityKind>;

export const ActivityDirection = z.enum(["inbound", "outbound", "internal"]);
export const ActivityOutcome = z.enum([
  "connected",
  "no_answer",
  "busy",
  "voicemail",
  "interested",
  "not_interested",
  "callback_requested",
  "scheduled",
  "completed",
  "rescheduled",
  "cancelled",
  "neutral",
]);

export const Activity = z.object({
  _id: z.string(),
  entityType: ActivityEntityType,
  entityId: z.string(),
  kind: ActivityKind,
  // Standardized "subject" line (Salesforce-style). Human readable, indexable.
  subject: z.string().min(1).max(200),
  body: z.string().max(5000).default(""),
  direction: ActivityDirection.default("internal"),
  outcome: ActivityOutcome.nullable().default(null),
  // Engagement metrics
  durationSec: z.number().int().min(0).default(0),
  // Time anchors
  occurredAt: z.string(),                 // when the touchpoint actually happened
  scheduledFor: z.string().nullable().default(null),
  // Linkages
  relatedTodoId: z.string().nullable().default(null),
  // Free-form structured payload (call recording url, email message-id, etc.)
  meta: z.record(z.string(), z.unknown()).default({}),
  // Audit
  actor: z.string(),                      // userId who logged or triggered it
  tenantId: z.string(),
  createdAt: z.string(),
});
export type Activity = z.infer<typeof Activity>;

export const TourStatus = z.enum(["scheduled", "confirmed", "completed", "no-show", "cancelled", "on-tour"]);
export type TourStatus = z.infer<typeof TourStatus>;

export const TourOutcome = z.enum([
  "booked",
  "thinking",
  "awaiting",
  "token-paid",
  "draft",
  "follow-up",
  "rejected",
  "not-interested",
  "dropped",
]).nullable();
export type TourOutcome = z.infer<typeof TourOutcome>;

export const PostTourUpdate = z.object({
  outcome: TourOutcome.default(null),
  confidence: z.number().int().min(0).max(100).default(0),
  objection: z.string().nullable().default(null),
  objectionNote: z.string().max(2000).default(""),
  expectedDecisionAt: z.string().nullable().default(null),
  nextFollowUpAt: z.string().nullable().default(null),
  filledAt: z.string().nullable().default(null),
});
export type PostTourUpdate = z.infer<typeof PostTourUpdate>;

export const Tour = z.object({
  _id: z.string(),
  leadId: z.string(),
  propertyId: z.string().nullable().default(null),
  assignedTo: z.string(),
  scheduledBy: z.string(),
  scheduledAt: z.string(),
  status: TourStatus.default("scheduled"),
  showUp: z.boolean().nullable().optional().default(null),
  customPropertyName: z.string().optional().default(""),
  bookingSource: z.string().default("whatsapp"),
  tourType: z.enum(["physical", "virtual", "pre-book-pitch"]).optional().default("physical"),
  postTour: PostTourUpdate.default({}),
  createdAt: z.string(),
  updatedAt: z.string(),
  tenantId: z.string(),
});
export type Tour = z.infer<typeof Tour>;
