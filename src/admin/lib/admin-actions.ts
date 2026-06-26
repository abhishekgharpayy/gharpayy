/**
 * Admin actions — destructive operations.
 * All mutations flow through the backend command bus via api.command()
 * and invalidate react-query caches so the UI stays in sync.
 */
import { useApp } from "@/lib/store";
import { useAuditLog } from "@/lib/crm10x/audit-log";
import { toast } from "sonner";
import { api } from "@/lib/api/client";

type Inverse = () => void;
const undoStack = new Map<string, Inverse>();

function pushUndo(id: string, fn: Inverse) {
  undoStack.set(id, fn);
  setTimeout(() => undoStack.delete(id), 10_000);
}

export function undo(id: string) {
  const fn = undoStack.get(id);
  if (!fn) {
    toast.warning("Undo window expired");
    return;
  }
  fn();
  undoStack.delete(id);
  toast.success("Reverted");
}

export function reassignLead(leadId: string, newTcmId: string, reason = "Admin reassignment") {
  const state = useApp.getState();
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) return;
  const before = lead.assignedTcmId;

  state.reassignLead(leadId, newTcmId, reason);
  const entry = useAuditLog.getState().log({
    actorId: "admin",
    actorName: "Admin",
    entityType: "lead",
    entityId: leadId,
    action: "admin.reassign",
    before: { assignedTcmId: before },
    after: { assignedTcmId: newTcmId },
    summary: `Reassigned ${lead.name} to ${state.tcms.find((t) => t.id === newTcmId)?.name ?? newTcmId}`,
  });

  const entryId = entry.id;
  pushUndo(entryId, () => {
    useApp.getState().reassignLead(leadId, before, "Undo admin reassignment");
  });
  toast.success(`Reassigned ${lead.name}`, {
    action: { label: "Undo", onClick: () => undo(entryId) },
  });
}

export function forceCloseLead(leadId: string, outcome: "won" | "lost", reasonOrAmount: string | number) {
  const state = useApp.getState();
  const lead = state.leads.find((l) => l.id === leadId);
  if (!lead) return;
  const before = lead.stage;

  if (outcome === "won") {
    const amount = typeof reasonOrAmount === "number" ? reasonOrAmount : lead.budget;
    const tour = state.tours.find((t) => t.leadId === leadId);
    if (tour?.propertyId) {
      state.closeDeal({
        leadId,
        tourId: tour.id,
        propertyId: tour.propertyId,
        tcmId: lead.assignedTcmId,
        amount,
      });
    } else {
      void state.setLeadStage(leadId, "booked");
    }
  } else {
    void state.setLeadStage(leadId, "dropped");
  }

  const entry = useAuditLog.getState().log({
    actorId: "admin",
    actorName: "Admin",
    entityType: "lead",
    entityId: leadId,
    action: outcome === "won" ? "admin.force-close.won" : "admin.force-close.lost",
    before: { stage: before },
    after: { stage: outcome === "won" ? "booked" : "dropped", reason: reasonOrAmount },
    summary: `Force-closed ${lead.name} as ${outcome}`,
  });

  const entryId = entry.id;
  pushUndo(entryId, () => {
    void useApp.getState().setLeadStage(leadId, before);
  });
  toast.success(`Closed ${lead.name} as ${outcome}`, {
    action: { label: "Undo stage", onClick: () => undo(entryId) },
  });
}

export function bulkReassign(leadIds: string[], newTcmId: string) {
  if (leadIds.length > 10 && !confirm(`Reassign ${leadIds.length} leads?`)) return;
  leadIds.forEach((id) => reassignLead(id, newTcmId, "Bulk admin reassignment"));
}

/** Flag a lead for admin intervention — persisted to MongoDB */
export async function flagIntervention(
  leadId: string,
  category: "pricing_dispute" | "tcm_unresponsive" | "special_reqs" | "bad_experience" | "other",
  note: string,
) {
  const cmdId = `fi_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await api.command({
      _id: cmdId,
      type: "cmd.lead.flag_intervention",
      issuedAt: new Date().toISOString(),
      payload: { leadId, isFlagged: true, category, note },
    });
    toast.success("Lead flagged for intervention");
  } catch (err) {
    console.error("[flagIntervention]", err);
    toast.error("Failed to flag lead");
  }
}

/** Resolve an intervention flag — clears it from MongoDB */
export async function resolveIntervention(leadId: string) {
  const cmdId = `ri_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await api.command({
      _id: cmdId,
      type: "cmd.lead.flag_intervention",
      issuedAt: new Date().toISOString(),
      payload: { leadId, isFlagged: false },
    });
    toast.success("Intervention resolved");
  } catch (err) {
    console.error("[resolveIntervention]", err);
    toast.error("Failed to resolve intervention");
  }
}
