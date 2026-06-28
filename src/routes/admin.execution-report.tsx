import { createFileRoute } from "@tanstack/react-router";
import { apiClient } from "@/lib/api/client";
import { useEffect, useState, useCallback, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import {
  AlertTriangle, Clock, Users, TrendingUp, CheckCircle2, XCircle,
  Activity, RefreshCw, ChevronDown, ChevronUp, Flame, Target,
  AlertCircle, UserX, ArrowRight, Download, List, BarChart2,
  PieChart, LayoutGrid, FileText, ChevronDown as ChevronDownIcon
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  leadsUpdatedLast30: number;
  propertiesSharedLast30: number;
  followUpsLast30: number;
  scheduledLast30: number;
  visitsLast30: number;
  bookingsLast30: number;
  bookingsToday: number;
  visitsToday: number;
  crmCompletionPct: number;
  missingOwners: number;
  missingNextActions: number;
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
  rawActivityLog: any[];
  featureUsage: any[];
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
    "new": "bg-slate-500 text-white",
    "contacted": "bg-blue-500 text-white",
    "tour-scheduled": "bg-violet-500 text-white",
    "on-tour": "bg-amber-500 text-amber-950",
    "tour-done": "bg-teal-500 text-teal-950",
    "negotiation": "bg-orange-500 text-white",
    "quote-sent": "bg-green-500 text-white",
    "not-responding-3d": "bg-red-400 text-red-950",
    "not-responding-7d": "bg-red-600 text-white",
    "booked": "bg-emerald-600 text-white",
    "dropped": "bg-gray-400 text-gray-900",
  };
  return map[stage] ?? "bg-slate-400 text-white";
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

// ─── Page ───────────────────────────────────────────────────────────────────────

function ExecutionMonitorPage() {
  const [report, setReport] = useState<ExecutionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowMins, setWindowMins] = useState(30);
  const [nextRefreshAt, setNextRefreshAt] = useState<number>(Date.now() + 30000);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiClient.get<ExecutionReport>("/api/admin/execution-report", {
        params: { window_minutes: windowMins },
      });
      setReport(res);
      setNextRefreshAt(Date.now() + windowMins * 60000);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [windowMins]);

  useEffect(() => {
    fetchReport();
    const interval = setInterval(() => {
      fetchReport();
    }, windowMins * 60000);
    return () => clearInterval(interval);
  }, [fetchReport, windowMins]);

  const downloadCSV = (filename: string, content: string) => {
    const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportRawActivity = () => {
    if (!report) return;
    const header = ["Time", "Employee", "Action", "Remarks/Subject"];
    const rows = report.rawActivityLog.map(log => [
      new Date(log.time).toLocaleString(),
      log.employee,
      log.action,
      `"${(log.detail || "").replace(/"/g, '""')}"`
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`raw-activity-${report.generatedAt}.csv`, csvContent);
  };

  const exportMemberSummary = () => {
    if (!report) return;
    const header = ["Employee", "Leads Added", "Total Actions", "Scheduled", "Quotations", "Visits", "Bookings", "CRM Completion %"];
    const rows = report.members.map(m => [
      `"${m.name}"`,
      m.totalLeadsAdded,
      m.totalActions,
      m.scheduledStageCount,
      m.totalQuotations,
      m.visitsToday,
      m.bookingsToday,
      m.crmCompletionPct
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`member-summary-${report.generatedAt}.csv`, csvContent);
  };

  if (!report && loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin mb-4 opacity-50" />
        <p>Generating real-time execution report...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold mb-1">Failed to load report</h3>
            <p className="text-sm opacity-90">{error}</p>
            <Button onClick={fetchReport} variant="outline" className="mt-3 text-red-400 border-red-500/30">
              Retry
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!report) return null;

  return (
    <div className="max-w-[1600px] mx-auto p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-500">
      {/* ── Header ── */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-violet-500" />
            Command Center
          </h1>
          <p className="text-slate-400 mt-2">
            Live Execution Monitoring • Window: <span className="font-bold text-white">{report.windowMinutes}m</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-slate-400 bg-slate-800/50 px-4 py-2 rounded-full border border-slate-700/50">
            <Clock className="w-4 h-4" />
            <span>Updated {fmtTime(report.generatedAt)}</span>
          </div>
          <Button
            onClick={fetchReport}
            variant="outline"
            className="bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-slate-800/50 border-slate-700 hover:bg-slate-700 hover:text-white">
                <Download className="w-4 h-4 mr-2" />
                Download
                <ChevronDownIcon className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48 bg-slate-800 border-slate-700 text-slate-200">
              <DropdownMenuItem onClick={exportRawActivity} className="cursor-pointer hover:bg-slate-700">
                <List className="w-4 h-4 mr-2 text-violet-400" />
                Raw Activity Log
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMemberSummary} className="cursor-pointer hover:bg-slate-700">
                <BarChart2 className="w-4 h-4 mr-2 text-violet-400" />
                Member Summary
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Critical Alerts ── */}
      {report.summary.criticalAlerts.length > 0 && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-red-400 font-bold mb-3">
            <AlertTriangle className="w-5 h-5" />
            CRITICAL ALERTS
          </div>
          <div className="space-y-2">
            {report.summary.criticalAlerts.map((alert, idx) => (
              <div key={idx} className="text-red-200 text-sm bg-red-900/20 px-3 py-2 rounded-lg border border-red-500/10">
                {alert}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── KPI Grid ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
            Total Members
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-black text-white">{report.summary.totalMembers}</div>
          <div className="text-xs text-slate-500 mt-1">Active on floor today</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
            Inactive ({report.windowMinutes}m)
            <UserX className="w-4 h-4 text-red-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.inactiveMembers > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {report.summary.inactiveMembers}
          </div>
          <div className="text-xs text-slate-500 mt-1">Require immediate manager action</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
            Stuck Leads
            <Target className="w-4 h-4 text-orange-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.stuckMembers > 0 ? "text-orange-400" : "text-emerald-400"}`}>
            {report.summary.stuckMembers} members
          </div>
          <div className="text-xs text-slate-500 mt-1">Have leads stuck &gt; 30m</div>
        </div>
        <div className="bg-slate-800/50 border border-slate-700/50 p-5 rounded-xl">
          <div className="text-slate-400 text-sm font-medium mb-1 flex items-center justify-between">
            Behind Targets
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.behindOnTargets > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {report.summary.behindOnTargets}
          </div>
          <div className="text-xs text-slate-500 mt-1">Missed daily execution targets</div>
        </div>
      </div>

      {/* ── Tabs for Sheets ── */}
      <Tabs defaultValue="dashboard" className="w-full">
        <TabsList className="bg-slate-800/50 border border-slate-700/50 mb-6 flex flex-wrap h-auto gap-2 p-1">
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <LayoutGrid className="w-4 h-4 mr-2" /> 30-Min Dashboard
          </TabsTrigger>
          <TabsTrigger value="matrix" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <BarChart2 className="w-4 h-4 mr-2" /> Lead Stage Matrix
          </TabsTrigger>
          <TabsTrigger value="scoreboard" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <TrendingUp className="w-4 h-4 mr-2" /> EOD Scoreboard
          </TabsTrigger>
          <TabsTrigger value="low-activity" className="data-[state=active]:bg-red-600 data-[state=active]:text-white">
            <AlertTriangle className="w-4 h-4 mr-2" /> Low Activity Alerts
          </TabsTrigger>
          <TabsTrigger value="features" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <PieChart className="w-4 h-4 mr-2" /> Feature Usage
          </TabsTrigger>
          <TabsTrigger value="raw" className="data-[state=active]:bg-violet-600 data-[state=active]:text-white">
            <List className="w-4 h-4 mr-2" /> Raw Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Sheet 1: Raw CRM Activity ── */}
        <TabsContent value="raw">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Remarks / Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rawActivityLog.map((log, i) => (
                  <TableRow key={i} className="border-slate-800">
                    <TableCell className="text-slate-300 font-mono text-xs">{fmtTime(log.time)}</TableCell>
                    <TableCell className="text-white font-medium">{log.employee}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-slate-800 text-slate-300">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-400 text-xs truncate max-w-[300px]">{log.detail || "—"}</TableCell>
                  </TableRow>
                ))}
                {report.rawActivityLog.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-slate-500">No recent activity.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 2: 30-Minute Dashboard ── */}
        <TabsContent value="dashboard">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Leads Added (30m)</TableHead>
                  <TableHead className="text-right">Total Clicks (30m)</TableHead>
                  <TableHead className="text-right">Prop Shared (30m)</TableHead>
                  <TableHead className="text-right">Scheduled (30m)</TableHead>
                  <TableHead className="text-right">Quotations (30m)</TableHead>
                  <TableHead>Most Used Feature</TableHead>
                  <TableHead>Inactive?</TableHead>
                  <TableHead>Stuck Leads</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className={`border-slate-800 ${m.isInactive ? "bg-red-950/10" : ""}`}>
                    <TableCell className="font-bold text-white">{m.name}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.leadsAddedLast30}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.actionsLast30}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.propertiesSharedLast30 || 0}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.scheduledLast30 || 0}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.quotationsLast30}</TableCell>
                    <TableCell>
                      {m.mostUsedActions.length > 0 ? (
                        <span className="text-xs text-slate-400 bg-slate-800 px-2 py-1 rounded">{m.mostUsedActions[0].action}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {m.isInactive ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Yes</Badge> : <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">No</Badge>}
                    </TableCell>
                    <TableCell>
                      {m.stuckLeads.length > 0 ? <span className="text-orange-400 font-bold">{m.stuckLeads.length}</span> : <span className="text-slate-500">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 3: Lead Stage Matrix ── */}
        <TabsContent value="matrix">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  {Object.values(STAGE_LABEL).map(label => <TableHead key={label} className="text-center text-xs">{label}</TableHead>)}
                  <TableHead className="text-center font-bold">Total Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className="border-slate-800">
                    <TableCell className="font-medium text-white">{m.name}</TableCell>
                    {Object.keys(STAGE_LABEL).map(stageKey => (
                      <TableCell key={stageKey} className="text-center">
                        {m.stageDistribution[stageKey] ? (
                          <span className={`inline-flex items-center justify-center min-w-[24px] h-6 rounded px-1.5 text-xs font-medium ${stageColor(stageKey)}`}>
                            {m.stageDistribution[stageKey]}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-center font-bold text-violet-400">{m.totalActiveLeads}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 4: Low Activity Alert ── */}
        <TabsContent value="low-activity">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Idle Time</TableHead>
                  <TableHead>Leads Added</TableHead>
                  <TableHead>Total Clicks</TableHead>
                  <TableHead>Stuck Stages</TableHead>
                  <TableHead>Manager Action Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.filter(m => m.isInactive || m.stuckLeads.length > 0 || m.followUpsRequired.length > 0).map((m) => (
                  <TableRow key={m.userId} className="border-slate-800 bg-red-950/5">
                    <TableCell className="font-bold text-white">{m.name}</TableCell>
                    <TableCell className="text-slate-300">{fmtTime(m.lastActionAt)}</TableCell>
                    <TableCell>
                      {m.isInactive ? (
                        <span className="text-red-400 font-bold">{m.minutesSinceLastAction} min</span>
                      ) : (
                        <span className="text-emerald-400">{m.minutesSinceLastAction} min</span>
                      )}
                    </TableCell>
                    <TableCell className="text-slate-300">{m.totalLeadsAdded}</TableCell>
                    <TableCell className="text-slate-300">{m.totalActions}</TableCell>
                    <TableCell>
                      {m.stuckLeads.map((s, i) => (
                        <div key={i} className="text-xs text-orange-400 mb-1">
                          {s.leadName} ({s.minutesInStage}m in {STAGE_LABEL[s.stage] || s.stage})
                        </div>
                      ))}
                      {m.stuckLeads.length === 0 && <span className="text-slate-500">—</span>}
                    </TableCell>
                    <TableCell>
                      {m.followUpsRequired.map((f, i) => (
                        <div key={i} className="text-xs text-amber-400 mb-1">• {f}</div>
                      ))}
                      {m.isInactive && <div className="text-xs text-red-400 font-bold">• Check inactivity</div>}
                    </TableCell>
                  </TableRow>
                ))}
                {report.members.filter(m => m.isInactive || m.stuckLeads.length > 0 || m.followUpsRequired.length > 0).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-emerald-500 font-medium">All members active and no stuck leads! 🎉</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 5: Feature Usage Analytics ── */}
        <TabsContent value="features">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Feature / Action</TableHead>
                  <TableHead className="text-right">Total Clicks</TableHead>
                  <TableHead className="text-right">Unique Users</TableHead>
                  <TableHead className="text-right">Avg / User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.featureUsage.map((f, i) => (
                  <TableRow key={i} className="border-slate-800">
                    <TableCell className="font-medium text-white">{f.feature}</TableCell>
                    <TableCell className="text-right text-violet-400 font-mono">{f.totalClicks}</TableCell>
                    <TableCell className="text-right text-slate-300">{f.uniqueUsers}</TableCell>
                    <TableCell className="text-right text-slate-400">{f.avgPerUser}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 6: End-of-Day Scoreboard ── */}
        <TabsContent value="scoreboard">
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-800/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead className="text-right">Leads Added</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Quotations</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">CRM Completion %</TableHead>
                  <TableHead className="text-right">Missing Owners</TableHead>
                  <TableHead className="text-right">Missing Actions</TableHead>
                  <TableHead className="text-center">Final Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className="border-slate-800">
                    <TableCell className="font-bold text-white">{m.name}</TableCell>
                    <TableCell className="text-right text-slate-300">{m.totalLeadsAdded}</TableCell>
                    <TableCell className={`text-right font-medium ${m.scheduledStageCount >= report.successCriteria.scheduledTarget ? "text-emerald-400" : "text-amber-400"}`}>{m.scheduledStageCount}</TableCell>
                    <TableCell className={`text-right font-medium ${m.totalQuotations >= report.successCriteria.quotationTarget ? "text-emerald-400" : "text-amber-400"}`}>{m.totalQuotations}</TableCell>
                    <TableCell className="text-right text-violet-400 font-bold">{m.visitsToday || 0}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold">{m.bookingsToday || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={m.crmCompletionPct >= 100 ? "text-emerald-400" : "text-amber-400"}>{m.crmCompletionPct || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right ${m.missingOwners > 0 ? "text-red-400 font-bold" : "text-slate-500"}`}>{m.missingOwners || 0}</TableCell>
                    <TableCell className={`text-right ${m.missingNextActions > 0 ? "text-red-400 font-bold" : "text-slate-500"}`}>{m.missingNextActions || 0}</TableCell>
                    <TableCell className="text-center">
                      {m.allCriteriaMet ? (
                        <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">Target Met</Badge>
                      ) : (
                        <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/30">Pending</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}
