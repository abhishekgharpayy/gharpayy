import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { AdminShell } from "@/admin/components/AdminShell";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { useAuthUser } from "@/lib/auth-store";

export const Route = createFileRoute("/admin/intelligence")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin") throw redirect({ to: "/" });
    },
    component: AdminIntelligence,
  }
);

const STAGE_ORDER = [
  "new",
  "contacted",
  "tour-scheduled",
  "on-tour",
  "tour-done",
  "negotiation",
  "quote-sent",
  "booked",
] as const;

type Stage = (typeof STAGE_ORDER)[number];

interface FunnelRow {
  stage: string;
  leads: number;
  convPct: number;
  dropPct: number;
  avgDays: number;
}

interface ObjectionCorrRow {
  code: string;
  raised: number;
  lost: number;
  lossPct: number;
}

function AdminIntelligence() {
  const { rows, isLoading, isError } = useLiveSupremeMetrics();

  // Derive leads from rows
  const leads = useMemo(() => rows.map((r) => r.lead), [rows]);

  // Derive objections from rows
  const objections = useMemo(
    () => rows.flatMap((r) => r.objections),
    [rows],
  );

  // Derive follow-ups from rows
  const followUps = useMemo(() => rows.flatMap((r) => r.followUps ?? []), [rows]);

  const funnel = useMemo(() => {
    const stageIndex = new Map<string, number>(STAGE_ORDER.map((s, i) => [s, i]));
    const counts = new Map<string, number>();
    const daysTotal = new Map<string, number>();
    STAGE_ORDER.forEach((s) => { counts.set(s, 0); daysTotal.set(s, 0); });

    const now = Date.now();
    leads.forEach((l) => {
      if (l.stage === "dropped") return;
      const idx = stageIndex.get(l.stage);
      if (idx === undefined) return;
      counts.set(l.stage, (counts.get(l.stage) ?? 0) + 1);
      const ageDays = Math.max(0, Math.floor((now - new Date(l.updatedAt).getTime()) / 86400000));
      daysTotal.set(l.stage, (daysTotal.get(l.stage) ?? 0) + ageDays);
    });

    const result: FunnelRow[] = [];
    for (let i = 0; i < STAGE_ORDER.length; i++) {
      const stage = STAGE_ORDER[i];
      const cnt = counts.get(stage) ?? 0;
      const totalDays = daysTotal.get(stage) ?? 0;
      const avgDays = cnt > 0 ? Math.round(totalDays / cnt) : 0;

      if (i < STAGE_ORDER.length - 1) {
        const nextCnt = counts.get(STAGE_ORDER[i + 1]) ?? 0;
        const convPct = cnt > 0 ? Math.round((nextCnt / cnt) * 100) : 0;
        result.push({ stage, leads: cnt, convPct, dropPct: 100 - convPct, avgDays });
      } else {
        result.push({ stage, leads: cnt, convPct: 100, dropPct: 0, avgDays });
      }
    }
    return result;
  }, [leads]);

  const objCorr = useMemo(() => {
    const lostLeadIds = new Set(leads.filter((l) => l.stage === "dropped").map((l) => l.id));
    const raised = new Map<string, number>();
    const lost = new Map<string, number>();

    objections.forEach((o) => {
      if ((o as any).code === "none") return;
      const code = (o as any).code as string;
      raised.set(code, (raised.get(code) ?? 0) + 1);
      if (lostLeadIds.has((o as any).leadId)) {
        lost.set(code, (lost.get(code) ?? 0) + 1);
      }
    });

    return [...raised.entries()]
      .map(([code, cnt]): ObjectionCorrRow => {
        const lostCnt = lost.get(code) ?? 0;
        return { code, raised: cnt, lost: lostCnt, lossPct: cnt > 0 ? Math.round((lostCnt / cnt) * 100) : 0 };
      })
      .sort((a, b) => b.lossPct - a.lossPct);
  }, [objections, leads]);

  const impactAnalytics = useMemo(() => {
    const tasks = followUps.filter((f: any) => !f.done);
    const overdue = tasks.filter((f: any) => new Date(f.dueAt).getTime() < Date.now());
    const byType = new Map<string, number>();
    tasks.forEach((t: any) => {
      byType.set(t.reason, (byType.get(t.reason) ?? 0) + 1);
    });
    const totalAgeHours = tasks.reduce((s, t: any) => {
      const age = Date.now() - new Date(t.dueAt).getTime();
      return s + Math.floor(age / 3600000);
    }, 0);
    return {
      total: tasks.length,
      overdue: overdue.length,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      avgAgeHours: tasks.length > 0 ? Math.round(totalAgeHours / tasks.length) : 0,
    };
  }, [followUps]);

  if (isLoading) {
    return (
      <AdminShell title="Intelligence" sub="Loading…">
        <div className="p-8 text-center text-muted-foreground animate-pulse">Fetching live data from MongoDB…</div>
      </AdminShell>
    );
  }

  if (isError) {
    return (
      <AdminShell title="Intelligence" sub="Error">
        <div className="p-8 text-center text-destructive">Failed to load. Check backend connection.</div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Intelligence" sub="Funnel velocity, objection correlation & task analytics — live from MongoDB">
      <div className="grid md:grid-cols-2 gap-4">
        {/* Funnel Velocity */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Funnel Velocity</div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-medium">Stage</th>
                <th className="text-right px-2 py-1.5 font-medium">Leads</th>
                <th className="text-right px-2 py-1.5 font-medium">Conv %</th>
                <th className="text-right px-2 py-1.5 font-medium">Drop %</th>
                <th className="text-right px-2 py-1.5 font-medium">Avg days</th>
              </tr>
            </thead>
            <tbody>
              {funnel.map((row, i) => (
                <tr key={row.stage} className={i < funnel.length - 1 ? "border-b border-border/50" : ""}>
                  <td className="px-2 py-1.5 capitalize">{row.stage.replace(/-/g, " ")}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{row.leads}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      row.convPct >= 50 ? "text-success" : row.convPct >= 30 ? "text-warning" : "text-destructive"
                    }`}
                  >
                    {row.convPct}%
                  </td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      row.dropPct >= 50 ? "text-destructive" : row.dropPct >= 30 ? "text-warning" : "text-success"
                    }`}
                  >
                    {row.dropPct}%
                  </td>
                  <td className="px-2 py-1.5 text-right font-mono">{row.avgDays}</td>
                </tr>
              ))}
              {!funnel.length && (
                <tr>
                  <td colSpan={5} className="px-2 py-4 text-center text-muted-foreground">No lead data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Objection Correlation */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">
            Objection ↔ Loss Correlation
          </div>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left px-2 py-1.5 font-medium">Objection code</th>
                <th className="text-right px-2 py-1.5 font-medium">Raised</th>
                <th className="text-right px-2 py-1.5 font-medium">Lost</th>
                <th className="text-right px-2 py-1.5 font-medium">Loss %</th>
              </tr>
            </thead>
            <tbody>
              {objCorr.map((row) => (
                <tr key={row.code} className="border-b border-border/50">
                  <td className="px-2 py-1.5 capitalize">{row.code.replace(/-/g, " ")}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{row.raised}</td>
                  <td className="px-2 py-1.5 text-right font-mono">{row.lost}</td>
                  <td
                    className={`px-2 py-1.5 text-right font-mono ${
                      row.lossPct >= 50 ? "text-destructive" : row.lossPct >= 30 ? "text-warning" : "text-success"
                    }`}
                  >
                    {row.lossPct}%
                  </td>
                </tr>
              ))}
              {!objCorr.length && (
                <tr>
                  <td colSpan={4} className="px-2 py-4 text-center text-muted-foreground">
                    No objection data yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Impact Queue Analytics */}
      <div className="rounded-xl border border-border bg-card p-4 mt-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-3">Impact Queue Analytics</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Total tasks", value: impactAnalytics.total, color: "" },
            { label: "Overdue tasks", value: impactAnalytics.overdue, color: "text-destructive" },
            { label: "Avg task age", value: `${impactAnalytics.avgAgeHours}h`, color: "" },
            {
              label: "Overdue rate",
              value: `${impactAnalytics.total > 0 ? Math.round((impactAnalytics.overdue / impactAnalytics.total) * 100) : 0}%`,
              color: "",
            },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-muted/30 rounded-lg p-3">
              <div className="text-xs text-muted-foreground">{label}</div>
              <div className={`text-xl font-display font-semibold ${color}`}>{value}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2">Tasks by type</div>
          <ul className="space-y-1 text-xs">
            {impactAnalytics.byType.map(([type, count]) => (
              <li key={type} className="flex justify-between gap-2 px-2 py-1 bg-muted/20 rounded">
                <span className="capitalize">{type.replace(/-/g, " ")}</span>
                <span className="font-mono">{count}</span>
              </li>
            ))}
            {!impactAnalytics.byType.length && (
              <li className="text-muted-foreground px-2">No pending tasks.</li>
            )}
          </ul>
        </div>
      </div>
    </AdminShell>
  );
}
