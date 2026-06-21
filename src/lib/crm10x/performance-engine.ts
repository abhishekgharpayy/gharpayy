import { differenceInHours, differenceInDays, isToday, isThisWeek } from "date-fns";
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

export function buildMyTeamNeedsAttentionSummary(enriched: EnrichedPerformanceLead[], tours: Tour[]) {
  const activeLeads = enriched.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked").length;
  const toursToday = tours.filter(t => isToday(new Date(t.scheduledAt))).length;
  const toursCompletedToday = tours.filter(t => isToday(new Date(t.scheduledAt)) && t.status === "completed").length;
  
  const tfPending = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing").length;
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing").length;
  
  const bookingsToday = enriched.filter(e => e.lead.stage === "booked" && e.lead.stageEnteredAt && isToday(new Date(e.lead.stageEnteredAt))).length;

  return { activeLeads, toursToday, toursCompletedToday, tfPending, quotePending, bookingsToday };
}

export function buildTodayNeedsAttention(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();

  const tourFeedback = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing");
  const moveIn7 = enriched.filter(e => e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);
  const noAct48 = enriched.filter(e => differenceInHours(now, new Date(e.lastActivityAt)) > 48);
  const unassigned = enriched.filter(e => !e.lead.assignedTcmId);
  const tourNotScheduled = enriched.filter(e => e.workflow.pendingItem === "tour-not-scheduled");

  return [
    countAndDrill("Feedback Missing", tourFeedback, { quickFilters: ["feedback-missing"] }),
    countAndDrill("Quote Pending", quotePending, { quickFilters: ["quote-pending"] }),
    countAndDrill("Move-In < 7 Days", moveIn7, { quickFilters: ["movein-0-7"] }),
    countAndDrill("No Activity > 48h", noAct48, { quickFilters: ["no-activity-48h"] }),
    countAndDrill("Unassigned", unassigned, { status: "unassigned" }),
    countAndDrill("Tour Not Scheduled", tourNotScheduled, { quickFilters: [] })
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

  const parsed = atRisk.map(e => {
    let issue = "Unknown";
    let priorityStr = "Medium";
    let priorityNum = 3; // Lower is higher priority
    
    const moveInDays = e.lead.moveInDate ? differenceInDays(new Date(e.lead.moveInDate), new Date()) : null;
    const noAct = differenceInHours(now, new Date(e.lastActivityAt)) > 48;

    if (moveInDays !== null && moveInDays >= 0 && moveInDays <= 7) {
      issue = "Move-In < 7 Days";
      priorityStr = "Critical";
      priorityNum = 1;
    } else if (e.workflow.pendingItem === "tour-feedback-missing") {
      issue = "Tour Feedback Missing";
      priorityStr = "High";
      priorityNum = 2;
    } else if (e.workflow.pendingItem === "quote-missing") {
      issue = "Quote Pending";
      priorityStr = "High";
      priorityNum = 2;
    } else if (noAct) {
      issue = "No Activity > 48h";
      priorityStr = "Medium";
      priorityNum = 3;
    } else if (!e.lead.assignedTcmId) {
      issue = "No Owner";
      priorityStr = "Medium";
      priorityNum = 4;
    } else {
      issue = formatWorkflowLabel(e.workflow.pendingItem);
      priorityStr = "Medium";
      priorityNum = 5;
    }
    
    return {
      lead: e.lead,
      moveInDays,
      issue,
      priority: priorityStr as "Critical" | "High" | "Medium",
      priorityNum,
      ownerId: e.lead.assignedTcmId
    };
  });

  return parsed.sort((a, b) => {
    if (a.priorityNum !== b.priorityNum) return a.priorityNum - b.priorityNum;
    return a.moveInDays !== null && b.moveInDays !== null ? a.moveInDays - b.moveInDays : 0;
  });
}

export function buildTCMLeaderboard(enriched: EnrichedPerformanceLead[], tcms: TCM[], hideInactive: boolean) {
  const result = tcms.map(tcm => {
    const tcmLeads = enriched.filter(e => e.lead.assignedTcmId === tcm.id);
    const activeLeadsCount = tcmLeads.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked").length;
    
    const pendingActions = tcmLeads.filter(e => {
       const w = e.workflow.pendingItem;
       return w === "tour-feedback-missing" || w === "quote-missing" || w === "deep-profile-missing" || w === "tour-not-scheduled";
    }).length;
    
    const feedbackPending = tcmLeads.filter(e => e.workflow.pendingItem === "tour-feedback-missing").length;

    const bookingsThisWeek = tcmLeads.filter(e => e.lead.stage === "booked" && e.lead.stageEnteredAt && isThisWeek(new Date(e.lead.stageEnteredAt))).length;

    return {
      tcm,
      drilldown: countAndDrill("Leads", tcmLeads, { assignment: tcm.id }),
      activeLeads: activeLeadsCount,
      feedbackPending,
      pendingActions,
      bookingsThisWeek,
    };
  });
  
  let sorted = result.sort((a, b) => b.bookingsThisWeek - a.bookingsThisWeek || b.pendingActions - a.pendingActions);
  
  if (hideInactive) {
    sorted = sorted.filter(r => r.activeLeads > 0);
  }
  
  return sorted;
}
