import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";
import { AdminCommandPalette, useAdminCommandPalette } from "./AdminCommandPalette";
import { LiveRevenueTicker } from "./LiveRevenueTicker";
import { LiveActivityDrawer } from "./LiveActivityDrawer";

const TABS = [
  { to: "/admin",                label: "Cockpit" },
  { to: "/admin/leads",          label: "Master Leads" },
  { to: "/admin/bookings",       label: "Bookings" },
  { to: "/admin/tenants",        label: "Tenants" },
  { to: "/admin/people",         label: "People 360" },
  { to: "/admin/health-score",   label: "⚡ Health Score" },
  { to: "/admin/supreme",        label: "Revenue & SLA" },
  { to: "/admin/radar",          label: "Radar" },
  { to: "/admin/command",        label: "Command" },
  { to: "/admin/audit",          label: "Audit Log" },
  { to: "/admin/warroom",        label: "War-Room TV" },
  { to: "/admin/settings",       label: "Settings" },
];

export function AdminShell({ children, title, sub, actions }: { children: ReactNode; title: string; sub?: string; actions?: ReactNode }) {
  const path = useRouterState({ select: (r) => r.location.pathname });
  const { open, setOpen } = useAdminCommandPalette();

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card/80 backdrop-blur px-4 py-3 space-y-2">
        {/* Top row: title + live ticker */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-destructive font-semibold">
              Super Admin · Full control
            </div>
            <div className="text-lg font-display font-semibold">{title}</div>
            {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
          </div>
          {/* Live Revenue Ticker & Actions */}
          <div className="flex items-center gap-3">
            <LiveRevenueTicker />
            {actions}
          </div>
        </div>

        {/* Nav row */}
        <nav className="flex items-center gap-1 flex-wrap text-xs">
          {TABS.map((t) => {
            const active =
              t.to === "/admin"
                ? path === "/admin"
                : path === t.to || path.startsWith(t.to + "/");
            return (
              <Link
                key={t.to}
                to={t.to}
                className={cn(
                  "px-2.5 py-1 rounded-md transition-colors",
                  active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                {t.label}
              </Link>
            );
          })}
          {/* Command palette trigger — ⌘K */}
          <button
            onClick={() => setOpen(true)}
            className="ml-2 flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-muted/60 transition-colors"
            title="Open command palette (⌘K / Ctrl+K)"
          >
            <span>⌘K</span>
          </button>
          
          {/* Live Activity Feed Drawer */}
          <LiveActivityDrawer />
        </nav>
      </div>

      {children}

      <AdminCommandPalette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}
