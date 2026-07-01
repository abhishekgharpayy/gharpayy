import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Users, Banknote, CalendarClock, Briefcase, TrendingUp } from "lucide-react";
import { KpiCard } from "@/components/atoms";

export const Route = createFileRoute("/hr/analytics")({
  component: AnalyticsPage,
});

function AnalyticsPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["hr-analytics"],
    queryFn: () => api.hr.analytics(),
  });

  return (
    <div className="p-6 space-y-6 w-full flex-1 flex flex-col h-[calc(100vh-80px)] animate-in fade-in duration-500">
      <header className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-2xl font-display font-semibold tracking-tight text-foreground">HR Analytics</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organization health, headcount, and payroll metrics.
          </p>
        </div>
      </header>

      {isLoading || !stats ? (
        <div className="h-64 flex items-center justify-center text-muted-foreground">Loading analytics...</div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiCard 
              label="Total Headcount" 
              value={stats.headcount} 
              sub="Active employees" 
              tone="default"
            />
            <KpiCard 
              label="Monthly Payroll Run Rate" 
              value={`₹${(stats.monthlyRunRate / 1000).toFixed(0)}k`} 
              sub="Current month" 
              tone="accent"
            />
            <KpiCard 
              label="Pending Leaves" 
              value={stats.pendingLeaves} 
              sub="Awaiting approval" 
              tone={stats.pendingLeaves > 0 ? "warning" : "default"}
            />
            <KpiCard 
              label="Active Candidates" 
              value={stats.activeCandidates} 
              sub="In hiring pipeline" 
              tone="default"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="border border-border rounded-xl bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <Users className="h-4 w-4 text-accent" />
                <h3 className="font-semibold text-sm">Today's Attendance</h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-lg bg-success/10 border border-success/20">
                  <div className="text-xs text-success font-medium mb-1">Present</div>
                  <div className="text-3xl font-bold text-success">{stats.todayPresent}</div>
                </div>
                <div className="p-4 rounded-lg bg-muted border border-border">
                  <div className="text-xs text-muted-foreground font-medium mb-1">On Leave</div>
                  <div className="text-3xl font-bold">{stats.todayOnLeave}</div>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Attendance rate: {stats.headcount ? Math.round((stats.todayPresent / stats.headcount) * 100) : 0}%
              </p>
            </div>

            <div className="border border-border rounded-xl bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-3">
                <TrendingUp className="h-4 w-4 text-accent" />
                <h3 className="font-semibold text-sm">Payroll Trend (Last 6 Months)</h3>
              </div>
              <div className="h-40 flex items-end justify-between gap-2 pt-4">
                {stats.payrollTrend.length === 0 ? (
                  <div className="w-full text-center text-sm text-muted-foreground self-center">No payroll data available</div>
                ) : (
                  stats.payrollTrend.map((run: any, i: number) => {
                    const max = Math.max(...stats.payrollTrend.map((r: any) => r.amount));
                    const heightPct = max > 0 ? (run.amount / max) * 100 : 0;
                    return (
                      <div key={run.month} className="flex flex-col items-center gap-2 flex-1 group">
                        <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                          ₹{(run.amount / 1000).toFixed(0)}k
                        </div>
                        <div className="w-full bg-accent/20 rounded-t-sm relative group-hover:bg-accent transition-colors" style={{ height: `${Math.max(heightPct, 5)}%` }} />
                        <div className="text-[10px] text-muted-foreground">{run.month.split('-')[1]}</div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
