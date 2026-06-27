import { createFileRoute } from "@tanstack/react-router";
import { apiClient } from "@/lib/api/client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  AlertTriangle, Clock, Users, TrendingUp, CheckCircle2, XCircle,
  Activity, RefreshCw, ChevronDown, ChevronUp, Flame, Target,
  AlertCircle, UserX, ArrowRight, Download,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface LeadStageEntry {
  leadId: string;
  leadName: string;
  stage: string;
  minutesInStage: number;
  isStuck: boolean;
}

interface UserAction {
  action: string;
  entityType?: string;
  detail?: string;
  occurredAt: string;
}

interface MemberReport {
  userId: string;
  name: string;
  role: string;
  zones: string[];
  totalLeadsAdded: number;
  leadsAddedLast30: number;
  stageDistribution: Record<string, number>;
  totalActiveLeads: number;
  stuckLeads: LeadStageEntry[];
  totalQuotations: number;
  quotationsLast30: number;
  totalActions: number;
  actionsLast30: number;
  mostUsedActions: { action: string; count: number }[];
  recentActions: UserAction[];
  lastActionAt: string | null;
  minutesSinceLastAction: number | null;
  isInactive: boolean;
  leadsByStage: { stage: string; count: number }[];
  followUpsRequired: string[];
  scheduledStageCount: number;
  quotationsMet: boolean;
  allCriteriaMet: boolean;
}

interface ExecutionReport {
  generatedAt: string;
  windowMinutes: number;
  windowStart: string;
  members: MemberReport[];
  summary: {
    totalMembers: number;
    inactiveMembers: number;
    stuckMembers: number;
    behindOnTargets: number;
    criticalAlerts: string[];
  };
  successCriteria: {
    scheduledTarget: number;
    quotationTarget: number;
  };
}

// ─── Route ──────────────────────────────────────────────────────────────────────

export const Route = createFileRoute("/admin/execution-report")({
  head: () => ({ meta: [{ title: "Execution Monitor — Admin" }] }),
  component: ExecutionMonitorPage,
});

// ─── Utilities ─────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtMins(mins: number | null): string {
  if (mins === null) return "Never";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function stageColor(stage: string): string {
  const map: Record<string, string> = {
    "new": "bg-slate-500",
    "contacted": "bg-blue-500",
    "tour-scheduled": "bg-violet-500",
    "on-tour": "bg-amber-500",
    "tour-done": "bg-teal-500",
    "negotiation": "bg-orange-500",
    "quote-sent": "bg-green-500",
    "not-responding-3d": "bg-red-400",
    "not-responding-7d": "bg-red-600",
    "booked": "bg-emerald-600",
    "dropped": "bg-gray-400",
  };
  return map[stage] ?? "bg-slate-400";
}

const STAGE_LABEL: Record<string, string> = {
  "new": "New",
  "contacted": "Contacted",
  "tour-scheduled": "Scheduled",
  "on-tour": "On Tour",
  "tour-done": "Tour Done",
  "negotiation": "Negotiating",
  "quote-sent": "Quote Sent",
  "not-responding-3d": "NR 3d",
  "not-responding-7d": "NR 7d",
  "booked": "Booked",
  "dropped": "Dropped",
};

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function CountdownTimer({ nextRefreshAt, windowMinutes }: { nextRefreshAt: number; windowMinutes: number }) {
  const [secsLeft, setSecsLeft] = useState(0);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, Math.round((nextRefreshAt - Date.now()) / 1000));
      setSecsLeft(diff);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextRefreshAt]);

  const totalSecs = windowMinutes * 60;
  const pct = Math.round(((totalSecs - secsLeft) / totalSecs) * 100);
  const mins = Math.floor(secsLeft / 60);
  const secs = secsLeft % 60;

  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        <Clock className="w-4 h-4" />
        <span>Next report in</span>
        <span className="font-mono font-bold text-white text-base">
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </span>
      </div>
      <div className="w-32">
        <Progress value={pct} className="h-1.5 bg-slate-700 [&>div]:bg-violet-500" />
      </div>
    </div>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ member }: { member: MemberReport }) {
  if (member.isInactive) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
        <UserX className="w-3 h-3" /> INACTIVE
      </span>
    );
  }
  if (member.allCriteriaMet) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
        <CheckCircle2 className="w-3 h-3" /> ON TRACK
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
      <AlertCircle className="w-3 h-3" /> BEHIND
    </span>
  );
}

// ─── Member Card ──────────────────────────────────────────────────────────────

function MemberCard({
  member,
  criteria,
  window: win,
}: {
  member: MemberReport;
  criteria: { scheduledTarget: number; quotationTarget: number };
  window: number;
}) {
  const [expanded, setExpanded] = useState(member.isInactive || member.stuckLeads.length > 0);

  const scheduledPct = Math.min(100, Math.round((member.scheduledStageCount / criteria.scheduledTarget) * 100));
  const quotePct = Math.min(100, Math.round((member.totalQuotations / criteria.quotationTarget) * 100));

  return (
    <div
      className={`rounded-xl border transition-all ${
        member.isInactive
          ? "border-red-500/40 bg-red-950/20"
          : member.allCriteriaMet
          ? "border-emerald-500/30 bg-emerald-950/10"
          : "border-slate-700/60 bg-slate-800/40"
      }`}
    >
      {/* Header row */}
      <div
        className="flex items-center gap-4 px-5 py-4 cursor-pointer select-none"
        onClick={() => setExpanded((p) => !p)}
      >
        {/* Avatar */}
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${
            member.isInactive ? "bg-red-700 text-red-100" : "bg-slate-700 text-slate-200"
          }`}
        >
          {member.name.slice(0, 2).toUpperCase()}
        </div>

        {/* Name + status */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-white truncate">{member.name}</span>
            <StatusBadge member={member} />
            {member.stuckLeads.length > 0 && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-orange-500/20 text-orange-400 border border-orange-500/30">
                <AlertTriangle className="w-3 h-3" /> {member.stuckLeads.length} stuck
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-0.5">
            {member.role.toUpperCase()}
            {member.zones.length > 0 && <> · {member.zones.slice(0, 2).join(", ")}</>}
            {" · "}
            Last action: <span className="text-slate-400">{fmtMins(member.minutesSinceLastAction)}</span>
          </div>
        </div>

        {/* Quick stats row */}
        <div className="hidden sm:flex items-center gap-6 text-sm shrink-0">
          <div className="text-center">
            <div className="font-bold text-white text-lg leading-none">{member.totalLeadsAdded}</div>
            <div className="text-slate-500 text-xs mt-0.5">leads today</div>
          </div>
          <div className="text-center">
            <div className={`font-bold text-lg leading-none ${member.scheduledStageCount >= criteria.scheduledTarget ? "text-emerald-400" : "text-white"}`}>
              {member.scheduledStageCount}
              <span className="text-slate-500 text-xs font-normal">/{criteria.scheduledTarget}</span>
            </div>
            <div className="text-slate-500 text-xs mt-0.5">scheduled</div>
          </div>
          <div className="text-center">
            <div className={`font-bold text-lg leading-none ${member.quotationsMet ? "text-emerald-400" : "text-white"}`}>
              {member.totalQuotations}
              <span className="text-slate-500 text-xs font-normal">/{criteria.quotationTarget}</span>
            </div>
            <div className="text-slate-500 text-xs mt-0.5">quotes</div>
          </div>
          <div className="text-center">
            <div className="font-bold text-white text-lg leading-none">{member.actionsLast30}</div>
            <div className="text-slate-500 text-xs mt-0.5">actions/{win}m</div>
          </div>
        </div>

        {/* Expand toggle */}
        <div className="text-slate-500 shrink-0">
          {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </div>

      {/* Progress bars */}
      <div className="px-5 pb-3 grid grid-cols-2 gap-3">
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Leads → Scheduled</span>
            <span className={scheduledPct >= 100 ? "text-emerald-400" : "text-slate-400"}>
              {member.scheduledStageCount}/{criteria.scheduledTarget}
            </span>
          </div>
          <Progress value={scheduledPct} className="h-1.5 bg-slate-700 [&>div]:bg-violet-500" />
        </div>
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Quotations</span>
            <span className={quotePct >= 100 ? "text-emerald-400" : "text-slate-400"}>
              {member.totalQuotations}/{criteria.quotationTarget}
            </span>
          </div>
          <Progress value={quotePct} className="h-1.5 bg-slate-700 [&>div]:bg-green-500" />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-slate-700/50 px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Stage distribution */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Pipeline ({member.totalActiveLeads} active leads)
            </div>
            <div className="space-y-2">
              {member.leadsByStage.map(({ stage, count }) => (
                <div key={stage} className="flex items-center gap-2 text-sm">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${stageColor(stage)}`} />
                  <span className="text-slate-300 flex-1 truncate">{STAGE_LABEL[stage] ?? stage}</span>
                  <span className="font-mono font-bold text-white">{count}</span>
                  <div className="w-20 bg-slate-700 rounded-full h-1.5">
                    <div
                      className={`${stageColor(stage)} h-1.5 rounded-full transition-all`}
                      style={{ width: `${Math.min(100, (count / Math.max(member.totalActiveLeads, 1)) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity & Stuck leads */}
          <div className="space-y-4">
            {/* Most used buttons */}
            <div>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                Most Used Actions Today
              </div>
              {member.mostUsedActions.length === 0 ? (
                <p className="text-xs text-slate-600">No actions logged yet</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {member.mostUsedActions.map(({ action, count }) => (
                    <span
                      key={action}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-slate-700/60 text-xs text-slate-300"
                    >
                      {action}
                      <span className="font-bold text-white">{count}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Click-by-click (recent actions) */}
            {member.recentActions.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Recent Activity (last {win}m)
                </div>
                <div className="space-y-1.5">
                  {member.recentActions.slice(0, 5).map((a, i) => (
                    <div key={i} className="flex items-start gap-2 text-xs">
                      <span className="text-slate-600 font-mono shrink-0 mt-0.5">{fmtTime(a.occurredAt)}</span>
                      <ArrowRight className="w-3 h-3 text-slate-600 shrink-0 mt-0.5" />
                      <span className="text-slate-400">
                        <span className="text-slate-200 font-medium">{a.action}</span>
                        {a.entityType && <> on {a.entityType}</>}
                        {a.detail && <> — {a.detail.slice(0, 60)}</>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Stuck leads */}
            {member.stuckLeads.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-orange-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Stuck &gt;{win}m in stage ({member.stuckLeads.length})
                </div>
                <div className="space-y-1.5">
                  {member.stuckLeads.slice(0, 6).map((l) => (
                    <div
                      key={l.leadId}
                      className="flex items-center gap-2 text-xs bg-orange-950/30 border border-orange-800/20 rounded-md px-2.5 py-1.5"
                    >
                      <span className={`w-2 h-2 rounded-full shrink-0 ${stageColor(l.stage)}`} />
                      <span className="text-slate-200 flex-1 truncate">{l.leadName}</span>
                      <span className="text-orange-400 font-mono shrink-0">
                        {l.minutesInStage >= 60
                          ? `${Math.floor(l.minutesInStage / 60)}h ${l.minutesInStage % 60}m`
                          : `${l.minutesInStage}m`}{" "}
                        in {STAGE_LABEL[l.stage] ?? l.stage}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Follow-ups */}
          {member.followUpsRequired.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2 flex items-center gap-1">
                <Flame className="w-3 h-3" />
                Follow-up Actions Required
              </div>
              <ul className="space-y-1">
                {member.followUpsRequired.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-300">
                    <XCircle className="w-3 h-3 text-red-400 shrink-0 mt-0.5" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function ExecutionMonitorPage() {
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState(30);
  const [nextRefreshAt, setNextRefreshAt] = useState(Date.now() + 30 * 60 * 1000);
  const refreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchReport = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const data = await apiClient.get<ExecutionReport>("/api/admin/execution-report", {
        params: { window_minutes: windowMinutes },
      });
      setReport(data);
      const nextAt = Date.now() + windowMinutes * 60 * 1000;
      setNextRefreshAt(nextAt);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load report");
    } finally {
      setLoading(false);
    }
  }, [windowMinutes]);

  // Auto-refresh every windowMinutes
  useEffect(() => {
    fetchReport();
    const schedule = () => {
      refreshTimeoutRef.current = setTimeout(() => {
        fetchReport(true);
        schedule();
      }, windowMinutes * 60 * 1000);
    };
    schedule();
    return () => {
      if (refreshTimeoutRef.current) clearTimeout(refreshTimeoutRef.current);
    };
  }, [fetchReport, windowMinutes]);

  const [downloading, setDownloading] = useState(false);

  const downloadActivityCsv = async () => {
    setDownloading(true);
    try {
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const data = await apiClient.get<{ items: any[] }>("/api/admin/user-actions", {
        params: { limit: 5000, since: startOfDay },
      });
      
      if (!data?.items || data.items.length === 0) {
        alert("No activities found to download for today.");
        return;
      }
      
      const headers = ["Timestamp", "User ID", "User Name", "User Role", "Action", "Entity Type", "Entity ID", "Details"];
      const rows = data.items.map(item => {
        const payload = item.payload || {};
        return [
          item.occurredAt || "",
          payload.userId || item.actor || "",
          payload.userName || "",
          payload.userRole || "",
          payload.action || "",
          payload.entityType || "",
          payload.entityId || "",
          payload.detail || ""
        ].map(val => `"${String(val).replace(/"/g, '""')}"`);
      });
      
      const csvContent = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `gharpayy_activity_report_${now.toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err: any) {
      alert("Failed to download CSV report: " + (err.message || err));
    } finally {
      setDownloading(false);
    }
  };

  const WINDOW_OPTIONS = [15, 30, 60] as const;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Target className="w-5 h-5 text-violet-400" />
            <h1 className="text-xl font-bold tracking-tight">Execution Monitor</h1>
            <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
              ADMIN
            </span>
          </div>
          <p className="text-sm text-slate-500">
            Floor execution report · Live team activity · Every {windowMinutes} minutes
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Window selector */}
          <div className="flex items-center gap-1 bg-slate-800 rounded-lg p-1 border border-slate-700">
            {WINDOW_OPTIONS.map((w) => (
              <button
                key={w}
                onClick={() => setWindowMinutes(w)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  windowMinutes === w
                    ? "bg-violet-600 text-white"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-700"
                }`}
              >
                {w}m
              </button>
            ))}
          </div>

          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => fetchReport()}
            disabled={loading}
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Button
            size="sm"
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={downloadActivityCsv}
            disabled={downloading}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {downloading ? "Downloading..." : "Export Report"}
          </Button>
        </div>
      </div>

      {/* Countdown */}
      {report && (
        <div className="mb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-900 rounded-lg border border-slate-800">
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span>
              Report generated{" "}
              <span className="text-slate-300">
                {new Date(report.generatedAt).toLocaleTimeString("en-IN", {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                  hour12: true,
                })}
              </span>
            </span>
            <span>·</span>
            <span>Window: last {report.windowMinutes} minutes</span>
          </div>
          <CountdownTimer nextRefreshAt={nextRefreshAt} windowMinutes={windowMinutes} />
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-5 flex items-center gap-2 p-4 rounded-lg bg-red-950/30 border border-red-800/40 text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && !report && (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-slate-700/60 bg-slate-800/40 p-5 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-700" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-700 rounded w-48" />
                  <div className="h-3 bg-slate-800 rounded w-32" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {report && (
        <>
          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            {[
              {
                label: "Team Members",
                value: report.summary.totalMembers,
                icon: <Users className="w-4 h-4 text-slate-400" />,
                color: "text-white",
              },
              {
                label: "Inactive",
                value: report.summary.inactiveMembers,
                icon: <UserX className="w-4 h-4 text-red-400" />,
                color: report.summary.inactiveMembers > 0 ? "text-red-400" : "text-emerald-400",
              },
              {
                label: "Stuck Members",
                value: report.summary.stuckMembers,
                icon: <AlertTriangle className="w-4 h-4 text-orange-400" />,
                color: report.summary.stuckMembers > 0 ? "text-orange-400" : "text-emerald-400",
              },
              {
                label: "Behind Target",
                value: report.summary.behindOnTargets,
                icon: <TrendingUp className="w-4 h-4 text-amber-400" />,
                color: report.summary.behindOnTargets > 0 ? "text-amber-400" : "text-emerald-400",
              },
            ].map(({ label, value, icon, color }) => (
              <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  {icon}
                  <span className="text-xs text-slate-500">{label}</span>
                </div>
                <div className={`text-2xl font-bold ${color}`}>{value}</div>
              </div>
            ))}
          </div>

          {/* Critical alerts */}
          {report.summary.criticalAlerts.length > 0 && (
            <div className="mb-5 rounded-xl border border-red-800/40 bg-red-950/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-sm font-semibold text-red-400 uppercase tracking-wider">Critical Alerts</span>
              </div>
              <ul className="space-y-2">
                {report.summary.criticalAlerts.map((a, i) => (
                  <li key={i} className="text-sm text-red-300">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Day success criteria legend */}
          <div className="mb-5 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-semibold text-slate-300">End-of-Day Success Criteria</span>
            </div>
            <div className="flex flex-wrap gap-4 text-sm">
              <span className="text-slate-400">
                ≥ <strong className="text-violet-300">{report.successCriteria.scheduledTarget} leads</strong> progressed to Scheduled+
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                ≥ <strong className="text-green-300">{report.successCriteria.quotationTarget} quotations</strong> generated
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                <strong className="text-blue-300">CRM updated</strong> with complete data
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-slate-400">
                <strong className="text-amber-300">No lead</strong> without owner/next action
              </span>
            </div>
          </div>

          {/* Per-member cards */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-400" />
              <span className="text-sm font-semibold text-slate-300">
                Team ({report.members.length})
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-slate-600">
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                Inactive
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                Behind
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                On track
              </span>
            </div>
          </div>

          <div className="space-y-3">
            {report.members.map((member) => (
              <MemberCard
                key={member.userId}
                member={member}
                criteria={report.successCriteria}
                window={report.windowMinutes}
              />
            ))}
          </div>

          {report.members.length === 0 && (
            <div className="text-center py-16 text-slate-600">
              <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>No team members found.</p>
              <p className="text-xs mt-1">Make sure members with role "member" or "tcm" exist in the system.</p>
            </div>
          )}

          {/* Footer timestamp */}
          <div className="mt-8 text-center text-xs text-slate-700">
            Report window: {new Date(report.windowStart).toLocaleTimeString("en-IN")} → Now ·
            Auto-refreshes every {report.windowMinutes} minutes
          </div>
        </>
      )}
    </div>
  );
}
