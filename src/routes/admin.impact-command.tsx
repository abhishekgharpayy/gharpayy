import { createFileRoute, redirect } from "@tanstack/react-router";
import { useAuthUser } from "@/lib/auth-store";
import { useState } from "react";
import { ShieldCheck, Flame, Hourglass, PhoneOff, Calendar, Snowflake, CheckCircle, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/admin/impact-command")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminImpactCommand,
});

function AdminImpactCommand() {
  const [timeFilter, setTimeFilter] = useState("This Month");
  const [activeTab, setActiveTab] = useState("Overview");

  const { data, isLoading } = useQuery({
    queryKey: ["impact_command"],
    queryFn: () => api.impactCommand(),
  });

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-7xl mx-auto w-full pt-4">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }

  const stats = data?.stats || {
    totalLeads: 0,
    toursScheduled: 0,
    toursDone: 0,
    bookings: 0,
    conversion: 0,
    stuck: 0,
    cohorts: { active: 0, awaiting: 0, noResponse: 0, future: 0, cold: 0, closed: 0 },
    scoreboard: []
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto w-full animate-in fade-in duration-500 pb-12 pt-4">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Impact Command Center</h1>
          <p className="text-sm text-muted-foreground mt-1 font-medium">5 pods · 7 members · scoped to all zones</p>
        </div>
        
        <div className="flex items-center gap-3">
          <select className="text-sm bg-background border border-border rounded-md px-3 py-1.5 outline-none font-medium text-foreground">
            <option>All zones</option>
            <option>North</option>
            <option>South</option>
            <option>East</option>
          </select>
          <div className="flex items-center bg-muted/30 p-1 rounded-lg border border-border">
            {["This Week", "Last Week", "This Month", "All Time"].map(tf => (
              <button 
                key={tf}
                onClick={() => setTimeFilter(tf)}
                className={cn(
                  "px-3 py-1 text-xs font-semibold rounded-md transition-colors",
                  timeFilter === tf ? "bg-foreground text-background shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <KPICard title="LEADS" value={stats.totalLeads} target={400} />
        <KPICard title="TOURS SCHEDULED" value={stats.toursScheduled} target={100} />
        <KPICard title="TOURS DONE" value={stats.toursDone} target={100} />
        <KPICard title="BOOKINGS" value={stats.bookings} target={40} />
        <KPICard title="CONVERSION" value={stats.conversion} target={10} isPercentage />
        <KPICard title="STUCK > 3D" value={stats.stuck} target={20} inverseLogic />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border mt-8">
        {["Overview", "Pods & Members", "3-Month Trend", "Vault"].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors",
              activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/20"
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "Overview" && (
        <div className="space-y-6">
          {/* Cohort Distribution */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-sm text-foreground mb-6">Cohort distribution</h3>
            <div className="space-y-4 max-w-xl">
              <CohortRow icon={Flame} color="text-amber-500" label="Active" count={stats.cohorts.active} total={stats.totalLeads || 1} />
              <CohortRow icon={Hourglass} color="text-slate-600 dark:text-slate-400" label="Awaiting" count={stats.cohorts.awaiting} total={stats.totalLeads || 1} />
              <CohortRow icon={PhoneOff} color="text-blue-500" label="No Response" count={stats.cohorts.noResponse} total={stats.totalLeads || 1} />
              <CohortRow icon={Calendar} color="text-rose-500" label="Future" count={stats.cohorts.future} total={stats.totalLeads || 1} />
              <CohortRow icon={Snowflake} color="text-slate-400" label="Cold" count={stats.cohorts.cold} total={stats.totalLeads || 1} />
              <CohortRow icon={CheckCircle} color="text-emerald-500" label="Closed" count={stats.cohorts.closed} total={stats.totalLeads || 1} />
            </div>
          </div>

          {/* Zone Scoreboard */}
          <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-border/50">
              <h3 className="font-semibold text-sm text-foreground flex items-center gap-2">Zone scoreboard</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="text-xs text-muted-foreground border-b border-border/50">
                  <tr>
                    <th className="px-6 py-4 font-medium">Zone</th>
                    <th className="px-6 py-4 font-medium text-center">Pods</th>
                    <th className="px-6 py-4 font-medium text-center">Open</th>
                    <th className="px-6 py-4 font-medium text-center">Stuck</th>
                    <th className="px-6 py-4 font-medium text-center">Bookings</th>
                    <th className="px-6 py-4 font-medium text-right">Stuck %</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.scoreboard.map((row, i) => (
                    <tr key={i} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">{row.zone}</td>
                      <td className="px-6 py-4 text-center text-muted-foreground">{row.pods}</td>
                      <td className="px-6 py-4 text-center font-medium">{row.open}</td>
                      <td className="px-6 py-4 text-center text-muted-foreground">{row.stuck}</td>
                      <td className="px-6 py-4 text-center font-bold">{row.bookings}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={cn(
                          "inline-flex font-mono text-xs font-bold",
                          row.stuckPct > 10 ? "text-destructive" : "text-emerald-500"
                        )}>
                          {row.stuckPct}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Top loss reasons */}
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="font-semibold text-sm text-foreground mb-8">Top loss reasons</h3>
            <div className="py-12 flex items-center justify-center text-sm text-muted-foreground font-medium">
              No lost leads in scope yet
            </div>
          </div>
        </div>
      )}
      
      {activeTab !== "Overview" && (
        <div className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground bg-muted/10">
          <Info className="w-8 h-8 mx-auto mb-3 opacity-20" />
          <p className="font-medium text-sm">Module coming soon</p>
        </div>
      )}
    </div>
  );
}

// Subcomponents

function KPICard({ title, value, target, isPercentage = false, inverseLogic = false }: { title: string, value: number, target: number, isPercentage?: boolean, inverseLogic?: boolean }) {
  const isCritical = inverseLogic ? value > target : value < (target * 0.5);
  
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm flex flex-col justify-between">
      <div className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{title}</div>
      <div className="flex items-baseline gap-2 mb-4">
        <span className="text-3xl font-bold text-foreground">{value}{isPercentage ? "%" : ""}</span>
        <span className="text-sm font-medium text-muted-foreground">/ {target}{isPercentage ? "%" : ""}</span>
      </div>
      <div>
        <span className={cn(
          "inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
          isCritical 
            ? "bg-rose-500/10 text-rose-500" 
            : "bg-emerald-500/10 text-emerald-500"
        )}>
          {isCritical ? "Critical" : "On track"}
        </span>
      </div>
    </div>
  );
}

function CohortRow({ icon: Icon, color, label, count, total }: { icon: any, color: string, label: string, count: number, total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  
  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2 w-32 shrink-0">
        <Icon className={cn("w-4 h-4", color)} />
        <span className="text-sm font-medium text-foreground">{label}</span>
      </div>
      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-foreground transition-all duration-1000" 
          style={{ width: count > 0 ? `${Math.max(pct, 1)}%` : '0%' }}
        />
      </div>
      <div className="w-8 text-right text-sm font-medium text-muted-foreground">
        {count}
      </div>
    </div>
  );
}
