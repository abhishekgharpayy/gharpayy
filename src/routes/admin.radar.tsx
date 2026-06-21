import { createFileRoute, redirect } from "@tanstack/react-router";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { AdminShell } from "@/admin/components/AdminShell";
import { useAuthUser } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { useMemo } from "react";
import type { AdminLeadRow } from "@/admin/lib/selectors";

export const Route = createFileRoute("/admin/radar")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin Radar — AI Predictions" }] }),
  component: RadarPage,
});

function RadarPage() {
  const { rows, isLoading, isError } = useLiveSupremeMetrics();

  const churnRadar = useMemo(() => {
    if (!rows) return [];
    const open = rows.filter(r => r.status === "open" || r.status === "dormant");
    const now = Date.now();
    
    return open.map(r => {
      let riskScore = 0;
      const reasons: string[] = [];

      // Factor 1: Time since last touch (up to 40 pts)
      const daysSinceTouch = (now - r.lastTouchTs) / 86_400_000;
      if (daysSinceTouch > 5) {
        riskScore += 40;
        reasons.push(`Ghosting (${Math.floor(daysSinceTouch)}d)`);
      } else if (daysSinceTouch > 2) {
        riskScore += 20;
        reasons.push(`No recent touch (${Math.floor(daysSinceTouch)}d)`);
      }

      // Factor 2: Unresolved Objections (up to 30 pts)
      const unresolvedObjs = r.objections.filter(o => o.code !== "none" && o.resolution !== "yes");
      if (unresolvedObjs.length > 0) {
        riskScore += 30;
        reasons.push(`${unresolvedObjs.length} unresolved objections`);
      }

      // Factor 3: Stalled Stage (up to 30 pts)
      if (r.lead.stage === "tour-done" && daysSinceTouch > 1) {
        riskScore += 20;
        reasons.push(`Stalled post-tour`);
      } else if (r.lead.stage === "negotiation" && daysSinceTouch > 2) {
        riskScore += 30;
        reasons.push(`Stalled in negotiation`);
      }

      // Factor 4: Budget vs Expected (up to 10 pts)
      if (r.expectedValue < r.lead.budget * 0.8 && r.expectedValue > 0) {
        riskScore += 10;
        reasons.push(`Value dropping`);
      }

      riskScore = Math.min(100, Math.max(0, riskScore));

      return {
        row: r,
        riskScore,
        reasons
      };
    }).filter(x => x.riskScore > 30).sort((a, b) => b.riskScore - a.riskScore).slice(0, 20);
  }, [rows]);

  const heatmap = useMemo(() => {
    if (!rows) return [];
    const map = new Map<string, { count: number, hot: number, value: number }>();
    rows.forEach(r => {
      const area = r.lead.preferredArea || "Unknown";
      if (!map.has(area)) map.set(area, { count: 0, hot: 0, value: 0 });
      const stats = map.get(area)!;
      stats.count++;
      if (r.probability >= 70 && !r.booked && r.status !== "lost") stats.hot++;
      if (r.status !== "lost") stats.value += r.expectedValue;
    });
    return Array.from(map.entries())
      .map(([area, stats]) => ({ area, ...stats }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 15);
  }, [rows]);

  if (isLoading) {
    return (
      <AdminShell title="AI Radar" sub="Loading predictive models...">
        <div className="p-8 text-center text-muted-foreground animate-pulse">Running churn predictions...</div>
      </AdminShell>
    );
  }

  if (isError) {
    return (
      <AdminShell title="AI Radar" sub="Error loading data">
        <div className="p-8 text-center text-destructive">Failed to fetch intelligence.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="AI Radar" sub="Predictive churn & spatial demand mapping.">
      <div className="grid lg:grid-cols-2 gap-4 mt-4">
        
        {/* Heatmap Panel */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-sm font-semibold">Geospatial Demand Heatmap</div>
              <div className="text-[10px] text-muted-foreground">Where your pipeline wants to live</div>
            </div>
            <div className="text-[10px] uppercase text-accent font-semibold tracking-wider">Top 15 Areas</div>
          </div>
          
          <div className="space-y-3">
            {heatmap.map((h, i) => (
              <div key={h.area} className="relative group">
                <div className="flex justify-between items-center text-xs mb-1">
                  <span className="font-medium flex items-center gap-2">
                    <span className="text-muted-foreground w-4">{i + 1}.</span> {h.area}
                  </span>
                  <span className="text-muted-foreground font-mono">₹{h.value.toLocaleString("en-IN")}</span>
                </div>
                <div className="h-2 w-full bg-muted rounded-full overflow-hidden flex">
                  {/* Visual Heat bar based on hot leads vs total */}
                  <div 
                    className="h-full bg-accent transition-all duration-1000" 
                    style={{ width: `${Math.min(100, (h.hot / Math.max(1, h.count)) * 200)}%` }} 
                  />
                  <div 
                    className="h-full bg-info/50 transition-all duration-1000" 
                    style={{ width: `${Math.min(100, ((h.count - h.hot) / h.count) * 100)}%` }} 
                  />
                </div>
                <div className="text-[10px] text-muted-foreground mt-1 flex justify-between">
                  <span>{h.count} total leads</span>
                  <span className="text-accent">{h.hot} hot leads</span>
                </div>
              </div>
            ))}
            {!heatmap.length && <div className="text-sm text-muted-foreground">No spatial data available.</div>}
          </div>
        </div>

        {/* Churn Radar Panel */}
        <div className="rounded-xl border border-destructive/20 bg-card p-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <div className="text-sm font-semibold text-destructive">AI Churn Radar</div>
              <div className="text-[10px] text-muted-foreground">Pipeline at severe risk of failing</div>
            </div>
            <div className="text-[10px] uppercase text-destructive font-semibold tracking-wider">Flight Risk Score</div>
          </div>

          <div className="space-y-2">
            {churnRadar.map((c) => (
              <div key={c.row.lead.id} className="p-3 rounded-lg border border-destructive/10 bg-destructive/5 hover:border-destructive/30 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-semibold text-sm">{c.row.lead.name}</div>
                    <div className="text-[10px] text-muted-foreground">{c.row.tcm?.name || "Unassigned"} · {c.row.lead.stage}</div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className={cn(
                      "text-lg font-mono font-bold",
                      c.riskScore > 80 ? "text-destructive" : c.riskScore > 50 ? "text-warning" : "text-accent"
                    )}>
                      {c.riskScore}%
                    </span>
                    <span className="text-[9px] uppercase text-muted-foreground">Risk</span>
                  </div>
                </div>
                
                <div className="text-[10px] space-y-0.5">
                  {c.reasons.map((reason, idx) => (
                    <div key={idx} className="flex items-center gap-1.5 text-muted-foreground">
                      <div className="w-1 h-1 rounded-full bg-destructive/50" />
                      {reason}
                    </div>
                  ))}
                </div>
                
                <div className="mt-3 flex gap-2">
                  <button className="flex-1 text-[10px] py-1.5 rounded bg-background border border-border hover:bg-muted transition-colors">
                    View Lead
                  </button>
                  <button className="flex-1 text-[10px] py-1.5 rounded bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20 transition-colors">
                    Emergency Nudge
                  </button>
                </div>
              </div>
            ))}
            {!churnRadar.length && <div className="text-sm text-muted-foreground">No high-risk leads detected! Your pipeline is healthy.</div>}
          </div>
        </div>

      </div>
    </AdminShell>
  );
}
