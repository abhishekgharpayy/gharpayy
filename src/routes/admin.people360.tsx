import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { api } from "@/lib/api/client";
import { useAuthUser } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import {
  Users, Activity, ShieldAlert, Flame, Phone, MapPin,
  MessageSquare, CalendarCheck, CheckCircle2, AlertTriangle,
  TrendingDown, TrendingUp, Clock, Zap, Eye,
} from "lucide-react";

export const Route = createFileRoute("/admin/people360")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "People 360 — Gharpayy Admin" },
      { name: "description", content: "Workload heatmap, activity pulse, and attrition risk radar for your team." },
    ],
  }),
  component: People360Page,
});

// ── Types ────────────────────────────────────────────────────────────────────

type Tab = "workload" | "pulse" | "risk";

interface WorkloadRow {
  userId: string;
  name: string;
  avatar: string;
  openLeads: number;
  scheduledTours: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  openTodos: number;
  monthlyBookings: number;
  workloadScore: number;
}

interface PulseEvent {
  activityId: string;
  kind: string;
  subject: string;
  body: string;
  actorName: string;
  actorAvatar: string;
  entityType: string;
  entityName: string;
  occurredAt: string;
  direction: string;
  outcome: string | null;
}

interface RiskRow {
  userId: string;
  name: string;
  avatar: string;
  riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  signals: {
    activityTrend: number;
    conversionTrend: number;
    overdueRatio: number;
    lastLoginDaysAgo: number;
    loginRecency: number;
  };
}

// ── Main Page ────────────────────────────────────────────────────────────────

function People360Page() {
  const [tab, setTab] = useState<Tab>("workload");

  const tabs: { key: Tab; label: string; Icon: typeof Users }[] = [
    { key: "workload", label: "Workload", Icon: Users },
    { key: "pulse", label: "Pulse", Icon: Activity },
    { key: "risk", label: "Risk Radar", Icon: ShieldAlert },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <header>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
          <Users className="h-3.5 w-3.5" />
          <span>Admin · People 360</span>
        </div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">People 360</h1>
        <p className="text-sm text-muted-foreground">
          Workload distribution, live activity pulse, and attrition risk — all from your real data.
        </p>
      </header>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {tabs.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cn(
              "text-[11px] font-medium rounded-full px-3 py-1 transition-colors inline-flex items-center gap-1.5",
              tab === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {tab === "workload" && <WorkloadTab />}
      {tab === "pulse" && <PulseTab />}
      {tab === "risk" && <RiskTab />}
    </div>
  );
}

// ── Workload Heatmap ─────────────────────────────────────────────────────────

function WorkloadTab() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["people360", "workload"],
    queryFn: () => api.people360.workload() as Promise<{ items: WorkloadRow[] }>,
    refetchInterval: 60_000,
  });

  const [visibleCount, setVisibleCount] = useState(10);

  if (isLoading) return <LoadingState label="Calculating workload distribution…" />;
  if (isError) return <ErrorState />;

  const items = data?.items ?? [];
  const avgScore = items.length > 0 ? Math.round(items.reduce((s, i) => s + i.workloadScore, 0) / items.length) : 0;
  const mostLoaded = items.length > 0 ? [...items].sort((a, b) => b.workloadScore - a.workloadScore)[0] : null;
  const leastLoaded = items.length > 0 ? [...items].sort((a, b) => a.workloadScore - b.workloadScore)[0] : null;
  const totalOverdue = items.reduce((s, i) => s + i.overdueFollowUps, 0);

  return (
    <div className="space-y-5">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Avg Workload" value={avgScore} suffix="/100" />
        <SummaryCard label="Most Loaded" value={mostLoaded?.name ?? "—"} sub={`Score: ${mostLoaded?.workloadScore ?? 0}`} />
        <SummaryCard label="Least Loaded" value={leastLoaded?.name ?? "—"} sub={`Score: ${leastLoaded?.workloadScore ?? 0}`} />
        <SummaryCard label="Overdue Follow-Ups" value={totalOverdue} accent />
      </div>

      {/* Heatmap Table */}
      <div className="rounded-xl border border-border bg-card overflow-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              {["TCM", "Open Leads", "Tours", "Follow-Ups", "Overdue", "Todos", "Bookings", "Load"].map((h) => (
                <th key={h} className="text-left px-3 py-2.5 font-medium text-muted-foreground uppercase tracking-wider text-[10px]">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.slice(0, visibleCount).map((row) => (
              <tr key={row.userId} className="border-b border-border hover:bg-muted/30 transition-colors">
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2">
                    <img src={row.avatar} alt="" className="w-6 h-6 rounded-full bg-muted" />
                    <span className="font-medium text-foreground">{row.name || "Unknown"}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5"><HeatCell value={row.openLeads} thresholds={[5, 15, 25]} /></td>
                <td className="px-3 py-2.5"><HeatCell value={row.scheduledTours} thresholds={[2, 5, 8]} /></td>
                <td className="px-3 py-2.5"><HeatCell value={row.pendingFollowUps} thresholds={[3, 8, 15]} /></td>
                <td className="px-3 py-2.5"><HeatCell value={row.overdueFollowUps} thresholds={[1, 3, 5]} /></td>
                <td className="px-3 py-2.5"><HeatCell value={row.openTodos} thresholds={[3, 7, 12]} /></td>
                <td className="px-3 py-2.5">
                  <span className="font-mono text-success">{row.monthlyBookings}</span>
                </td>
                <td className="px-3 py-2.5">
                  <WorkloadBar value={row.workloadScore} />
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-muted-foreground">No TCMs found.</td></tr>
            )}
          </tbody>
        </table>
        {items.length > visibleCount && (
          <div className="p-3 text-center border-t border-border bg-muted/10">
            <button 
              className="text-xs bg-background hover:bg-muted text-foreground border border-border px-4 py-1.5 rounded transition-colors"
              onClick={() => setVisibleCount(v => v + 10)}
            >
              Load More ({items.length - visibleCount} remaining)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function HeatCell({ value, thresholds }: { value: number; thresholds: [number, number, number] }) {
  const cls =
    value >= thresholds[2] ? "bg-destructive/15 text-destructive" :
    value >= thresholds[1] ? "bg-warning/15 text-warning-foreground" :
    value >= thresholds[0] ? "bg-info/10 text-info" :
    "bg-muted/60 text-muted-foreground";

  return (
    <span className={cn("inline-flex items-center justify-center font-mono text-[11px] font-semibold rounded-md px-2 py-0.5 min-w-[28px]", cls)}>
      {value}
    </span>
  );
}

function WorkloadBar({ value }: { value: number }) {
  const color =
    value >= 70 ? "bg-destructive" :
    value >= 40 ? "bg-warning" :
    "bg-success";

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", color)} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
      <span className="text-[10px] font-mono w-6 text-right text-muted-foreground">{value}</span>
    </div>
  );
}

// ── Activity Pulse ───────────────────────────────────────────────────────────

type PulseFilter = "all" | "call" | "tour_scheduled" | "whatsapp" | "site_visit" | "stage_changed";

function PulseTab() {
  const [filter, setFilter] = useState<PulseFilter>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["people360", "pulse", filter],
    queryFn: () => api.people360.pulse({ limit: 100, kind: filter === "all" ? undefined : filter }) as Promise<{ items: PulseEvent[] }>,
    refetchInterval: 30_000,
  });

  const filters: { key: PulseFilter; label: string; Icon: typeof Phone }[] = [
    { key: "all", label: "All", Icon: Activity },
    { key: "call", label: "Calls", Icon: Phone },
    { key: "tour_scheduled", label: "Tours", Icon: CalendarCheck },
    { key: "whatsapp", label: "WhatsApp", Icon: MessageSquare },
    { key: "site_visit", label: "Visits", Icon: MapPin },
    { key: "stage_changed", label: "Stage Changes", Icon: Zap },
  ];

  const items = data?.items ?? [];

  // Group by time bucket
  const grouped = useMemo(() => {
    const now = Date.now();
    const HOUR = 3_600_000;
    const DAY = 86_400_000;
    const buckets: { label: string; items: PulseEvent[] }[] = [
      { label: "Last Hour", items: [] },
      { label: "Today", items: [] },
      { label: "This Week", items: [] },
      { label: "Older", items: [] },
    ];

    for (const item of items) {
      const ts = new Date(item.occurredAt).getTime();
      const diff = now - ts;
      if (diff < HOUR) buckets[0].items.push(item);
      else if (diff < DAY) buckets[1].items.push(item);
      else if (diff < 7 * DAY) buckets[2].items.push(item);
      else buckets[3].items.push(item);
    }

    return buckets.filter(b => b.items.length > 0);
  }, [items]);

  if (isLoading) return <LoadingState label="Loading activity pulse…" />;
  if (isError) return <ErrorState />;

  return (
    <div className="space-y-5">
      {/* Sub-filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "text-[11px] font-medium rounded-full px-3 py-1 transition-colors inline-flex items-center gap-1.5",
              filter === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground",
            )}
          >
            <Icon className="h-3 w-3" />
            {label}
          </button>
        ))}
      </div>

      {/* Timeline */}
      {grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No activity found for this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map((bucket) => (
            <div key={bucket.label}>
              <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-3 pl-1">
                {bucket.label}
              </h3>
              <div className="space-y-1.5">
                {bucket.items.map((evt) => (
                  <PulseEventCard key={evt.activityId} event={evt} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PulseEventCard({ event: e }: { event: PulseEvent }) {
  const kindIcon: Record<string, typeof Phone> = {
    call: Phone,
    whatsapp: MessageSquare,
    tour_scheduled: CalendarCheck,
    site_visit: MapPin,
    stage_changed: Zap,
    created: CheckCircle2,
    assigned: Users,
    note: Eye,
  };
  const Icon = kindIcon[e.kind] || Activity;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/30 transition-colors">
      <div className="mt-0.5 h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-sm">{e.actorName}</span>
          <span className="text-[11px] text-muted-foreground">·</span>
          <span className="text-[11px] text-muted-foreground">{e.subject}</span>
        </div>
        {e.entityName && (
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {e.entityType === "lead" ? "Lead: " : ""}{e.entityName}
          </p>
        )}
      </div>
      <div className="text-[10px] text-muted-foreground font-mono whitespace-nowrap shrink-0">
        {formatDistanceToNow(new Date(e.occurredAt), { addSuffix: true })}
      </div>
    </div>
  );
}

// ── Attrition Risk Radar ─────────────────────────────────────────────────────

type RiskFilter = "all" | "critical" | "high" | "medium" | "low";

function RiskTab() {
  const [filter, setFilter] = useState<RiskFilter>("all");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["people360", "risk"],
    queryFn: () => api.people360.risk() as Promise<{ items: RiskRow[] }>,
    refetchInterval: 60_000,
  });

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (filter === "all") return all;
    return all.filter((r) => r.riskLevel === filter);
  }, [data, filter]);

  const [visibleCount, setVisibleCount] = useState(10);

  const filters: { key: RiskFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ];

  if (isLoading) return <LoadingState label="Analyzing attrition signals…" />;
  if (isError) return <ErrorState />;

  const criticalCount = (data?.items ?? []).filter(r => r.riskLevel === "critical").length;
  const highCount = (data?.items ?? []).filter(r => r.riskLevel === "high").length;

  return (
    <div className="space-y-5">
      {/* Alert banner */}
      {(criticalCount + highCount) > 0 && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <p className="text-sm text-destructive">
            <span className="font-semibold">{criticalCount + highCount} team member{criticalCount + highCount > 1 ? "s" : ""}</span> at elevated risk.
            {criticalCount > 0 && <span className="ml-1">({criticalCount} critical)</span>}
          </p>
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={cn(
              "text-[11px] font-medium rounded-full px-3 py-1 transition-colors",
              filter === key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Risk Cards */}
      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
          No team members in this risk category.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.slice(0, visibleCount).map((row) => (
            <RiskCard key={row.userId} row={row} />
          ))}
        </div>
      )}
      {items.length > visibleCount && (
        <div className="pt-2 text-center">
          <button 
            className="text-xs bg-card hover:bg-muted text-foreground border border-border px-4 py-1.5 rounded transition-colors shadow-sm"
            onClick={() => setVisibleCount(v => v + 10)}
          >
            Load More ({items.length - visibleCount} remaining)
          </button>
        </div>
      )}
    </div>
  );
}

const RISK_STYLES: Record<RiskRow["riskLevel"], { bg: string; text: string; border: string; label: string }> = {
  critical: { bg: "bg-destructive/10", text: "text-destructive", border: "border-destructive/40", label: "Critical" },
  high: { bg: "bg-warning/10", text: "text-warning-foreground", border: "border-warning/40", label: "High" },
  medium: { bg: "bg-info/10", text: "text-info", border: "border-info/40", label: "Medium" },
  low: { bg: "bg-success/10", text: "text-success", border: "border-success/40", label: "Low" },
};

function RiskCard({ row }: { row: RiskRow }) {
  const style = RISK_STYLES[row.riskLevel];
  const isPulsing = row.riskLevel === "critical" || row.riskLevel === "high";

  return (
    <article className={cn(
      "rounded-xl border bg-card p-4 space-y-3 transition-all",
      style.border,
      isPulsing && "animate-pulse-subtle",
    )}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <img src={row.avatar} alt="" className="w-8 h-8 rounded-full bg-muted" />
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm text-foreground truncate">{row.name || "Unknown"}</div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
              style.bg, style.text,
            )}>
              {style.label}
            </span>
            <span className="text-[10px] font-mono text-muted-foreground">
              Score: {row.riskScore}
            </span>
          </div>
        </div>
      </div>

      {/* Signal Bars */}
      <div className="space-y-2 pt-1">
        <SignalBar
          label="Activity Decline"
          value={row.signals.activityTrend}
          icon={row.signals.activityTrend > 30 ? TrendingDown : TrendingUp}
        />
        <SignalBar
          label="Conversion Drop"
          value={row.signals.conversionTrend}
          icon={row.signals.conversionTrend > 30 ? TrendingDown : TrendingUp}
        />
        <SignalBar
          label="Overdue Ratio"
          value={row.signals.overdueRatio}
          icon={AlertTriangle}
        />
        <SignalBar
          label="Login Recency"
          value={row.signals.loginRecency}
          icon={Clock}
          sub={`${row.signals.lastLoginDaysAgo}d ago`}
        />
      </div>
    </article>
  );
}

function SignalBar({ label, value, icon: Icon, sub }: { label: string; value: number; icon: typeof TrendingDown; sub?: string }) {
  const color =
    value >= 70 ? "bg-destructive" :
    value >= 40 ? "bg-warning" :
    "bg-success";

  return (
    <div>
      <div className="flex justify-between text-[10px] text-muted-foreground mb-0.5">
        <span className="flex items-center gap-1">
          <Icon className="h-2.5 w-2.5" />
          {label}
        </span>
        <span className="font-mono">{value}{sub ? ` · ${sub}` : ""}</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${Math.min(100, value)}%` }}
        />
      </div>
    </div>
  );
}

// ── Shared ───────────────────────────────────────────────────────────────────

function SummaryCard({ label, value, suffix, sub, accent }: { label: string; value: string | number; suffix?: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("font-display text-xl font-semibold tabular-nums truncate", accent && "text-accent")}>
        {value}
        {suffix && <span className="text-muted-foreground text-xs font-normal">{suffix}</span>}
      </div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function LoadingState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] space-y-3">
      <div className="h-8 w-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
      <p className="text-sm text-muted-foreground animate-pulse">{label}</p>
    </div>
  );
}

function ErrorState() {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-10 text-center text-sm text-destructive">
      Failed to load data. Check your backend connection.
    </div>
  );
}
