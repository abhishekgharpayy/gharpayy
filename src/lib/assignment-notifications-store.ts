/**
 * Assignment Notifications Store
 *
 * Polls the server for pending assignment notifications addressed to the
 * currently logged-in user. Exposes accept() and passOn() actions that
 * dispatch the appropriate commands and refresh the list.
 */

import { create } from "zustand";
import { api, type AssignmentNotificationItem } from "@/lib/api/client";
import { toast } from "sonner";

function playNotificationSound() {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    
    osc.connect(gain);
    gain.connect(ctx.destination);
    
    osc.type = "sine";
    osc.frequency.setValueAtTime(500, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1000, ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  } catch (e) {}
}

const uid = (p: string) => `${p}-${Math.random().toString(36).slice(2, 14)}`;

interface AssignmentNotifState {
  /** Pending assignments for the current user */
  pending: AssignmentNotificationItem[];
  /** Assignments passed on (for the original assigner's info feed) */
  passed: AssignmentNotificationItem[];
  loading: boolean;
  error: string | null;
  hasLoadedOnce: boolean;

  /** Fetch both pending + passed lists from the server */
  refresh: () => Promise<void>;

  /** Accept a pending assignment (lead or tour) */
  accept: (notificationId: string, type: "lead" | "tour") => Promise<void>;

  /** Pass on a pending assignment to another person */
  passOn: (notificationId: string, type: "lead" | "tour", newAssigneeId: string) => Promise<void>;
}

export const useAssignmentNotifications = create<AssignmentNotifState>()((set, get) => ({
  pending: [],
  passed: [],
  loading: false,
  error: null,
  hasLoadedOnce: false,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const [pendingRes, passedRes] = await Promise.all([
        api.assignmentNotifications.listPending(),
        api.assignmentNotifications.listPassed(),
      ]);

      const oldPending = get().pending;
      const hasLoadedOnce = get().hasLoadedOnce;

      if (hasLoadedOnce) {
        const newItems = pendingRes.items.filter((n) => !oldPending.some((o) => o._id === n._id));
        if (newItems.length > 0) {
          playNotificationSound();
          const first = newItems[0];
          toast.success(first.type === "tour" ? "New tour assigned!" : "New lead assigned!", {
            description: `${first.assignedByName} assigned ${first.leadName}'s ${first.type} to you.`,
            action: {
              label: "Check Inbox",
              onClick: () => {
                window.location.href = "/inbox";
              }
            }
          });
        }
      }

      set({ pending: pendingRes.items, passed: passedRes.items, hasLoadedOnce: true });
    } catch (e) {
      set({ error: (e as Error).message });
    } finally {
      set({ loading: false });
    }
  },

  accept: async (notificationId, type) => {
    const cmdType = type === "lead" ? "cmd.lead.accept_assignment" : "cmd.tour.accept_assignment";
    await api.command({
      _id: uid("c"),
      type: cmdType,
      issuedAt: new Date().toISOString(),
      payload: { notificationId },
    });
    // Update status immediately (optimistic)
    set((s) => ({
      pending: s.pending.map((n) => n._id === notificationId ? { ...n, status: "accepted" as const } : n),
    }));
    // Refresh from server to sync
    await get().refresh();
  },

  passOn: async (notificationId, type, newAssigneeId) => {
    const cmdType = type === "lead" ? "cmd.lead.pass_assignment" : "cmd.tour.pass_assignment";
    await api.command({
      _id: uid("c"),
      type: cmdType,
      issuedAt: new Date().toISOString(),
      payload: { notificationId, newAssigneeId },
    });
    // Remove from pending list immediately (optimistic)
    set((s) => ({
      pending: s.pending.filter((n) => n._id !== notificationId),
    }));
    // Refresh from server to sync
    await get().refresh();
  },
}));

/** How many pending assignments does the current user have? */
export function usePendingAssignmentCount(): number {
  return useAssignmentNotifications((s) => s.pending.filter((n) => n.status === "pending").length);
}
