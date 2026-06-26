import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export interface AdminLeadRow {
  lead: {
    _id: string;
    id?: string;
    name: string;
    phone: string;
    source: string;
    stage: string;
    intent: string;
    confidence: number;
    budget: number;
    preferredArea: string;
    assignedTcmId: string | null;
    createdAt: string;
    updatedAt: string;
    createdBy?: string;
    tags?: string[];
    [key: string]: unknown;
  };
  tcm?: { id: string; name: string; role: string; zones: string[]; phone: string; email: string };
  tours: any[];
  bookings: any[];
  followUps: any[];
  lastTouchTs: number;
  probability: number;
  expectedValue: number;
  status: "open" | "booked" | "lost" | "dormant";
  whyNotClosed: string;
  dormantBucket: "30d" | "60d" | "90d" | null;
  hasVisit: boolean;
  booked: boolean;
  // New fields from overhaul
  intervention: {
    isFlagged: boolean;
    category: string;
    note: string;
    flaggedAt: string;
    flaggedBy: string;
  } | null;
  currentStageAgeDays: number;
  isStuck: boolean;
  visits: any[];
  calls: any[];
  objections: any[];
  messages: any[];
  assignments: any[];
  coachNotes: any[];
  lastObjection?: any;
  reassignedCount: number;
}

export interface AdminLeadsResponse {
  rows: AdminLeadRow[];
  tcms: { id: string; name: string; role: string; zones: string[]; phone: string; email: string }[];
}

export const adminLeadsKeys = {
  all: ["admin-leads"] as const,
};

export function useAdminLeads() {
  return useQuery({
    queryKey: adminLeadsKeys.all,
    queryFn: () => apiClient.get<AdminLeadsResponse>("/admin/leads"),
    staleTime: 30_000,
  });
}
