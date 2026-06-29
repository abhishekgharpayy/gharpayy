import { useState, useMemo } from "react";
import { useApp } from "@/lib/store";
import { api } from "@/lib/api/client";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Activity,
  Target,
  BarChart3,
  UserCheck,
  Clock,
  Zap,
  DollarSign,
  Loader2,
  Calendar,
  Filter,
  X,
  ArrowUpRight,
  TrendingUp,
  HelpCircle,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

function getStartDate(f: { range: string; startDate: string }) {
  if (f.range === "custom") return f.startDate || undefined;
  const now = new Date();
  if (f.range === "7d") now.setDate(now.getDate() - 7);
  else if (f.range === "30d") now.setDate(now.getDate() - 30);
  else if (f.range === "90d") now.setDate(now.getDate() - 90);
  else return undefined; // "all"
  return now.toISOString().split("T")[0];
}

export default function Funnel() {
  const { leads = [], properties = [], tcms = [] } = useApp();

  const [filters, setFilters] = useState({
    range: "30d",
    startDate: "",
    endDate: "",
    tcmId: "all",
    zoneId: "all",
    area: "all",
  });

  const [selectedDrillDown, setSelectedDrillDown] = useState<{
    title: string;
    leads: any[];
  } | null>(null);

  // Extract unique options for filter dropdowns from preloaded store
  const tcmOptions = useMemo(() => {
    return tcms.map((t) => ({ id: t.id, name: t.fullName || t.name }));
  }, [tcms]);

  const zoneOptions = useMemo(() => {
    const all = new Set<string>();
    tcms.forEach((t) => {
      if (t.zone) all.add(t.zone);
      if (t.zones) t.zones.forEach((z: string) => all.add(z));
    });
    return Array.from(all).sort();
  }, [tcms]);

  const areaOptions = useMemo(() => {
    const all = new Set<string>();
    properties.forEach((p) => {
      if (p.area) all.add(p.area);
    });
    return Array.from(all).sort();
  }, [properties]);

  // Query intelligence computed by the backend
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["funnel_intelligence", filters],
    queryFn: () =>
      api.funnel.getIntelligence({
        startDate: getStartDate(filters),
        endDate: filters.endDate || undefined,
        tcmId: filters.tcmId !== "all" ? filters.tcmId : undefined,
        zoneId: filters.zoneId !== "all" ? filters.zoneId : undefined,
        area: filters.area !== "all" ? filters.area : undefined,
      }),
  });

  const handleWaterfallClick = (stageLabel: string) => {
    let filteredLeads: any[] = [];
    if (stageLabel === "Scheduled") {
      filteredLeads = leads.filter((l) => l.stage === "tour-scheduled" || l.stage === "tour-done");
    } else if (stageLabel === "Show-Ups") {
      filteredLeads = leads.filter((l) => l.stage === "tour-done" || l.stage === "negotiation");
    } else if (stageLabel === "Drafts") {
      filteredLeads = leads.filter((l) => l.stage === "negotiation");
    } else if (stageLabel === "Booked") {
      filteredLeads = leads.filter((l) => l.stage === "booked");
    }

    // Apply global filters (TCM, Zone, Area) to the drill-down list too!
    if (filters.tcmId !== "all") {
      filteredLeads = filteredLeads.filter((l) => l.assignedTcmId === filters.tcmId);
    }
    if (filters.zoneId !== "all") {
      filteredLeads = filteredLeads.filter((l) => l.zoneCategory === filters.zoneId);
    }
    if (filters.area && filters.area !== "all") {
      filteredLeads = filteredLeads.filter((l) => l.preferredArea === filters.area);
    }

    setSelectedDrillDown({
      title: `${stageLabel} Leads (${filteredLeads.length})`,
      leads: filteredLeads,
    });
  };

  const handleTcmAreaClick = (tcmId: string, areaName: string) => {
    const tcm = tcms.find((t) => t.id === tcmId);
    const filteredLeads = leads.filter(
      (l) => l.assignedTcmId === tcmId && l.preferredArea === areaName
    );
    setSelectedDrillDown({
      title: `${tcm?.fullName || tcm?.name || "TCM"} in ${areaName} (${filteredLeads.length})`,
      leads: filteredLeads,
    });
  };

  const handleLossReasonClick = (reason: string) => {
    const filteredLeads = leads.filter(
      (l) => l.stage === "dropped" && l.whyNotClosed?.toLowerCase().includes(reason.toLowerCase())
    );
    setSelectedDrillDown({
      title: `Lost Due to ${reason.toUpperCase()} (${filteredLeads.length})`,
      leads: filteredLeads,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-[#F97316]" />
        <span className="text-sm font-medium text-muted-foreground animate-pulse">
          Computing funnel metrics from MongoDB...
        </span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <AlertTriangle className="h-10 w-10 text-destructive mb-3" />
        <h3 className="font-semibold text-lg text-foreground mb-1">Failed to compute metrics</h3>
        <p className="text-sm text-muted-foreground max-w-sm mb-4">
          Please check your connection or database collections.
        </p>
        <Button onClick={() => refetch()} variant="outline" size="sm">
          Retry Computation
        </Button>
      </div>
    );
  }

  const {
    waterfall,
    timeHeatmap,
    lossReasons,
    budgetVsActual,
    tcmAreaMatrix,
    staleTours,
    conversionVelocity,
  } = data;

  return (
    <div className="space-y-6 animate-slide-up pb-12">
      {/* ═══ HEADER & TITLES ═══ */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Funnel Intelligence</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Database-backed conversions, time matrices, objections, and leakage analytics
          </p>
        </div>
        <div className="text-right text-[10px] font-mono text-muted-foreground">
          Last processed: {new Date(data.processedAt || Date.now()).toLocaleTimeString()}
        </div>
      </div>

      {/* ═══ GLOBAL FILTER BAR ═══ */}
      <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <Filter className="h-3.5 w-3.5 text-[#F97316]" />
            <span>Filters:</span>
          </div>

          {/* Date Selector */}
          <div className="flex items-center gap-2">
            <Select
              value={filters.range}
              onValueChange={(val) => setFilters((prev) => ({ ...prev, range: val }))}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs bg-background">
                <SelectValue placeholder="Date Range" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">Last 7 Days</SelectItem>
                <SelectItem value="30d">Last 30 Days</SelectItem>
                <SelectItem value="90d">Last 90 Days</SelectItem>
                <SelectItem value="all">All Time</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            {filters.range === "custom" && (
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters((prev) => ({ ...prev, startDate: e.target.value }))}
                className="h-8 px-2 rounded-md border border-border text-xs bg-background font-mono focus:outline-none focus:ring-1 focus:ring-[#F97316]"
              />
            )}
          </div>

          {/* TCM Selector */}
          <Select
            value={filters.tcmId}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, tcmId: val }))}
          >
            <SelectTrigger className="h-8 w-[140px] text-xs bg-background">
              <SelectValue placeholder="All TCMs" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All TCMs</SelectItem>
              {tcmOptions.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Zone Selector */}
          <Select
            value={filters.zoneId}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, zoneId: val }))}
          >
            <SelectTrigger className="h-8 w-[120px] text-xs bg-background">
              <SelectValue placeholder="All Zones" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Zones</SelectItem>
              {zoneOptions.map((z) => (
                <SelectItem key={z} value={z}>
                  {z}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Area Selector */}
          <Select
            value={filters.area}
            onValueChange={(val) => setFilters((prev) => ({ ...prev, area: val }))}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs bg-background">
              <SelectValue placeholder="All Areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {areaOptions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Reset Filters */}
          {(filters.range !== "30d" ||
            filters.tcmId !== "all" ||
            filters.zoneId !== "all" ||
            filters.area !== "all") && (
            <button
              onClick={() =>
                setFilters({
                  range: "30d",
                  startDate: "",
                  endDate: "",
                  tcmId: "all",
                  zoneId: "all",
                  area: "all",
                })
              }
              className="ml-auto text-xs text-destructive hover:underline font-semibold"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* ═══ 1. REVENUE WATERFALL CARD ═══ */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4.5 w-4.5 text-[#F97316]" />
            <h3 className="font-semibold text-sm text-foreground">Revenue Waterfall & Leakage</h3>
          </div>
          <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-mono">
            Interactive · Click stage to drill down
          </span>
        </div>
        <div className="space-y-3">
          {waterfall.stages.map((stage: any) => {
            const pct = Math.min(
              100,
              (stage.value / Math.max(1, waterfall.stages[0].value)) * 100
            );
            return (
              <div
                key={stage.label}
                onClick={() => handleWaterfallClick(stage.label)}
                className="group cursor-pointer rounded-lg p-2 hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="font-semibold text-foreground flex items-center gap-1.5">
                    {stage.label}
                    <Eye className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <span className="text-muted-foreground font-mono">
                    ₹{stage.value.toLocaleString()} ({stage.count})
                    {stage.leak !== undefined && stage.leak > 0 && (
                      <span className="text-destructive ml-2 font-medium">
                        -₹{stage.leak.toLocaleString()}
                      </span>
                    )}
                  </span>
                </div>
                <div className="h-6 bg-muted/40 rounded-full overflow-hidden relative">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{
                      width: `${pct}%`,
                      backgroundColor: stage.color || "#F97316",
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t border-border flex items-center gap-2 text-xs">
          <AlertTriangle className="h-4 w-4 text-destructive" />
          <span className="text-muted-foreground">
            Biggest leakage area:{" "}
            <span className="text-destructive font-semibold">{waterfall.leakLabel}</span> (₹
            {waterfall.totalLeak.toLocaleString()})
          </span>
        </div>
      </div>

      {/* ═══ COLUMNAR METRIC LAYOUT ═══ */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* ═══ 2. CONVERSION VELOCITY ═══ */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-[#F97316]" />
            <h3 className="font-semibold text-sm text-foreground">Conversion Velocity</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3.5 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-2xl font-bold font-mono text-foreground">
                {conversionVelocity.schedulingToTour.avg}d
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Schedule → Tour</p>
            </div>
            <div className="text-center p-3.5 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-2xl font-bold font-mono text-foreground">
                {conversionVelocity.tourToBooking.avg}d
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Tour → Booking</p>
            </div>
            <div className="text-center p-3.5 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-2xl font-bold font-mono text-[#F97316]">
                {conversionVelocity.fullCycle.avg}d
              </p>
              <p className="text-[10px] text-muted-foreground mt-1">Full Cycle</p>
            </div>
          </div>
          <p className="text-[9px] text-muted-foreground text-center mt-3 font-mono">
            Computed from {conversionVelocity.sampleSize} completed leads
          </p>
        </div>

        {/* ═══ 3. STALE TOUR RADAR ═══ */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-500" />
              <h3 className="font-semibold text-sm text-foreground">Stale Tour Radar</h3>
            </div>
            <span className="text-[10px] font-mono bg-amber-500/10 text-amber-500 px-2 py-0.5 rounded-full border border-amber-500/20">
              {staleTours.length} Active Tours
            </span>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar max-h-48 space-y-2">
            {staleTours.slice(0, 15).map((t: any) => (
              <div
                key={t.id}
                className={cn(
                  "flex items-center justify-between p-2.5 rounded-lg border text-xs",
                  t.urgency === "critical"
                    ? "bg-destructive/5 border-destructive/20 text-destructive"
                    : t.urgency === "warning"
                    ? "bg-amber-500/5 border-amber-500/20 text-amber-500"
                    : "bg-muted/10 border-border text-foreground"
                )}
              >
                <div className="min-w-0 flex items-center gap-2">
                  <div
                    className={cn(
                      "w-1.5 h-1.5 rounded-full shrink-0",
                      t.urgency === "critical"
                        ? "bg-destructive animate-pulse"
                        : t.urgency === "warning"
                        ? "bg-amber-500"
                        : "bg-muted-foreground"
                    )}
                  />
                  <div className="truncate">
                    <p className="font-semibold text-foreground truncate">{t.leadName}</p>
                    <p className="text-[9px] text-muted-foreground truncate">
                      {t.assignedToName} · {t.area}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0 font-mono text-[10px] ml-2">
                  <p className="font-bold">
                    {t.ageDays > 0 ? `${t.ageDays}d old` : `${Math.abs(t.daysUntilTour)}d left`}
                  </p>
                  <p className="text-[8px] text-muted-foreground">
                    {t.tourDate} {t.tourTime}
                  </p>
                </div>
              </div>
            ))}
            {!staleTours.length && (
              <div className="flex items-center justify-center h-24 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                No active stale tours
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 4. TOUR SLOT HEATMAP ═══ */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-4 min-w-[600px]">
          <div className="flex items-center gap-2">
            <Activity className="h-4.5 w-4.5 text-[#F97316]" />
            <h3 className="font-semibold text-sm text-foreground">Tour Slot Performance Heatmap</h3>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">% Conversion per slot</span>
        </div>
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-1">
            <div className="text-[10px] text-muted-foreground" />
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
              <div key={d} className="text-[10px] text-muted-foreground text-center font-bold">
                {d}
              </div>
            ))}
            {["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm"].map(
              (hour) => (
                <div key={hour} className="contents" style={{ contentVisibility: "auto" }}>
                  <div className="text-[10px] text-muted-foreground flex items-center font-mono font-medium">
                    {hour}
                  </div>
                  {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((day) => {
                    const cell = timeHeatmap.find((c: any) => c.day === day && c.hour === hour);
                    const rate = cell?.rate ?? 0;
                    const hasTours = cell?.tours > 0;
                    return (
                      <div
                        key={`${day}-${hour}`}
                        className={cn(
                          "h-8 rounded flex flex-col items-center justify-center text-[10px] font-mono transition-transform hover:scale-105 border border-transparent",
                          rate >= 60
                            ? "bg-success/20 text-success border-success/30"
                            : rate >= 30
                            ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            : hasTours
                            ? "bg-muted/30 text-muted-foreground border-border/50"
                            : "bg-muted/5 text-muted-foreground/30"
                        )}
                        title={`${day} ${hour}: ${cell?.tours ?? 0} tours, ${rate}% conv`}
                      >
                        {hasTours ? (
                          <>
                            <span className="font-bold">{rate}%</span>
                            <span className="text-[8px] opacity-75">{cell.tours}t</span>
                          </>
                        ) : (
                          "-"
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </div>
        </div>
      </div>

      {/* ═══ COLUMNAR INTERACTIVE WIDGETS ═══ */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* ═══ 5. LOSS REASON INTELLIGENCE ═══ */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
          <div className="flex items-center gap-2 mb-4">
            <Target className="h-4.5 w-4.5 text-destructive" />
            <h3 className="font-semibold text-sm text-foreground">Loss Reason Intelligence</h3>
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar max-h-72 space-y-3">
            {lossReasons.map((r: any) => (
              <div
                key={r.reason}
                onClick={() => handleLossReasonClick(r.reason)}
                className="group cursor-pointer p-3 bg-muted/20 hover:bg-muted/40 rounded-xl border border-border/50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-bold text-foreground capitalize flex items-center gap-1.5">
                    {r.reason}
                    <Eye className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground font-semibold">
                    {r.count} leads ({r.percentage}%)
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-destructive rounded-full"
                    style={{ width: `${r.percentage}%` }}
                  />
                </div>
                <div className="p-2 rounded bg-destructive/5 text-[10px] text-destructive border border-destructive/10 font-sans">
                  💡 <b>Plan:</b> {r.recommendation}
                </div>
              </div>
            ))}
            {!lossReasons.length && (
              <div className="flex items-center justify-center h-48 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                No loss reasons recorded
              </div>
            )}
          </div>
        </div>

        {/* ═══ 6. BUDGET VS ACTUAL MATRIX ═══ */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4.5 w-4.5 text-[#F97316]" />
              <h3 className="font-semibold text-sm text-foreground">Budget vs Actual Rent Gap</h3>
            </div>
            <span className="text-[10px] font-mono bg-[#F97316]/10 text-[#F97316] px-2 py-0.5 rounded-full border border-[#F97316]/20">
              Avg Gap: {budgetVsActual.avgGapPct > 0 ? "+" : ""}
              {budgetVsActual.avgGapPct}%
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 mb-4">
            <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-lg font-bold font-mono text-foreground">
                {budgetVsActual.totalLinked}
              </p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">
                Linked deals
              </p>
            </div>
            <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-lg font-bold font-mono text-success">
                {budgetVsActual.overBudget}
              </p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">
                Over budget
              </p>
            </div>
            <div className="text-center p-3 bg-muted/20 rounded-xl border border-border/50">
              <p className="text-lg font-bold font-mono text-destructive">
                {budgetVsActual.underBudget}
              </p>
              <p className="text-[9px] text-muted-foreground font-semibold uppercase mt-0.5">
                Under budget
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto no-scrollbar max-h-48 space-y-1.5">
            {budgetVsActual.points.map((p: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between text-[11px] p-2 bg-muted/10 border border-border/30 rounded-lg"
              >
                <div className="truncate">
                  <p className="font-semibold text-foreground truncate max-w-[140px]">
                    {p.leadName}
                  </p>
                  <p className="text-[9px] text-muted-foreground">{p.tcmName || "Unassigned"}</p>
                </div>
                <div className="text-right font-mono">
                  <p className="text-foreground">
                    ₹{p.budget.toLocaleString()} → ₹{p.actualRent.toLocaleString()}
                  </p>
                  <p className={cn("text-[9px] font-bold", p.gap >= 0 ? "text-success" : "text-destructive")}>
                    {p.gapPct > 0 ? "+" : ""}
                    {p.gapPct}% ({p.gap >= 0 ? "over" : "under"})
                  </p>
                </div>
              </div>
            ))}
            {!budgetVsActual.points.length && (
              <div className="flex items-center justify-center h-32 text-xs font-mono uppercase tracking-wider text-muted-foreground">
                No budget gaps computed yet
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══ 7. TCM AREA STRENGTH MATRIX ═══ */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm overflow-x-auto">
        <div className="flex items-center justify-between mb-4 min-w-[500px]">
          <div className="flex items-center gap-2">
            <UserCheck className="h-4.5 w-4.5 text-[#F97316]" />
            <h3 className="font-semibold text-sm text-foreground">TCM × Area Strength Matrix</h3>
          </div>
          <span className="text-[10px] text-muted-foreground font-mono">
            Interactive · Click cells to view list
          </span>
        </div>
        <div className="min-w-[500px]">
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `120px repeat(${tcmAreaMatrix.areas.length}, 1fr)`,
            }}
          >
            {/* Header row */}
            <div className="text-[10px] text-muted-foreground font-bold p-1">TCM</div>
            {tcmAreaMatrix.areas.map((area: string) => (
              <div
                key={area}
                className="text-[10px] text-muted-foreground text-center font-bold p-1 truncate"
                title={area}
              >
                {area}
              </div>
            ))}

            {/* Matrix rows */}
            {tcmAreaMatrix.tcmIds.map((tcm: any) => (
              <div key={tcm.id} className="contents">
                <div
                  className="text-xs text-foreground font-semibold p-1.5 truncate border-r border-border"
                  title={tcm.name}
                >
                  {tcm.name}
                </div>
                {tcm.areas.map((a: any) => {
                  const hasData = a.tours > 0;
                  return (
                    <div
                      key={`${tcm.id}-${a.area}`}
                      onClick={() => hasData && handleTcmAreaClick(tcm.id, a.area)}
                      className={cn(
                        "h-10 flex flex-col items-center justify-center text-[10px] font-mono rounded border transition-transform hover:scale-105",
                        hasData ? "cursor-pointer" : "cursor-default",
                        a.rate >= 50
                          ? "bg-success/20 text-success border-success/30"
                          : a.rate >= 20
                          ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                          : hasData
                          ? "bg-muted/30 text-muted-foreground border-border/50"
                          : "bg-muted/5 text-muted-foreground/30"
                      )}
                    >
                      {hasData ? (
                        <>
                          <span className="font-bold">{a.rate}%</span>
                          <span className="text-[8px] opacity-75">{a.tours} tours</span>
                        </>
                      ) : (
                        "-"
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ═══ DRILL-DOWN DRAWER ═══ */}
      <Sheet
        open={selectedDrillDown !== null}
        onOpenChange={(open) => !open && setSelectedDrillDown(null)}
      >
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto bg-card border-l border-border shadow-2xl">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-lg font-bold text-foreground">
              {selectedDrillDown?.title}
            </SheetTitle>
          </SheetHeader>

          <div className="space-y-3">
            {selectedDrillDown?.leads.map((l: any, idx: number) => {
              const tcm = tcms.find((t) => t.id === l.assignedTcmId);
              return (
                <div
                  key={l.id || idx}
                  className="p-4 rounded-xl border border-border bg-muted/20 space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-foreground text-sm truncate max-w-[180px]">
                      {l.name}
                    </span>
                    <span className="bg-primary/10 text-primary font-mono font-semibold px-2 py-0.5 rounded capitalize">
                      {l.stage.replace(/-/g, " ")}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>
                      <span className="font-semibold text-foreground/80">TCM:</span>{" "}
                      {tcm?.fullName || tcm?.name || "Unassigned"}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/80">Zone:</span>{" "}
                      {l.zoneCategory || "Unspecified"}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/80">Area:</span>{" "}
                      {l.preferredArea || "Unspecified"}
                    </div>
                    <div>
                      <span className="font-semibold text-foreground/80">Budget:</span> ₹
                      {l.budget?.toLocaleString()}
                    </div>
                  </div>
                  {l.whyNotClosed && (
                    <div className="mt-1 pt-1.5 border-t border-border/50 text-[10px] text-destructive bg-destructive/5 px-2 py-1 rounded">
                      ⚠️ <b>Objection:</b> {l.whyNotClosed}
                    </div>
                  )}
                </div>
              );
            })}
            {!selectedDrillDown?.leads.length && (
              <div className="py-12 text-center text-xs font-mono uppercase tracking-widest text-muted-foreground">
                No matching leads found
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
