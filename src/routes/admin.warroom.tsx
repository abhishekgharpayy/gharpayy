import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LayoutDashboard, Tv } from "lucide-react";

import { useAdminRows } from "@/admin/lib/use-admin-rows";
import { computeMoneyMap, computeSlaBreaches } from "@/admin/lib/supreme-metrics";
import { useAuthUser } from "@/lib/auth-store";
import { api } from "@/lib/api/client";

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

// ---------------------------------------------------------------------------
// COLOR CONSTANTS — hardcoded so Tailwind arbitrary values always resolve
// ---------------------------------------------------------------------------
const C = {
  bg:          "#0F0F0D",
  surface:     "#1A1A17",
  border:      "#2A2A25",
  borderBr:    "#3A3A33",
  textPri:     "#F5F4F0",
  textSec:     "#8A8880",
  textTer:     "#55544F",
  accent:      "#F97316",
  accentDim:   "#7C3910",
  success:     "#22C55E",
  danger:      "#EF4444",
  warning:     "#F59E0B",
} as const;

function inrL(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

// ---------------------------------------------------------------------------
// HELPERS
// ---------------------------------------------------------------------------

function useClock() {
  const [time, setTime] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

function useCountUp(target: number, durationMs = 1200, delayMs = 0) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let start: number | null = null;
    let animId: number;
    let delayTimeout: NodeJS.Timeout;

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const progress = Math.min((timestamp - start) / durationMs, 1);
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress);
      setCount(target * ease);
      if (progress < 1) animId = requestAnimationFrame(step);
    };

    delayTimeout = setTimeout(() => {
      animId = requestAnimationFrame(step);
    }, delayMs);

    return () => {
      clearTimeout(delayTimeout);
      if (animId) cancelAnimationFrame(animId);
    };
  }, [target, durationMs, delayMs]);
  return count;
}

function formatCrore(n: number) {
  return formatMoney(n);
}

function formatMoney(n: number) {
  if (n === 0) return "₹0";
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  return `₹${Math.round(n).toLocaleString("en-IN")}`;
}

function eventFormatter(item: any) {
  let type = item.type || "";
  if (type.startsWith("evt.")) {
    type = type.slice(4).replace(/\./g, "_");
  }
  const p = item.payload || {};
  const tcm = p.tcmName || "TCM";
  const name = p.leadName || p.customerName || "Lead";

  if (type === "lead_created") return { cat: "lead", text: `New lead: ${name}`, bold: name };
  if (type === "lead_stage_changed") return { cat: "lead", text: `${tcm} moved ${name} to ${p.newStage || "new stage"}`, bold: name };
  if (type === "lead_assigned") return { cat: "lead", text: `${name} assigned to ${tcm}`, bold: name };
  if (type === "tour_scheduled") return { cat: "tour", text: `Tour set: ${name} @ ${p.propertyName || "Property"}`, bold: name };
  if (type === "tour_completed") return { cat: "tour", text: `Tour done: ${name} → ${p.outcome || "completed"}`, bold: name };
  if (type === "quotation_sent") return { cat: "quote", text: `Quote sent to ${name}: ${inrL(p.amount || 0)}`, bold: name };
  if (type === "quotation_accepted" || type === "deal_won") return { cat: "quote", text: `🎉 ${name} accepted quote!`, bold: name };
  if (type === "user_login") return { cat: "user", text: `${p.userName || "User"} came online`, bold: p.userName || "User" };
  if (type === "lead_dropped") return { cat: "lead", text: `${name} dropped by ${tcm}`, bold: name };

  return { cat: "user", text: `${name} ${type.replace(/_/g, " ")}`, bold: name };
}

// ---------------------------------------------------------------------------
// SUB-COMPONENTS
// ---------------------------------------------------------------------------

function ClockDisplay() {
  const time = useClock();
  return (
    <div className="text-2xl font-mono font-bold" style={{ color: C.textPri, letterSpacing: "0.05em" }}>
      {time.toLocaleTimeString("en-IN", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}
    </div>
  );
}

function AutoRefreshRing({ tick }: { tick: number }) {
  const [offset, setOffset] = useState(100);
  const duration = 30000;
  const lastTick = useRef(tick);

  useEffect(() => {
    let start: number | null = null;
    let animId: number;

    if (tick !== lastTick.current) {
      lastTick.current = tick;
      start = null;
    }

    const step = (timestamp: number) => {
      if (!start) start = timestamp;
      const elapsed = timestamp - start;
      const progress = Math.min(elapsed / duration, 1);
      setOffset(100 - progress * 100);
      if (progress < 1) animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [tick]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs" style={{ color: C.textTer }}>Auto-refresh: 30s</span>
      <svg className="w-5 h-5 transform -rotate-90" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r="16" fill="none" stroke={C.border} strokeWidth="4" />
        <circle
          cx="18" cy="18" r="16" fill="none"
          stroke={C.accent}
          strokeWidth="4"
          strokeDasharray="100 100"
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function KPICard({ label, sub, tone, countVal, formatFn, delay, chip }: {
  label: string; sub: string; tone: string; countVal: number;
  formatFn: (n: number) => string; delay: number; chip?: string;
}) {
  const currentVal = useCountUp(countVal, 1200, delay);
  const displayVal = formatFn(currentVal);

  const len = displayVal.length;
  let fontSize = "2.25rem";       // text-4xl
  if (len >= 7 && len <= 9) fontSize = "1.875rem"; // text-3xl
  if (len > 9) fontSize = "1.5rem";                // text-2xl

  const toneColor =
    tone === "accent"  ? C.accent :
    tone === "success" ? C.success :
    tone === "danger"  ? C.danger :
    tone === "warning" ? (countVal > 0 ? C.warning : C.textSec) :
    C.textPri;

  const isPulsing = tone === "danger" && countVal > 0;

  const chipBg =
    tone === "success" ? "#052e16" :
    tone === "danger"  ? "#450a0a" : "#1e293b";
  const chipFg =
    tone === "success" ? "#4ade80" :
    tone === "danger"  ? "#f87171" : "#94a3b8";

  return (
    <div
      className="rounded-xl px-5 py-4 flex-1 flex flex-col justify-between overflow-hidden relative"
      style={{ background: C.surface, border: `1px solid ${C.border}` }}
    >
      {/* Left accent border */}
      <div
        className={isPulsing ? "animate-pulse" : ""}
        style={{
          position: "absolute", left: 0, top: 0, bottom: 0, width: 2,
          backgroundColor: toneColor,
        }}
      />

      <div
        className="font-semibold uppercase"
        style={{ fontSize: 10, letterSpacing: "0.12em", color: C.textTer }}
      >
        {label}
      </div>
      <div
        className="font-mono font-bold mt-2 mb-1"
        style={{ fontSize, color: toneColor }}
      >
        {displayVal}
      </div>
      <div className="flex items-center justify-between" style={{ fontSize: 10, color: C.textTer }}>
        <span>{sub}</span>
        {chip && (
          <span
            className="font-mono px-1.5 py-0.5 rounded"
            style={{ background: chipBg, color: chipFg }}
          >
            {chip}
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MAIN COMPONENT
// ---------------------------------------------------------------------------

function WarRoomTV() {
  const rows = useAdminRows();
  const [backendAlerts, setBackendAlerts] = useState<any[]>([]);
  const [dataTick, setDataTick] = useState(0);
  const [isFetching, setIsFetching] = useState(false);
  const [error, setError] = useState(false);
  const [feedHeaderFlash, setFeedHeaderFlash] = useState(false);
  const [isTVMode, setIsTVMode] = useState(true);

  const lastProcessedActivityId = useRef<string | null>(null);

  const refreshData = useCallback(async () => {
    setIsFetching(true);
    try {
      const activityResult = await api.activity.all(50);
      const newItems = activityResult.items.slice(0, 50);

      if (newItems.length > 0) {
        const latestId = newItems[0]._id;

        if (latestId !== lastProcessedActivityId.current) {
          setBackendAlerts((prev) => {
            const merged = [
              ...newItems
                .filter((item: any) => item.type !== "evt.user.action")
                .map((item: any) => {
                  const fmt = eventFormatter(item);
                  return { id: item._id, ts: item.occurredAt, text: fmt.text, bold: fmt.bold, cat: fmt.cat };
                }),
              ...prev,
            ];
            const unique = Array.from(new Map(merged.map((item) => [item.id, item])).values());
            return unique.slice(0, 50);
          });

          if (lastProcessedActivityId.current !== null) {
            setFeedHeaderFlash(true);
            setTimeout(() => setFeedHeaderFlash(false), 600);
          }
          lastProcessedActivityId.current = latestId;
        }
      }
      setError(false);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setIsFetching(false);
      setDataTick((value) => value + 1);
    }
  }, []);

  useEffect(() => {
    void refreshData();
    const i = setInterval(() => void refreshData(), 30_000);
    return () => clearInterval(i);
  }, [refreshData]);

  // Deduplicate rows by lead ID to prevent duplicate values in metrics and CR
  const uniqueRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter(r => {
      if (!r || !r.lead) return false;
      const id = r.lead.id || r.lead._id;
      if (!id) return false;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  }, [rows]);

  // Derived metrics using uniqueRows
  const money = useMemo(() => computeMoneyMap(uniqueRows), [uniqueRows]);
  const allBreaches = useMemo(() => computeSlaBreaches(uniqueRows), [uniqueRows]);
  const hot = useMemo(() => uniqueRows.filter((r) => !r.booked && r.probability >= 70), [uniqueRows]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { name: string; zone: string; total: number; won: number; lost: number }>();
    uniqueRows.forEach((r) => {
      if (!r.tcm) return;
      if (!map.has(r.tcm.id))
        map.set(r.tcm.id, { name: r.tcm.name, zone: r.tcm.zones?.[0] || "Network", total: 0, won: 0, lost: 0 });
      const entry = map.get(r.tcm.id)!;
      entry.total++;
      if (r.booked) entry.won++;
      else if (r.status === "lost") entry.lost++;
    });
    return Array.from(map.values())
      .filter((x) => x.total > 0)
      .map((x) => {
        const closed = x.won + x.lost;
        const cvr = closed > 0 ? Math.round((x.won / closed) * 100) : 0;
        return { ...x, cvr };
      })
      .sort((a, b) => b.cvr - a.cvr);
  }, [uniqueRows]);

  const cvrColor = (cvr: number) => (cvr >= 70 ? C.success : cvr >= 40 ? C.accent : C.danger);

  const mapBreachType = (type: string) => {
    if (type === "first-response") return "No first contact";
    if (type === "post-tour") return "Post-tour stalled";
    if (type === "follow-up") return "Follow-up overdue";
    return type.replace(/-/g, " ");
  };

  const dotColorMap: Record<string, string> = {
    lead: C.accent,
    tour: C.success,
    quote: "#A78BFA",
    alert: C.danger,
    user: C.textSec,
  };

  return (
    <div
      className={isTVMode ? "fixed inset-0 z-50 overflow-hidden font-sans" : "w-full overflow-hidden font-sans rounded-xl p-1"}
      style={{ backgroundColor: C.bg, color: C.textPri }}
    >
      <style>{`
        /* Hide scrollbar for Chrome, Safari and Opera */
        .no-scrollbar::-webkit-scrollbar {
          display: none !important;
        }
        /* Hide scrollbar for IE, Edge and Firefox */
        .no-scrollbar {
          -ms-overflow-style: none !important;  /* IE and Edge */
          scrollbar-width: none !important;  /* Firefox */
        }
      `}</style>
      <LiveLeadsBridge />
      <LiveBookingsBridge />
      <LiveToursAppBridge />
      <LiveFollowUpsBridge />
      <LiveTcMsBridge />
      <LivePropertiesBridge />

      {/* Progress Bar */}
      <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden">
        <motion.div
          className="h-full"
          style={{ backgroundColor: C.accent }}
          initial={{ x: "-100%" }}
          animate={{ x: isFetching && dataTick > 0 ? "0%" : "-100%" }}
          transition={{ duration: isFetching ? 2 : 0.2, ease: "linear" }}
        />
      </div>

      <div
        className="grid gap-3 w-full max-w-full"
        style={{
          gridTemplateRows: "48px 140px 1fr",
          height: isTVMode ? "100vh" : "calc(100vh - 120px)",
          padding: isTVMode ? "16px" : "8px 0 0 0",
        }}
      >

        {/* ═══ ROW 1: TOPBAR ═══ */}
        <div className="flex items-center justify-between w-full h-full">
          <div className="flex items-center gap-3">
            {isTVMode ? (
              <button
                onClick={() => setIsTVMode(false)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer border border-[#3A3A33] hover:bg-[#2A2A25]"
                style={{ backgroundColor: C.surface, color: C.accent }}
                title="Show sidebar and topbar (Standard View)"
              >
                <LayoutDashboard className="w-3.5 h-3.5" />
                <span>Return to side view</span>
              </button>
            ) : (
              <button
                onClick={() => setIsTVMode(true)}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold transition-colors cursor-pointer border border-[#3A3A33] hover:bg-[#2A2A25]"
                style={{ backgroundColor: C.surface, color: C.accent }}
                title="Hide sidebar and enter full TV screen mode"
              >
                <Tv className="w-3.5 h-3.5" />
                <span>TV Mode</span>
              </button>
            )}
            <span style={{ color: C.borderBr }}>·</span>
            <span className="text-sm font-semibold uppercase" style={{ letterSpacing: "0.15em", color: C.accent }}>
              WAR ROOM
            </span>
            <span style={{ color: C.borderBr }}>·</span>
            <span className="text-sm font-mono" style={{ color: C.textSec }}>
              {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>

          <ClockDisplay />

          <div className="flex items-center gap-4">
            {error && (
              <div className="text-xs px-4 py-1.5 rounded-full flex items-center gap-2" style={{ background: "#450a0a", color: "#f87171" }}>
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-9.238m7.824 2.167a1 1 0 111.414 1.414m-1.414-1.414L3 3m8.293 8.293l1.414 1.414" />
                </svg>
                Connection lost — retrying...
              </div>
            )}



            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.success }} />
              <span className="text-xs font-bold tracking-widest" style={{ color: C.success }}>LIVE</span>
            </div>
            <span style={{ color: C.borderBr }}>·</span>
            <AutoRefreshRing tick={dataTick} />
          </div>
        </div>

        {/* ═══ ROW 2: KPI STRIP ═══ */}
        <div className="flex gap-3 w-full h-full">
          <KPICard label="WEIGHTED PIPELINE" tone="accent" countVal={money.pipelineRevenue} formatFn={formatMoney} sub="Total active pipeline" delay={0} />
          <KPICard label="HOT LEADS (≥70%)" tone="success" countVal={money.hotRevenue} formatFn={formatMoney} sub="High probability closes" chip={`${hot.length} leads`} delay={150} />
          <KPICard label="AT RISK" tone="danger" countVal={money.atRiskRevenue} formatFn={formatMoney} sub="SLA breached, needs action" chip={`${allBreaches.length} leads`} delay={300} />
          <KPICard label="WALKING 30D" tone="warning" countVal={money.walkingRevenue} formatFn={formatMoney} sub="Dormant 30 days" delay={450} />
        </div>

        {/* ═══ ROW 3: THREE PANELS ═══ */}
        <div className="grid h-full w-full gap-3 overflow-hidden" style={{ gridTemplateColumns: "1fr 1.4fr 1fr" }}>

          {/* ── LEFT: TCM LEADERBOARD ── */}
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <div className="font-semibold uppercase" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accent }}>
                TCM LEADERBOARD
              </div>
              <div className="font-semibold px-2 py-0.5 rounded" style={{ fontSize: 10, background: C.accentDim, color: C.accent }}>
                Today
              </div>
            </div>
            <div className="flex-1 overflow-hidden relative">
              <motion.div
                className="absolute w-full"
                animate={leaderboard.length > 8 ? { y: [0, -Math.max(0, (leaderboard.length - 8) * 60), 0] } : { y: 0 }}
                transition={leaderboard.length > 8 ? { duration: leaderboard.length * 2, repeat: Infinity, ease: "linear", repeatDelay: 1 } : {}}
              >
                {leaderboard.map((t, idx) => (
                  <div key={t.name} className="px-4 py-2.5 last:border-0" style={{ borderBottom: `1px solid ${C.border}` }}>
                    <div className="flex items-center gap-3">
                      <div className="w-5 text-right flex-shrink-0 flex justify-end font-mono" style={{ fontSize: 11, color: C.textTer }}>
                        {idx === 0 ? <div className="w-2 h-2 rounded-full" style={{ background: "#facc15" }} /> :
                         idx === 1 ? <div className="w-2 h-2 rounded-full" style={{ background: "#d1d5db" }} /> :
                         idx === 2 ? <div className="w-2 h-2 rounded-full" style={{ background: "#b45309" }} /> :
                         String(idx + 1).padStart(2, "0")}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold truncate max-w-[80px]" style={{ color: C.textPri }}>{t.name}</div>
                          <div className="font-mono text-xs" style={{ color: C.textSec }}>{t.total} leads</div>
                        </div>
                        <div className="truncate" style={{ fontSize: 10, color: C.textTer }}>{t.zone}</div>
                      </div>
                      <div className="font-mono font-bold text-right" style={{ color: cvrColor(t.cvr) }}>
                        {t.cvr}%
                      </div>
                    </div>
                    <div className="ml-8 mt-1.5 h-0.5 rounded-full overflow-hidden" style={{ background: C.border }}>
                      <div className="h-full rounded-full" style={{ width: `${t.cvr}%`, background: cvrColor(t.cvr) }} />
                    </div>
                  </div>
                ))}
                {!leaderboard.length && (
                  <div className="flex items-center justify-center h-32 font-mono uppercase tracking-widest" style={{ fontSize: 10, color: C.textTer }}>
                    AWAITING DATA
                  </div>
                )}
              </motion.div>
            </div>
          </div>

          {/* ── CENTER: SLA BREACHES ── */}
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <div className="px-4 py-3" style={{ borderBottom: `1px solid ${C.border}`, background: C.surface }}>
              <div className="flex items-center justify-between">
                <div className="font-semibold uppercase" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.danger }}>
                  SLA BREACHES
                </div>
                <div className="font-mono text-xs font-bold px-2 py-0.5 rounded" style={{ background: "#450a0a", color: C.danger }}>
                  {allBreaches.length}
                </div>
              </div>
              <div className="mt-0.5" style={{ fontSize: 10, color: C.textTer }}>High value leads without first response</div>
            </div>

            <div className="flex-1 overflow-auto no-scrollbar">
              {allBreaches.slice(0, 15).map((b, idx) => (
                <div
                  key={`${b.leadId}-${b.type}`}
                  className="px-4 py-3 flex items-center gap-3 transition-colors"
                  style={{
                    borderBottom: `1px solid ${C.border}`,
                    background: idx % 2 === 1 ? C.bg : "transparent",
                  }}
                >
                  <div className="w-6 flex-shrink-0 font-mono" style={{ fontSize: 11, color: C.textTer }}>
                    {String(idx + 1).padStart(2, "0")}
                  </div>
                  <div className="text-sm font-semibold truncate w-32 flex-shrink-0" style={{ color: C.textPri }} title={b.leadName}>
                    {b.leadName.length > 14 ? b.leadName.substring(0, 14) + "…" : b.leadName}
                  </div>
                  <div className="flex-shrink-0">
                    <span className="px-2 py-0.5 rounded font-medium whitespace-nowrap" style={{ fontSize: 10, background: "#450a0a", color: "#f87171" }}>
                      {mapBreachType(b.type)}
                    </span>
                  </div>
                  <div className="font-mono text-xs flex-1 whitespace-nowrap" style={{ color: C.warning }}>
                    {b.ageHrs > 0 ? `${Math.floor(b.ageHrs)}h ${Math.round((b.ageHrs % 1) * 60)}m ago` : "Just now"}
                  </div>
                  <div
                    className="font-mono font-bold text-right flex-shrink-0"
                    style={{
                      color: b.expectedValue >= 10_000_000 ? C.danger : b.expectedValue >= 1_000_000 ? C.warning : C.textSec,
                    }}
                  >
                    {formatMoney(b.expectedValue)}
                  </div>
                </div>
              ))}
              {!allBreaches.length && (
                <div className="flex items-center justify-center h-full font-mono uppercase tracking-widest" style={{ fontSize: 10, color: C.textTer }}>
                  ALL SYSTEMS NOMINAL
                </div>
              )}
            </div>

            <div className="px-4 py-2 text-xs font-mono mt-auto" style={{ background: "rgba(69,10,10,0.4)", color: C.danger, borderTop: `1px solid ${C.border}` }}>
              {formatMoney(money.atRiskRevenue)} total at risk across {allBreaches.length} leads
            </div>
          </div>

          {/* ── RIGHT: LIVE FEED ── */}
          <div className="rounded-xl overflow-hidden flex flex-col" style={{ background: C.surface, border: `1px solid ${C.border}` }}>
            <motion.div
              className="px-4 py-3 flex items-center justify-between"
              style={{ background: C.surface }}
              animate={feedHeaderFlash
                ? { borderBottomColor: [C.border, C.accent, C.border] }
                : { borderBottomColor: C.border }
              }
              transition={{ duration: 0.6 }}
            >
              <div className="font-semibold uppercase" style={{ fontSize: 11, letterSpacing: "0.1em", color: C.accent }}>
                LIVE FEED
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: C.success }} />
                <span className="font-bold" style={{ fontSize: 10, color: C.success }}>LIVE</span>
              </div>
            </motion.div>

            <div className="flex-1 overflow-auto no-scrollbar pt-2">
              <AnimatePresence initial={false}>
                {backendAlerts.map((a) => (
                  <motion.div
                    key={a.id}
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="px-4 py-2.5 last:border-0 flex items-start gap-3"
                    style={{ borderBottom: `1px solid ${C.borderBr}` }}
                  >
                    <div className="font-mono w-14 flex-shrink-0 pt-0.5" style={{ fontSize: 10, color: C.textTer }}>
                      {new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }).toLowerCase()}
                    </div>
                    <div className="flex-shrink-0 pt-1.5">
                      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: dotColorMap[a.cat] || C.textSec }} />
                    </div>
                    <div className="text-sm leading-snug" style={{ color: C.textPri }}>
                      {a.text}
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {!backendAlerts.length && (
                <div className="flex items-center justify-center h-full font-mono uppercase tracking-widest" style={{ fontSize: 10, color: C.textTer }}>
                  AWAITING EVENTS
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
