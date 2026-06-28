import type { Lead, Tour } from "@/lib/types";
import { type ColumnKey, type ImpactEnriched } from "@/components/impact/impact-queue-types";
import { differenceInHours, differenceInDays } from "date-fns";

export function calculateLastActivityAt(
  lead: Lead,
  activities: any[],
  followUps: any[],
  tours: Tour[]
): string {
  let latest = new Date(lead.createdAt).getTime();

  if (lead.updatedAt) {
    const updated = new Date(lead.updatedAt).getTime();
    if (updated > latest) latest = updated;
  }
  
  if (lead.lastContactAt) {
    const contacted = new Date(lead.lastContactAt).getTime();
    if (contacted > latest) latest = contacted;
  }

  // Check activities
  for (const act of activities) {
    if (act.leadId === lead.id) {
      const actTime = new Date(act.timestamp || act.createdAt || 0).getTime();
      if (actTime > latest) latest = actTime;
    }
  }

  // Check tours updates
  for (const tour of tours) {
    if (tour.leadId === lead.id) {
      if (tour.updatedAt) {
        const tTime = new Date(tour.updatedAt).getTime();
        if (tTime > latest) latest = tTime;
      }
    }
  }

  // Check followups updates
  for (const fu of followUps) {
    if (fu.leadId === lead.id) {
      if (fu.updatedAt || fu.createdAt) {
        const fuTime = new Date(fu.updatedAt || fu.createdAt || 0).getTime();
        if (fuTime > latest) latest = fuTime;
      }
    }
  }

  return new Date(latest).toISOString();
}

export function deriveImpactStage(
  lead: Lead,
  lastActivityAt: string,
  openTour?: Tour,
  lastQuote?: any
): { stage: ColumnKey; reason: string } {
  // 1. Booked
  if (lead.stage === "booked") {
    return { stage: "booked", reason: "Lead is booked" };
  }

  // 2. Not Needed
  if (lead.stage === "dropped") {
    return { stage: "notNeeded", reason: "Lead is dropped" };
  }

  // 3. Decision Pending
  if (lead.stage === "tour-done" || lead.stage === "quote-sent" || lead.stage === "negotiation") {
    return { stage: "decisionPending", reason: `Lead is in ${lead.stage}` };
  }

  // 4. Tour Scheduled
  if (openTour || lead.stage === "tour-scheduled" || lead.stage === "on-tour") {
    return { stage: "tourScheduled", reason: "Tour is scheduled or ongoing" };
  }

  // 5. Super Hot
  const hoursSinceReply = lead.lastContactAt ? differenceInHours(new Date(), new Date(lead.lastContactAt)) : Infinity;
  const daysToMoveIn = lead.moveInDate ? differenceInDays(new Date(lead.moveInDate), new Date()) : Infinity;
  
  if (
    hoursSinceReply <= 24 ||
    (daysToMoveIn >= 0 && daysToMoveIn <= 7) ||
    lead.intent === "hot"
  ) {
    return { stage: "superHot", reason: "High intent (recent reply, move-in < 7d, or marked hot)" };
  }

  // 6. Stuck
  const hoursSinceActivity = differenceInHours(new Date(), new Date(lastActivityAt));
  if (hoursSinceActivity > 48) {
    return { stage: "stuck", reason: "No activity for > 48h" };
  }
  // Other stuck conditions: missed follow-up (we'd need follow-ups), quote sent but no response (handled by stage? wait, quote-sent is decision pending)
  // We can refine this.

  // 7. Follow-Up
  return { stage: "followUp", reason: "Active lead needing follow-up" };
}

export function derivePriorityScore(
  lead: Lead,
  lastActivityAt: string,
  openTour?: Tour,
  lastQuote?: any
): number {
  let score = 0;
  
  // Base urgency on move-in
  if (lead.moveInDate) {
    const days = differenceInDays(new Date(lead.moveInDate), new Date());
    if (days >= 0 && days <= 3) score += 40;
    else if (days <= 7) score += 25;
    else if (days <= 15) score += 15;
  }
  
  // Heat
  if (lead.intent === "hot") score += 20;
  if (lead.intent === "warm") score += 10;
  
  // Risk (no activity)
  const hoursSinceActivity = differenceInHours(new Date(), new Date(lastActivityAt));
  if (hoursSinceActivity > 48) score += 20;
  else if (hoursSinceActivity > 24) score += 10;
  
  // Quote pending
  if (lead.stage === "quote-sent" || lead.stage === "negotiation") {
    score += 15;
  }
  
  return Math.min(100, score);
}

export function deriveNextAction(
  lead: Lead,
  lastActivityAt: string,
  openTour?: Tour,
  lastQuote?: any
): { action: string; priority: number; reason: string } {
  // Payment pending
  if (lead.stage === "booked") { // Wait, booked usually means won. If payment pending before booked?
     // We will just do a basic one.
  }
  
  if (lead.stage === "negotiation") {
    return { action: "negotiate", priority: 85, reason: "In negotiation" };
  }
  
  if (lead.stage === "tour-done") {
    return { action: "send-quote", priority: 80, reason: "Tour done, quote pending" };
  }
  
  if (lead.stage === "quote-sent") {
    return { action: "follow-up", priority: 75, reason: "Quote sent, follow-up needed" };
  }
  
  if (openTour) {
    return { action: "prepare-tour", priority: 70, reason: "Tour is scheduled" };
  }
  
  if (lead.stage === "new" || !lead.lastContactAt) {
    return { action: "call-now", priority: 90, reason: "Never called" };
  }
  
  return { action: "follow-up", priority: 50, reason: "Regular follow-up" };
}

export interface WorkflowState {
  currentStep: string;
  pendingItem: string;
  nextAction: string;
  clickDestination: string;
  sortingScore: number;
  pendingDurationDays: number;
}

export function deriveWorkflowState(
  lead: Lead,
  openTour: Tour | undefined,
  hasQuote: boolean,
  hasPropertySelected: boolean,
  lastActivityAt: string
): WorkflowState {
  let currentStep = "Qualification";
  let pendingItem = "";
  let nextAction = "";
  let clickDestination = "impact";
  let sortingScore = 0;
  
  const referenceDate = lead.stageEnteredAt || lead.updatedAt || lead.createdAt;
  const stuckHours = (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60);
  const pendingDurationDays = Math.max(0, Math.floor(stuckHours / 24));
  
  const isDeepProfileIncomplete = !lead.moveInDate || !lead.preferredArea;
  const isBudgetNotVerified = !lead.budget;
  const noActivityDays = Math.floor((Date.now() - new Date(lastActivityAt).getTime()) / (1000 * 60 * 60 * 24));

  // Determine Urgency Score component
  let urgencyScore = 0;
  if (lead.moveInDate) {
    const daysToMoveIn = differenceInDays(new Date(lead.moveInDate), new Date());
    if (daysToMoveIn >= 0 && daysToMoveIn <= 3) urgencyScore = 1000;
    else if (daysToMoveIn <= 7) urgencyScore = 800;
    else if (daysToMoveIn <= 15) urgencyScore = 600;
    else if (daysToMoveIn <= 30) urgencyScore = 400;
  }
  sortingScore = urgencyScore + pendingDurationDays;

  if (lead.stage === "dropped") {
     return {
       currentStep: "Not Needed",
       pendingItem: (lead as any).dropReason || "Not Interested",
       nextAction: "",
       clickDestination: "impact",
       sortingScore,
       pendingDurationDays
     };
  }

  if (lead.stage === "booked") {
     return {
       currentStep: "Booked",
       pendingItem: "Move-In Preparation",
       nextAction: "Prepare Check-In",
       clickDestination: "checkin",
       sortingScore,
       pendingDurationDays
     };
  }

  // 1. Check Tour Intelligence First
  if (openTour) {
    const tourTime = new Date(openTour.scheduledAt).getTime();
    const now = Date.now();
    
    if (tourTime < now) {
      if (openTour.status === "completed" || openTour.decision) {
         if (openTour.status === "no-show") {
           currentStep = "Tour";
           pendingItem = "Tour Reschedule Required";
           nextAction = "Reschedule Tour";
           clickDestination = "tour";
         } else if (openTour.decision === "thinking" || openTour.decision === "draft") {
           currentStep = "Decision Pending";
           pendingItem = hasQuote ? "Negotiation Pending" : "Quote Not Sent";
           nextAction = hasQuote ? "Follow Up" : "Send Quote";
           clickDestination = hasQuote ? "negotiation" : "quote";
         } else {
           currentStep = "Decision Pending";
           pendingItem = "Quotation Pending";
           nextAction = "Send Quote";
           clickDestination = "quote";
         }
      } else {
         // Outcome Missing
         currentStep = "Tour";
         pendingItem = "Tour Feedback Missing";
         nextAction = "Complete Tour Outcome";
         clickDestination = "post";
         sortingScore += 5000; // Super high priority
      }
      return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
    } else {
      // Upcoming Tour
      return {
        currentStep: "Tour",
        pendingItem: "Tour Pending",
        nextAction: "Conduct Tour",
        clickDestination: "tour",
        sortingScore,
        pendingDurationDays
      };
    }
  }

  // 2. Decision Pending checks
  if (lead.stage === "quote-sent" || lead.stage === "negotiation" || lead.stage === "tour-done") {
     currentStep = "Decision Pending";
     if (lead.stage === "negotiation") {
       pendingItem = "Negotiation Pending";
       nextAction = "Follow Up";
       clickDestination = "negotiation";
     } else if (lead.stage === "quote-sent" || hasQuote) {
       pendingItem = "Quote Sent";
       nextAction = "Follow-Up For Decision";
       clickDestination = "quote";
     } else {
       pendingItem = "Quote Not Sent";
       nextAction = "Send Quote";
       clickDestination = "quote";
     }
     return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
  }

  // 3. Stuck Checks
  if (noActivityDays >= 3 && lead.stage !== "new") {
     currentStep = "Stuck";
     pendingItem = `No Activity ${noActivityDays} Days`;
     nextAction = "Re-Engage Lead";
     clickDestination = "impact";
     return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
  }

  // 4. Qualification & Profile Checks
  const isVisitReady = lead.tags?.includes("impact:visit-ready") ?? false;

  if (!isVisitReady) {
    if (isDeepProfileIncomplete) {
       currentStep = "Qualification";
       pendingItem = "Deep Profile Incomplete";
       nextAction = "Complete Profile";
       clickDestination = "impact";
       return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
    }

    if (isBudgetNotVerified) {
       currentStep = "Qualification";
       pendingItem = "Budget Not Verified";
       nextAction = "Verify Budget";
       clickDestination = "impact";
       return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
    }

    if (!hasPropertySelected) {
       currentStep = "Qualification";
       pendingItem = "Property Not Selected";
       nextAction = "Select Property";
       clickDestination = "best-fit";
       return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
    }
  }

  if (!openTour) {
     currentStep = "Qualification";
     pendingItem = "Tour Not Scheduled";
     nextAction = "Schedule Tour";
     clickDestination = "tour";
     return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
  }

  // Fallback Follow-up
  currentStep = "Follow-Up";
  if (lead.nextFollowUpAt) {
     const isToday = new Date(lead.nextFollowUpAt).toDateString() === new Date().toDateString();
     pendingItem = isToday ? "Follow-Up Due Today" : "Follow-Up Pending";
  } else {
     pendingItem = "Callback Requested";
  }
  nextAction = "Call Lead";
  clickDestination = "impact";
  
  return { currentStep, pendingItem, nextAction, clickDestination, sortingScore, pendingDurationDays };
}
