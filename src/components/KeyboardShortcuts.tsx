import { useEffect, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { create } from "zustand";

interface ShortcutStore {
  isOpen: boolean;
  setOpen: (open: boolean) => void;
}

export const useShortcutModal = create<ShortcutStore>((set) => ({
  isOpen: false,
  setOpen: (open) => set({ isOpen: open }),
}));

/**
 * Global keyboard shortcuts.
 *  g t → Today, g l → Leads, g d → Dashboard, g h → Handoffs,
 *  g r → Revival, g v → Revenue, g m → Heatmap, g b → Leaderboard
 *  c → Log call on selected lead
 *  w → Send WhatsApp on selected lead
 *  n → New follow-up (24h) on selected lead
 *  ? → Show shortcut hints
 */
export function KeyboardShortcuts() {
  const navigate = useNavigate();
  const { selectedLeadId, leads, logCall, sendMessage, setLeadFollowUp } = useApp();
  const { isOpen, setOpen } = useShortcutModal();
  const lastKey = useRef<{ key: string; at: number }>({ key: "", at: 0 });

  useEffect(() => {
    function isTyping(el: EventTarget | null): boolean {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    }

    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTyping(e.target)) return;

      const key = e.key.toLowerCase();
      const now = Date.now();
      const isChord = lastKey.current.key === "g" && now - lastKey.current.at < 1500;

      // Chord: g + X
      if (isChord) {
        const map: Record<string, { to: string; label: string }> = {
          t: { to: "/today", label: "Today" },
          d: { to: "/", label: "Dashboard" },
          l: { to: "/leads", label: "Leads" },
          h: { to: "/handoffs", label: "Handoffs" },
          r: { to: "/revival", label: "Revival" },
          v: { to: "/revenue", label: "Revenue" },
          m: { to: "/heatmap", label: "Heatmap" },
          b: { to: "/leaderboard", label: "Leaderboard" },
          s: { to: "/sequences", label: "Sequences" },
          i: { to: "/inventory", label: "Inventory" },
          o: { to: "/tours", label: "Tours" },
          f: { to: "/follow-ups", label: "Follow-ups" },
        };
        const dest = map[key];
        if (dest) {
          e.preventDefault();
          navigate({ to: dest.to });
        }
        lastKey.current = { key: "", at: 0 };
        return;
      }

      if (key === "g") {
        lastKey.current = { key: "g", at: now };
        return;
      }

      // Single-key actions on selected lead
      if (selectedLeadId) {
        const lead = leads.find((l) => l.id === selectedLeadId);
        if (!lead) return;
        if (key === "c") {
          e.preventDefault();
          logCall(lead.id);
          toast.success(`Call logged · ${lead.name}`);
          return;
        }
        if (key === "w") {
          e.preventDefault();
          sendMessage(lead.id, "WhatsApp template sent");
          toast.success(`WA sent · ${lead.name}`);
          return;
        }
        if (key === "n") {
          e.preventDefault();
          const dueAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
          setLeadFollowUp(lead.id, dueAt, "medium", "Manual follow-up (24h)");
          toast.success(`Follow-up set in 24h · ${lead.name}`);
          return;
        }
      }

      if (key === "?") {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, selectedLeadId, leads, logCall, sendMessage, setLeadFollowUp, setOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Navigate and perform actions quickly using your keyboard.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Global Search</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">Cmd + K</kbd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Go to Dashboard</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">g then d</kbd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Go to Leads</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">g then l</kbd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Go to Leaderboard</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">g then b</kbd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Log Call (selected lead)</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">c</kbd>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <span className="text-muted-foreground">Create User (on People page)</span>
            <kbd className="justify-self-end bg-muted px-2 py-0.5 rounded font-mono text-xs">Cmd + N</kbd>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
