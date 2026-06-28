import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { computeHealthScores, type TcmHealthScore } from "@/admin/lib/supreme-metrics";
import { useAuthUser } from "@/lib/auth-store";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, ChevronDown, ChevronUp, Trophy } from "lucide-react";

export const Route = createFileRoute("/admin/health-score")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "TCM Health Scores — Admin" }] }),
  component: HealthScorePage,
});

const GRADE_STYLE: Record<TcmHealthScore["grade"], { bg: string; text: string; border: string }> = {
  S: { bg: "bg-purple-500/15", text: "text-purple-400", border: "border-purple-500/40" },
  A: { bg: "bg-success/15",    text: "text-success",    border: "border-success/40" },
  B: { bg: "bg-info/15",       text: "text-info",        border: "border-info/40" },
  C: { bg: "bg-warning/15",    text: "text-warning",     border: "border-warning/40" },
  D: { bg: "bg-orange-500/15", text: "text-orange-400",  border: "border-orange-500/40" },
  F: { bg: "bg-destructive/15",text: "text-destructive", border: "border-destructive/40" },
};

function ScoreBar({ value, max, color }: { value: number; max: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-500", color)}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="text-[10px] font-mono w-6 text-right text-muted-foreground">{value}</span>
    </div>
  );
}

function TcmCard({ s, rank }: { s: TcmHealthScore; rank: number }) {
  const [expanded, setExpanded] = useState(false);
  const g = GRADE_STYLE[s.grade];

  return (
    <div className={cn("rounded-xl border bg-card p-4 transition-all", g.border)}>
      {/* Header row */}
      <div className="flex items-center gap-3">
        {/* Rank */}
        <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground shrink-0">
          {rank === 1 ? <Trophy className="h-3.5 w-3.5 text-yellow-400" /> : rank}
        </div>

        {/* Name + trend */}
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{s.name}</div>
          <div className="text-[10px] text-muted-foreground">
            {s.open} open · {s.booked} booked · {s.lost} lost
          </div>
        </div>

        {/* Score ring */}
        <div className={cn("flex flex-col items-center justify-center w-14 h-14 rounded-full border-2 shrink-0", g.border, g.bg)}>
          <span className={cn("text-xl font-bold font-mono leading-none", g.text)}>{s.score}</span>
          <span className={cn("text-[10px] font-bold", g.text)}>{s.grade}</span>
        </div>

        {/* Trend icon */}
        <div className="shrink-0">
          {s.trend === "up" && <TrendingUp className="h-4 w-4 text-success" />}
          {s.trend === "down" && <TrendingDown className="h-4 w-4 text-destructive" />}
          {s.trend === "flat" && <Minus className="h-4 w-4 text-muted-foreground" />}
        </div>

        {/* Expand toggle */}
        <button
          onClick={() => setExpanded(!expanded)}
          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      {/* Score bar */}
      <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700",
            s.score >= 75 ? "bg-success" : s.score >= 50 ? "bg-warning" : "bg-destructive",
          )}
          style={{ width: `${s.score}%` }}
        />
      </div>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="mt-4 space-y-3 border-t border-border pt-3">
          {/* Breakdown bars */}
          <div className="space-y-2">
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-1">Score breakdown</div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-muted-foreground">Conversion</span>
              <ScoreBar value={s.breakdown.conversion} max={25} color="bg-success" />
              <span className="text-[10px] text-muted-foreground">/25</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-muted-foreground">Response rate</span>
              <ScoreBar value={s.breakdown.responseRate} max={25} color="bg-info" />
              <span className="text-[10px] text-muted-foreground">/25</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-muted-foreground">Pipeline quality</span>
              <ScoreBar value={s.breakdown.pipeline} max={20} color="bg-accent" />
              <span className="text-[10px] text-muted-foreground">/20</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-muted-foreground">Activity</span>
              <ScoreBar value={s.breakdown.activity} max={20} color="bg-warning" />
              <span className="text-[10px] text-muted-foreground">/20</span>
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="w-28 text-muted-foreground">Dormancy penalty</span>
              <ScoreBar value={s.breakdown.dormancy} max={10} color="bg-destructive" />
              <span className="text-[10px] text-muted-foreground">/10</span>
            </div>
          </div>

          {/* Pipeline value */}
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border">
            <span className="text-muted-foreground">Pipeline value</span>
            <span className="font-mono font-semibold text-accent">
              ₹{(s.pipelineValue / 100_000).toFixed(1)}L
            </span>
          </div>

          {/* Coaching tips */}
          <div>
            <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Coaching tips</div>
            <ul className="space-y-1.5">
              {s.tips.map((tip, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-accent shrink-0">→</span>
                  <span>{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthScorePage() {
  const { rows, isLoading, isError } = useLiveSupremeMetrics();
  const scores = useMemo(() => computeHealthScores(rows), [rows]);

  const avg = scores.length
    ? Math.round(scores.reduce((s, x) => s + x.score, 0) / scores.length)
    : 0;

  const dist = useMemo(() => {
    const g: Record<string, number> = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    scores.forEach((s) => g[s.grade]++);
    return g;
  }, [scores]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">TCM Health Scores</h1>
          <p className="text-sm text-muted-foreground">Loading…</p>
        </div>
        <div className="p-8 text-center text-muted-foreground animate-pulse">
          Computing health scores from live data…
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-lg font-semibold">TCM Health Scores</h1>
          <p className="text-sm text-muted-foreground">Error</p>
        </div>
        <div className="p-8 text-center text-destructive">Failed to load. Check backend connection.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-semibold">TCM Health Scores</h1>
        <p className="text-sm text-muted-foreground">Composite AI-style performance score — conversion, response rate, pipeline quality & activity</p>
      </div>
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">Team avg score</div>
          <div className={cn(
            "text-3xl font-bold font-mono mt-1",
            avg >= 75 ? "text-success" : avg >= 50 ? "text-warning" : "text-destructive",
          )}>
            {avg}<span className="text-lg text-muted-foreground">/100</span>
          </div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider">TCMs scored</div>
          <div className="text-3xl font-bold font-mono mt-1 text-accent">{scores.length}</div>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 md:col-span-2">
          <div className="text-[10px] uppercase text-muted-foreground tracking-wider mb-2">Grade distribution</div>
          <div className="flex gap-2">
            {(["S", "A", "B", "C", "D", "F"] as const).map((g) => {
              const s = GRADE_STYLE[g];
              return (
                <div key={g} className={cn("flex-1 text-center rounded-lg py-1.5 border text-xs font-bold", s.bg, s.text, s.border)}>
                  <div className="text-lg font-mono">{dist[g]}</div>
                  <div>{g}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Score cards */}
      {scores.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-muted-foreground text-sm">
          No TCM data yet. Scores appear once leads are assigned to team members.
        </div>
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {scores.map((s, i) => (
            <TcmCard key={s.tcmId} s={s} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}
