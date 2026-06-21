import type { Lead, LeadStage, Property, TCM, Tour } from "@/lib/types";
import type { Quotation } from "@/lib/crm10x/quotations";
import type { NextBestAction } from "@/lib/crm10x/impact-scoring";
import type { TourQueueBand } from "@/lib/crm10x/tour-queue-bands";
import {
  Calendar,
  CheckCircle2,
  FileText,
  Sparkles,
  UserCheck,
  Flame,
  AlertTriangle,
  UserX,
  type LucideIcon,
} from "lucide-react";

export type ColumnKey = "superHot" | "followUp" | "tourScheduled" | "stuck" | "decisionPending" | "booked" | "notNeeded";

/** Target stage when dragging a card into a column (confirmed in dialog). */
export const COLUMN_STAGE_TARGET: Partial<Record<ColumnKey, LeadStage>> = {
  superHot: "contacted",
  followUp: "contacted",
  tourScheduled: "tour-scheduled",
  stuck: "contacted",
  decisionPending: "quote-sent",
  booked: "booked",
  notNeeded: "dropped",
};

export type ImpactEnriched = {
  lead: Lead;
  openTour?: Tour;
  lastQuote?: Quotation;
  nba: NextBestAction;
  score: number; // Priority Score
  column: ColumnKey;
  tourBand?: TourQueueBand;
  tourTimeHint?: string;
  stageDebugReason?: string;
  nextActionReason?: string;
  workflow?: import("@/lib/crm10x/workflow-navigation").WorkflowNavigationState;
};

export const COLUMNS: { key: ColumnKey; label: string; tint: string; icon: LucideIcon }[] = [
  { key: "superHot", label: "Super Hot", tint: "border-l-danger", icon: Flame },
  { key: "followUp", label: "Follow-Up", tint: "border-l-info", icon: Sparkles },
  { key: "tourScheduled", label: "Tour Scheduled", tint: "border-l-accent", icon: Calendar },
  { key: "stuck", label: "Stuck", tint: "border-l-warning", icon: AlertTriangle },
  { key: "decisionPending", label: "Decision Pending", tint: "border-l-primary", icon: FileText },
  { key: "booked", label: "Booked", tint: "border-l-success", icon: CheckCircle2 },
  { key: "notNeeded", label: "Not Needed", tint: "border-l-muted", icon: UserX },
];

export type EnrichedLite = ImpactEnriched;

export type BoardColumnProps = {
  columnKey: ColumnKey;
  items: ImpactEnriched[];
  tcms: TCM[];
  properties: Property[];
  nowMs: number;
  focusLeadId: string | null;
  focusAction: import("@/lib/crm10x/impact-hard-actions").LeadFocusAction | null;
  keyboardFocusLeadId: string | null;
  onFocusConsumed: () => void;
  onRequestStageMove: (leadId: string, from: ColumnKey, to: ColumnKey) => void;
};
