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
import { toast } from "sonner";
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

interface PipelineHealthStage {
  stage: string;
  count: number;
  newLast30: number;
  waitingOver30: number;
  waitingOver120: number;
  actionRequired: string;
}

interface InterventionLog {
  time: string;
  employee: string;
  issue: string;
  rootCause: string;
  actionTaken: string;
  expectedResolution: string;
  checkedAgain: string;
}

interface IntervalSnapshot {
  time: string;
  employee: string;
  leadsAddedLast30: number;
  totalLeadsAdded: number;
  totalClicks: number;
  mostUsedFeature: string;
  clickSummary: string;
  currentStage: string;
  leadsScheduled: number;
  quotationsGenerated: number;
  isInactive: boolean;
  stuckStage: string;
  nextFollowUp: string;
  managerAction: string;
  status: string;
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
  pipelineHealth: PipelineHealthStage[];
  interventionLog: InterventionLog[];
  intervalSnapshots: IntervalSnapshot[];
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
  const [startTime, setStartTime] = useState<string>(() => {
    const d = new Date();
    d.setHours(9, 0, 0, 0);
    const tzOffset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tzOffset).toISOString().slice(0, 16);
  });
  const [endTime, setEndTime] = useState<string>("");
  const [nextRefreshAt, setNextRefreshAt] = useState<number>(Date.now() + 30000);
  const [visibleCount, setVisibleCount] = useState(10);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      let calculatedWindow = 30;
      if (startTime) {
         const endMs = endTime ? new Date(endTime).getTime() : Date.now();
         calculatedWindow = Math.round((endMs - new Date(startTime).getTime()) / 60000);
      }
      
      const windowMinutes = Math.max(5, calculatedWindow);
      const params: any = { window_minutes: windowMinutes };
      if (endTime) params.end_time = new Date(endTime).toISOString();
      
      const res = await apiClient.get<ExecutionReport>("/api/admin/execution-report", {
        params,
      });
      setReport(res);
      setNextRefreshAt(Date.now() + windowMinutes * 60000);
    } catch (e: any) {
      setError(e.response?.data?.message || e.message);
    } finally {
      setLoading(false);
    }
  }, [startTime, endTime]);

  useEffect(() => {
    fetchReport();
    if (endTime) return; // Don't auto-refresh historical reports
    let calculatedWindow = 30;
    if (startTime) {
       const endMs = endTime ? new Date(endTime).getTime() : Date.now();
       calculatedWindow = Math.round((endMs - new Date(startTime).getTime()) / 60000);
    }
    const interval = setInterval(() => {
      fetchReport();
    }, Math.max(5, calculatedWindow) * 60000);
    return () => clearInterval(interval);
  }, [fetchReport, startTime, endTime]);

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

  const exportIntervalSnapshot = () => {
    if (!report) return;
    const header = ["Time", "Team Member", "Leads Added (Last 30 Min)", "Total Leads Added", "Total Clicks/Actions", "Most Used Feature", "Click-by-Click Activity Summary", "Current Pipeline Stage", "Leads Scheduled", "Quotations Generated", "Inactive (Yes/No)", "Stuck >30 Min (Stage)", "Next Follow-up Required", "Manager Action", "Status"];
    const rows = report.intervalSnapshots.map(s => [
      s.time,
      `"${s.employee}"`,
      s.leadsAddedLast30,
      s.totalLeadsAdded,
      s.totalClicks,
      `"${s.mostUsedFeature}"`,
      `"${s.clickSummary}"`,
      s.currentStage,
      s.leadsScheduled,
      s.quotationsGenerated,
      s.isInactive ? "Yes" : "No",
      s.stuckStage,
      s.nextFollowUp,
      `"${s.managerAction}"`,
      s.status
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`interval-snapshot-${report.generatedAt}.csv`, csvContent);
  };

  const exportPipelineHealth = () => {
    if (!report) return;
    const header = ["Pipeline Stage", "Count", "New (30 Min)", "Waiting >30 Min", "Waiting >2 Hours", "Action Required"];
    const rows = report.pipelineHealth.map(p => [
      STAGE_LABEL[p.stage] || p.stage,
      p.count,
      p.newLast30,
      p.waitingOver30,
      p.waitingOver120,
      `"${p.actionRequired}"`
    ]);
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`pipeline-health-${report.generatedAt}.csv`, csvContent);
  };

  const exportSuccessTracker = () => {
    if (!report) return;
    const header = ["KPI", "Target", "Current", "Status"];
    const rows = [
      ["Leads progressed to Scheduled", `${report.successCriteria.scheduledTarget} per person`, (report.members.reduce((acc, m) => acc + (m.scheduledStageCount || 0), 0) / (report.members.length || 1)).toFixed(1), "—"],
      ["Quotations Generated", `${report.successCriteria.quotationTarget} per person`, (report.members.reduce((acc, m) => acc + m.totalQuotations, 0) / (report.members.length || 1)).toFixed(1), "—"],
      ["CRM Data Complete", "100%", `${(report.members.reduce((acc, m) => acc + m.crmCompletionPct, 0) / (report.members.length || 1)).toFixed(0)}%`, "—"],
      ["Zero Inactive Team Members", "Yes", report.summary.inactiveMembers === 0 ? "Yes" : "No", report.summary.inactiveMembers === 0 ? "Met" : "Missed"],
      ["Zero Leads Stuck >30 Minutes", "Yes", report.summary.stuckMembers === 0 ? "Yes" : "No", report.summary.stuckMembers === 0 ? "Met" : "Missed"]
    ];
    const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
    downloadCSV(`success-tracker-${report.generatedAt}.csv`, csvContent);
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
      toast.error("Failed to generate PDF report.");
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
          <div className="flex flex-wrap items-center gap-2 bg-card/50 border border-border px-3 py-1.5 rounded-md">
             <span className="text-sm font-medium text-muted-foreground">Start:</span>
             <input 
               type="datetime-local" 
               className="bg-transparent text-sm text-foreground outline-none border-none focus:ring-0 cursor-pointer"
               value={startTime}
               onChange={(e) => setStartTime(e.target.value)}
             />
             <span className="text-sm font-medium text-muted-foreground ml-2">End:</span>
             <input 
               type="datetime-local" 
               className="bg-transparent text-sm text-foreground outline-none border-none focus:ring-0 cursor-pointer"
               value={endTime}
               onChange={(e) => setEndTime(e.target.value)}
             />
             {(startTime || endTime) && (
               <Button variant="ghost" size="sm" className="h-6 px-2 py-0 text-red-400 hover:text-red-500 hover:bg-red-400/10 ml-1" onClick={() => { setStartTime(""); setEndTime(""); }}>
                 Clear
               </Button>
             )}
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
                                    <DropdownMenuContent align="end" className="w-64 bg-card border-border text-foreground max-h-[80vh] overflow-y-auto">
              <DropdownMenuItem onClick={exportSummaryToPDF} className="cursor-pointer hover:bg-muted font-bold text-primary/90">
                <FileText className="w-4 h-4 mr-2" />
                Download Summary (PDF)
              </DropdownMenuItem>
              <div className="h-px bg-muted my-1 mx-2" />
              <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">Command Center</div>
              <DropdownMenuItem onClick={exportIntervalSnapshot} className="cursor-pointer hover:bg-muted">
                <Clock className="w-4 h-4 mr-2 text-primary" />
                30-Min Interval (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMemberSummary} className="cursor-pointer hover:bg-muted">
                <LayoutGrid className="w-4 h-4 mr-2 text-primary" />
                Team Dashboard (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportPipelineHealth} className="cursor-pointer hover:bg-muted">
                <Target className="w-4 h-4 mr-2 text-primary" />
                Pipeline Health (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportSuccessTracker} className="cursor-pointer hover:bg-muted">
                <CheckCircle2 className="w-4 h-4 mr-2 text-primary" />
                Success & Interventions (CSV)
              </DropdownMenuItem>
              
              <div className="h-px bg-muted my-1 mx-2" />
              <div className="px-2 py-1 text-xs font-bold text-muted-foreground uppercase tracking-wider">Raw Sheets</div>
              <DropdownMenuItem onClick={exportRawActivity} className="cursor-pointer hover:bg-muted">
                <List className="w-4 h-4 mr-2 text-primary" />
                Sheet 1: Raw Activity (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportMemberSummary} className="cursor-pointer hover:bg-muted">
                <LayoutGrid className="w-4 h-4 mr-2 text-primary" />
                Sheet 2: 30m Dash (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportLeadStageMatrix} className="cursor-pointer hover:bg-muted">
                <BarChart2 className="w-4 h-4 mr-2 text-primary" />
                Sheet 3: Matrix (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportLowActivityAlerts} className="cursor-pointer hover:bg-muted">
                <AlertTriangle className="w-4 h-4 mr-2 text-red-400" />
                Sheet 4: Low Act (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportFeatureUsage} className="cursor-pointer hover:bg-muted">
                <PieChart className="w-4 h-4 mr-2 text-primary" />
                Sheet 5: Features (CSV)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={exportEODScoreboard} className="cursor-pointer hover:bg-muted">
                <TrendingUp className="w-4 h-4 mr-2 text-primary" />
                Sheet 6: EOD (CSV)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Critical Alerts ── */}
      {report.summary.criticalAlerts.length > 0 && (
        <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-4">
          <div className="flex items-center gap-2 text-black font-bold mb-3">
            <AlertTriangle className="w-5 h-5" />
            CRITICAL ALERTS
          </div>
          <div className="space-y-2">
            {report.summary.criticalAlerts.map((alert, idx) => (
              <div key={idx} className="text-black text-sm bg-red-900/20 px-3 py-2 rounded-lg border border-red-500/10">
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
      <Tabs defaultValue="interval" className="w-full">
        <div className="flex flex-col gap-2 mb-6">
          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider">Command Center Views</div>
          <TabsList className="bg-card/50 border border-border flex flex-wrap h-auto gap-2 p-1 self-start">
            <TabsTrigger value="interval" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-bold">
              <Clock className="w-4 h-4 mr-2" /> 30-Min Interval
            </TabsTrigger>
            <TabsTrigger value="team-dashboard" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-bold">
              <LayoutGrid className="w-4 h-4 mr-2" /> Team Dashboard
            </TabsTrigger>
            <TabsTrigger value="pipeline-health" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-bold">
              <Target className="w-4 h-4 mr-2" /> Pipeline Health
            </TabsTrigger>
            <TabsTrigger value="success" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-bold">
              <CheckCircle2 className="w-4 h-4 mr-2" /> Success & Interventions
            </TabsTrigger>
          </TabsList>

          <div className="text-sm font-bold text-muted-foreground uppercase tracking-wider mt-4">Raw Execution Sheets</div>
          <TabsList className="bg-card/50 border border-border flex flex-wrap h-auto gap-2 p-1 self-start">
            <TabsTrigger value="raw" className="data-[state=active]:bg-slate-700 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 1: Raw
            </TabsTrigger>
            <TabsTrigger value="dashboard" className="data-[state=active]:bg-slate-700 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 2: 30m Dash
            </TabsTrigger>
            <TabsTrigger value="matrix" className="data-[state=active]:bg-slate-700 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 3: Matrix
            </TabsTrigger>
            <TabsTrigger value="low-activity" className="data-[state=active]:bg-red-600 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 4: Low Act
            </TabsTrigger>
            <TabsTrigger value="features" className="data-[state=active]:bg-slate-700 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 5: Features
            </TabsTrigger>
            <TabsTrigger value="scoreboard" className="data-[state=active]:bg-slate-700 data-[state=active]:text-foreground text-xs font-medium px-4">
              Sheet 6: EOD
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── 30-Min Interval Snapshot ── */}
        <TabsContent value="interval">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-right">Leads Added (Last 30 Min)</TableHead>
                  <TableHead className="text-right">Total Leads Added</TableHead>
                  <TableHead className="text-right">Total Clicks/Actions</TableHead>
                  <TableHead>Most Used Feature</TableHead>
                  <TableHead>Click-by-Click Activity Summary</TableHead>
                  <TableHead>Current Pipeline Stage</TableHead>
                  <TableHead className="text-right">Leads Scheduled</TableHead>
                  <TableHead className="text-right">Quotations Generated</TableHead>
                  <TableHead>Inactive (Yes/No)</TableHead>
                  <TableHead>Stuck &gt;30 Min (Stage)</TableHead>
                  <TableHead>Next Follow-up Required</TableHead>
                  <TableHead>Manager Action</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.intervalSnapshots.map((s, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="font-mono text-xs">{s.time}</TableCell>
                    <TableCell className="font-bold">{s.employee}</TableCell>
                    <TableCell className="text-right">{s.leadsAddedLast30}</TableCell>
                    <TableCell className="text-right">{s.totalLeadsAdded}</TableCell>
                    <TableCell className="text-right">{s.totalClicks}</TableCell>
                    <TableCell>{s.mostUsedFeature}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{s.clickSummary}</TableCell>
                    <TableCell><Badge variant="outline">{STAGE_LABEL[s.currentStage] || s.currentStage}</Badge></TableCell>
                    <TableCell className="text-right">{s.leadsScheduled}</TableCell>
                    <TableCell className="text-right">{s.quotationsGenerated}</TableCell>
                    <TableCell>{s.isInactive ? <Badge variant="destructive">Yes</Badge> : <Badge className="bg-emerald-500/20 text-emerald-500 hover:bg-emerald-500/20">No</Badge>}</TableCell>
                    <TableCell>{s.stuckStage}</TableCell>
                    <TableCell>{s.nextFollowUp}</TableCell>
                    <TableCell>{s.managerAction}</TableCell>
                    <TableCell>{s.status === "On Track" ? <span className="text-emerald-500 font-bold">On Track</span> : <span className="text-amber-500 font-bold">Action Needed</span>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Team Performance Dashboard ── */}
        <TabsContent value="team-dashboard">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Team Member</TableHead>
                  <TableHead className="text-right">Total Leads Added</TableHead>
                  <TableHead className="text-right">Leads Progressed to Scheduled</TableHead>
                  <TableHead className="text-right">Quotations</TableHead>
                  <TableHead className="text-right">Total Clicks</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead className="text-right">Pipeline Stuck Count</TableHead>
                  <TableHead>Inactive Alerts</TableHead>
                  <TableHead className="text-right">Data Quality</TableHead>
                  <TableHead className="text-right">Owner Missing</TableHead>
                  <TableHead className="text-right">Next Action Missing</TableHead>
                  <TableHead>Final Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map(m => (
                  <TableRow key={m.userId} className="border-border">
                    <TableCell className="font-bold">{m.name}</TableCell>
                    <TableCell className="text-right">{m.totalLeadsAdded}</TableCell>
                    <TableCell className="text-right">{m.scheduledStageCount}</TableCell>
                    <TableCell className="text-right">{m.totalQuotations}</TableCell>
                    <TableCell className="text-right">{m.totalActions}</TableCell>
                    <TableCell>{fmtMins(m.minutesSinceLastAction)}</TableCell>
                    <TableCell className="text-right text-orange-400 font-bold">{m.stuckLeads.length}</TableCell>
                    <TableCell>{m.isInactive ? "Yes" : "No"}</TableCell>
                    <TableCell className="text-right">{m.crmCompletionPct}%</TableCell>
                    <TableCell className="text-right text-red-400 font-bold">{m.missingOwners}</TableCell>
                    <TableCell className="text-right text-red-400 font-bold">{m.missingNextActions}</TableCell>
                    <TableCell>{m.allCriteriaMet ? <Badge className="bg-emerald-500/20 text-emerald-500 border-none">Target Met</Badge> : <Badge variant="outline">Pending</Badge>}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Pipeline Health ── */}
        <TabsContent value="pipeline-health">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Pipeline Stage</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead className="text-right">New (30 Min)</TableHead>
                  <TableHead className="text-right">Waiting &gt;30 Min</TableHead>
                  <TableHead className="text-right">Waiting &gt;2 Hours</TableHead>
                  <TableHead>Action Required</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.pipelineHealth.map(p => (
                  <TableRow key={p.stage} className="border-border">
                    <TableCell className="font-medium">{STAGE_LABEL[p.stage] || p.stage}</TableCell>
                    <TableCell className="text-right text-primary font-bold">{p.count}</TableCell>
                    <TableCell className="text-right text-emerald-400 font-medium">{p.newLast30}</TableCell>
                    <TableCell className="text-right text-orange-400 font-medium">{p.waitingOver30}</TableCell>
                    <TableCell className="text-right text-red-400 font-bold">{p.waitingOver120}</TableCell>
                    <TableCell>{p.actionRequired}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* ── Success & Interventions ── */}
        <TabsContent value="success">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Daily Success Tracker */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="p-4 border-b border-border bg-card/50 font-bold flex items-center gap-2">
                <Target className="w-5 h-5 text-primary" /> Daily Success Tracker
              </div>
              <Table>
                <TableHeader className="bg-card/80">
                  <TableRow>
                    <TableHead>KPI</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Current</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="border-border">
                    <TableCell>Leads progressed to Scheduled</TableCell>
                    <TableCell>{report.successCriteria.scheduledTarget} per person</TableCell>
                    <TableCell>{(report.members.reduce((acc, m) => acc + (m.scheduledStageCount || 0), 0) / (report.members.length || 1)).toFixed(1)} avg</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell>Quotations Generated</TableCell>
                    <TableCell>{report.successCriteria.quotationTarget} per person</TableCell>
                    <TableCell>{(report.members.reduce((acc, m) => acc + m.totalQuotations, 0) / (report.members.length || 1)).toFixed(1)} avg</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell>CRM Data Complete</TableCell>
                    <TableCell>100%</TableCell>
                    <TableCell>{(report.members.reduce((acc, m) => acc + m.crmCompletionPct, 0) / (report.members.length || 1)).toFixed(0)}% avg</TableCell>
                    <TableCell>—</TableCell>
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell>Zero Inactive Team Members</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell>{report.summary.inactiveMembers === 0 ? "Yes" : "No"}</TableCell>
                    <TableCell>{report.summary.inactiveMembers === 0 ? <span className="text-emerald-500 font-bold">Met</span> : <span className="text-red-400 font-bold">Missed</span>}</TableCell>
                  </TableRow>
                  <TableRow className="border-border">
                    <TableCell>Zero Leads Stuck &gt;30 Minutes</TableCell>
                    <TableCell>Yes</TableCell>
                    <TableCell>{report.summary.stuckMembers === 0 ? "Yes" : "No"}</TableCell>
                    <TableCell>{report.summary.stuckMembers === 0 ? <span className="text-emerald-500 font-bold">Met</span> : <span className="text-red-400 font-bold">Missed</span>}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>

            {/* 30-Minute Reporting Checklist */}
            <div className="bg-card border border-border rounded-xl p-6">
              <h3 className="font-bold flex items-center gap-2 mb-4 text-primary">
                <CheckCircle2 className="w-5 h-5" /> 30-Minute Reporting Checklist
              </h3>
              <ul className="space-y-3 text-sm text-muted-foreground">
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Total leads added by each team member</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Number of new leads added in the last 30 minutes</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Total CRM clicks/actions performed</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Most-used CRM features/buttons</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Click-by-click activity summary</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Current stage of every lead</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Team members with zero or low activity</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Team members stuck at a stage for more than 30 minutes</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Follow-up assigned to each executive</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Manager intervention completed wherever required</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> CRM data completeness verified</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Owner assigned to every lead</li>
                <li className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" /> Next action assigned to every lead</li>
              </ul>
            </div>

            {/* Intervention Log */}
            <div className="bg-card border border-border rounded-xl overflow-hidden col-span-1 lg:col-span-2">
              <div className="p-4 border-b border-border bg-card/50 font-bold flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" /> Intervention Log
              </div>
              <Table>
                <TableHeader className="bg-card/80">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Issue Identified</TableHead>
                    <TableHead>Root Cause</TableHead>
                    <TableHead>Action Taken</TableHead>
                    <TableHead>Expected Resolution</TableHead>
                    <TableHead>Checked Again</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {report.interventionLog.map((log, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="font-mono text-xs">{log.time}</TableCell>
                      <TableCell className="font-bold">{log.employee}</TableCell>
                      <TableCell className="text-amber-500">{log.issue}</TableCell>
                      <TableCell>{log.rootCause}</TableCell>
                      <TableCell>{log.actionTaken}</TableCell>
                      <TableCell>{log.expectedResolution}</TableCell>
                      <TableCell>{log.checkedAgain}</TableCell>
                    </TableRow>
                  ))}
                  {report.interventionLog.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-6">No interventions logged for this period.</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
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
                  <TableHead>Team</TableHead>
                  <TableHead>Lead Name</TableHead>
                  <TableHead>Lead ID</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Previous Stage</TableHead>
                  <TableHead>New Stage</TableHead>
                  <TableHead>Button Clicked</TableHead>
                  <TableHead className="text-right">Duration (Sec)</TableHead>
                  <TableHead>Device</TableHead>
                  <TableHead>Remarks</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.rawActivityLog.slice(0, visibleCount).map((log, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground font-mono text-xs">{fmtTime(log.time)}</TableCell>
                    <TableCell className="text-foreground font-medium">{log.employee}</TableCell>
                    <TableCell>{log.team}</TableCell>
                    <TableCell className="font-medium">{log.leadName}</TableCell>
                    <TableCell className="font-mono text-xs">{log.leadId}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="bg-card text-muted-foreground">{log.action}</Badge>
                    </TableCell>
                    <TableCell>{log.previousStage}</TableCell>
                    <TableCell>{log.newStage}</TableCell>
                    <TableCell>{log.buttonClicked}</TableCell>
                    <TableCell className="text-right">{log.durationSec}</TableCell>
                    <TableCell>{log.device}</TableCell>
                    <TableCell className="text-muted-foreground text-xs truncate max-w-[200px]">{log.detail || "—"}</TableCell>
                  </TableRow>
                ))}
                {report.rawActivityLog.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">No recent activity.</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
            {report.rawActivityLog.length > visibleCount && (
              <div className="p-3 text-center border-t border-border bg-muted/10">
                <Button variant="outline" size="sm" onClick={() => setVisibleCount(v => v + 10)}>
                  Load More ({report.rawActivityLog.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Sheet 2: 30-Minute Dashboard ── */}
        <TabsContent value="dashboard">
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <Table>
              <TableHeader className="bg-card/80">
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="text-right">Leads Added</TableHead>
                  <TableHead className="text-right">Leads Updated</TableHead>
                  <TableHead className="text-right">Total Clicks</TableHead>
                  <TableHead className="text-right">Prop Shared</TableHead>
                  <TableHead className="text-right">Follow-ups</TableHead>
                  <TableHead className="text-right">Scheduled</TableHead>
                  <TableHead className="text-right">Visits</TableHead>
                  <TableHead className="text-right">Quotations</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead>Most Used Feature</TableHead>
                  <TableHead>Last Activity</TableHead>
                  <TableHead>Inactive (30+ Min)</TableHead>
                  <TableHead className="text-right">Stuck Lead Count</TableHead>
                  <TableHead>Manager Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className={`border-border ${m.isInactive ? "bg-red-950/10" : ""}`}>
                    <TableCell className="font-bold text-foreground">{m.name}</TableCell>
                    <TableCell>{m.zones?.[0] || "General"}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.leadsAddedLast30}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.leadsUpdatedLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.actionsLast30}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.propertiesSharedLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.followUpsLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.scheduledLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.visitsLast30 || 0}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.quotationsLast30}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{m.bookingsLast30 || 0}</TableCell>
                    <TableCell>
                      {m.mostUsedActions.length > 0 ? (
                        <span className="text-xs text-muted-foreground bg-card px-2 py-1 rounded">{m.mostUsedActions[0].action}</span>
                      ) : "—"}
                    </TableCell>
                    <TableCell>{fmtMins(m.minutesSinceLastAction)}</TableCell>
                    <TableCell>
                      {m.isInactive ? <Badge className="bg-red-500/20 text-red-400 border-red-500/30">Yes</Badge> : <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">No</Badge>}
                    </TableCell>
                    <TableCell className="text-right">
                      {m.stuckLeads.length > 0 ? <span className="text-orange-400 font-bold">{m.stuckLeads.length}</span> : <span className="text-muted-foreground">0</span>}
                    </TableCell>
                    <TableCell>{m.isInactive ? "Call" : "—"}</TableCell>
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
                  <TableHead className="text-center text-xs">New</TableHead>
                  <TableHead className="text-center text-xs">Contacted</TableHead>
                  <TableHead className="text-center text-xs">Qualified</TableHead>
                  <TableHead className="text-center text-xs">Property Shared</TableHead>
                  <TableHead className="text-center text-xs">Follow-up</TableHead>
                  <TableHead className="text-center text-xs">Scheduled</TableHead>
                  <TableHead className="text-center text-xs">Visit Done</TableHead>
                  <TableHead className="text-center text-xs">Quote</TableHead>
                  <TableHead className="text-center text-xs">Negotiation</TableHead>
                  <TableHead className="text-center text-xs">Booked</TableHead>
                  <TableHead className="text-center text-xs">Lost</TableHead>
                  <TableHead className="text-center font-bold">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.members.map((m) => (
                  <TableRow key={m.userId} className="border-border">
                    <TableCell className="font-medium text-foreground">{m.name}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["new"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["contacted"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["qualified"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["property-shared"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["follow-up"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["tour-scheduled"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["tour-done"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["quote-sent"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["negotiation"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["booked"] || 0}</TableCell>
                    <TableCell className="text-center">{m.stageDistribution["dropped"] || 0}</TableCell>
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
                  <TableHead>Clicks</TableHead>
                  <TableHead>Stuck Stage</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Manager Follow-up</TableHead>
                  <TableHead>Status</TableHead>
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
                      {m.isInactive ? "No clicks > 30m" : (m.stuckLeads.length > 0 ? "Leads Stuck" : "—")}
                    </TableCell>
                    <TableCell>
                      {m.followUpsRequired.map((f, i) => (
                        <div key={i} className="text-xs text-amber-400 mb-1">• {f}</div>
                      ))}
                      {m.isInactive && <div className="text-xs text-red-400 font-bold">• Check inactivity</div>}
                    </TableCell>
                    <TableCell>Pending</TableCell>
                  </TableRow>
                ))}
                {report.members.filter(m => m.isInactive || m.stuckLeads.length > 0 || m.followUpsRequired.length > 0).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-emerald-500 font-medium">All members active and no stuck leads! </TableCell>
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
                  <TableHead>Most Active Employee</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.featureUsage.map((f, i) => (
                  <TableRow key={i} className="border-border">
                    <TableCell className="font-medium text-foreground">{f.feature}</TableCell>
                    <TableCell className="text-right text-primary font-mono">{f.totalClicks}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{f.uniqueUsers}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{f.avgPerUser}</TableCell>
                    <TableCell className="font-bold text-center">{f.mostActiveEmployee}</TableCell>
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
                  <TableHead className="text-right">Missing Next Actions</TableHead>
                  <TableHead className="text-right">Final Score</TableHead>
                  <TableHead className="text-center">Status</TableHead>
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
                    <TableCell className="text-right text-primary font-black">
                       {Math.round((m.scheduledStageCount / (report.successCriteria.scheduledTarget || 1)) * 50 + (m.totalQuotations / (report.successCriteria.quotationTarget || 1)) * 50)}%
                    </TableCell>
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
