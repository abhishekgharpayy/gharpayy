import type { TCM, Property, Lead, Tour, ActivityLog, FollowUp, HandoffMessage, ActiveSequence } from "./types";

export const TCMS: TCM[] = [
  { id: "tcm1", name: "Alice Johnson", initials: "AJ", zone: "North", conversionRate: 0.15, avgResponseMins: 10 },
  { id: "tcm2", name: "Bob Smith", initials: "BS", zone: "South", conversionRate: 0.22, avgResponseMins: 5 },
  { id: "tcm3", name: "Charlie Davis", initials: "CD", zone: "East", conversionRate: 0.18, avgResponseMins: 12 },
];

export const PROPERTIES: Property[] = [];

// Generate 50 realistic Leads
export const LEADS: Lead[] = Array.from({ length: 50 }).map((_, i) => {
  const stages: Array<Lead["stage"]> = ["new", "contacted", "tour-scheduled", "on-tour", "tour-done", "negotiation", "quote-sent", "booked", "dropped"];
  return {
    id: `lead_${i + 1}`,
    name: `Test Lead ${i + 1}`,
    phone: `+9198765432${String(i).padStart(2, '0')}`,
    source: "Website",
    budget: 15000,
    moveInDate: new Date().toISOString(),
    preferredArea: "Downtown",
    assignedTcmId: TCMS[i % 3].id,
    stage: stages[Math.floor(Math.random() * stages.length)],
    intent: "warm",
    confidence: Math.random() * 100,
    tags: [],
    nextFollowUpAt: null,
    responseSpeedMins: 10,
    createdAt: new Date(Date.now() - Math.random() * 30 * 86400000).toISOString(),
    updatedAt: new Date().toISOString(),
  };
});

export const TOURS: Tour[] = [];
export const ACTIVITIES: ActivityLog[] = [];

// Generate 150 FollowUps
export const FOLLOWUPS: FollowUp[] = Array.from({ length: 150 }).map((_, i) => {
  const lead = LEADS[Math.floor(Math.random() * LEADS.length)];
  const isDone = Math.random() > 0.4; // 60% completion rate
  const now = Date.now();
  const dueAtMs = now - (10 * 86400000) + (Math.random() * 15 * 86400000); 
  const reasons = ["initial_contact", "schedule_tour", "post_tour_feedback", "negotiation", "payment_reminder", "check_in"];
  
  return {
    id: `task_${i + 1}`,
    leadId: lead.id,
    tcmId: lead.assignedTcmId,
    dueAt: new Date(dueAtMs).toISOString(),
    priority: Math.random() > 0.8 ? "high" : "medium",
    reason: reasons[Math.floor(Math.random() * reasons.length)],
    done: isDone,
  };
});

export const HANDOFFS: HandoffMessage[] = [];
export const SEQUENCES_INIT: ActiveSequence[] = [];
