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

// Ensure the Enriched format matches ImpactQueue's derived data
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
    
    // Simplistic relevant active tour grabber
    const openTour = leadTours.find(t => t.status === "scheduled" || t.status === "confirmed" || t.status === "on-tour") || leadTours[0];

    const leadQuotes = quotes
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());
    const lastQuote = leadQuotes[0];

    const lastActivityAt = calculateLastActivityAt(lead, activities, followUps, tours);
    const impactStage = deriveImpactStage(lead, lastActivityAt, openTour, lastQuote);
    const workflow = deriveWorkflowState(lead, openTour, !!lastQuote, !!lead.preferredArea /* simplified proxy */, lastActivityAt);
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

export function buildQueueHealthSnapshot(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();
  
  const superHot = enriched.filter(e => e.impactStage.stage === "superHot");
  const followUp = enriched.filter(e => e.impactStage.stage === "followUp");
  const tourScheduled = enriched.filter(e => e.impactStage.stage === "tourScheduled");
  const decisionPending = enriched.filter(e => e.impactStage.stage === "decisionPending");
  
  const currentMonthStr = new Date().toISOString().slice(0, 7); // YYYY-MM
  const bookedThisMonth = enriched.filter(e => e.lead.stage === "booked" && e.lead.stageEnteredAt?.startsWith(currentMonthStr));
  const droppedThisMonth = enriched.filter(e => e.lead.stage === "dropped" && e.lead.stageEnteredAt?.startsWith(currentMonthStr));

  const overdueFollowUps = enriched.filter(e => e.lead.nextFollowUpAt && new Date(e.lead.nextFollowUpAt).getTime() < now);
  const tourFeedbackMissing = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing");
  const noOwner = enriched.filter(e => !e.lead.assignedTcmId);

  return {
    metrics: [
      countAndDrill("Total Active Leads", enriched.filter(e => e.lead.stage !== "dropped" && e.lead.stage !== "booked"), { chip: "all" }),
      countAndDrill("Super Hot", superHot, { chip: "hot" }),
      countAndDrill("Tour Scheduled", tourScheduled, { chip: "all" }),
      countAndDrill("Decision Pending", decisionPending, { chip: "all" }),
      countAndDrill("Booked This Month", bookedThisMonth, { chip: "all" })
    ],
    bottlenecks: [
      countAndDrill("Overdue Follow-Ups", overdueFollowUps, { actionRequired: ["no-next-action"] }), // approx
      countAndDrill("Tour Feedback Missing", tourFeedbackMissing, { actionRequired: [] }),
      countAndDrill("Quote Pending", quotePending, { chip: "quote-pending" }),
      countAndDrill("No Owner Assigned", noOwner, { assignment: ["unassigned"] })
    ]
  };
}

export function buildConversionOpportunitiesToday(enriched: EnrichedPerformanceLead[]) {
  const tourFeedback = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing");
  const negotiationActive = enriched.filter(e => e.lead.stage === "negotiation");
  const moveIn7 = enriched.filter(e => e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);
  const bookingPending = enriched.filter(e => e.workflow.pendingItem === "booking-pending" || e.workflow.pendingItem === "negotiation-pending");

  return [
    countAndDrill("Tour Feedback Missing", tourFeedback, { actionRequired: [] }),
    countAndDrill("Quote Pending", quotePending, { chip: "quote-pending" }),
    countAndDrill("Negotiation Active", negotiationActive, { chip: "all" }),
    countAndDrill("Move-In < 7 Days", moveIn7, { moveIn: ["movein-0-7"] }),
    countAndDrill("Booking Pending", bookingPending, { chip: "all" })
  ];
}

export function buildBusinessImpact(enriched: EnrichedPerformanceLead[]) {
  const expectedCheckIns = enriched.filter(e => e.lead.stage === "booked" && e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);
  const moveIns7 = enriched.filter(e => e.lead.stage !== "booked" && e.lead.stage !== "dropped" && e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);
  const hotNoTour = enriched.filter(e => e.lead.intent === "hot" && (!e.openTour || e.openTour.status === "cancelled" || e.openTour.status === "no-show"));
  const tourAwaitingFeedback = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotesAwaitingDecision = enriched.filter(e => e.lead.stage === "quote-sent" || e.lead.stage === "negotiation");

  return [
    countAndDrill("Expected Check-ins", expectedCheckIns, { chip: "all" }),
    countAndDrill("Move-ins in Next 7 Days", moveIns7, { moveIn: ["movein-0-7"] }),
    countAndDrill("Hot Leads Without Tour", hotNoTour, { chip: "hot" }),
    countAndDrill("Tours Awaiting Feedback", tourAwaitingFeedback, { actionRequired: [] }),
    countAndDrill("Quotes Awaiting Decision", quotesAwaitingDecision, { chip: "quote-pending" })
  ];
}

export function buildWorkflowSLA(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();
  const noAct24 = enriched.filter(e => differenceInHours(now, new Date(e.lastActivityAt)) > 24);
  const noAct48 = enriched.filter(e => differenceInHours(now, new Date(e.lastActivityAt)) > 48);
  const noAct72 = enriched.filter(e => differenceInHours(now, new Date(e.lastActivityAt)) > 72);
  
  const tfMissing12 = enriched.filter(e => {
    if (e.workflow.pendingItem !== "tour-feedback-missing" || !e.openTour) return false;
    return differenceInHours(now, new Date(e.openTour.scheduledAt)) > 12;
  });
  
  const quotePending24 = enriched.filter(e => {
    if (e.workflow.pendingItem !== "quote-missing" || !e.openTour) return false;
    return differenceInHours(now, new Date(e.openTour.scheduledAt)) > 24;
  });

  return [
    countAndDrill("No Activity > 24h", noAct24, { actionRequired: ["no-activity-24h"] }),
    countAndDrill("No Activity > 48h", noAct48, { actionRequired: ["no-activity-48h"] }),
    countAndDrill("No Activity > 72h", noAct72, { actionRequired: ["no-activity-72h"] }),
    countAndDrill("Tour Feedback Missing > 12h", tfMissing12, { actionRequired: [] }),
    countAndDrill("Quote Pending > 24h", quotePending24, { chip: "quote-pending" }),
  ];
}

export function buildTodaysFocus(enriched: EnrichedPerformanceLead[]) {
  const deepProfile = enriched.filter(e => e.workflow.pendingItem === "deep-profile-missing");
  const propNotSelected = enriched.filter(e => e.workflow.pendingItem === "property-not-selected");
  const tourFeedback = enriched.filter(e => e.workflow.pendingItem === "tour-feedback-missing");
  const quotePending = enriched.filter(e => e.workflow.pendingItem === "quote-missing");
  const moveIn7 = enriched.filter(e => e.lead.moveInDate && differenceInDays(new Date(e.lead.moveInDate), new Date()) <= 7 && differenceInDays(new Date(e.lead.moveInDate), new Date()) >= 0);

  return [
    countAndDrill("Deep Profile Missing", deepProfile, { qualification: ["profile-incomplete"] }),
    countAndDrill("Property Not Selected", propNotSelected, { propertyStatus: ["property-not-selected"] }),
    countAndDrill("Tour Feedback Missing", tourFeedback, { actionRequired: [] }),
    countAndDrill("Quote Pending", quotePending, { chip: "quote-pending" }),
    countAndDrill("Move-In < 7 Days", moveIn7, { moveIn: ["movein-0-7"] })
  ].sort((a, b) => b.count - a.count);
}

export function buildTopAtRiskLeads(enriched: EnrichedPerformanceLead[]) {
  const now = Date.now();
  const atRisk = enriched.filter(e => {
    const moveIn = e.lead.moveInDate ? differenceInDays(new Date(e.lead.moveInDate), new Date()) : Infinity;
    const noAct = differenceInHours(now, new Date(e.lastActivityAt)) > 48;
    return (moveIn >= 0 && moveIn <= 7) || noAct || e.workflow.pendingItem === "tour-feedback-missing" || e.workflow.pendingItem === "quote-missing" || !e.lead.assignedTcmId;
  });

  return atRisk.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 20).map(e => {
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

function formatWorkflowLabel(id: string): string {
  return id.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function buildWorkflowHealth(enriched: EnrichedPerformanceLead[]) {
  const missingByItem = new Map<string, EnrichedPerformanceLead[]>();
  for (const e of enriched) {
    if (e.lead.stage === "booked" || e.lead.stage === "dropped") continue;
    const item = e.workflow.pendingItem;
    if (!missingByItem.has(item)) missingByItem.set(item, []);
    missingByItem.get(item)!.push(e);
  }
  
  const result: MetricDrilldown[] = [];
  missingByItem.forEach((leads, item) => {
    result.push(countAndDrill(formatWorkflowLabel(item), leads, { actionRequired: [] })); // exact filter payloads need mapping later
  });
  return result.sort((a, b) => b.count - a.count);
}

export function buildStageAging(enriched: EnrichedPerformanceLead[]) {
  const stages = ["new", "contacted", "tour-scheduled", "tour-done", "negotiation"];
  const now = Date.now();
  
  return stages.map(stage => {
    const stageLeads = enriched.filter(e => e.lead.stage === stage);
    
    const day0_1 = stageLeads.filter(e => differenceInDays(now, new Date(e.lead.stageEnteredAt || e.lead.createdAt)) <= 1);
    const day2_3 = stageLeads.filter(e => {
       const d = differenceInDays(now, new Date(e.lead.stageEnteredAt || e.lead.createdAt));
       return d > 1 && d <= 3;
    });
    const day4_7 = stageLeads.filter(e => {
       const d = differenceInDays(now, new Date(e.lead.stageEnteredAt || e.lead.createdAt));
       return d > 3 && d <= 7;
    });
    const day7plus = stageLeads.filter(e => differenceInDays(now, new Date(e.lead.stageEnteredAt || e.lead.createdAt)) > 7);

    return {
      stage: formatWorkflowLabel(stage),
      total: stageLeads.length,
      day0_1: countAndDrill("0-1 Day", day0_1, { chip: "all" }),
      day2_3: countAndDrill("2-3 Days", day2_3, { chip: "all" }),
      day4_7: countAndDrill("4-7 Days", day4_7, { chip: "all" }),
      day7plus: countAndDrill("7+ Days", day7plus, { chip: "all" }),
    };
  });
}

export function buildPipelineHealth(enriched: EnrichedPerformanceLead[]) {
  let leadToTourSum = 0, leadToTourCount = 0;
  let tourToQuoteSum = 0, tourToQuoteCount = 0;
  let quoteToBookSum = 0, quoteToBookCount = 0;

  for (const e of enriched) {
    if (e.lead.stage === "tour-done" || e.lead.stage === "negotiation" || e.lead.stage === "booked") {
      const created = new Date(e.lead.createdAt).getTime();
      const tourDate = e.openTour ? new Date(e.openTour.scheduledAt).getTime() : created + 86400000*2;
      const diff = Math.max(0, differenceInDays(tourDate, created));
      leadToTourSum += diff;
      leadToTourCount++;
    }

    if (e.lead.stage === "quote-sent" || e.lead.stage === "negotiation" || e.lead.stage === "booked") {
      const tourDate = e.openTour ? new Date(e.openTour.scheduledAt).getTime() : new Date(e.lead.createdAt).getTime();
      const quoteDate = e.lastQuote ? new Date(e.lastQuote.sentAt).getTime() : tourDate + 86400000;
      const diff = Math.max(0, differenceInDays(quoteDate, tourDate));
      tourToQuoteSum += diff;
      tourToQuoteCount++;
    }

    if (e.lead.stage === "booked") {
      const quoteDate = e.lastQuote ? new Date(e.lastQuote.sentAt).getTime() : new Date(e.lead.createdAt).getTime();
      const bookDate = new Date(e.lead.stageEnteredAt || e.lead.updatedAt).getTime();
      const diff = Math.max(0, differenceInDays(bookDate, quoteDate));
      quoteToBookSum += diff;
      quoteToBookCount++;
    }
  }

  const missingByItem = new Map<string, EnrichedPerformanceLead[]>();
  for (const e of enriched) {
    if (e.lead.stage === "booked" || e.lead.stage === "dropped") continue;
    const item = e.workflow.pendingItem;
    if (!missingByItem.has(item)) missingByItem.set(item, []);
    missingByItem.get(item)!.push(e);
  }
  
  let biggestBottleneck = { label: "None", leads: [] as EnrichedPerformanceLead[] };
  missingByItem.forEach((leads, item) => {
    if (leads.length > biggestBottleneck.leads.length) biggestBottleneck = { label: formatWorkflowLabel(item), leads };
  });

  return {
    velocity: {
      leadToTour: leadToTourCount ? Math.round((leadToTourSum / leadToTourCount) * 10) / 10 : 0,
      tourToQuote: tourToQuoteCount ? Math.round((tourToQuoteSum / tourToQuoteCount) * 10) / 10 : 0,
      quoteToBook: quoteToBookCount ? Math.round((quoteToBookSum / quoteToBookCount) * 10) / 10 : 0,
    },
    biggestBottleneck: countAndDrill(biggestBottleneck.label, biggestBottleneck.leads, { actionRequired: [] })
  };
}

export function buildTourPerformance(enriched: EnrichedPerformanceLead[], tours: Tour[]) {
  const at = Date.now();
  const scheduled = tours.filter(t => t.status === "scheduled" && new Date(t.scheduledAt).getTime() >= at);
  const completed = tours.filter(t => t.status === "completed" || t.decision);
  const noShow = tours.filter(t => t.status === "no-show");
  const cancelled = tours.filter(t => t.status === "cancelled");
  // Rescheduled is typically tracked via multiple tours or activity logs, assuming a basic filter for now
  const feedbackMissing = tours.filter(t => t.status === "scheduled" && new Date(t.scheduledAt).getTime() < at && !t.decision);
  
  const mapDrill = (label: string, tourArr: Tour[]) => {
    const leadIds = Array.from(new Set(tourArr.map(t => t.leadId)));
    return { label, count: tourArr.length, filterPayload: { chip: "all" } as Partial<QueueFilters>, leadIds };
  };

  return [
    mapDrill("Scheduled", scheduled),
    mapDrill("Completed", completed),
    mapDrill("No Show", noShow),
    mapDrill("Cancelled", cancelled),
    mapDrill("Feedback Missing", feedbackMissing)
  ];
}

export function buildTCMLeaderboard(enriched: EnrichedPerformanceLead[], tcms: TCM[]) {
  const result = tcms.map(tcm => {
    const tcmLeads = enriched.filter(e => e.lead.assignedTcmId === tcm.id);
    const leadsCount = tcmLeads.length;
    const toursCount = tcmLeads.filter(e => e.openTour).length;
    const quotesCount = tcmLeads.filter(e => e.lastQuote).length;
    const bookingsCount = tcmLeads.filter(e => e.lead.stage === "booked").length;
    
    const leadToTour = leadsCount > 0 ? Math.round((toursCount / leadsCount) * 100) : 0;
    const tourToQuote = toursCount > 0 ? Math.round((quotesCount / toursCount) * 100) : 0;
    const quoteToBook = quotesCount > 0 ? Math.round((bookingsCount / quotesCount) * 100) : 0;

    return {
      tcm,
      drilldown: countAndDrill("Leads", tcmLeads, { assignment: [tcm.id] }),
      leads: leadsCount,
      tours: toursCount,
      quotes: quotesCount,
      bookings: bookingsCount,
      leadToTour,
      tourToQuote,
      quoteToBook
    };
  });
  
  return result.sort((a, b) => b.bookings - a.bookings || b.leadToTour - a.leadToTour);
}

export function buildLeadOwnershipRisk(enriched: EnrichedPerformanceLead[]) {
  const noAssigned = enriched.filter(e => !e.lead.assignedTcmId);
  const noFollowUpOwner = enriched.filter(e => e.lead.nextFollowUpAt && !e.lead.assignedTcmId); // simplified
  const noTourOwner = enriched.filter(e => e.openTour && !e.openTour.tcmId && !e.lead.assignedTcmId); // simplified

  return [
    countAndDrill("No Assigned TCM", noAssigned, { assignment: ["unassigned"] }),
    countAndDrill("No Follow-Up Owner", noFollowUpOwner, { actionRequired: [] }),
    countAndDrill("No Tour Owner", noTourOwner, { actionRequired: [] })
  ];
}
