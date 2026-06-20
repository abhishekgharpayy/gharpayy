import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useAdminRows } from "@/admin/lib/use-admin-rows";
import { computeMoneyMap, computeSlaBreaches } from "@/admin/lib/supreme-metrics";
import { useVisitWar } from "@/lib/visits/war-store";
import { useAuthUser } from "@/lib/auth-store";
import { api } from "@/lib/api/client";
import { useApp } from "@/lib/store";
import { normalizeLeadRecord } from "@/lib/lead-helpers";
import type { Lead as LegacyLead, LeadStage, Intent } from "@/lib/types";
import type { Lead as WireLead } from "@/contracts";
import type { CreatorLeaderboardEntry } from "@/lib/stats-types";

export const Route = createFileRoute("/admin/warroom")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "War-Room TV - Admin" }] }),
  component: WarRoomTV,
});

function toLegacyLead(w: WireLead, fallbackTcmId = ""): LegacyLead {
  return normalizeLeadRecord({
    id: w._id,
    name: w.name,
    phone: w.phone,
    source: w.source ?? "manual",
    budget: w.budget ?? 0,
    budgetText: w.budgetText ?? "",
    moveInDate: w.moveInDate ?? new Date().toISOString().slice(0, 10),
    preferredArea: w.preferredArea ?? "",
    assignedTcmId: w.assignedTcmId ?? fallbackTcmId,
    assigneeId: w.assigneeId ?? w.assignedTcmId ?? null,
    createdBy: w.createdBy ?? null,
    stage: (w.stage as LeadStage) ?? "new",
    intent: (w.intent as Intent) ?? "warm",
    confidence: w.confidence ?? 50,
    tags: w.tags ?? [],
    nextFollowUpAt: w.nextFollowUpAt ?? null,
    responseSpeedMins: w.responseSpeedMins ?? 0,
    createdAt: w.createdAt,
    updatedAt: w.updatedAt,
    email: w.email,
    areas: w.areas,
    fullAddress: w.fullAddress,
    type: w.type,
    room: w.room,
    need: w.need,
    inBLR: w.inBLR,
    quality: w.quality,
    specialReqs: w.specialReqs,
    notes: w.notes,
    zoneCategory: w.zoneCategory,
    stageLabel: w.stageLabel,
  });
}

function inrL(n: number) {
  if (n >= 10_000_000) return `?${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `?${(n / 100_000).toFixed(1)}L`;
  return `?${Math.round(n).toLocaleString("en-IN")}`;
}

function WarRoomTV() {
  const rows = useAdminRows();
  const setLeads = useApp((s) => s.setLeads);
  const tcms = useApp((s) => s.tcms);
  const localAlerts = useVisitWar((s) => s.alerts).slice(0, 8);
  const [leaderboard, setLeaderboard] = useState<CreatorLeaderboardEntry[]>([]);
  const [backendAlerts, setBackendAlerts] = useState<{ id: string; ts: string; message: string }[]>([]);
  const [tick, setTick] = useState(0);
  const [dataTick, setDataTick] = useState(0);

  const refreshData = useCallback(async () => {
    const fallbackTcm = tcms[0]?.id ?? "";
    const [leadResult, boardResult, activityResult] = await Promise.allSettled([
      api.leads.list({ limit: 200 }),
      api.stats.leaderboard("today"),
      api.activity.all(8),
    ]);

    if (leadResult.status === "fulfilled") {
      setLeads((leadResult.value.items as WireLead[]).map((lead) => toLegacyLead(lead, fallbackTcm)));
    }
    if (boardResult.status === "fulfilled") {
      setLeaderboard(boardResult.value.rankings.slice(0, 8));
    }
    if (activityResult.status === "fulfilled") {
      setBackendAlerts(
        activityResult.value.items.slice(0, 8).map((item) => ({
          id: item._id,
          ts: item.occurredAt,
          message: String(item.payload.message ?? item.payload.text ?? item.type),
        })),
      );
    }
    setDataTick((value) => value + 1);
  }, [setLeads, tcms]);

  const alerts = backendAlerts.length ? backendAlerts : localAlerts.map((a) => ({
    id: a.id,
    ts: new Date(a.ts).toISOString(),
    message: a.message,
  }));
  const money = useMemo(() => computeMoneyMap(rows), [rows]);
  const allBreaches = useMemo(() => computeSlaBreaches(rows), [rows]);
  const breaches = useMemo(() => allBreaches.slice(0, 8), [allBreaches]);
  const hot = useMemo(() => rows.filter((r) => !r.booked && r.probability >= 70).sort((a, b) => b.probability - a.probability).slice(0, 8), [rows]);

  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    void refreshData();
    const i = setInterval(() => void refreshData(), 90_000);
    return () => clearInterval(i);
  }, [refreshData]);

  return (
    <div className="fixed inset-0 bg-background text-foreground overflow-auto p-6 font-display">
      <style>{`@keyframes warFade{from{opacity:.45;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}@keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}`}</style>
      <header className="flex items-center justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-destructive font-bold">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <span>War-Room · Live · Admin TV</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight">Gharpayy Cockpit</h1>
        </div>
        <div className="text-right">
          <div className="text-3xl font-mono tabular-nums">{new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</div>
          <div className="text-[11px] text-muted-foreground">auto-refresh · last tick #{tick} · data #{dataTick}</div>
          <Link to="/admin" className="text-[11px] underline text-muted-foreground">exit</Link>
        </div>
      </header>

      <main key={dataTick} style={{ animation: "warFade 420ms ease-out" }}>
        <section className="grid grid-cols-5 gap-3 mb-4">
          <BigTile label="Booked 12mo" value={inrL(money.bookedRevenue)} tone="success" />
          <BigTile label="Weighted pipeline" value={inrL(money.pipelineRevenue)} tone="info" />
          <BigTile label="Hot >=70%" value={inrL(money.hotRevenue)} tone="accent" />
          <BigTile label="At risk" value={inrL(money.atRiskRevenue)} tone="warn" />
          <BigTile label="Walking 30d" value={inrL(money.walkingRevenue)} tone="danger" />
        </section>

        <section className="grid grid-cols-3 gap-3">
          <Wall title="Most likely to close">
            {hot.map((r, i) => (
              <Row key={r.lead.id} idx={i + 1} left={r.lead.name} mid={r.tcm?.name ?? "-"} right={`${r.probability}%`} />
            ))}
            {!hot.length && <Empty>No hot leads.</Empty>}
          </Wall>
          <Wall title="SLA breaches by value">
            {breaches.map((b, i) => (
              <Row key={b.leadId + b.type} idx={i + 1} left={b.leadName} mid={b.type} right={inrL(b.expectedValue)} tone="danger" />
            ))}
            {!breaches.length && <Empty>No breaches. Clean.</Empty>}
          </Wall>
          <Wall title="Live alerts">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-3 text-base py-1 border-b border-border/40">
                <span className="font-mono text-muted-foreground text-sm">{new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1">{a.message}</span>
              </li>
            ))}
            {!alerts.length && <Empty>Silent. All quiet.</Empty>}
          </Wall>
        </section>

        <section className="grid grid-cols-2 gap-3 mt-4">
          <Wall title="Today's Leaderboard">
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboard} layout="vertical" margin={{ left: 8, right: 16, top: 8, bottom: 8 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.35)" }} />
                  <Bar dataKey="toursCount" radius={[0, 6, 6, 0]}>
                    {leaderboard.map((entry) => (
                      <Cell key={entry.userId} fill={entry.toursCount >= 3 ? "hsl(var(--success))" : entry.toursCount >= 1 ? "hsl(var(--warning))" : "hsl(var(--destructive))"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!leaderboard.length && <Empty>No leaderboard data.</Empty>}
          </Wall>
          <Wall title="SLA Breach Ticker">
            <div className="overflow-hidden rounded-lg border border-border/60 bg-muted/20 py-3">
              <div
                className="flex w-max gap-6 whitespace-nowrap px-4 text-sm"
                style={{ animation: allBreaches.length > 4 ? "ticker 24s linear infinite" : undefined }}
              >
                {[...allBreaches, ...allBreaches].slice(0, Math.max(allBreaches.length * 2, allBreaches.length)).map((b, i) => (
                  <span key={`${b.leadId}-${b.type}-${i}`} className="inline-flex items-center gap-2">
                    <span className="font-semibold">{b.leadName}</span>
                    <span className="text-muted-foreground">· {b.type} ·</span>
                    <span className="font-mono text-destructive">{inrL(b.expectedValue)}</span>
                  </span>
                ))}
                {!allBreaches.length && <span className="text-muted-foreground">No active SLA breaches.</span>}
              </div>
            </div>
          </Wall>
        </section>
      </main>
    </div>
  );
}

function BigTile({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "accent" | "warn" | "danger" }) {
  const cls = { success: "text-success", info: "text-info", accent: "text-accent", warn: "text-warning", danger: "text-destructive" }[tone];
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-5">
      <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`text-5xl font-bold mt-2 tabular-nums ${cls}`}>{value}</div>
    </div>
  );
}

function Wall({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border-2 border-border bg-card p-4">
      <div className="text-lg font-semibold mb-2">{title}</div>
      <ul className="space-y-0">{children}</ul>
    </div>
  );
}

function Row({ idx, left, mid, right, tone }: { idx: number; left: string; mid: string; right: string; tone?: "danger" }) {
  return (
    <li className="flex items-center gap-3 py-1.5 border-b border-border/40 text-base">
      <span className="w-6 text-center font-mono text-muted-foreground">{idx}</span>
      <span className="flex-1 truncate font-medium">{left}</span>
      <span className="text-sm text-muted-foreground truncate w-24 text-right">{mid}</span>
      <span className={`font-mono tabular-nums w-20 text-right ${tone === "danger" ? "text-destructive" : "text-accent"}`}>{right}</span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="text-muted-foreground py-3 text-center">{children}</li>;
}