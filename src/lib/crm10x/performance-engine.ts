import { differenceInHours, differenceInDays } from "date-fns";
import type { Lead, Tour, ActivityLog, FollowUp, TCM } from "@/lib/types";
import { deriveImpactStage, calculateLastActivityAt, derivePriorityScore, deriveNextAction } from "./impact-stage-derivation";
import { deriveWorkflowState } from "./workflow-navigation";
import type { QueueFilters } from "@/components/impact/ImpactQueueHeaderControls";

export interface MetricDrilldown {
  label: string;
  count: number;
  filterPayload: Partial<QueueFilters>;
  leadIds: string[];
}

export type EnrichedPerformanceLead = {
  lead: Lead;
  openTour?: Tour;
  lastQuote?: any;
  lastActivityAt: string;
  impactStage: { stage: string; reason: string };
  workflow: ReturnType<typeof deriveWorkflowState>;
  priorityScore: number;
};

export function buildEnrichedPerformanceLeads(
  leads: Lead[],
  tours: Tour[],
  quotes: any[],
  activities: ActivityLog[],
  followUps: FollowUp[]
): EnrichedPerformanceLead[] {
  const at = Date.now();
  return leads.map((lead) => {
    const leadTours = tours
      .filter((t) => t.leadId === lead.id)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime());
    
    const openTour = leadTours.find(t => t.status === "scheduled" || t.status === "confirmed" || t.status === "on-tour") || leadTours[0];

    const leadQuotes = quotes
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    const lastQuote = leadQuotes[0];

    const lastActivityAt = calculateLastActivityAt(lead, activities, followUps, tours);
    const impactStage = deriveImpactStage(lead, lastActivityAt, openTour, lastQuote);
    const workflow = deriveWorkflowState(lead, openTour, !!lastQuote, !!lead.preferredArea, lastActivityAt);
    const priorityScore = derivePriorityScore(lead, lastActivityAt, openTour, lastQuote);

    return {
      lead,
      openTour,
      lastQuote,
      lastActivityAt,
      impactStage,
      workflow,
      priorityScore
    };
  });
}

function countAndDrill(label: string, leads: EnrichedPerformanceLead[], filterPayload: Partial<QueueFilters>): MetricDrilldown {
  return {
    label,
    count: leads.length,
    filterPayload,
    leadIds: leads.map(e => e.lead.id)
  };
}

export function buildMyTeamNeedsAttentionSummary(enriched: EnrichedPerformanceLead[]) {
  const activeLeads = enriched.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked").length;
  const tfMissing = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing").length;
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing").length;
  
  // Move-ins this week (0-7 days)
  const moveIn7 = enriched.filter(e => e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0).length;
  
  const unassigned = enriched.filter(e => !e.lead.assignedTcmId).length;

  return { activeLeads, tfMissing, quotePending, moveIn7, unassigned };
}

export function buildTodayNeedsAttention(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();

  const tourFeedback = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing");
  const moveIn7 = enriched.filter(e => e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);
  const noAct48 = enriched.filter(e => differenceInHours(now, new Date(e.lastActivityAt)) > 48);
  const unassigned = enriched.filter(e => !e.lead.assignedTcmId);
  
  const propNotSelected = enriched.filter(e => e.workflow.pendingItem === "property-not-selected");
  const tourNotScheduled = enriched.filter(e => e.workflow.pendingItem === "tour-not-scheduled");

  return [
    countAndDrill("Feedback Missing", tourFeedback, { actionRequired: [] }),
    countAndDrill("Quote Pending", quotePending, { chip: "quote-pending" }),
    countAndDrill("Move-In < 7 Days", moveIn7, { moveIn: ["movein-0-7"] }),
    countAndDrill("No Activity > 48h", noAct48, { actionRequired: ["no-activity-48h"] }),
    countAndDrill("Unassigned", unassigned, { assignment: ["unassigned"] }),
    countAndDrill("Property Not Selected", propNotSelected, { propertyStatus: ["property-not-selected"] }),
    countAndDrill("Tour Not Scheduled", tourNotScheduled, { actionRequired: [] })
  ];
}

function formatWorkflowLabel(id: string): string {
  return id.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function buildTopAtRiskLeads(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();
  const atRisk = enriched.filter(e => {
    const moveIn = e.lead.moveInDate ? differenceInDays(new Date(e.lead.moveInDate), new Date()) : Infinity;
    const noAct = differenceInHours(now, new Date(e.lastActivityAt)) > 48;
    return (moveIn >= 0 && moveIn <= 7) || noAct || e.workflow.pendingItem === "tour-feedback-missing" || e.workflow.pendingItem === "quote-missing" || !e.lead.assignedTcmId;
  });

  return atRisk.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 10).map(e => {
    let issue = "Unknown";
    if (!e.lead.assignedTcmId) issue = "No Owner";
    else if (e.workflow.pendingItem === "tour-feedback-missing") issue = "Tour Feedback Missing";
    else if (e.workflow.pendingItem === "quote-missing") issue = "Quote Pending";
    else if (differenceInHours(now, new Date(e.lastActivityAt)) > 48) issue = "No Activity > 48h";
    else if (e.workflow.pendingItem === "deep-profile-missing") issue = "Deep Profile Missing";
    else issue = formatWorkflowLabel(e.workflow.pendingItem);
    
    const moveInDays = e.lead.moveInDate ? differenceInDays(new Date(e.lead.moveInDate), new Date()) : null;

    return {
      lead: e.lead,
      moveInDays,
      issue,
      ownerId: e.lead.assignedTcmId
    };
  });
}

export function buildTCMLeaderboard(enriched: EnrichedPerformanceLead[], tcms: TCM[], hideInactive: boolean) {
  const result = tcms.map(tcm => {
    const tcmLeads = enriched.filter(e => e.lead.assignedTcmId === tcm.id);
    const leadsCount = tcmLeads.length;
    const toursCount = tcmLeads.filter(e => e.openTour).length;
    const bookingsCount = tcmLeads.filter(e => e.lead.stage === "booked").length;
    const conversion = leadsCount > 0 ? Math.round((bookingsCount / leadsCount) * 100) : 0;

    return {
      tcm,
      drilldown: countAndDrill("Leads", tcmLeads, { assignment: [tcm.id] }),
      leads: leadsCount,
      tours: toursCount,
      bookings: bookingsCount,
      conversion
    };
  });
  
  let sorted = result.sort((a, b) => b.bookings - a.bookings || b.leads - a.leads);
  
  if (hideInactive) {
    sorted = sorted.filter(r => r.leads > 0);
  }
  
  return sorted.slice(0, 10);
}
