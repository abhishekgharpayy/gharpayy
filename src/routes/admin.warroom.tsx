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

import { LiveLeadsBridge } from "@/components/LiveLeadsBridge";
import { LiveBookingsBridge } from "@/components/LiveBookingsBridge";
import { LiveToursAppBridge } from "@/components/LiveToursAppBridge";
import { LiveFollowUpsBridge } from "@/components/LiveFollowUpsBridge";
import { LiveTcMsBridge } from "@/components/LiveTcMsBridge";
import { LivePropertiesBridge } from "@/components/LivePropertiesBridge";

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
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
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
  const [bigWin, setBigWin] = useState<{ leadName: string, amount: number, tcmName: string } | null>(null);
  const [pingPulse, setPingPulse] = useState(false);

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
      const newItems = activityResult.value.items.slice(0, 8);
      setBackendAlerts(
        newItems.map((item) => ({
          id: item._id,
          ts: item.occurredAt,
          message: String(item.payload.message ?? item.payload.text ?? item.type),
        })),
      );
      if (newItems.length > 0) {
        setPingPulse(true);
        setTimeout(() => setPingPulse(false), 2000);
        
        // Check for real booking activities instead of faking it
        const newBookings = newItems.filter(item => item.type === "deal_won" || item.type === "booking_created");
        if (newBookings.length > 0) {
            const latest = newBookings[0];
            setBigWin({ 
              leadName: String(latest.payload.leadName || "Client"), 
              amount: Number(latest.payload.amount || 0), 
              tcmName: String(latest.payload.tcmName || "TCM") 
            });
            setTimeout(() => setBigWin(null), 8000);
        }
      }
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
    <div className="fixed inset-0 bg-slate-950 text-slate-50 overflow-auto p-6 font-display">
      <LiveLeadsBridge />
      <LiveBookingsBridge />
      <LiveToursAppBridge />
      <LiveFollowUpsBridge />
      <LiveTcMsBridge />
      <LivePropertiesBridge />
    <div className="space-y-4 bg-slate-950 p-4 rounded-xl text-slate-50 font-mono relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-900/20 via-slate-950/80 to-slate-950 pointer-events-none" />
      
      <div className="absolute top-6 right-6 flex items-center gap-3 z-20">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 font-bold">
          Live System Radar
        </div>
        <div className="relative flex h-3 w-3">
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 ${pingPulse ? 'animate-ping' : ''}`} />
          <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
        </div>
      </div>

      <div className="relative z-10 flex flex-col h-full gap-6">
        <style>{`
          @keyframes warFade{from{opacity:.45;transform:translateY(4px)}to{opacity:1;transform:translateY(0)}}
          @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
          .neon-border { box-shadow: 0 0 10px rgba(59, 130, 246, 0.2), inset 0 0 10px rgba(59, 130, 246, 0.1); }
          .neon-border-success { box-shadow: 0 0 15px rgba(16, 185, 129, 0.2), inset 0 0 10px rgba(16, 185, 129, 0.1); }
          .neon-border-danger { box-shadow: 0 0 15px rgba(239, 68, 68, 0.2), inset 0 0 10px rgba(239, 68, 68, 0.1); }
          .neon-border-warn { box-shadow: 0 0 15px rgba(245, 158, 11, 0.2), inset 0 0 10px rgba(245, 158, 11, 0.1); }
          .neon-text-glow { text-shadow: 0 0 10px currentColor; }
        `}</style>
        
        <div className="text-[11px] text-blue-500/60 font-mono mt-1">SYS_TICK #{tick} // DATA_SYNC #{dataTick}</div>

        <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <BigTile label="BOOKED 12M" value={inrL(money.bookedRevenue)} tone="success" />
          <BigTile label="WEIGHTED PIPELINE" value={inrL(money.pipelineRevenue)} tone="info" />
          <BigTile label="HOT >=70%" value={inrL(money.hotRevenue)} tone="accent" />
          <BigTile label="AT RISK" value={inrL(money.atRiskRevenue)} tone="warn" />
          <BigTile label="WALKING 30D" value={inrL(money.walkingRevenue)} tone="danger" />
        </section>

        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Wall title="MOST LIKELY TO CLOSE" icon="🎯">
            {hot.map((r, i) => (
              <Row key={r.lead.id} idx={i + 1} left={r.lead.name} mid={r.tcm?.name ?? "-"} right={`${r.probability}%`} />
            ))}
            {!hot.length && <Empty>NO HOT LEADS DETECTED</Empty>}
          </Wall>
          
          <Wall title="SLA BREACHES (HIGH VALUE)" icon="⚠️" borderTone="danger">
            {breaches.map((b, i) => (
              <Row key={b.leadId + b.type} idx={i + 1} left={b.leadName} mid={b.type.replace(/_/g, " ")} right={inrL(b.expectedValue)} tone="danger" />
            ))}
            {!breaches.length && <Empty>ALL SYSTEMS NOMINAL. NO BREACHES.</Empty>}
          </Wall>
          
          <Wall title="LIVE ACTIVITY FEED" icon="📡">
            {alerts.map((a) => (
              <li key={a.id} className="flex gap-4 text-sm py-2.5 border-b border-blue-900/30">
                <span className="font-mono text-blue-400/70">{new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                <span className="flex-1 text-blue-100/90 capitalize">{a.message.replace(/_/g, " ")}</span>
              </li>
            ))}
            {!alerts.length && <Empty>COMM CHANNELS SILENT.</Empty>}
          </Wall>
        </section>

        <section className="grid grid-cols-1 gap-6">
          <Wall title="GLOBAL TCM LEADERBOARD" icon="🏆" borderTone="accent">
            <div className="h-64 mt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaderboard} layout="vertical" margin={{ left: 8, right: 30, top: 0, bottom: 0 }}>
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fill: "#94a3b8", fontSize: 13, fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(59, 130, 246, 0.1)" }} contentStyle={{ backgroundColor: "#020617", border: "1px solid #1e3a8a", borderRadius: "8px" }} />
                  <Bar dataKey="toursCount" radius={[0, 4, 4, 0]} isAnimationActive={true} animationDuration={1000} barSize={24}>
                    {leaderboard.map((entry) => (
                      <Cell key={entry.userId} fill={entry.toursCount >= 3 ? "#10b981" : entry.toursCount >= 1 ? "#f59e0b" : "#ef4444"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            {!leaderboard.length && <Empty>AWAITING LEADERBOARD DATA.</Empty>}
          </Wall>

          <div className="overflow-hidden rounded-xl border border-red-500/30 bg-red-950/20 py-3 relative neon-border-danger">
            <div className="absolute left-0 top-0 bottom-0 w-24 bg-gradient-to-r from-slate-950 to-transparent z-10 flex items-center px-4 font-black tracking-widest text-red-500 text-xs">
              BREACHES
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-slate-950 to-transparent z-10" />
            <div
              className="flex w-max gap-8 whitespace-nowrap px-24 text-sm font-mono"
              style={{ animation: allBreaches.length > 0 ? "ticker 20s linear infinite" : undefined }}
            >
              {[...allBreaches, ...allBreaches].slice(0, Math.max(allBreaches.length * 2, 1)).map((b, i) => (
                <span key={`${b.leadId}-${b.type}-${i}`} className="inline-flex items-center gap-3">
                  <span className="font-bold text-red-400">{b.leadName}</span>
                  <span className="text-red-500/50">///</span>
                  <span className="text-red-300 uppercase">{b.type.replace(/_/g, " ")}</span>
                  <span className="text-red-500/50">///</span>
                  <span className="font-black text-red-500">{inrL(b.expectedValue)}</span>
                </span>
              ))}
              {!allBreaches.length && <span className="text-green-500 tracking-widest px-8">NO ACTIVE SLA BREACHES DETECTED ACROSS THE NETWORK.</span>}
            </div>
          </div>
        </section>
      </div>

      {bigWin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/95 backdrop-blur-xl animate-in fade-in duration-500">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-green-900/40 via-slate-950/90 to-slate-950/100 pointer-events-none" />
          <div className="relative text-center space-y-6 animate-in slide-in-from-bottom-10 zoom-in-95 duration-700">
            <div className="text-[180px] leading-none mb-4 animate-bounce drop-shadow-[0_0_50px_rgba(16,185,129,0.8)]">🚀</div>
            <h2 className="text-7xl font-display font-black text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-green-500 tracking-tight neon-text-glow">
              MISSION ACCOMPLISHED
            </h2>
            <div className="text-5xl font-mono text-green-400 font-bold drop-shadow-[0_0_20px_rgba(74,222,128,0.5)] mt-4">
              {inrL(bigWin.amount)} <span className="text-2xl text-green-600/80 tracking-widest uppercase ml-2">Revenue Secured</span>
            </div>
            <div className="text-3xl font-medium mt-8 text-slate-300">
              Agent <span className="text-blue-400 font-bold px-2">{bigWin.tcmName.toUpperCase()}</span> closed <span className="font-black text-white px-2 border-b-2 border-green-500">{bigWin.leadName.toUpperCase()}</span>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  );
}

function BigTile({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "accent" | "warn" | "danger" }) {
  const tones = {
    success: { text: "text-emerald-400", border: "neon-border-success", bg: "bg-emerald-950/20 border-emerald-500/30" },
    info: { text: "text-blue-400", border: "neon-border", bg: "bg-blue-950/20 border-blue-500/30" },
    accent: { text: "text-purple-400", border: "shadow-[0_0_15px_rgba(168,85,247,0.2)]", bg: "bg-purple-950/20 border-purple-500/30" },
    warn: { text: "text-amber-400", border: "neon-border-warn", bg: "bg-amber-950/20 border-amber-500/30" },
    danger: { text: "text-red-500", border: "neon-border-danger", bg: "bg-red-950/20 border-red-500/30" },
  };
  const t = tones[tone];
  
  return (
    <div className={`rounded-xl border ${t.bg} ${t.border} p-5 relative overflow-hidden transition-all duration-300 hover:scale-[1.02]`}>
      <div className="absolute top-0 right-0 w-16 h-16 bg-white/5 blur-2xl rounded-full transform translate-x-8 -translate-y-8" />
      <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`text-4xl md:text-5xl font-black mt-3 font-mono tabular-nums tracking-tighter ${t.text} drop-shadow-[0_0_8px_currentColor]`}>{value}</div>
    </div>
  );
}

function Wall({ title, children, icon, borderTone = "info" }: { title: string; children: React.ReactNode; icon?: string; borderTone?: "info" | "danger" | "accent" }) {
  const borders = {
    info: "border-blue-800/40 shadow-[0_0_15px_rgba(30,58,138,0.3)]",
    danger: "border-red-800/40 shadow-[0_0_15px_rgba(153,27,27,0.3)]",
    accent: "border-purple-800/40 shadow-[0_0_15px_rgba(107,33,168,0.3)]",
  };
  
  return (
    <div className={`rounded-xl border bg-slate-900/50 backdrop-blur-sm p-5 flex flex-col h-full ${borders[borderTone]}`}>
      <div className="flex items-center gap-3 mb-4 border-b border-white/5 pb-3">
        {icon && <span className="text-xl opacity-80">{icon}</span>}
        <div className="text-sm font-bold tracking-[0.15em] uppercase text-slate-300">{title}</div>
      </div>
      <ul className="space-y-1 flex-1">{children}</ul>
    </div>
  );
}

function Row({ idx, left, mid, right, tone }: { idx: number; left: string; mid: string; right: string; tone?: "danger" }) {
  return (
    <li className="flex items-center gap-4 py-2 border-b border-white/5 text-sm transition-colors hover:bg-white/5 rounded-md px-2 -mx-2">
      <span className="w-5 text-center font-mono text-slate-500 text-xs">{String(idx).padStart(2, '0')}</span>
      <span className="flex-1 truncate font-semibold text-slate-200">{left}</span>
      <span className="text-xs text-slate-400 truncate w-24 text-right uppercase tracking-wider">{mid}</span>
      <span className={`font-mono font-bold tabular-nums w-24 text-right tracking-tight ${tone === "danger" ? "text-red-400" : "text-emerald-400"}`}>{right}</span>
    </li>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <li className="text-slate-500 py-6 text-center font-mono text-xs uppercase tracking-widest">{children}</li>;
}