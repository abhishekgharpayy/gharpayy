import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard, Target, CalendarPlus, ClipboardList, Boxes, Activity,
  Building2, Search, Sun, Command, Trophy, Sparkles, MessageSquare,
  IndianRupee, MapPin, Zap, Users, Home, Calendar, Store, Swords, Settings, AlertTriangle,
  ShieldCheck, Inbox, Camera, HelpCircle, Layers, HeartPulse, ListTodo, Gauge,
} from "lucide-react";
import { MemberDailyReminderPopup } from "@/components/stats/MemberDailyReminderPopup";
import { NotificationCenter } from "./NotificationCenter";
import { ProfileMenu } from "./ProfileMenu";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ReactNode } from "react";
import { LeadControlPanel } from "./LeadControlPanel";
import { CommandPalette } from "./CommandPalette";
import { CoachWidget } from "./CoachWidget";
import { useNow, useMountedNow } from "@/hooks/use-now";
import { buildDoNextQueue } from "@/lib/engine";
import { useGame, whoKey } from "@/lib/gamification";
import { useCRM10x } from "@/lib/crm10x/store";
import { useEffect, useMemo } from "react";
import { PictureInPictureProvider, PipMount, usePip } from "./pip/PipProvider";
import { PipButton } from "./pip/PipButton";
import { usePipRouteSync } from "./pip/usePipSync";


import { ClientOnly } from "./ClientOnly";
import { QuickCreateMenu } from "./QuickCreateMenu";
import { LiveLeadsBridge } from "./LiveLeadsBridge";
import { LiveToursAppBridge } from "./LiveToursAppBridge";
import { LiveToursBridge } from "./LiveToursBridge";
import { useAuthUser } from "@/lib/auth-store";
import { useAppState } from "@/myt/lib/app-context";

function PipRouteSyncBridge() {
  const { active } = usePip();
  usePipRouteSync(active);
  return null;
}

type NavItem = { to: string; label: string; icon: typeof Target; badge?: number; accent?: boolean };

const TAIL_NAV: NavItem[] = [
  { to: "/daily-progress", label: "Daily Progress", icon: Gauge },
  { to: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { to: "/settings", label: "Settings", icon: Settings },
];

function withTailNav(items: NavItem[]) {
  const out = [...items];
  for (const item of TAIL_NAV) {
    if (!out.some((n) => n.to === item.to)) out.push(item);
  }
  return out;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { role, setRole, currentTcmId, setCurrentTcmId, tcms, leads, tours, followUps, handoffs, bookings } = useApp();
  const selectedLeadId = useApp((s) => s.selectedLeadId);
  const { setCurrentMemberId } = useAppState();
  const authUser = useAuthUser((s) => s.user);
  const hydrateAuth = useAuthUser((s) => s.hydrate);
  // Map real DB role → personas the user is allowed to "view as".
  // Single-option roles see a static label instead of a dropdown.
  const allowedPersonas: Record<string, Array<typeof role>> = {
    super_admin: ["super-admin"],
    manager:     ["hr"],
    admin:       ["hr"],
    member:      ["flow-ops"],
    tcm:         ["tcm"],
    owner:       ["owner"],
  };
  const dbRole = authUser?.role;
  const allowed = (dbRole && allowedPersonas[dbRole]) || ["super-admin"];

  // On mount / role change, force the sidebar persona into the allowed set.
  useEffect(() => { if (!authUser) hydrateAuth(); }, [authUser, hydrateAuth]);
  useEffect(() => {
    if (!dbRole) return;
    if (!allowed.includes(role)) setRole(allowed[0]);
  }, [dbRole, role, setRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // Set currentMemberId for all logged-in users so tours and notifications work correctly
  useEffect(() => {
    if (authUser) {
      setCurrentMemberId(authUser.id);
    } else {
      setCurrentMemberId(null);
    }
  }, [authUser, setCurrentMemberId]);
  const router = useRouterState();
  const path = router.location.pathname;
  const [now, mounted] = useMountedNow();

  const filterTcm = role === "tcm" ? currentTcmId : undefined;
  const queue = useMemo(
    () => (mounted ? buildDoNextQueue(leads, tours, followUps, now, filterTcm) : []),
    [leads, tours, followUps, now, filterTcm, mounted],
  );
  const overdueCount = mounted ? followUps.filter((f) => !f.done && +new Date(f.dueAt) <= now).length : 0;
  const incompletePostTour = tours.filter((t) => t.status === "completed" && !t.postTour.filledAt).length;
  const unreadHandoffs = handoffs.filter((h) => !h.read && h.to === role).length;

  // Booking XP awarder - credit the TCM once per booking id.
  // Both awardXp and registerBooking are idempotent via persisted dedupe keys,
  // so safe to re-run across remounts.
  const awardXp = useGame((s) => s.awardXp);
  const registerBooking = useGame((s) => s.registerBooking);
  const rolloverIfNeeded = useGame((s) => s.rolloverIfNeeded);
  useEffect(() => {
    if (!mounted) return;
    bookings.forEach((b) => {
      const who = whoKey("tcm", b.tcmId);
      awardXp(who, 100, `booking:${b.id}`);
      registerBooking(who, b.id);
    });
  }, [bookings, mounted, awardXp, registerBooking]);

  // Daily rollover for the active user.
  useEffect(() => {
    if (!mounted) return;
    rolloverIfNeeded(whoKey(role, currentTcmId));
  }, [mounted, role, currentTcmId, rolloverIfNeeded]);

  // Attribute prior WhatsApp sends to bookings (ROI for templates).
  // Guard: only matching leadId, only sends BEFORE the booking, only within 14d
  // window - the store enforces this and never re-credits a message twice.
  const markMessageBookedAfter = useCRM10x((s) => s.markMessageBookedAfter);
  useEffect(() => {
    if (!mounted) return;
    bookings.forEach((b) => markMessageBookedAfter(b.leadId, b.id, b.ts));
  }, [bookings, mounted, markMessageBookedAfter]);

  const navByRole: Record<typeof role, NavItem[]> = {
    hr: withTailNav([
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/leads", label: "Leads", icon: Target },
      { to: "/myt/tours", label: "Tours", icon: CalendarPlus },
      { to: "/impact", label: "Impact", icon: HeartPulse },
      { to: "/property-hub", label: "Property Hub", icon: Building2 },
      { to: "/myt/war-room", label: "War Room", icon: Swords },
      { to: "/myt/team", label: "Team", icon: Users },
      { to: "/revenue", label: "Revenue", icon: IndianRupee },
      { to: "/myt/funnel", label: "Funnel", icon: Activity },
      { to: "/myt/zones", label: "Zones", icon: MapPin },
      { to: "/myt/owners-compare", label: "Owners", icon: ShieldCheck },
      { to: "/supply-hub", label: "Supply Hub", icon: Layers },
      { to: "/my-tasks", label: "My Tasks", icon: ListTodo },
    ]),
    "flow-ops": withTailNav([
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/leads", label: "Leads", icon: Target },
      { to: "/myt/schedule", label: "Tours", icon: CalendarPlus },
      { to: "/impact", label: "Impact", icon: HeartPulse },
      { to: "/property-hub", label: "Property Hub", icon: Building2 },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/myt/marketplace", label: "Marketplace", icon: Store },
      { to: "/supply-hub", label: "Supply Hub", icon: Layers },
      { to: "/sequences", label: "Outreach", icon: Zap },
      { to: "/my-tasks", label: "My Tasks", icon: ListTodo },
    ]),
    tcm: withTailNav([
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/inbox", label: "Inbox", icon: Inbox },
      { to: "/leads", label: "Leads", icon: Target },
      { to: "/myt/schedule", label: "Tours", icon: CalendarPlus },
      { to: "/impact", label: "Impact", icon: HeartPulse },
      { to: "/property-hub", label: "Property Hub", icon: Building2 },
      { to: "/calendar", label: "Calendar", icon: Calendar },
      { to: "/myt/marketplace", label: "Marketplace", icon: Store },
      { to: "/supply-hub", label: "Supply Hub", icon: Layers },
      { to: "/sequences", label: "Outreach", icon: Zap },
      { to: "/my-tasks", label: "My Tasks", icon: ListTodo },
    ]),
    owner: [
      { to: "/owner", label: "Owner Home", icon: ShieldCheck },
      { to: "/owner/blocks", label: "Approvals", icon: Inbox },
      { to: "/owner/rooms", label: "Rooms", icon: Building2 },
      { to: "/owner/inventory", label: "Inventory", icon: Layers },
      { to: "/owner/visits", label: "Tours", icon: Camera },
      { to: "/impact", label: "Impact", icon: HeartPulse },
      { to: "/property-hub", label: "Property Hub", icon: Building2 },
      { to: "/owner/insights", label: "Insights", icon: IndianRupee },
      { to: "/my-tasks", label: "My Tasks", icon: ListTodo },
    ],
    "super-admin": withTailNav([
      { to: "/today", label: "Today", icon: Sun, badge: queue.length },
      { to: "/leads", label: "Leads", icon: Target },
      { to: "/myt/tours", label: "Tours", icon: CalendarPlus },
      { to: "/impact", label: "Impact", icon: HeartPulse },
      { to: "/property-hub", label: "Property Hub", icon: Building2 },
      { to: "/myt/war-room", label: "War Room", icon: Swords },
      { to: "/myt/team", label: "Team", icon: Users },
      { to: "/revenue", label: "Revenue", icon: IndianRupee },
      { to: "/zones", label: "Zones", icon: MapPin },
    ]),
  };

  const items = navByRole[role];
  

  const isActive = (to: string) => (to === "/" ? path === "/" : path === to || path.startsWith(to + "/"));
  const shouldMountMytBridges = path.startsWith("/myt");

  return (
    <PictureInPictureProvider>
      <PipRouteSyncBridge />
      <LiveLeadsBridge />
      <LiveToursAppBridge />
      {shouldMountMytBridges ? <LiveToursBridge /> : null}
      <div className="min-h-screen flex w-full bg-background text-foreground">
      {/* Sidebar */}
      <aside className="hidden md:flex w-60 flex-col bg-sidebar text-sidebar-foreground border-r border-sidebar-border sticky top-0 h-screen">
        <div className="px-5 py-5 flex items-center gap-2 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg bg-accent flex items-center justify-center">
            <Building2 className="h-4 w-4 text-accent-foreground" />
          </div>
          <div className="leading-tight">
            <div className="text-sidebar-accent-foreground font-display font-semibold text-sm">Gharpayy</div>
            <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground">Arena Infrastructure</div>
          </div>
        </div>

        {(() => {
          const roleMeta = {
            "flow-ops": { label: "Flow Ops", dot: "bg-info" },
            tcm: { label: "TCM Desk", dot: "bg-accent" },
            hr: { label: "HR / Leadership", dot: "bg-success" },
            owner: { label: "Owner Portal", dot: "bg-warning" },
            "super-admin": { label: "Super Admin", dot: "bg-destructive" },
          } as const;
          const meta = roleMeta[role];
          const userName = role === "tcm" ? tcms.find((t) => t.id === currentTcmId)?.name : null;
          return (
            <div className="px-5 pt-4 pb-2">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-sidebar-foreground/70 font-semibold">
                <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                <span>{meta.label}</span>
                {userName && <span className="text-sidebar-foreground/50 normal-case tracking-normal">· {userName.split(" ")[0]} {userName.split(" ")[1]?.[0] ?? ""}.</span>}
              </div>
            </div>
          );
        })()}

        <nav className="flex-1 px-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {items.map((it) => {
            const Icon = it.icon;
            const active = isActive(it.to);
            return (
              <Link
                key={it.to}
                to={it.to}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-[13px] transition-colors",
                  active
                    ? "bg-accent/15 text-accent border border-accent/20"
                    : "hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                  it.accent && !active && "text-accent",
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{it.label}</span>
                {it.badge !== undefined && it.badge > 0 && mounted && (
                  <span className={cn(
                    "ml-auto text-[10px] rounded-full px-1.5 py-0.5 font-mono",
                    it.accent
                      ? "bg-accent text-accent-foreground"
                      : "bg-destructive text-destructive-foreground",
                  )}>
                    {it.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-sidebar-border space-y-2">
          <div className="text-[10px] uppercase tracking-wider text-sidebar-foreground px-1">View as</div>
          {(() => {
            const labels: Record<string, string> = {
              "flow-ops": "Flow Ops",
              tcm: "TCM",
              hr: "HR / Leadership",
              owner: "Property Owner",
              "super-admin": "Super Admin",
            };
            const userName = authUser?.fullName || authUser?.username || authUser?.email || "";
            if (allowed.length <= 1) {
              return (
                <div className="bg-sidebar-accent border border-sidebar-border text-sidebar-accent-foreground rounded-md px-3 py-1.5 flex flex-col leading-tight">
                  <span className="text-xs">{labels[role] ?? role}</span>
                  {userName && <span className="text-[10px] text-sidebar-accent-foreground truncate">{userName}</span>}
                </div>
              );
            }
            return (
              <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                <SelectTrigger className="bg-sidebar-accent border-sidebar-border text-sidebar-accent-foreground h-auto py-1.5 text-xs">
                  <div className="flex flex-col items-start leading-tight">
                    <span>{labels[role] ?? role}</span>
                    {userName && <span className="text-[10px] text-sidebar-accent-foreground truncate">{userName}</span>}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {allowed.map((p) => (
                    <SelectItem key={p} value={p}>{labels[p] ?? p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          })()}
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 bg-background/85 backdrop-blur border-b border-border flex items-center gap-3 px-4 md:px-6">
          <div className="md:hidden font-display font-semibold">Gharpayy</div>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="md:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground"
            aria-label="Open command palette"
          >
            <Search className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true }))}
            className="hidden md:flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-card hover:bg-muted/60 text-xs text-muted-foreground w-full max-w-md transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Jump to lead, page or action…</span>
            <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-mono">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <ClientOnly><QuickCreateMenu /></ClientOnly>

            <PipButton mode="capture" label="PiP Add" className="hidden sm:inline-flex" />
            <PipButton mode="manage" label="PiP Manage" className="hidden sm:inline-flex" />
            <PipButton />
            <NotificationCenter role={role} />
            <ProfileMenu />
          </div>
        </header>


        <PipMount>
          <main className="flex-1 w-full max-w-350 mx-auto p-4 pb-24 md:p-6 md:pb-6">{children}</main>
        </PipMount>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur md:hidden"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-stretch gap-1 overflow-x-auto px-2 py-2 scrollbar-thin scroll-smooth snap-x">
          {items.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "relative flex shrink-0 snap-start flex-col items-center justify-center gap-1 rounded-md px-3 py-1.5 text-[10px] font-medium transition-colors min-w-16 min-h-11",
                  active ? "bg-accent/10 text-accent" : "text-muted-foreground hover:bg-muted/60",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && mounted && (
                  <span className="absolute right-1 top-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-mono text-destructive-foreground">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Overlays */}
      {selectedLeadId ? <LeadControlPanel /> : null}
      <CommandPalette />
      <CoachWidget />
      {authUser ? <MemberDailyReminderPopup /> : null}
      </div>
    </PictureInPictureProvider>
  );
}
