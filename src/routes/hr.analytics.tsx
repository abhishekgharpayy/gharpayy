import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Users, Banknote, CalendarClock, Briefcase, TrendingUp, Clock, ChevronRight, UserPlus, CreditCard, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { useState, useEffect } from "react";

export const Route = createFileRoute("/hr/analytics")({
  component: DashboardPage,
});

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div className="text-sm font-medium text-muted-foreground tabular-nums tracking-tight">
      {format(time, "EEEE, MMMM do, yyyy · HH:mm:ss")}
    </div>
  );
}

function DashboardPage() {
  const { data: stats, isLoading } = useQuery({
    queryKey: ["hr-analytics"],
    queryFn: () => api.hr.analytics(),
  });

  return (
    <div className="p-4 md:p-8 space-y-8 w-full flex-1 flex flex-col h-[calc(100vh-80px)] overflow-y-auto animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
      
      {/* Header Area */}
      <header className="flex flex-col md:flex-row items-start md:items-end justify-between gap-4 border-b border-border/50 pb-6 shrink-0">
        <div>
          <div className="mb-2"><LiveClock /></div>
          <h1 className="text-4xl font-display font-semibold tracking-tight text-foreground bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">
            Welcome to Command Center
          </h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Here is your real-time overview of organization health, headcount, and payroll.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/hr/hiring" className="inline-flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all hover:-translate-y-0.5">
            <UserPlus className="h-4 w-4 mr-2" /> Add Candidate
          </Link>
          <Link to="/hr/payroll" className="inline-flex items-center justify-center rounded-xl bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 transition-all">
            <CreditCard className="h-4 w-4 mr-2" /> Run Payroll
          </Link>
        </div>
      </header>

      {isLoading || !stats ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground animate-pulse">
          <Sparkles className="h-8 w-8 mb-4 opacity-50" />
          <p>Gathering real-time insights...</p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Glassmorphic KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KpiWidget 
              label="Active Headcount" 
              value={stats.headcount} 
              icon={Users}
              trend="+2 this month"
              color="text-blue-500"
              bg="bg-blue-500/10"
            />
            <KpiWidget 
              label="Payroll Run Rate" 
              value={`?${(stats.monthlyRunRate / 1000).toFixed(0)}k`} 
              icon={Banknote}
              trend="Stable"
              color="text-emerald-500"
              bg="bg-emerald-500/10"
            />
            <Link to="/hr/leaves" className="group block h-full">
              <KpiWidget 
                label="Pending Leaves" 
                value={stats.pendingLeaves} 
                icon={CalendarClock}
                trend={stats.pendingLeaves > 0 ? "Requires action" : "All caught up"}
                color={stats.pendingLeaves > 0 ? "text-amber-500" : "text-muted-foreground"}
                bg={stats.pendingLeaves > 0 ? "bg-amber-500/10" : "bg-muted/50"}
                interactive
              />
            </Link>
            <Link to="/hr/hiring" className="group block h-full">
              <KpiWidget 
                label="Pipeline Candidates" 
                value={stats.activeCandidates} 
                icon={Briefcase}
                trend="Actively interviewing"
                color="text-purple-500"
                bg="bg-purple-500/10"
                interactive
              />
            </Link>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Live Attendance Ring */}
            <div className="col-span-1 border border-border/50 rounded-2xl bg-card/40 backdrop-blur-xl p-6 shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute top-0 right-0 p-32 bg-emerald-500/5 rounded-full blur-3xl -z-10" />
              <div className="flex items-center gap-2 mb-6">
                <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <Clock className="h-4 w-4 text-emerald-500" />
                </div>
                <h3 className="font-semibold">Today's Attendance</h3>
              </div>
              
              <div className="flex-1 flex flex-col items-center justify-center">
                <div className="relative w-48 h-48 flex items-center justify-center mb-6">
                  <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="45" className="stroke-muted/30" strokeWidth="8" fill="none" />
                    <circle 
                      cx="50" cy="50" r="45" 
                      className="stroke-emerald-500 transition-all duration-1000 ease-out" 
                      strokeWidth="8" fill="none" strokeLinecap="round"
                      strokeDasharray="282.7" 
                      strokeDashoffset={stats.headcount ? 282.7 - (282.7 * (stats.todayPresent / stats.headcount)) : 282.7}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold tracking-tighter text-foreground">{stats.headcount ? Math.round((stats.todayPresent / stats.headcount) * 100) : 0}%</span>
                    <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mt-1">Present</span>
                  </div>
                </div>
                
                <div className="flex items-center justify-center gap-8 w-full border-t border-border/50 pt-6">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-emerald-500">{stats.todayPresent}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">Checked In</div>
                  </div>
                  <div className="w-px h-8 bg-border/50" />
                  <div className="text-center">
                    <div className="text-2xl font-bold text-muted-foreground">{stats.todayOnLeave}</div>
                    <div className="text-[10px] text-muted-foreground uppercase font-semibold">On Leave</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payroll Trend Chart */}
            <div className="col-span-2 border border-border/50 rounded-2xl bg-card/40 backdrop-blur-xl p-6 shadow-sm flex flex-col relative overflow-hidden">
              <div className="absolute bottom-0 left-0 p-32 bg-primary/5 rounded-full blur-3xl -z-10" />
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <TrendingUp className="h-4 w-4 text-primary" />
                  </div>
                  <h3 className="font-semibold">6-Month Payroll Trend</h3>
                </div>
              </div>
              
              <div className="flex-1 flex items-end justify-between gap-2 md:gap-4 mt-auto">
                {stats.payrollTrend.length === 0 ? (
                  <div className="w-full text-center text-sm text-muted-foreground self-center">No payroll data available</div>
                ) : (
                  stats.payrollTrend.map((run: any, i: number) => {
                    const max = Math.max(...stats.payrollTrend.map((r: any) => r.amount));
                    const heightPct = max > 0 ? (run.amount / max) * 100 : 0;
                    return (
                      <div key={run.month} className="flex flex-col items-center gap-3 flex-1 group h-48 justify-end">
                        <div className="text-xs font-medium text-foreground opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap bg-background shadow-sm border border-border rounded-md px-2 py-1 transform -translate-y-2">
                          ?{(run.amount / 1000).toFixed(0)}k
                        </div>
                        <div className="w-full max-w-[60px] bg-primary/20 rounded-t-lg relative group-hover:bg-primary transition-colors overflow-hidden" style={{ height: `${Math.max(heightPct, 5)}%` }}>
                          <div className="absolute inset-0 bg-gradient-to-t from-transparent to-primary/30" />
                        </div>
                        <div className="text-xs text-muted-foreground font-medium uppercase tracking-wider">{run.month.split('-')[1]}</div>
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

function KpiWidget({ label, value, icon: Icon, trend, color, bg, interactive }: any) {
  return (
    <div className={`relative overflow-hidden rounded-2xl border border-border/50 bg-card/40 backdrop-blur-xl p-5 shadow-sm transition-all duration-300 h-full flex flex-col ${interactive ? 'hover:border-primary/50 hover:shadow-md hover:-translate-y-1 group-hover:border-primary/50' : ''}`}>
      <div className={`absolute top-0 right-0 p-16 rounded-full blur-3xl -z-10 opacity-20 ${bg}`} />
      <div className="flex items-center justify-between mb-4">
        <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${bg}`}>
          <Icon className={`h-5 w-5 ${color}`} />
        </div>
        {interactive && (
          <ChevronRight className="h-4 w-4 text-muted-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-primary" />
        )}
      </div>
      <div className="mt-auto">
        <div className="text-3xl font-bold tracking-tight text-foreground mb-1">{value}</div>
        <div className="text-sm font-medium text-muted-foreground mb-1">{label}</div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground/70">{trend}</div>
      </div>
    </div>
  );
}
