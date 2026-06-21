import { describe, it, expect, vi } from "vitest";
import { deriveImpactStage, calculateLastActivityAt } from "./impact-stage-derivation";
import type { Lead, Tour, ActivityLog, FollowUp } from "@/lib/types";
import { differenceInHours } from "date-fns";

describe("impact-stage-derivation", () => {
  const baseLead = {
    id: "lead-1",
    name: "Test Lead",
    phone: "1234567890",
    stage: "new",
    intent: "cold",
    createdAt: new Date().toISOString(),
  } as Lead;

  describe("deriveImpactStage", () => {
    it("should classify dropped as notNeeded", () => {
      const result = deriveImpactStage({ ...baseLead, stage: "dropped" }, new Date().toISOString());
      expect(result.stage).toBe("notNeeded");
    });

    it("should classify booked as booked", () => {
      const result = deriveImpactStage({ ...baseLead, stage: "booked" }, new Date().toISOString());
      expect(result.stage).toBe("booked");
    });

    it("should classify quote-sent as decisionPending", () => {
      const result = deriveImpactStage({ ...baseLead, stage: "quote-sent" }, new Date().toISOString());
      expect(result.stage).toBe("decisionPending");
    });

    it("should classify active tour as tourScheduled", () => {
      const mockTour = { id: "tour-1", leadId: "lead-1", status: "scheduled", scheduledAt: new Date().toISOString() } as Tour;
      const result = deriveImpactStage(baseLead, new Date().toISOString(), mockTour);
      expect(result.stage).toBe("tourScheduled");
    });

    it("should classify hot intent as superHot", () => {
      const result = deriveImpactStage({ ...baseLead, intent: "hot" }, new Date().toISOString());
      expect(result.stage).toBe("superHot");
    });

    it("should classify recent reply as superHot", () => {
      const now = new Date();
      now.setHours(now.getHours() - 10);
      const result = deriveImpactStage({ ...baseLead, lastContactAt: now.toISOString() }, new Date().toISOString());
      expect(result.stage).toBe("superHot");
    });

    it("should classify 48h inactive as stuck", () => {
      const now = new Date();
      now.setHours(now.getHours() - 50); // > 48h ago
      const result = deriveImpactStage(baseLead, now.toISOString());
      expect(result.stage).toBe("stuck");
    });

    it("should classify general active as followUp", () => {
      const now = new Date();
      now.setHours(now.getHours() - 10); // < 48h
      const result = deriveImpactStage(baseLead, now.toISOString());
      // Not hot, not booked, etc => followUp
      expect(result.stage).toBe("followUp");
    });
  });

  describe("calculateLastActivityAt", () => {
    it("should calculate latest from all activity arrays", () => {
      const early = new Date();
      early.setDate(early.getDate() - 5);
      
      const middle = new Date();
      middle.setDate(middle.getDate() - 2);

      const latest = new Date();

      const activities: ActivityLog[] = [
        { id: "act-1", leadId: "lead-1", timestamp: middle.toISOString() } as any
      ];

      const lead = { ...baseLead, createdAt: early.toISOString() };
      
      const result = calculateLastActivityAt(lead, activities, [], []);
      expect(new Date(result).getTime()).toBe(middle.getTime());
    });
  });
});
