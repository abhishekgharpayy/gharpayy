import { z } from "zod";
import { Lead, Todo, Activity, TourStatus, BookingEntity, TenantEntity, PaymentRecord } from "./entities.js";

// Event registry - every event the system can emit. Server publishes, client + workers subscribe.
export const EventType = z.enum([
  "evt.lead.created",
  "evt.lead.updated",
  "evt.lead.assigned",
  "evt.lead.stage_changed",
  "evt.lead.deleted",
  "evt.lead.assignment_pending",
  "evt.lead.assignment_passed",
  // Todos
  "evt.todo.created",
  "evt.todo.updated",
  "evt.todo.assigned",
  "evt.todo.accepted",
  "evt.todo.declined",
  "evt.todo.completed",
  "evt.todo.cancelled",
  // Activities
  "evt.activity.logged",
  "evt.activity.updated",
  "evt.activity.deleted",
  // Tour
  "evt.tour.scheduled",
  "evt.tour.rescheduled",
  "evt.tour.completed",
  "evt.tour.cancelled",
  "evt.tour.updated",
  "evt.tour.assignment_accepted",
  "evt.tour.assignment_passed",
  // Bookings
  "evt.booking.created",
  "evt.booking.updated",
  "evt.booking.cancelled",
  "evt.booking.approved",
  "evt.booking.marked_paid",
  // Tenants
  "evt.tenant.created",
  "evt.tenant.updated",
  "evt.tenant.status_changed",
  // Future modules
  "evt.room.blocked",
  "evt.room.released",
  // Owner sharing
  "evt.booking.shared_with_owner",
  // Payments
  "evt.payment.recorded",
  "evt.payment.updated",
  "evt.payment.deleted",
  "evt.rents.generated",
  // Alerts
  "evt.alert.rent_overdue",
  "evt.alert.booking_approval",
  "evt.alert.tenant_exited",
  "evt.alert.vacant_room",
  "evt.alert.followup_due",
  "evt.alert.tour_no_show",
]);
export type EventType = z.infer<typeof EventType>;

const Envelope = z.object({
  _id: z.string(),
  type: EventType,
  occurredAt: z.string(),
  actor: z.string(),
  tenantId: z.string(),
  correlationId: z.string(),
  causationId: z.string().nullable().default(null),
  version: z.literal(1),
});

// ---------- Lead events ----------
export const LeadCreatedEvt = Envelope.extend({
  type: z.literal("evt.lead.created"),
  payload: z.object({ lead: Lead }),
});
export const LeadUpdatedEvt = Envelope.extend({
  type: z.literal("evt.lead.updated"),
  payload: z.object({ leadId: z.string(), patch: Lead.partial() }),
});
export const LeadAssignedEvt = Envelope.extend({
  type: z.literal("evt.lead.assigned"),
  payload: z.object({ leadId: z.string(), tcmId: z.string(), originalAssignedById: z.string().optional(), assigneeName: z.string().optional() }),
});
export const LeadStageChangedEvt = Envelope.extend({
  type: z.literal("evt.lead.stage_changed"),
  payload: z.object({ leadId: z.string(), from: z.string(), to: z.string() }),
});
export const LeadDeletedEvt = Envelope.extend({
  type: z.literal("evt.lead.deleted"),
  payload: z.object({ leadId: z.string() }),
});

// ---------- Todo events ----------
export const TodoCreatedEvt = Envelope.extend({
  type: z.literal("evt.todo.created"),
  payload: z.object({ todo: Todo }),
});
export const TodoUpdatedEvt = Envelope.extend({
  type: z.literal("evt.todo.updated"),
  payload: z.object({ todoId: z.string(), patch: Todo.partial() }),
});
export const TodoAssignedEvt = Envelope.extend({
  type: z.literal("evt.todo.assigned"),
  payload: z.object({ todoId: z.string(), assignTo: z.string(), pending: z.boolean() }),
});
export const TodoAcceptedEvt = Envelope.extend({
  type: z.literal("evt.todo.accepted"),
  payload: z.object({ todoId: z.string(), by: z.string() }),
});
export const TodoDeclinedEvt = Envelope.extend({
  type: z.literal("evt.todo.declined"),
  payload: z.object({ todoId: z.string(), by: z.string(), reason: z.string().nullable() }),
});
export const TodoCompletedEvt = Envelope.extend({
  type: z.literal("evt.todo.completed"),
  payload: z.object({ todoId: z.string(), by: z.string() }),
});
export const TodoCancelledEvt = Envelope.extend({
  type: z.literal("evt.todo.cancelled"),
  payload: z.object({ todoId: z.string(), by: z.string() }),
});

// ---------- Activity events ----------
export const ActivityLoggedEvt = Envelope.extend({
  type: z.literal("evt.activity.logged"),
  payload: z.object({ activity: Activity }),
});
export const ActivityUpdatedEvt = Envelope.extend({
  type: z.literal("evt.activity.updated"),
  payload: z.object({ activityId: z.string(), patch: Activity.partial() }),
});
export const ActivityDeletedEvt = Envelope.extend({
  type: z.literal("evt.activity.deleted"),
  payload: z.object({ activityId: z.string(), entityType: z.string(), entityId: z.string() }),
});

export const TourScheduledEvt = Envelope.extend({
  type: z.literal("evt.tour.scheduled"),
  payload: z.object({
    tour: z.object({
      _id: z.string(),
      leadId: z.string(),
      propertyId: z.string().nullable(),
      assignedTo: z.string(),
      scheduledBy: z.string(),
      scheduledAt: z.string(),
      status: TourStatus,
      bookingSource: z.string(),
      tourType: z.enum(["physical", "virtual", "pre-book-pitch"]).optional(),
      createdAt: z.string(),
      updatedAt: z.string(),
    }),
  }),
});
export const TourRescheduledEvt = Envelope.extend({
  type: z.literal("evt.tour.rescheduled"),
  payload: z.object({ tourId: z.string(), scheduledAt: z.string() }),
});
export const TourCompletedEvt = Envelope.extend({
  type: z.literal("evt.tour.completed"),
  payload: z.object({ tourId: z.string() }),
});
export const TourCancelledEvt = Envelope.extend({
  type: z.literal("evt.tour.cancelled"),
  payload: z.object({ tourId: z.string() }),
});
export const TourUpdatedEvt = Envelope.extend({
  type: z.literal("evt.tour.updated"),
  payload: z.object({ tourId: z.string(), patch: z.record(z.string(), z.unknown()) }),
});

// ---------- Assignment notification events ----------
export const LeadAssignmentPendingEvt = Envelope.extend({
  type: z.literal("evt.lead.assignment_pending"),
  payload: z.object({ leadId: z.string(), tcmId: z.string() }),
});
export const LeadAssignmentPassedEvt = Envelope.extend({
  type: z.literal("evt.lead.assignment_passed"),
  payload: z.object({
    leadId: z.string(),
    passedById: z.string(),
    passedByName: z.string(),
    passedToId: z.string(),
    passedToName: z.string(),
    originalAssignedById: z.string(),
  }),
});
export const TourAssignmentAcceptedEvt = Envelope.extend({
  type: z.literal("evt.tour.assignment_accepted"),
  payload: z.object({ tourId: z.string(), tcmId: z.string(), leadId: z.string(), originalAssignedById: z.string().optional(), assigneeName: z.string().optional() }),
});
export const TourAssignmentPassedEvt = Envelope.extend({
  type: z.literal("evt.tour.assignment_passed"),
  payload: z.object({
    tourId: z.string(),
    leadId: z.string(),
    passedById: z.string(),
    passedByName: z.string(),
    passedToId: z.string(),
    passedToName: z.string(),
    originalAssignedById: z.string(),
  }),
});

// ---------- Booking events ----------
export const BookingCreatedEvt = Envelope.extend({
  type: z.literal("evt.booking.created"),
  payload: z.object({ booking: BookingEntity }),
});
export const BookingUpdatedEvt = Envelope.extend({
  type: z.literal("evt.booking.updated"),
  payload: z.object({ bookingId: z.string(), patch: z.record(z.string(), z.unknown()) }),
});
export const BookingCancelledEvt = Envelope.extend({
  type: z.literal("evt.booking.cancelled"),
  payload: z.object({ bookingId: z.string() }),
});
export const BookingApprovedEvt = Envelope.extend({
  type: z.literal("evt.booking.approved"),
  payload: z.object({ bookingId: z.string() }),
});
export const BookingMarkedPaidEvt = Envelope.extend({
  type: z.literal("evt.booking.marked_paid"),
  payload: z.object({ bookingId: z.string(), paidRef: z.string() }),
});
export const BookingSharedWithOwnerEvt = Envelope.extend({
  type: z.literal("evt.booking.shared_with_owner"),
  payload: z.object({ bookingId: z.string(), ownerId: z.string() }),
});

// ---------- Tenant events ----------
export const TenantCreatedEvt = Envelope.extend({
  type: z.literal("evt.tenant.created"),
  payload: z.object({ tenant: TenantEntity }),
});
export const TenantUpdatedEvt = Envelope.extend({
  type: z.literal("evt.tenant.updated"),
  payload: z.object({ tenantId: z.string(), patch: z.record(z.string(), z.unknown()) }),
});
export const TenantStatusChangedEvt = Envelope.extend({
  type: z.literal("evt.tenant.status_changed"),
  payload: z.object({ tenantId: z.string(), from: z.string(), to: z.string(), exitDate: z.string().nullable() }),
});

// ---------- Payment events ----------
export const PaymentRecordedEvt = Envelope.extend({
  type: z.literal("evt.payment.recorded"),
  payload: z.object({ payment: PaymentRecord }),
});
export const PaymentUpdatedEvt = Envelope.extend({
  type: z.literal("evt.payment.updated"),
  payload: z.object({ paymentId: z.string(), patch: z.record(z.string(), z.unknown()) }),
});
export const PaymentDeletedEvt = Envelope.extend({
  type: z.literal("evt.payment.deleted"),
  payload: z.object({ paymentId: z.string(), tenantId: z.string() }),
});
export const RentsGeneratedEvt = Envelope.extend({
  type: z.literal("evt.rents.generated"),
  payload: z.object({ month: z.string(), count: z.number() }),
});

// ---------- Alert events ----------
export const AlertRentOverdueEvt = Envelope.extend({
  type: z.literal("evt.alert.rent_overdue"),
  payload: z.object({ alertId: z.string(), title: z.string(), severity: z.string() }),
});
export const AlertBookingApprovalEvt = Envelope.extend({
  type: z.literal("evt.alert.booking_approval"),
  payload: z.object({ alertId: z.string(), title: z.string(), severity: z.string() }),
});
export const AlertTenantExitedEvt = Envelope.extend({
  type: z.literal("evt.alert.tenant_exited"),
  payload: z.object({ alertId: z.string(), title: z.string(), severity: z.string() }),
});

export const DomainEvent = z.discriminatedUnion("type", [
  LeadCreatedEvt,
  LeadUpdatedEvt,
  LeadAssignedEvt,
  LeadStageChangedEvt,
  LeadDeletedEvt,
  LeadAssignmentPendingEvt,
  LeadAssignmentPassedEvt,
  TodoCreatedEvt,
  TodoUpdatedEvt,
  TodoAssignedEvt,
  TodoAcceptedEvt,
  TodoDeclinedEvt,
  TodoCompletedEvt,
  TodoCancelledEvt,
  ActivityLoggedEvt,
  ActivityUpdatedEvt,
  ActivityDeletedEvt,
  TourScheduledEvt,
  TourRescheduledEvt,
  TourCompletedEvt,
  TourCancelledEvt,
  TourUpdatedEvt,
  TourAssignmentAcceptedEvt,
  TourAssignmentPassedEvt,
  BookingCreatedEvt,
  BookingUpdatedEvt,
  BookingCancelledEvt,
  BookingApprovedEvt,
  BookingMarkedPaidEvt,
  BookingSharedWithOwnerEvt,
  TenantCreatedEvt,
  TenantUpdatedEvt,
  TenantStatusChangedEvt,
  PaymentRecordedEvt,
  PaymentUpdatedEvt,
  PaymentDeletedEvt,
  RentsGeneratedEvt,
  AlertRentOverdueEvt,
  AlertBookingApprovalEvt,
  AlertTenantExitedEvt,
]);
export type DomainEvent = z.infer<typeof DomainEvent>;
