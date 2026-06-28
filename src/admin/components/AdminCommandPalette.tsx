/**
 * AdminCommandPalette — ⌘K / Ctrl+K anywhere in the admin.
 *
 * Features:
 * - Fuzzy search across all leads (name, phone, area, stage)
 * - Jump to any admin page
 * - Quick actions: reassign lead, flag lead, force-close won/lost
 * - Keyboard-only navigation (↑ ↓ Enter Esc)
 */
import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAdminRows } from "@/admin/lib/use-admin-rows";
import { reassignLead, forceCloseLead, flagIntervention } from "@/admin/lib/admin-actions";
import { useApp } from "@/lib/store";
import { toast } from "sonner";
import { Search, ArrowRight, Zap, Users, BarChart2, FileText, Settings, Terminal, Eye, BookOpen, LogIn } from "lucide-react";
import { LeadSparkline } from "./LeadSparkline";
import type { AdminLeadRow } from "@/admin/lib/selectors";

// ── Types ────────────────────────────────────────────────────────────────────

type PaletteItem =
  | { kind: "nav"; id: string; label: string; sub: string; icon: React.ReactNode; to: string }
  | { kind: "lead"; id: string; label: string; sub: string; row: AdminLeadRow }
  | { kind: "action"; id: string; label: string; sub: string; icon: React.ReactNode; run: () => void };

// ── Nav items ────────────────────────────────────────────────────────────────

const NAV_ITEMS: Omit<Extract<PaletteItem, { kind: "nav" }>, "kind">[] = [
  { id: "nav-cockpit",       label: "Cockpit",           sub: "Live pipeline overview",         icon: <Zap className="h-4 w-4" />,         to: "/admin" },
  { id: "nav-leads",         label: "Master Leads",      sub: "Full lead table + bulk actions", icon: <Users className="h-4 w-4" />,        to: "/admin/leads" },
  { id: "nav-bookings",      label: "Bookings",          sub: "All bookings & owner lifecycle", icon: <BookOpen className="h-4 w-4" />,     to: "/admin/bookings" },
  { id: "nav-tenants",       label: "Tenants",           sub: "Active tenant roster",           icon: <Users className="h-4 w-4" />,        to: "/admin/tenants" },
  { id: "nav-people",        label: "People 360",        sub: "TCM performance table",          icon: <Users className="h-4 w-4" />,        to: "/admin/people" },
  { id: "nav-supreme",       label: "Revenue & SLA",     sub: "Money map + SLA breach board",  icon: <BarChart2 className="h-4 w-4" />,    to: "/admin/supreme" },
  { id: "nav-intelligence",  label: "Intelligence",      sub: "Funnel velocity + objections",   icon: <Eye className="h-4 w-4" />,          to: "/admin/intelligence" },
  { id: "nav-command",       label: "Command Bridge",    sub: "Broadcast, kill-switch, impersonate", icon: <Terminal className="h-4 w-4" />, to: "/admin/command" },
  { id: "nav-audit",         label: "Audit Log",         sub: "Every admin action persisted",   icon: <FileText className="h-4 w-4" />,     to: "/admin/audit" },
  { id: "nav-warroom",       label: "War-Room TV",       sub: "Full-screen cockpit display",    icon: <Eye className="h-4 w-4" />,          to: "/admin/warroom" },
  { id: "nav-health-score",  label: "⚡ Health Score",    sub: "TCM composite scores + coaching",    icon: <BarChart2 className="h-4 w-4" />,    to: "/admin/health-score" },
  { id: "nav-settings",      label: "Settings",          sub: "Diagnostics & role controls",    icon: <Settings className="h-4 w-4" />,     to: "/admin/settings" },
  { id: "nav-login",         label: "Sign out",          sub: "Return to login page",           icon: <LogIn className="h-4 w-4" />,        to: "/login" },
];

// ── Hook: register Cmd/Ctrl+K ────────────────────────────────────────────────

export function useAdminCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return { open, setOpen };
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export function AdminCommandPalette({ open, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const navigate = useNavigate();
  const rows = useAdminRows();
  const { tcms } = useApp();

  // Reset on open
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Build items
  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    // Lead search
    const leadItems: PaletteItem[] = rows
      .filter((r) => {
        if (!q) return r.probability >= 60 && !r.booked; // default: hot leads
        return (
          r.lead.name.toLowerCase().includes(q) ||
          r.lead.phone.includes(q) ||
          r.lead.preferredArea.toLowerCase().includes(q) ||
          r.lead.stage.toLowerCase().includes(q) ||
          (r.tcm?.name ?? "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.probability - a.probability)
      .slice(0, q ? 8 : 5)
      .map((r) => ({
        kind: "lead" as const,
        id: r.lead.id,
        label: r.lead.name,
        sub: `${r.lead.stage} · ${r.tcm?.name ?? "Unassigned"} · ${r.probability}% · ₹${(r.expectedValue / 1000).toFixed(0)}k`,
        row: r,
      }));

    // Nav items
    const navItems: PaletteItem[] = NAV_ITEMS.filter(
      (n) => !q || n.label.toLowerCase().includes(q) || n.sub.toLowerCase().includes(q),
    ).map((n) => ({ kind: "nav" as const, ...n }));

    // Quick actions (only when a lead query matches one lead)
    const actionItems: PaletteItem[] = [];
    if (leadItems.length === 1) {
      const r = (leadItems[0] as Extract<PaletteItem, { kind: "lead" }>).row;
      const tid = tcms[0]?.id;
      if (tid) {
        actionItems.push({
          kind: "action",
          id: `reassign-${r.lead.id}`,
          label: `Reassign "${r.lead.name}" to ${tcms[0]?.name}`,
          sub: "Quick reassign to first available TCM",
          icon: <Users className="h-4 w-4 text-warning" />,
          run: () => {
            reassignLead(r.lead.id, tid, "Reassigned via ⌘K");
            toast.success(`Reassigned ${r.lead.name} → ${tcms[0]?.name}`);
            onClose();
          },
        });
      }
      if (!r.booked && r.lead.stage !== "dropped") {
        actionItems.push({
          kind: "action",
          id: `won-${r.lead.id}`,
          label: `Force Won — "${r.lead.name}"`,
          sub: "Mark as booked immediately",
          icon: <Zap className="h-4 w-4 text-success" />,
          run: () => {
            forceCloseLead(r.lead.id, "won", r.lead.budget);
            toast.success(`${r.lead.name} marked Won`);
            onClose();
          },
        });
        actionItems.push({
          kind: "action",
          id: `lost-${r.lead.id}`,
          label: `Force Lost — "${r.lead.name}"`,
          sub: "Mark as dropped immediately",
          icon: <Zap className="h-4 w-4 text-destructive" />,
          run: () => {
            forceCloseLead(r.lead.id, "lost", "⌘K force-close");
            toast.warning(`${r.lead.name} marked Lost`);
            onClose();
          },
        });
        actionItems.push({
          kind: "action",
          id: `flag-${r.lead.id}`,
          label: `Flag for Intervention — "${r.lead.name}"`,
          sub: "Escalate to admin review",
          icon: <ArrowRight className="h-4 w-4 text-destructive" />,
          run: () => {
            flagIntervention(r.lead.id, "Flagged via ⌘K command palette");
            toast.warning(`${r.lead.name} flagged`);
            onClose();
          },
        });
      }
    }

    // Merge: leads first, then nav, then actions
    return [...leadItems, ...navItems, ...actionItems];
  }, [query, rows, tcms, onClose]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => Math.min(c + 1, items.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        const item = items[cursor];
        if (!item) return;
        activateItem(item);
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [items, cursor, onClose],
  );

  function activateItem(item: PaletteItem) {
    if (item.kind === "nav") {
      navigate({ to: item.to });
      onClose();
    } else if (item.kind === "lead") {
      navigate({ to: "/admin/leads" });
      onClose();
    } else if (item.kind === "action") {
      item.run();
    }
  }

  // Scroll selected into view
  useEffect(() => {
    const el = listRef.current?.children[cursor] as HTMLElement | undefined;
    el?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      {/* Panel */}
      <div
        className="relative w-full max-w-2xl mx-4 rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setCursor(0); }}
            onKeyDown={handleKeyDown}
            placeholder="Search leads, pages, actions…"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">
            esc
          </kbd>
        </div>

        {/* Results */}
        <ul
          ref={listRef}
          className="max-h-[50vh] overflow-y-auto divide-y divide-border/50 py-1"
        >
          {items.length === 0 && (
            <li className="px-4 py-8 text-center text-sm text-muted-foreground">
              No results for "{query}"
            </li>
          )}
          {items.map((item, i) => (
            <li key={item.id}>
              <button
                onMouseEnter={() => setCursor(i)}
                onClick={() => activateItem(item)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === cursor ? "bg-accent/15" : "hover:bg-muted/40"
                }`}
              >
                {/* Icon / sparkline */}
                <div className="shrink-0 w-8 flex items-center justify-center">
                  {item.kind === "lead" ? (
                    <LeadSparkline row={item.row} width={32} height={20} />
                  ) : item.kind === "nav" ? (
                    <span className="text-muted-foreground">{item.icon}</span>
                  ) : (
                    <span className="text-muted-foreground">{item.icon}</span>
                  )}
                </div>

                {/* Text */}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate flex items-center gap-2">
                    {item.label}
                    {item.kind === "lead" && (
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0 ${
                          item.row.probability >= 70
                            ? "bg-success/15 text-success"
                            : item.row.probability >= 40
                            ? "bg-warning/15 text-warning"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {item.row.probability}%
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{item.sub}</div>
                </div>

                {/* Type badge */}
                <div className="shrink-0">
                  {item.kind === "nav" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      page
                    </span>
                  )}
                  {item.kind === "lead" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-info/15 text-info">
                      lead
                    </span>
                  )}
                  {item.kind === "action" && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/15 text-accent">
                      action
                    </span>
                  )}
                </div>

                {/* Enter hint */}
                {i === cursor && (
                  <kbd className="shrink-0 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground font-mono">
                    ↵
                  </kbd>
                )}
              </button>
            </li>
          ))}
        </ul>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-border bg-muted/20 text-[10px] text-muted-foreground">
          <span><kbd className="font-mono">↑↓</kbd> navigate</span>
          <span><kbd className="font-mono">↵</kbd> select</span>
          <span><kbd className="font-mono">esc</kbd> close</span>
          <span className="ml-auto">{items.length} result{items.length !== 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>
  );
}
