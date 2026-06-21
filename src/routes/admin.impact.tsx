import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useApp } from "@/lib/store";
import { useAuthUser } from "@/lib/auth-store";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";
import { Target, Zap, AlertTriangle, CheckCircle, Clock3, Search, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";
import { normalizeLeadRecord } from "@/lib/lead-helpers";
import type { Lead, TCM, FollowUp } from "@/lib/types";

export const Route = createFileRoute("/admin/impact")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin") throw redirect({ to: "/" });
    },
    component: AdminImpact,
  }
);

// Chart Colors corresponding to standard dashboard themes
const COLORS = {
  success: "#10b981", // Emerald 500
  warning: "#f59e0b", // Amber 500
  danger: "#ef4444",  // Red 500
  primary: "#3b82f6", // Blue 500
  accent: "#8b5cf6",  // Violet 500
  muted: "#94a3b8",   // Slate 400
};

const PIE_COLORS = [COLORS.primary, COLORS.success, COLORS.warning, COLORS.danger, COLORS.accent, '#ec4899', '#14b8a6'];

function AdminImpact() {
  const app = useApp();
  
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tcms, setTcms] = useState<TCM[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [lRes, tRes, fRes] = await Promise.all([
          api.leads.list({ limit: 2000 }),
          api.tcms.list(),
          api.followUps.list({ limit: 2000 })
        ]);
        setLeads((lRes.items as any[]).map(l => normalizeLeadRecord(l)));
        setTcms(tRes.map(t => ({ id: t.id, name: t.fullName, initials: t.fullName.substring(0, 2).toUpperCase(), totalLeads: 0, conversionRate: 0, totalTasks: 0, completionRate: 0, avgResponseMins: 0 })));
        setFollowUps(fRes.items as FollowUp[]);
      } catch (err) {
        console.error("Failed to load impact data", err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  const [auditSearch, setAuditSearch] = useState("");
  const [sortCol, setSortCol] = useState("timeStr");
  const [sortAsc, setSortAsc] = useState(false);

  const reportData = useMemo(() => {
    const leadsMap = new Map(leads.map(l => [l.id, l]));
    const tcmsMap = new Map(tcms.map(t => [t.id, t]));

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
    const thirtyDaysAgo = now - 30 * 24 * 3600 * 1000;

    let totalAvgTime = 0;
    let completedWithTime = 0;

    const tcmStats = new Map<string, any>();
    const typeStats = new Map<string, any>();
    const dailyStats = new Map<string, any>();

    let oldestOverdue = { age: -1, name: "", days: 0 };
    const overdueByTcm = new Map<string, number>();
    const overdueByType = new Map<string, number>();

    const auditData: any[] = [];
    
    // Initialize 30 days
    for (let i = 29; i >= 0; i--) {
        const d = new Date(now - i * 86400000);
        const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        dailyStats.set(dateStr, { date: dateStr, displayDate: `${String(d.getDate()).padStart(2,'0')} ${d.toLocaleString('default', {month: 'short'})}`, created: 0, completed: 0 });
    }

    const data = {
      kpi: { total: followUps.length, completed: 0, pending: 0, overdue: 0, completionRate: 0, avgTime: 0 },
      tcms: [] as any[],
      types: [] as any[],
      daily: [] as any[],
      audit: [] as any[],
      overdueAnalysis: { total: 0, mostOverdueTcm: "", mostOverdueType: "", oldestTask: "" },
      overallDonut: [] as any[]
    };

    const sortedFollowUps = [...followUps].sort((a, b) => {
        const ta = new Date(a.dueAt || 0).getTime();
        const tb = new Date(b.dueAt || 0).getTime();
        return tb - ta;
    });

    for (const f of sortedFollowUps) {
        const tcmId = f.tcmId || "unassigned";
        const type = f.reason || "unknown";
        const dueAt = new Date(f.dueAt).getTime();
        // Since FollowUp type currently lacks createdAt/updatedAt, we infer based on dueAt or fallback
        const createdAt = dueAt - 86400000; 
        const updatedAt = now; 

        const isOverdue = !f.done && dueAt < now;
        const isPending = !f.done && dueAt >= now;

        if (f.done) data.kpi.completed++;
        else if (isOverdue) data.kpi.overdue++;
        else data.kpi.pending++;

        if (!tcmStats.has(tcmId)) {
            tcmStats.set(tcmId, { id: tcmId, name: tcmsMap.get(tcmId)?.name || tcmId, shortName: (tcmsMap.get(tcmId)?.name || tcmId).split(' ')[0], total: 0, completed: 0, pending: 0, overdue: 0, recent7: 0, timeSum: 0, timeCount: 0 });
        }
        const ts = tcmStats.get(tcmId);
        ts.total++;
        if (f.done) {
            ts.completed++;
            if (updatedAt > sevenDaysAgo) ts.recent7++;
            const hours = (updatedAt - createdAt) / 3600000;
            if (hours >= 0 && hours < 8760) { 
                ts.timeSum += hours;
                ts.timeCount++;
                totalAvgTime += hours;
                completedWithTime++;
            }
        } else if (isOverdue) {
            ts.overdue++;
            overdueByTcm.set(tcmId, (overdueByTcm.get(tcmId) || 0) + 1);
            
            const daysOverdue = (now - dueAt) / 86400000;
            if (daysOverdue > oldestOverdue.age) {
                const leadName = leadsMap.get(f.leadId)?.name || "Unknown";
                oldestOverdue = { age: daysOverdue, name: `Task for ${leadName} (${type.replace(/_/g, " ")})`, days: Math.round(daysOverdue) };
            }
        } else {
            ts.pending++;
        }

        if (!typeStats.has(type)) {
            typeStats.set(type, { type: type.replace(/_/g, " "), total: 0, completed: 0, pending: 0, overdue: 0 });
        }
        const tys = typeStats.get(type);
        tys.total++;
        if (f.done) tys.completed++;
        else if (isOverdue) {
            tys.overdue++;
            overdueByType.set(type, (overdueByType.get(type) || 0) + 1);
        }
        else tys.pending++;

        if (createdAt > thirtyDaysAgo) {
            const cd = new Date(createdAt);
            const createdDateStr = `${cd.getFullYear()}-${String(cd.getMonth()+1).padStart(2,'0')}-${String(cd.getDate()).padStart(2,'0')}`;
            if (dailyStats.has(createdDateStr)) dailyStats.get(createdDateStr).created++;
        }
        if (f.done && updatedAt > thirtyDaysAgo) {
            const ud = new Date(updatedAt);
            const updatedDateStr = `${ud.getFullYear()}-${String(ud.getMonth()+1).padStart(2,'0')}-${String(ud.getDate()).padStart(2,'0')}`;
            if (dailyStats.has(updatedDateStr)) dailyStats.get(updatedDateStr).completed++;
        }

        if (auditData.length < 50) {
            const leadName = leadsMap.get(f.leadId)?.name || "Unknown Lead";
            const tcmName = tcmsMap.get(f.tcmId)?.name || "Unassigned";
            const timestamp = f.dueAt;
            let statusObj = { text: "⏳ Pending", val: "pending", days: 0 };
            if (f.done) statusObj = { text: "✅ Completed", val: "completed", days: 0 };
            else if (isOverdue) {
                const odDays = Math.round((now - dueAt) / 86400000);
                statusObj = { text: `🔴 Overdue (${odDays}d)`, val: "overdue", days: odDays };
            }

            auditData.push({
                timeStr: new Date(timestamp).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }),
                tcm: tcmName,
                leadName: leadName,
                type: type.replace(/_/g, " "),
                status: statusObj.text,
                statusVal: statusObj.val,
                rawTime: new Date(timestamp).getTime()
            });
        }
    }

    data.kpi.completionRate = data.kpi.total > 0 ? Math.round((data.kpi.completed / data.kpi.total) * 100) : 0;
    data.kpi.avgTime = completedWithTime > 0 ? Math.round((totalAvgTime / completedWithTime) * 10) / 10 : 0;
    
    for (const ts of tcmStats.values()) {
        ts.completionRate = ts.total > 0 ? Math.round((ts.completed / ts.total) * 100) : 0;
        ts.avgTime = ts.timeCount > 0 ? Math.round((ts.timeSum / ts.timeCount) * 10) / 10 : 0;
        ts.score = (ts.completionRate * 0.5) + (ts.recent7 * 0.3) - (ts.overdue * 0.2);
        data.tcms.push(ts);
    }
    data.tcms.sort((a, b) => b.score - a.score);

    for (const tys of typeStats.values()) {
        tys.completionRate = tys.total > 0 ? Math.round((tys.completed / tys.total) * 100) : 0;
        tys.pendingOverdue = tys.pending + tys.overdue;
        data.types.push(tys);
    }
    data.types.sort((a, b) => b.total - a.total);

    data.daily = Array.from(dailyStats.values());
    data.audit = auditData;

    let topOverdueTcm = { name: "None", count: 0 };
    for (const [tcmId, count] of overdueByTcm.entries()) {
        if (count > topOverdueTcm.count) topOverdueTcm = { name: tcmsMap.get(tcmId)?.name || tcmId, count };
    }
    let topOverdueType = { type: "None", count: 0 };
    for (const [type, count] of overdueByType.entries()) {
        if (count > topOverdueType.count) topOverdueType = { type, count };
    }

    data.overdueAnalysis = {
        total: data.kpi.overdue,
        mostOverdueTcm: topOverdueTcm.name,
        mostOverdueType: topOverdueType.type.replace(/_/g, " "),
        oldestTask: oldestOverdue.name ? `${oldestOverdue.name} (${oldestOverdue.days} days)` : "None"
    };

    data.overallDonut = [
      { name: 'Completed', value: data.kpi.completed, color: COLORS.success },
      { name: 'Pending', value: data.kpi.pending, color: COLORS.warning },
      { name: 'Overdue', value: data.kpi.overdue, color: COLORS.danger }
    ];

    return data;
  }, [leads, tcms, followUps]);

  // Handle Audit sorting and filtering
  const filteredAudit = useMemo(() => {
    let res = reportData.audit;
    if (auditSearch) {
      const q = auditSearch.toLowerCase();
      res = res.filter(r => 
        r.tcm.toLowerCase().includes(q) || 
        r.leadName.toLowerCase().includes(q) || 
        r.type.toLowerCase().includes(q) ||
        r.status.toLowerCase().includes(q)
      );
    }
    return res.sort((a, b) => {
      let va = a[sortCol];
      let vb = b[sortCol];
      if (sortCol === "timeStr") { va = a.rawTime; vb = b.rawTime; }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [reportData.audit, auditSearch, sortCol, sortAsc]);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortAsc(!sortAsc);
    else { setSortCol(col); setSortAsc(true); }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground animate-pulse">Computing impact metrics...</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 p-6 pb-20 max-w-[1400px] mx-auto animate-in fade-in duration-500">
      <header className="flex flex-col gap-2">
        <h1 className="font-display text-3xl font-semibold tracking-tight inline-flex items-center gap-3">
          <Target className="h-8 w-8 text-primary" /> Impact Queue Analytics
        </h1>
        <p className="text-muted-foreground">
          Comprehensive dashboard for tracking TCM workflows, task completion, and overdue queues.
        </p>
      </header>

      {/* KPI Summary Strip */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-foreground/90 border-b border-border pb-2">Executive Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: "Total Tasks", value: reportData.kpi.total, icon: Target, color: "text-primary", bg: "bg-primary/10" },
            { label: "Completed", value: reportData.kpi.completed, icon: CheckCircle, color: "text-green-500", bg: "bg-green-500/10" },
            { label: "Pending", value: reportData.kpi.pending, icon: Clock3, color: "text-amber-500", bg: "bg-amber-500/10" },
            { label: "Overdue", value: reportData.kpi.overdue, icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
            { label: "Completion Rate", value: `${reportData.kpi.completionRate}%`, icon: Zap, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Avg Time", value: `${reportData.kpi.avgTime}h`, icon: Clock3, color: "text-muted-foreground", bg: "bg-muted" },
          ].map((k, i) => (
            <div key={i} className="rounded-xl border border-border bg-card p-4 shadow-sm flex flex-col justify-between hover:-translate-y-1 transition-transform">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">{k.label}</span>
                <div className={`p-1.5 rounded-md ${k.bg}`}>
                  <k.icon className={`h-4 w-4 ${k.color}`} />
                </div>
              </div>
              <div className={`text-3xl font-display font-bold ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Overdue Strip */}
      <section className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 md:p-6 shadow-sm">
        <div className="flex items-center gap-2 text-red-500 font-semibold mb-3 border-b border-red-500/10 pb-2">
          <AlertTriangle className="h-5 w-5" /> Overdue Analysis
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Total Overdue</div>
            <div className="text-xl font-bold mt-1 text-foreground">{reportData.overdueAnalysis.total}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Most Overdue TCM</div>
            <div className="text-xl font-bold mt-1 text-foreground">{reportData.overdueAnalysis.mostOverdueTcm}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Most Overdue Type</div>
            <div className="text-xl font-bold mt-1 capitalize text-foreground">{reportData.overdueAnalysis.mostOverdueType}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Oldest Task</div>
            <div className="text-base font-bold mt-1 text-red-500">{reportData.overdueAnalysis.oldestTask}</div>
          </div>
        </div>
      </section>

      {/* Charts Grid */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-foreground/90 border-b border-border pb-2">Visualizations</h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Donut */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Overall Completion</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reportData.overallDonut} innerRadius="60%" outerRadius="80%" paddingAngle={5} dataKey="value">
                    {reportData.overallDonut.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                  <Legend verticalAlign="bottom" height={36} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Grouped Bar TCM */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Tasks per TCM</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.tcms} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="shortName" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="completed" name="Completed" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pending" name="Pending" fill={COLORS.warning} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="overdue" name="Overdue" fill={COLORS.danger} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Type Distribution Pie */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Task Type Distribution</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={reportData.types} outerRadius="80%" dataKey="total" nameKey="type">
                    {reportData.types.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Daily Line Chart */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Daily Activity (Last 30 Days)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={reportData.daily} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="displayDate" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                  <Legend verticalAlign="top" height={36} />
                  <Line type="monotone" dataKey="created" name="Created" stroke={COLORS.primary} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="completed" name="Completed" stroke={COLORS.success} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Leaderboard Horizontal Bar */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">TCM Leaderboard (Score)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.tcms} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                  <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis dataKey="name" type="category" width={100} stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                  <Bar dataKey="score" name="Performance Score" fill={COLORS.accent} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Type Grouped Bar */}
          <div className="bg-card border border-border rounded-xl p-5 shadow-sm h-80 flex flex-col">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">Task Types (Completed vs Pending/Overdue)</h3>
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={reportData.types} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="type" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: 'hsl(var(--muted))' }} contentStyle={{ backgroundColor: 'var(--card)', borderRadius: '8px', borderColor: 'var(--border)' }} />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="completed" name="Completed" fill={COLORS.success} radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pendingOverdue" name="Pending/Overdue" fill={COLORS.warning} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </section>

      {/* Data Tables */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-foreground/90 border-b border-border pb-2">Data Tables</h2>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          
          {/* TCM Performance Table */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20 font-semibold text-sm flex items-center gap-2">
              🏆 TCM Performance Table
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 font-semibold">TCM Name</th>
                    <th className="p-3 font-semibold text-right">Total</th>
                    <th className="p-3 font-semibold text-right">Done</th>
                    <th className="p-3 font-semibold text-right">Pend</th>
                    <th className="p-3 font-semibold text-right">Late</th>
                    <th className="p-3 font-semibold text-right">Rate</th>
                    <th className="p-3 font-semibold text-right">Score</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {reportData.tcms.map((t, i) => (
                    <tr key={t.id} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 flex items-center gap-2">
                        {i < 3 && <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${i===0?'bg-amber-500/20 text-amber-500':i===1?'bg-slate-400/20 text-slate-400':'bg-orange-600/20 text-orange-600'}`}>{i+1}</span>}
                        <span className="font-medium">{t.name}</span>
                      </td>
                      <td className="p-3 text-right font-mono text-primary">{t.total}</td>
                      <td className="p-3 text-right font-mono text-green-500">{t.completed}</td>
                      <td className="p-3 text-right font-mono text-amber-500">{t.pending}</td>
                      <td className="p-3 text-right font-mono text-red-500">{t.overdue}</td>
                      <td className="p-3 text-right font-mono">{t.completionRate}%</td>
                      <td className="p-3 text-right font-mono font-bold text-accent">{t.score.toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Type Breakdown Table */}
          <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
            <div className="p-4 border-b border-border bg-muted/20 font-semibold text-sm flex items-center gap-2">
              📌 Task Type Breakdown
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                  <tr>
                    <th className="p-3 font-semibold">Type</th>
                    <th className="p-3 font-semibold text-right">Total</th>
                    <th className="p-3 font-semibold text-right">Done</th>
                    <th className="p-3 font-semibold text-right">Pend</th>
                    <th className="p-3 font-semibold text-right">Late</th>
                    <th className="p-3 font-semibold text-right">Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {reportData.types.map((t) => (
                    <tr key={t.type} className="hover:bg-muted/20 transition-colors">
                      <td className="p-3 capitalize font-medium">{t.type}</td>
                      <td className="p-3 text-right font-mono text-primary">{t.total}</td>
                      <td className="p-3 text-right font-mono text-green-500">{t.completed}</td>
                      <td className="p-3 text-right font-mono text-amber-500">{t.pending}</td>
                      <td className="p-3 text-right font-mono text-red-500">{t.overdue}</td>
                      <td className="p-3 text-right font-mono">{t.completionRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive Audit Table */}
      <section>
        <h2 className="text-xl font-semibold mb-4 text-foreground/90 border-b border-border pb-2">Audit Log (Latest 50)</h2>
        <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border bg-muted/10 relative">
            <Search className="absolute left-6 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input 
              className="pl-10 bg-background border-none shadow-none focus-visible:ring-1" 
              placeholder="Search audit logs (TCM, Lead, Type)..." 
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
            />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/40 text-muted-foreground border-b border-border">
                <tr>
                  <th className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('timeStr')}>
                    Timestamp {sortCol === 'timeStr' ? (sortAsc ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('tcm')}>
                    TCM {sortCol === 'tcm' ? (sortAsc ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('leadName')}>
                    Lead {sortCol === 'leadName' ? (sortAsc ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('type')}>
                    Task Type {sortCol === 'type' ? (sortAsc ? '↑' : '↓') : '↕'}
                  </th>
                  <th className="p-3 font-semibold cursor-pointer hover:text-foreground transition-colors" onClick={() => toggleSort('statusVal')}>
                    Status {sortCol === 'statusVal' ? (sortAsc ? '↑' : '↓') : '↕'}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {filteredAudit.map((row, i) => (
                  <tr key={i} className="hover:bg-muted/20 transition-colors">
                    <td className="p-3 font-mono text-xs text-muted-foreground whitespace-nowrap">{row.timeStr}</td>
                    <td className="p-3 font-medium">{row.tcm}</td>
                    <td className="p-3">{row.leadName}</td>
                    <td className="p-3 capitalize text-muted-foreground">{row.type}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide border
                        ${row.statusVal === "completed" ? "bg-green-500/10 text-green-500 border-green-500/20" : 
                          row.statusVal === "overdue" ? "bg-red-500/10 text-red-500 border-red-500/20" : 
                          "bg-amber-500/10 text-amber-500 border-amber-500/20"}`}
                      >
                        {row.status}
                      </span>
                    </td>
                  </tr>
                ))}
                {!filteredAudit.length && (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No records found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
