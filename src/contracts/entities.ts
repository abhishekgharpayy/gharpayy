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
  _id: z.string(), // ULID
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  source: z.string().max(60).default("manual"),
  budget: z.number().int().min(0),
  budgetText: z.string().max(80).default(""),
  moveInDate: z.string(), // ISO date
  preferredArea: z.string().max(120),
  zoneId: z.string().nullable().default(null),
  assignedTcmId: z.string().nullable().default(null),
  stage: LeadStage.default("new"),
  intent: Intent.default("warm"),
  confidence: z.number().int().min(0).max(100).default(50),
  tags: z.array(z.string().max(30)).max(10).default([]),
  nextFollowUpAt: z.string().nullable().default(null),
  responseSpeedMins: z.number().int().min(0).default(0),
  priorityScore: z.number().int().min(0).max(100).default(0),
  priorityState: z.enum(["HOT", "WARM", "COLD", "OVERDUE"]).default("COLD"),
  nextBestAction: z.string().nullable().default(null),
  priorityReason: z.string().nullable().default(null),
  propertySelection: z.object({
    type: z.enum(["hub", "other"]),
    propertyId: z.string().optional(),
    propertyName: z.string().optional()
  }).optional(),
  // ---- Extended Quick-Add fields (additive, all optional with defaults) ----
  email: z.string().max(160).default(""),
  areas: z.array(z.string().max(80)).max(20).default([]),
  fullAddress: z.string().max(1000).default(""),
  type: z.string().max(60).default(""), // student / working / family ...
  room: z.string().max(60).default(""), // single / double / triple ...
  need: z.string().max(60).default(""), // boys / girls / coliving ...
  inBLR: z.boolean().nullable().default(null),
  quality: LeadQuality.nullable().default(null),
  specialReqs: z.string().max(2000).default(""),
  notes: z.string().max(2000).default(""),
  zoneCategory: z.string().max(80).default(""), // bucket label
  assigneeId: z.string().nullable().default(null), // mirror of assignedTcmId for UI
  stageLabel: z.string().max(120).default(""), // long stage label e.g. "MYT [TENANT]"
  createdAt: z.string(),
  updatedAt: z.string(),
  // Audit
  createdBy: z.string(),
  tenantId: z.string(),
  // Overhaul additions
  intervention: z.object({
    isFlagged: z.boolean(),
    category: z.string(),
    note: z.string(),
    flaggedAt: z.string(),
    flaggedBy: z.string(),
  }).nullable().optional(),
  suggestedProperties: z.array(z.string()).default([]),
});
export type Lead = z.infer<typeof Lead>;

// ------------------- TODO ENTITY -------------------
// A todo can be standalone (entityType = "none") OR attached to any entity.
export const TodoEntityType = z.enum(["none", "lead", "tour", "deal", "owner", "unit"]);
export type TodoEntityType = z.infer<typeof TodoEntityType>;

export const TodoStatus = z.enum([
  "open", // created, awaiting acceptance if assigned
  "pending-accept", // assigned to someone other than creator, not yet accepted
  "accepted", // assignee accepted, now actively owned
  "in-progress", // marked started
  "done",
  "declined", // assignee declined; bounces back to creator
  "cancelled",
]);
export type TodoStatus = z.infer<typeof TodoStatus>;

export const TodoPriority = z.enum(["low", "med", "high", "urgent"]);

export const Todo = z.object({
  _id: z.string(), // ULID
  title: z.string().min(1).max(200),
  notes: z.string().max(2000).default(""),
  // Attachment to a parent entity (or "none" for standalone My Tasks)
  entityType: TodoEntityType.default("none"),
  entityId: z.string().nullable().default(null),
  // People
  createdBy: z.string(), // userId
  assignedTo: z.string().nullable().default(null), // userId, null = unassigned (My Tasks for creator)
  // State
  status: TodoStatus.default("open"),
  priority: TodoPriority.default("med"),
  dueAt: z.string().nullable().default(null), // ISO
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
  "status_changed",
  "coaching_note",
  "ai_parse",
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
  occurredAt: z.string(), // when the touchpoint actually happened
  scheduledFor: z.string().nullable().default(null),
  // Linkages
  relatedTodoId: z.string().nullable().default(null),
  // Free-form structured payload (call recording url, email message-id, etc.)
  meta: z.record(z.string(), z.unknown()).default({}),
  // Audit
  actor: z.string(), // userId who logged or triggered it
  tenantId: z.string(),
  createdAt: z.string(),
});
export type Activity = z.infer<typeof Activity>;

export const TourStatus = z.enum([
  "scheduled",
  "confirmed",
  "completed",
  "no-show",
  "cancelled",
  "on-tour",
]);
export type TourStatus = z.infer<typeof TourStatus>;

export const TourOutcome = z
  .enum([
    "booked",
    "thinking",
    "awaiting",
    "token-paid",
    "draft",
    "follow-up",
    "rejected",
    "not-interested",
    "dropped",
  ])
  .nullable();
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
  location: z.object({ lat: z.number(), lng: z.number() }).optional().nullable().default(null),
});
export type Tour = z.infer<typeof Tour>;

// ------------------- BOOKING ENTITY -------------------
export const BookingStatus = z.enum(["pending", "approved", "paid", "active", "expired", "cancelled"]);
export type BookingStatus = z.infer<typeof BookingStatus>;

/**
 * Owner-facing lifecycle stages layered on top of the core booking status.
 * Tracks the coordination flow between flow-ops (sales) and the property owner.
 */
export const OwnerBookingLifecycle = z.enum([
  "created",
  "shared_with_owner",
  "viewed_by_owner",
  "acknowledged",
  "room_ready",
  "move_in_approved",
  "completed",
  "rejected",
  "cancelled",
]);
export type OwnerBookingLifecycle = z.infer<typeof OwnerBookingLifecycle>;

export const OwnerDecision = z.enum(["approve", "approve_with_conditions", "reject"]);
export type OwnerDecision = z.infer<typeof OwnerDecision>;

export const ReadinessStatus = z.enum(["pending", "ready"]);
export const ReadinessChecklist = z.object({
  cleaning: ReadinessStatus.default("pending"),
  furniture: ReadinessStatus.default("pending"),
  internet: ReadinessStatus.default("pending"),
  electricity: ReadinessStatus.default("pending"),
  water: ReadinessStatus.default("pending"),
  inspection: ReadinessStatus.default("pending"),
});
export type ReadinessChecklist = z.infer<typeof ReadinessChecklist>;

export const PaymentLineStatus = z.enum(["received", "pending", "waived"]);
export const PaymentLine = z.object({
  id: z.string(),
  label: z.string(),
  amount: z.number().int().min(0),
  status: PaymentLineStatus.default("pending"),
  receivedAt: z.string().nullable().default(null),
});
export type PaymentLine = z.infer<typeof PaymentLine>;

export const BookingHistoryEntry = z.object({
  ts: z.string(),
  actor: z.string(),
  text: z.string(),
});

export const BookingEntity = z.object({
  _id: z.string(),
  leadId: z.string(),
  tourId: z.string(),
  propertyId: z.string(),
  /** MongoDB _id of the owner user. Populated when the property has an ownerId. */
  ownerId: z.string().nullable().default(null),
  tcmId: z.string(),
  amount: z.number().int().min(0),
  tenantName: z.string().min(1).max(120),
  tenantPhone: z.string().min(7).max(20),
  deposit: z.number().int().min(0),
  moveInDate: z.string(),
  status: BookingStatus.default("pending"),
  // ---- Owner portal lifecycle ----
  ownerLifecycle: OwnerBookingLifecycle.default("created"),
  ownerDecision: OwnerDecision.nullable().default(null),
  ownerDecisionAt: z.string().nullable().default(null),
  ownerConditionNote: z.string().nullable().default(null),
  ownerRejectionReason: z.string().nullable().default(null),
  sharedWithOwnerAt: z.string().nullable().default(null),
  viewedByOwnerAt: z.string().nullable().default(null),
  acknowledgedAt: z.string().nullable().default(null),
  readyAt: z.string().nullable().default(null),
  moveInApprovedAt: z.string().nullable().default(null),
  completedAt: z.string().nullable().default(null),
  // ---- Room readiness checklist ----
  readiness: ReadinessChecklist.default({}),
  // ---- Payment lines (richer than single `amount`) ----
  paymentLines: z.array(PaymentLine).default([]),
  // ---- Inventory details (room/bed specifics) ----
  roomNumber: z.string().max(60).default(""),
  bedNumber: z.string().max(20).default(""),
  sharing: z.string().max(30).default(""),
  floor: z.string().max(20).default(""),
  // ---- History / audit trail ----
  history: z.array(BookingHistoryEntry).default([]),
  // ---- Legacy fields ----
  offerExpiresAt: z.string().nullable().default(null),
  paidRef: z.string().nullable().default(null),
  notes: z.string().max(2000).default(""),
  tenantId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BookingEntity = z.infer<typeof BookingEntity>;

// ------------------- TENANT ENTITY -------------------
export const TenantStatus = z.enum(["active", "notice", "exited"]);
export type TenantStatus = z.infer<typeof TenantStatus>;

export const TenantEntity = z.object({
  _id: z.string(),
  bookingId: z.string(),
  leadId: z.string(),
  propertyId: z.string(),
  tcmId: z.string(),
  name: z.string().min(1).max(120),
  phone: z.string().min(7).max(20),
  email: z.string().max(160).default(""),
  roomNumber: z.string().max(60).default(""),
  moveInDate: z.string(),
  rent: z.number().int().min(0),
  deposit: z.number().int().min(0),
  status: TenantStatus.default("active"),
  noticeGivenAt: z.string().nullable().default(null),
  exitDate: z.string().nullable().default(null),
  notes: z.string().max(2000).default(""),
  tenantId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TenantEntity = z.infer<typeof TenantEntity>;

// ------------------- PAYMENT ENTITY -------------------
export const PaymentMethod = z.enum(["UPI", "Cash", "Bank", "Card"]);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

export const PaymentType = z.enum(["token", "rent", "deposit", "maintenance", "other"]);
export type PaymentType = z.infer<typeof PaymentType>;

export const PaymentStatus = z.enum(["paid", "pending", "overdue", "partial"]);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PaymentRecord = z.object({
  _id: z.string(),
  tenantId: z.string(),
  bookingId: z.string(),
  tenantName: z.string(),
  propertyName: z.string().default(""),
  month: z.string(), // "YYYY-MM"
  amount: z.number().int().min(0),
  status: PaymentStatus.default("pending"),
  method: PaymentMethod.nullable().default(null),
  ref: z.string().max(200).nullable().default(null),
  type: PaymentType.default("rent"),
  notes: z.string().max(2000).default(""),
  paidAt: z.string().nullable().default(null),
  dueAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PaymentRecord = z.infer<typeof PaymentRecord>;

// ------------------- LEAVE ENTITY -------------------
export const LeaveType = z.enum(["casual", "sick", "earned", "unpaid"]);
export type LeaveType = z.infer<typeof LeaveType>;

export const LeaveStatus = z.enum(["pending", "approved", "rejected", "cancelled"]);
export type LeaveStatus = z.infer<typeof LeaveStatus>;

export const LeaveEntity = z.object({
  _id: z.string(),
  employeeId: z.string(), // Refers to the User _id who requested it
  employeeName: z.string(),
  type: LeaveType,
  status: LeaveStatus.default("pending"),
  startDate: z.string(), // YYYY-MM-DD
  endDate: z.string(),   // YYYY-MM-DD
  days: z.number().min(0.5),
  reason: z.string().max(2000),
  managerId: z.string().nullable(), // The person who approved/rejected
  managerNote: z.string().max(2000).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LeaveEntity = z.infer<typeof LeaveEntity>;

// ------------------- ATTENDANCE ENTITY -------------------
export const AttendanceStatus = z.enum(["present", "absent", "half-day", "late", "on-leave"]);
export type AttendanceStatus = z.infer<typeof AttendanceStatus>;

export const AttendanceEntity = z.object({
  _id: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  date: z.string(), // YYYY-MM-DD
  checkIn: z.string().nullable(), // ISO String
  checkOut: z.string().nullable(), // ISO String
  status: AttendanceStatus.default("absent"),
  workHours: z.number().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type AttendanceEntity = z.infer<typeof AttendanceEntity>;

// ------------------- ATS (CANDIDATE) ENTITY -------------------
export const CandidateStage = z.enum(["applied", "screening", "interview", "offer", "hired", "rejected"]);
export type CandidateStage = z.infer<typeof CandidateStage>;

export const CandidateEntity = z.object({
  _id: z.string(),
  roleAppliedFor: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  email: z.string().email(),
  phone: z.string().min(7).max(20),
  resumeUrl: z.string().url().nullable().optional(),
  stage: CandidateStage.default("applied"),
  notes: z.string().max(2000).default(""),
  interviewerId: z.string().nullable().default(null),
  interviewDate: z.string().nullable().default(null), // ISO String
  rating: z.number().min(1).max(5).nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CandidateEntity = z.infer<typeof CandidateEntity>;

// ------------------- PAYROLL & COMPENSATION -------------------
export const PayrollRunEntity = z.object({
  _id: z.string(),
  month: z.string(), // YYYY-MM
  status: z.enum(["draft", "processing", "paid"]),
  totalAmount: z.number().min(0),
  processedAt: z.string().nullable().default(null),
  createdAt: z.string(),
});
export type PayrollRunEntity = z.infer<typeof PayrollRunEntity>;

export const PayslipEntity = z.object({
  _id: z.string(),
  payrollRunId: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  month: z.string(), // YYYY-MM
  baseSalary: z.number().min(0),
  allowances: z.number().min(0).default(0),
  deductions: z.number().min(0).default(0),
  netPay: z.number().min(0),
  status: z.enum(["draft", "paid"]),
  createdAt: z.string(),
});
export type PayslipEntity = z.infer<typeof PayslipEntity>;

// ------------------- PERFORMANCE REVIEWS -------------------
export const ReviewEntity = z.object({
  _id: z.string(),
  employeeId: z.string(),
  employeeName: z.string(),
  reviewerId: z.string(),
  reviewerName: z.string(),
  type: z.enum(["self", "manager", "peer"]),
  cycle: z.string(), // e.g. "Q3 2026"
  rating: z.number().min(1).max(5),
  feedback: z.string().max(3000),
  status: z.enum(["draft", "submitted"]),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ReviewEntity = z.infer<typeof ReviewEntity>;

// ------------------- NEW HR ENTITIES (ONBOARDING, DOCUMENTS, POLICY, GRIEVANCE, OFFBOARDING) -------------------

export const OnboardingTask = z.object({
  id: z.string(), // generated uuid/ulid
  title: z.string(),
  assigneeId: z.string().nullable().default(null),
  dueDate: z.string().nullable().default(null),
  status: z.enum(["pending", "in_progress", "done", "overdue"]).default("pending"),
  completedAt: z.string().nullable().default(null),
});
export type OnboardingTask = z.infer<typeof OnboardingTask>;

export const OnboardingPlan = z.object({
  _id: z.string(),
  employeeId: z.string(),
  tasks: z.array(OnboardingTask).default([]),
  createdBy: z.string(),
  status: z.enum(["in_progress", "completed", "overdue"]).default("in_progress"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type OnboardingPlan = z.infer<typeof OnboardingPlan>;

export const DocumentType = z.enum(["offer_letter", "contract", "appraisal", "id_proof", "nda", "increment"]);
export type DocumentType = z.infer<typeof DocumentType>;

export const EmployeeDocument = z.object({
  _id: z.string(),
  employeeId: z.string(),
  type: DocumentType,
  fileUrl: z.string().url(),
  filename: z.string(),
  version: z.number().int().min(1).default(1),
  expiryDate: z.string().nullable().default(null),
  uploadedBy: z.string(),
  uploadedAt: z.string(),
  updatedAt: z.string(),
});
export type EmployeeDocument = z.infer<typeof EmployeeDocument>;

export const GrievanceCategory = z.enum(["harassment", "pay_dispute", "work_env", "manager_behaviour", "other"]);
export type GrievanceCategory = z.infer<typeof GrievanceCategory>;

export const GrievanceStatus = z.enum(["raised", "under_review", "resolved", "escalated"]);
export type GrievanceStatus = z.infer<typeof GrievanceStatus>;

export const GrievanceNote = z.object({
  text: z.string(),
  addedBy: z.string(),
  addedAt: z.string(),
});
export type GrievanceNote = z.infer<typeof GrievanceNote>;

export const Grievance = z.object({
  _id: z.string(),
  raisedBy: z.string(),
  isAnonymous: z.boolean().default(false),
  category: GrievanceCategory,
  description: z.string().min(50),
  status: GrievanceStatus.default("raised"),
  internalNotes: z.array(GrievanceNote).default([]),
  resolutionNote: z.string().nullable().default(null),
  raisedAt: z.string(),
  resolvedAt: z.string().nullable().default(null),
  updatedAt: z.string(),
});
export type Grievance = z.infer<typeof Grievance>;

export const PolicyStatus = z.enum(["draft", "published", "archived"]);
export type PolicyStatus = z.infer<typeof PolicyStatus>;

export const Policy = z.object({
  _id: z.string(),
  title: z.string(),
  description: z.string(),
  pdfUrl: z.string().url(),
  version: z.number().int().min(1).default(1),
  effectiveDate: z.string(),
  publishedBy: z.string(),
  publishedAt: z.string(),
  status: PolicyStatus.default("published"),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Policy = z.infer<typeof Policy>;

export const PolicyAcknowledgement = z.object({
  _id: z.string(),
  policyId: z.string(),
  employeeId: z.string(),
  acknowledgedAt: z.string(),
});
export type PolicyAcknowledgement = z.infer<typeof PolicyAcknowledgement>;

export const OffboardingTask = z.object({
  id: z.string(),
  title: z.string(),
  assignedTeam: z.string(),
  dueDate: z.string(),
  status: z.enum(["pending", "done"]).default("pending"),
  completedAt: z.string().nullable().default(null),
});
export type OffboardingTask = z.infer<typeof OffboardingTask>;

export const OffboardingWorkflow = z.object({
  _id: z.string(),
  employeeId: z.string(),
  initiatedBy: z.string(),
  exitDate: z.string(),
  tasks: z.array(OffboardingTask).default([]),
  exitInterview: z.record(z.string(), z.unknown()).nullable().default(null),
  status: z.enum(["in_progress", "completed"]).default("in_progress"),
  createdAt: z.string(),
  completedAt: z.string().nullable().default(null),
  updatedAt: z.string(),
});
export type OffboardingWorkflow = z.infer<typeof OffboardingWorkflow>;
