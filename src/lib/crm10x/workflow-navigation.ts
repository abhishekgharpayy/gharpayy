import type { Lead, Tour } from "@/lib/types";
import { differenceInDays } from "date-fns";
import { deriveWorkflowCompletion } from "./workflow-completion";

export interface WorkflowNavigationState {
  currentStep: string;
  pendingItem: string;
  nextAction: string;
  destinationTab: string;
  destinationSection: string;
  destinationField: string;
  sortingScore: number;
  pendingDurationDays: number;
}

export function deriveWorkflowState(
  lead: Lead,
  openTour: Tour | undefined,
  hasQuote: boolean,
  hasPropertySelected: boolean,
  lastActivityAt: string
): WorkflowNavigationState {
  const completion = deriveWorkflowCompletion(lead, openTour, hasQuote, hasPropertySelected);

  const referenceDate = lead.stageEnteredAt || lead.updatedAt || lead.createdAt;
  const stuckHours = (Date.now() - new Date(referenceDate).getTime()) / (1000 * 60 * 60);
  const pendingDurationDays = Math.max(0, Math.floor(stuckHours / 24));
  
  let urgencyScore = 0;
  if (lead.moveInDate) {
    const daysToMoveIn = differenceInDays(new Date(lead.moveInDate), new Date());
    if (daysToMoveIn >= 0 && daysToMoveIn <= 3) urgencyScore = 1000;
    else if (daysToMoveIn <= 7) urgencyScore = 800;
    else if (daysToMoveIn <= 15) urgencyScore = 600;
    else if (daysToMoveIn <= 30) urgencyScore = 400;
  }
  const sortingScore = urgencyScore + pendingDurationDays;

  // Base state
  let state: Omit<WorkflowNavigationState, 'sortingScore' | 'pendingDurationDays'> = {
    currentStep: "qualification",
    pendingItem: "deep-profile-missing",
    nextAction: "complete-profile",
    destinationTab: "impact",
    destinationSection: "deep-profile",
    destinationField: "default"
  };

  const isVisitReady = lead.tags?.includes("impact:visit-ready") ?? false;

  if (lead.stage === "dropped") {
    state = { currentStep: "not-needed", pendingItem: "lead-dropped", nextAction: "none", destinationTab: "impact", destinationSection: "none", destinationField: "none" };
  } else if (completion.bookingCompleted || lead.stage === "booked") {
    state = { currentStep: "booked", pendingItem: "booking-pending", nextAction: "prepare-check-in", destinationTab: "checkin", destinationSection: "checkin", destinationField: "checkin" };
  } else if (!isVisitReady && !lead.moveInDate) { // using moveInDate as proxy for basic deep profile
    state = { currentStep: "qualification", pendingItem: "deep-profile-missing", nextAction: "add-move-in-date", destinationTab: "impact", destinationSection: "deep-profile", destinationField: "move-in-date" };
  } else if (!isVisitReady && !completion.budgetVerified) {
    state = { currentStep: "qualification", pendingItem: "budget-missing", nextAction: "verify-budget", destinationTab: "impact", destinationSection: "deep-profile", destinationField: "budget-stated" };
  } else if (!isVisitReady && !lead.preferredArea) {
    state = { currentStep: "qualification", pendingItem: "preferred-area-missing", nextAction: "add-preferred-area", destinationTab: "impact", destinationSection: "deep-profile", destinationField: "preferred-area" };
  } else if (!isVisitReady && !completion.propertySelected) {
    state = { currentStep: "qualification", pendingItem: "property-not-selected", nextAction: "select-property", destinationTab: "impact", destinationSection: "property-selector", destinationField: "property-search" };
  } else if (!openTour && !completion.tourCompleted) {
    state = { currentStep: "tour", pendingItem: "tour-not-scheduled", nextAction: "schedule-tour", destinationTab: "tour", destinationSection: "schedule-tour", destinationField: "tour-date" };
  } else if (openTour && new Date(openTour.scheduledAt).getTime() < Date.now() && !completion.tourCompleted) {
    state = { currentStep: "tour", pendingItem: "tour-feedback-missing", nextAction: "complete-tour-outcome", destinationTab: "tour", destinationSection: "tour-outcome", destinationField: "tour-feedback" };
  } else if (openTour && openTour.status === "no-show") {
    state = { currentStep: "tour", pendingItem: "tour-feedback-missing", nextAction: "complete-tour-outcome", destinationTab: "tour", destinationSection: "tour-outcome", destinationField: "tour-feedback" };
  } else if (openTour && new Date(openTour.scheduledAt).getTime() >= Date.now() && !completion.tourCompleted) {
    state = { currentStep: "tour", pendingItem: "tour-pending", nextAction: "prepare-tour", destinationTab: "tour", destinationSection: "upcoming-tour", destinationField: "none" };
  } else if (completion.tourCompleted && !completion.quoteSent) {
    state = { currentStep: "decision-pending", pendingItem: "quote-missing", nextAction: "send-quote", destinationTab: "quote", destinationSection: "quote-builder", destinationField: "quote-builder" };
  } else if (completion.quoteSent) {
    state = { currentStep: "decision-pending", pendingItem: "negotiation-pending", nextAction: "negotiate", destinationTab: "negotiation", destinationSection: "negotiation", destinationField: "negotiation" };
  }

  return { ...state, sortingScore, pendingDurationDays };
}

export function formatWorkflowLabel(id: string): string {
  return id.split("-").map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}
