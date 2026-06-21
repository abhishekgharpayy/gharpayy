import type { Lead, Tour } from "@/lib/types";

export interface WorkflowCompletion {
  deepProfileComplete: boolean;
  budgetVerified: boolean;
  propertySelected: boolean;
  tourScheduled: boolean;
  tourCompleted: boolean;
  quoteSent: boolean;
  negotiationStarted: boolean;
  bookingCompleted: boolean;
}

export function deriveWorkflowCompletion(
  lead: Lead,
  openTour: Tour | undefined,
  hasQuote: boolean,
  hasPropertySelected: boolean,
): WorkflowCompletion {
  return {
    deepProfileComplete: Boolean(lead.moveInDate && lead.preferredArea),
    budgetVerified: Boolean(lead.budget && lead.budget > 0),
    propertySelected: hasPropertySelected,
    tourScheduled: Boolean(openTour && new Date(openTour.scheduledAt).getTime() >= Date.now()),
    tourCompleted: Boolean(openTour && (openTour.status === "completed" || openTour.decision)),
    quoteSent: hasQuote || lead.stage === "quote-sent",
    negotiationStarted: lead.stage === "negotiation",
    bookingCompleted: lead.stage === "booked",
  };
}
