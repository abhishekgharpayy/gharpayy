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
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function fmtMins(mins: number | null): string {
  if (mins === null) return "Never";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m ago`;
}

function stageColor(stage: string): string {
  const map: Record<string, string> = {
    "new": "bg-slate-500 text-foreground",
    "contacted": "bg-blue-500 text-foreground",
    "tour-scheduled": "bg-violet-500 text-foreground",
    "on-tour": "bg-amber-500 text-amber-950",
    "tour-done": "bg-teal-500 text-teal-950",
    "negotiation": "bg-orange-500 text-foreground",
    "quote-sent": "bg-green-500 text-foreground",
    "not-responding-3d": "bg-red-400 text-red-950",
    "not-responding-7d": "bg-red-600 text-foreground",
    "booked": "bg-emerald-600 text-foreground",
    "dropped": "bg-gray-400 text-gray-900",
  };
  return map[stage] ?? "bg-slate-400 text-foreground";
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
      log.time && !isNaN(new Date(log.time).getTime()) ? new Date(log.time).toLocaleString() : "—",
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

  const exportLeadStageMatrix = () => {
    if (!report) return;
    const header = ["Employee", "New", "Contacted", "Interested", "Scheduled", "Visited", "Booked"];
    const rows = report.members.map(m => [
      `"${m.name}"`,
      m.stageDistribution["new"] || 0,
      m.stageDistribution["contacted"] || 0,
      m.stageDistribution["interested"] || 0,
      m.stageDistribution["scheduled"] || 0,
      m.stageDistribution["visited"] || 0,
      m.stageDistribution["booked"] || 0
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`lead-stage-matrix-${report.generatedAt}.csv`, csvContent);
  };

  const exportEODScoreboard = () => {
    if (!report) return;
    const header = ["Employee", "Scheduled Target", "Scheduled Actual", "Quotations Target", "Quotations Actual", "Status"];
    const rows = report.members.map(m => [
      `"${m.name}"`,
      report.successCriteria.scheduledTarget,
      m.scheduledStageCount,
      report.successCriteria.quotationTarget,
      m.totalQuotations,
      m.allCriteriaMet ? "Target Met" : "Behind"
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`eod-scoreboard-${report.generatedAt}.csv`, csvContent);
  };

  const exportLowActivityAlerts = () => {
    if (!report) return;
    const header = ["Employee", "Inactive Status", "Stuck Leads Count", "Missing Follow-ups"];
    const rows = report.members.map(m => [
      `"${m.name}"`,
      m.isInactive ? "Yes" : "No",
      m.stuckLeads.length,
      m.followUpsRequired.length
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`low-activity-alerts-${report.generatedAt}.csv`, csvContent);
  };

  const exportFeatureUsage = () => {
    if (!report) return;
    const header = ["Feature", "Total Usage"];
    const rows = report.featureUsage.map(f => [
      f.action,
      f.count
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`feature-usage-${report.generatedAt}.csv`, csvContent);
  };

  const exportSummaryToPDF = async () => {
    if (!report) return;
    try {
      const { jsPDF } = await import("jspdf");
      const autoTableMod = await import("jspdf-autotable");
      const autoTable = autoTableMod.default;

      const doc = new jsPDF({ unit: "pt", format: "a4" });
      
      // Page 1: Overview Summary
      doc.setFontSize(22);
      doc.text("Gharpayy Execution Summary", 40, 50);
      doc.setFontSize(10);
      doc.text(`Generated At: ${new Date(report.generatedAt).toLocaleString()}`, 40, 68);
      doc.text(`Active Window: ${report.windowMinutes} mins | Total Members: ${report.summary.totalMembers}`, 40, 82);

      // Section 1: Global KPIs
      const totalLeadsAdded = report.members.reduce((acc, m) => acc + m.totalLeadsAdded, 0);
      const totalScheduled = report.members.reduce((acc, m) => acc + (m.scheduledStageCount || 0), 0);
      const totalQuotations = report.members.reduce((acc, m) => acc + m.totalQuotations, 0);
      const totalActions = report.members.reduce((acc, m) => acc + m.totalActions, 0);

      autoTable(doc, {
        startY: 100,
        head: [["KPI Metric", "Value"]],
        body: [
          ["Total Actions (Today)", String(totalActions)],
          ["Total Leads Added", String(totalLeadsAdded)],
          ["Total Scheduled", String(totalScheduled)],
          ["Total Quotations", String(totalQuotations)],
          ["Active Team Members", String(report.summary.totalMembers)],
          ["Inactive Team Members (Window)", String(report.summary.inactiveMembers)],
          ["Stuck Team Members (Window)", String(report.summary.stuckMembers)],
          ["Behind on Daily Targets", String(report.summary.behindOnTargets)],
        ],
        theme: "striped",
      });

      // Section 2: Top Performers
      const topPerformers = [...report.members]
        .sort((a, b) => b.totalActions - a.totalActions)
        .slice(0, 5);

      const performersBody = topPerformers.map((m, index) => [
        String(index + 1),
        m.name,
        m.role === "tcm" ? "TCM" : "Member",
        String(m.totalActions),
        String(m.actionsLast30)
      ]);

      doc.setFontSize(14);
      // @ts-ignore
      const finalY = doc.lastAutoTable.finalY || 280;
      doc.text("Top Performers (Most Actions)", 40, finalY + 40);

      autoTable(doc, {
        startY: finalY + 55,
        head: [["Rank", "Employee", "Role", "Total Actions", "Actions (Last 30m)"]],
        body: performersBody,
        theme: "grid",
      });

      // Section 3: Critical Alerts
      // @ts-ignore
      let finalY2 = doc.lastAutoTable.finalY || (finalY + 180);
      if (report.summary.criticalAlerts && report.summary.criticalAlerts.length > 0) {
        doc.setFontSize(14);
        doc.text("Critical Alerts & Operational Bottlenecks", 40, finalY2 + 40);
        
        const alertsBody = report.summary.criticalAlerts.map(alert => [alert]);
        autoTable(doc, {
          startY: finalY2 + 55,
          head: [["Alert Details"]],
          body: alertsBody,
          theme: "striped",
          headStyles: { fillColor: [220, 38, 38] } // Red color for alerts header
        });
        // @ts-ignore
        finalY2 = doc.lastAutoTable.finalY || (finalY2 + 100);
      }

      // Page 2: Detailed End-of-Day Scoreboard
      doc.addPage();
      doc.setFontSize(18);
      doc.text("End-of-Day (EOD) Scoreboard Details", 40, 50);
      doc.setFontSize(10);
      doc.text("Daily performance, targets, and compliance breakdown by employee.", 40, 68);

      const scoreboardBody = report.members.map((m) => [
        m.name,
        String(m.totalLeadsAdded),
        String(m.scheduledStageCount),
        String(m.totalQuotations),
        String(m.visitsToday || 0),
        String(m.bookingsToday || 0),
        `${m.crmCompletionPct || 0}%`,
        String(m.missingOwners),
        String(m.missingNextActions),
        m.allCriteriaMet ? "Target Met" : "Pending"
      ]);

      autoTable(doc, {
        startY: 90,
        head: [["Employee", "Leads Added", "Scheduled", "Quotations", "Visits", "Bookings", "CRM Comp. %", "Miss Owners", "Miss Actions", "Status"]],
        body: scoreboardBody,
        theme: "grid",
        headStyles: { fillColor: [109, 40, 217] }, // Violet color for scoreboard header
        styles: { fontSize: 8 }, // Smaller font size to fit columns cleanly
      });

      doc.save(`overall-summary-${report.generatedAt}.pdf`);
    } catch (e) {
      console.error("Failed to generate PDF", e);
      alert("Failed to generate PDF report.");
    }
  };

  if (!report && loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px] text-muted-foreground">
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
          <h1 className="text-3xl font-black text-foreground tracking-tight flex items-center gap-3">
            <Activity className="w-8 h-8 text-primary" />
            Command Center
          </h1>
          <p className="text-muted-foreground mt-2">
            Live Execution Monitoring • Window: <span className="font-bold text-foreground">{report.windowMinutes}m</span>
          </p>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card/50 px-4 py-2 rounded-full border border-border">
            <Clock className="w-4 h-4" />
            <span>Updated {fmtTime(report.generatedAt)}</span>
          </div>
          <Button
            onClick={fetchReport}
            variant="outline"
            className="bg-card/50 border-border hover:bg-muted hover:text-foreground"
            disabled={loading}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="bg-card/50 border-border hover:bg-muted hover:text-foreground">
                <Download className="w-4 h-4 mr-2" />
                Download
                <ChevronDownIcon className="w-4 h-4 ml-2" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 bg-card border-border text-foreground">
              <DropdownMenuItem onClick={exportSummaryToPDF} className="cursor-pointer hover:bg-muted font-bold text-primary/90">
                <FileText className="w-4 h-4 mr-2" />
                Download Summary (PDF)
              </DropdownMenuItem>
              <div className="h-px bg-muted my-1 mx-2" />
              <DropdownMenuItem onClick={exportMemberSummary} className="cursor-pointer hover:bg-muted">
                <LayoutGrid className="w-4 h-4 mr-2 text-primary" />
                30-Min Dashboard (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportLeadStageMatrix} className="cursor-pointer hover:bg-muted">
                <BarChart2 className="w-4 h-4 mr-2 text-primary" />
                Lead Stage Matrix (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportEODScoreboard} className="cursor-pointer hover:bg-muted">
                <TrendingUp className="w-4 h-4 mr-2 text-primary" />
                EOD Scoreboard (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportLowActivityAlerts} className="cursor-pointer hover:bg-muted">
                <AlertTriangle className="w-4 h-4 mr-2 text-red-400" />
                Low Activity Alerts (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportFeatureUsage} className="cursor-pointer hover:bg-muted">
                <PieChart className="w-4 h-4 mr-2 text-primary" />
                Feature Usage (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportRawActivity} className="cursor-pointer hover:bg-muted">
                <List className="w-4 h-4 mr-2 text-primary" />
                Raw Activity Log (CSV)
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
        <div className="bg-card/50 border border-border p-5 rounded-xl">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center justify-between">
            Total Members
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-3xl font-black text-foreground">{report.summary.totalMembers}</div>
          <div className="text-xs text-muted-foreground mt-1">Active on floor today</div>
        </div>
        <div className="bg-card/50 border border-border p-5 rounded-xl">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center justify-between">
            Inactive ({report.windowMinutes}m)
            <UserX className="w-4 h-4 text-red-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.inactiveMembers > 0 ? "text-red-400" : "text-emerald-400"}`}>
            {report.summary.inactiveMembers}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Require immediate manager action</div>
        </div>
        <div className="bg-card/50 border border-border p-5 rounded-xl">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center justify-between">
            Stuck Leads
            <Target className="w-4 h-4 text-orange-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.stuckMembers > 0 ? "text-orange-400" : "text-emerald-400"}`}>
            {report.summary.stuckMembers} members
          </div>
          <div className="text-xs text-muted-foreground mt-1">Have leads stuck &gt; 30m</div>
        </div>
        <div className="bg-card/50 border border-border p-5 rounded-xl">
          <div className="text-muted-foreground text-sm font-medium mb-1 flex items-center justify-between">
            Behind Targets
            <TrendingUp className="w-4 h-4 text-amber-400" />
          </div>
          <div className={`text-3xl font-black ${report.summary.behindOnTargets > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {report.summary.behindOnTargets}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Missed daily execution targets</div>
        </div>
      </div>

      {/* ── Tabs for Sheets ── */}
      <Tabs defaultValue="summary" className="w-full">
        <TabsList className="bg-card/50 border border-border mb-6 flex flex-wrap h-auto gap-2 p-1">
          <TabsTrigger value="summary" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-bold">
            <FileText className="w-4 h-4 mr-2" /> Overall Summary
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-foreground">
            <LayoutGrid className="w-4 h-4 mr-2" /> 30-Min Dashboard
          </TabsTrigger>
          <TabsTrigger value="matrix" className="data-[state=active]:bg-primary data-[state=active]:text-foreground">
            <BarChart2 className="w-4 h-4 mr-2" /> Lead Stage Matrix
          </TabsTrigger>
          <TabsTrigger value="scoreboard" className="data-[state=active]:bg-primary data-[state=active]:text-foreground">
            <TrendingUp className="w-4 h-4 mr-2" /> EOD Scoreboard
          </TabsTrigger>
          <TabsTrigger value="low-activity" className="data-[state=active]:bg-red-600 data-[state=active]:text-foreground">
            <AlertTriangle className="w-4 h-4 mr-2" /> Low Activity Alerts
          </TabsTrigger>
          <TabsTrigger value="features" className="data-[state=active]:bg-primary data-[state=active]:text-foreground">
            <PieChart className="w-4 h-4 mr-2" /> Feature Usage
          </TabsTrigger>
          <TabsTrigger value="raw" className="data-[state=active]:bg-primary data-[state=active]:text-foreground">
            <List className="w-4 h-4 mr-2" /> Raw Activity
          </TabsTrigger>
        </TabsList>

        {/* ── Sheet 0: Overall Summary ── */}
        <TabsContent value="summary">
          <div id="summary-report-container" className="bg-card border border-border rounded-xl p-8 space-y-8">
            <div className="border-b border-border pb-6 flex justify-between items-end">
              <div>
                <h2 className="text-3xl font-black text-foreground">Gharpayy Execution Summary</h2>
                <p className="text-muted-foreground mt-2">Generated At: {new Date(report.generatedAt).toLocaleString()}</p>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold text-primary">Total Actions: {report.members.reduce((acc, m) => acc + m.totalActions, 0)}</div>
                <div className="text-sm text-muted-foreground">Active Window: {report.windowMinutes} mins</div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="bg-card/40 p-4 rounded-lg">
                <div className="text-muted-foreground text-sm mb-1">Total Leads Added</div>
                <div className="text-2xl font-bold text-foreground">{report.members.reduce((acc, m) => acc + m.totalLeadsAdded, 0)}</div>
              </div>
              <div className="bg-card/40 p-4 rounded-lg">
                <div className="text-muted-foreground text-sm mb-1">Total Scheduled</div>
                <div className="text-2xl font-bold text-foreground">{report.members.reduce((acc, m) => acc + (m.scheduledStageCount || 0), 0)}</div>
              </div>
              <div className="bg-card/40 p-4 rounded-lg">
                <div className="text-muted-foreground text-sm mb-1">Total Quotations</div>
                <div className="text-2xl font-bold text-foreground">{report.members.reduce((acc, m) => acc + m.totalQuotations, 0)}</div>
              </div>
              <div className="bg-card/40 p-4 rounded-lg">
                <div className="text-muted-foreground text-sm mb-1">Active Team Members</div>
                <div className="text-2xl font-bold text-foreground">{report.summary.totalMembers}</div>
              </div>
            </div>

            <div>
              <h3 className="text-xl font-bold text-foreground mb-4">Top Performers (Most Actions)</h3>
              <div className="bg-card/40 rounded-lg overflow-hidden">
                <Table>
                  <TableHeader className="bg-card/80">
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead className="text-right">Total Actions</TableHead>
                      <TableHead className="text-right">Scheduled</TableHead>
                      <TableHead className="text-right">Quotations</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...report.members].sort((a, b) => b.totalActions - a.totalActions).slice(0, 5).map(m => (
                      <TableRow key={m.userId} className="border-border">
                        <TableCell className="font-bold text-foreground">{m.name}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.totalActions}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.scheduledStageCount || 0}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{m.totalQuotations}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            
            {report.summary.criticalAlerts.length > 0 && (
              <div>
                <h3 className="text-xl font-bold text-red-400 mb-4">Critical Action Required</h3>
                <div className="space-y-2">
                  {report.summary.criticalAlerts.map((alert, i) => (
                    <div key={i} className="bg-red-950/20 text-red-200 p-3 rounded border border-red-900/50 text-sm">
                      {alert}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Sheet 1: Raw CRM Activity ── */}
        <TabsContent value="raw">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Employee</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Remarks / Subject</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rawActivityLog.map((log, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="text-muted-foreground font-mono text-xs">{fmtTime(log.time)}</TableCell>
                    <TableCell className="text-foreground font-medium">{log.employee}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-card text-muted-foreground">{log.action}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs truncate max-w-[300px]">{log.detail || "—"}</TableCell>
                  </TableRow>
                ))}
                {report.rawActivityLog.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No recent activity.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 2: 30-Minute Dashboard ── */}
        <TabsContent value="dashboard">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
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
                  <TableRow key={m.userId} className={`border-border ${m.isInactive ? "bg-red-950/10" : ""}`}>
                    <TableCell className="font-bold text-foreground">{m.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.leadsAddedLast30}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.actionsLast30}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.propertiesSharedLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.scheduledLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.quotationsLast30}</TableCell>
                    <TableCell>
                      {m.mostUsedActions.length > 0 ? (
                        <span className="text-xs text-muted-foreground bg-card px-2 py-1 rounded">{m.mostUsedActions[0].action}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>
                      {m.isInactive ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Yes</Badge> : <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">No</Badge>}
                    </TableCell>
                    <TableCell>
                      {m.stuckLeads.length > 0 ? <span className="text-orange-400 font-bold">{m.stuckLeads.length}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 3: Lead Stage Matrix ── */}
        <TabsContent value="matrix">
          <div className="bg-card border border-border rounded-xl overflow-hidden overflow-x-auto">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  {Object.values(STAGE_LABEL).map(label => <TableHead key={label} className="text-center text-xs">{label}</TableHead>)}
                  <TableHead className="text-center font-bold">Total Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className="border-border">
                    <TableCell className="font-medium text-foreground">{m.name}</TableCell>
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
                    <TableCell className="text-center font-bold text-primary">{m.totalActiveLeads}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 4: Low Activity Alert ── */}
        <TabsContent value="low-activity">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
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
                  <TableRow key={m.userId} className="border-border bg-red-950/5">
                    <TableCell className="font-bold text-foreground">{m.name}</TableCell>
                    <TableCell className="text-muted-foreground">{fmtTime(m.lastActionAt)}</TableCell>
                    <TableCell>
                      {m.isInactive ? (
                        <span className="text-red-400 font-bold">{m.minutesSinceLastAction} min</span>
                      ) : (
                        <span className="text-emerald-400">{m.minutesSinceLastAction} min</span>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.totalLeadsAdded}</TableCell>
                    <TableCell className="text-muted-foreground">{m.totalActions}</TableCell>
                    <TableCell>
                      {m.stuckLeads.map((s, i) => (
                        <div key={i} className="text-xs text-orange-400 mb-1">
                          {s.leadName} ({s.minutesInStage}m in {STAGE_LABEL[s.stage] || s.stage})
                        </div>
                      ))}
                      {m.stuckLeads.length === 0 && <span className="text-muted-foreground">—</span>}
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
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Feature / Action</TableHead>
                  <TableHead className="text-right">Total Clicks</TableHead>
                  <TableHead className="text-right">Unique Users</TableHead>
                  <TableHead className="text-right">Avg / User</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.featureUsage.map((f, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="font-medium text-foreground">{f.feature}</TableCell>
                    <TableCell className="text-right text-primary font-mono">{f.totalClicks}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{f.uniqueUsers}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{f.avgPerUser}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Sheet 6: End-of-Day Scoreboard ── */}
        <TabsContent value="scoreboard">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
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
                  <TableRow key={m.userId} className="border-border">
                    <TableCell className="font-bold text-foreground">{m.name}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.totalLeadsAdded}</TableCell>
                    <TableCell className={`text-right font-medium ${m.scheduledStageCount >= report.successCriteria.scheduledTarget ? "text-emerald-400" : "text-amber-400"}`}>{m.scheduledStageCount}</TableCell>
                    <TableCell className={`text-right font-medium ${m.totalQuotations >= report.successCriteria.quotationTarget ? "text-emerald-400" : "text-amber-400"}`}>{m.totalQuotations}</TableCell>
                    <TableCell className="text-right text-primary font-bold">{m.visitsToday || 0}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-bold">{m.bookingsToday || 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span className={m.crmCompletionPct >= 100 ? "text-emerald-400" : "text-amber-400"}>{m.crmCompletionPct || 0}%</span>
                      </div>
                    </TableCell>
                    <TableCell className={`text-right ${m.missingOwners > 0 ? "text-red-400 font-bold" : "text-muted-foreground"}`}>{m.missingOwners || 0}</TableCell>
                    <TableCell className={`text-right ${m.missingNextActions > 0 ? "text-red-400 font-bold" : "text-muted-foreground"}`}>{m.missingNextActions || 0}</TableCell>
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
