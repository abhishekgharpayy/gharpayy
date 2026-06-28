import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useLiveSupremeMetrics, useAddCoachingNote } from "@/admin/lib/use-live-supreme";
import {
  computeMoneyMap, computeTcmHealth, computeAreaPulse,
  computeSourceROI, collectVoiceOfCustomer, computeSlaBreaches,
} from "@/admin/lib/supreme-metrics";
import { cn } from "@/lib/utils";
import { useAuthUser } from "@/lib/auth-store";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import type { AdminLeadRow } from "@/admin/lib/selectors";

export const Route = createFileRoute("/admin/supreme")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  head: () => ({ meta: [{ title: "Admin Supreme \u2014 God Mode" }] }),
  component: SupremePage,
});

function inrL(n: number) {
  if (isNaN(n) || n == null) return "₹0";
  if (n >= 10_000_000) return `\u20B9${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `\u20B9${(n / 100_000).toFixed(1)}L`;
  return `\u20B9${Math.round(n).toLocaleString("en-IN")}`;
}
function pct(n: number) { return isNaN(n) ? "0%" : `${Math.round(n * 100)}%`; }

type DrawerState =
  | { kind: "lead"; row: AdminLeadRow }
  | { kind: "tcm"; tcmId: string; name: string }
  | null;

function SupremePage() {
  const { rows, isLoading, isError } = useLiveSupremeMetrics();
  const [drawer, setDrawer] = useState<DrawerState>(null);

  const { data: watchdogData, isLoading: loadingWatchdog } = useQuery({
    queryKey: ["watchdog_feed"],
    queryFn: () => api.watchdog(),
    refetchInterval: 60000 // Refetch every minute
  });
  const anomalies = watchdogData?.anomalies || [];

  const money = useMemo(() => computeMoneyMap(rows || []), [rows]);
  const tcms = useMemo(() => computeTcmHealth(rows || []), [rows]);
  const areas = useMemo(() => computeAreaPulse(rows || []), [rows]).slice(0, 8);
  const sources = useMemo(() => computeSourceROI(rows || []), [rows]).slice(0, 6);
  const voices = useMemo(() => collectVoiceOfCustomer(rows || [], 10), [rows]);
  const breaches = useMemo(() => computeSlaBreaches(rows || []), [rows]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="p-8 text-center text-muted-foreground animate-pulse">Gathering intelligence...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div className="p-8 text-center text-destructive">Failed to fetch metrics. Please check your connection.</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Admin Supreme · God Mode</h1>
          <p className="text-xs text-muted-foreground">Every rupee, every person, every breach — one screen.</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => window.print()}>Export Briefing</Button>
      </div>
      <section className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Tile label="Projected EOM" value={inrL(money.projectedEomRevenue)} tone="success" />
        <Tile label="Booked (12mo)" value={inrL(money.bookedRevenue)} tone="success" />
        <Tile label="Pipeline" value={inrL(money.pipelineRevenue)} tone="info" />
        <Tile label="Hot \u226570%" value={inrL(money.hotRevenue)} tone="accent" />
        <Tile label="At-risk (\u22653d)" value={inrL(money.atRiskRevenue)} tone="warn" />
        <Tile label="Lost (30d)" value={inrL(money.walkingRevenue)} tone="danger" />
      </section>

      {/* AI Anomaly Watchdog Feed */}
      <Panel title="AI Anomaly Watchdog \u00B7 System Guardian" sub="Real-time operational anomaly detection" className="mt-3 border-accent/40 bg-accent/5">
        {loadingWatchdog ? (
          <div className="text-muted-foreground text-xs p-4 animate-pulse">Running system diagnostics...</div>
        ) : anomalies.length === 0 ? (
          <div className="text-success text-xs p-4 flex items-center gap-2">
            <div className="h-2 w-2 bg-success rounded-full animate-pulse" /> All systems nominal. No anomalies detected.
          </div>
        ) : (
          <div className="space-y-2 max-h-[250px] overflow-auto">
            {anomalies.map((a: any, i: number) => (
              <div key={i} className="flex items-start gap-3 p-2 rounded-md bg-background border border-border/50">
                <div className={cn(
                  "mt-0.5 w-2 h-2 rounded-full shrink-0",
                  a.severity === "high" ? "bg-destructive animate-pulse" : a.severity === "medium" ? "bg-warning" : "bg-info"
                )} />
                <div>
                  <div className="text-[11px] font-semibold flex items-center gap-2">
                    <span className="uppercase text-muted-foreground">{a.type.replace("_", " ")}</span>
                    <span className="text-[9px] text-muted-foreground">{new Date(a.timestamp).toLocaleString("en-IN", { hour: "numeric", minute: "numeric", hour12: true })}</span>
                  </div>
                  <div className="text-xs mt-0.5 text-foreground leading-relaxed">{a.message}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <div className="grid lg:grid-cols-3 gap-3 mt-3">
        <Panel title="SLA breach board" sub="Most expensive overdue work first" className="lg:col-span-2">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
                <tr><th className="text-left py-1.5">Lead</th><th className="text-left">TCM</th><th className="text-left">Breach</th><th className="text-right">Age</th><th className="text-right">Prob</th><th className="text-right">EV</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {breaches.map((b) => (
                  <tr key={b.leadId + b.type} className="border-b border-border/60 hover:bg-muted/40 cursor-pointer" onClick={() => {
                    const r = rows.find(x => x.lead.id === b.leadId);
                    if (r) setDrawer({ kind: "lead", row: r });
                  }}>
                    <td className="py-1.5 font-medium hover:underline text-accent">{b.leadName}</td>
                    <td className="text-muted-foreground">{b.tcm}</td>
                    <td><span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive text-[10px]">{b.type}</span></td>
                    <td className="text-right font-mono">{Math.round(b.ageHrs)}h</td>
                    <td className="text-right font-mono">{b.probability}%</td>
                    <td className="text-right font-mono text-accent">{inrL(b.expectedValue)}</td>
                    <td className="text-right py-1">
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 mr-1" onClick={(e) => { e.stopPropagation(); alert(`Re-assigned ${b.leadName}`); }}>Re-assign</Button>
                      <Button size="sm" variant="destructive" className="h-6 text-[10px] px-2" onClick={(e) => { e.stopPropagation(); alert(`Forced SLA resolve for ${b.leadName}`); }}>Resolve</Button>
                    </td>
                  </tr>
                ))}
                {!breaches.length && <tr><td colSpan={6} className="text-center text-muted-foreground py-4">No breaches. Clean slate.</td></tr>}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel title="Voice of customer" sub="Raw objections & lost-reasons, latest first">
          <ul className="space-y-2 text-xs max-h-[420px] overflow-auto pr-1">
            {voices.map((v, i) => (
              <li key={i} className="border-l-2 border-destructive/60 pl-2 cursor-pointer hover:bg-muted/30 p-1" onClick={() => {
                const r = rows.find(x => x.lead.id === v.leadId);
                if (r) setDrawer({ kind: "lead", row: r });
              }}>
                <div className="text-foreground">"{v.text}"</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">\u2014 {v.leadName} \u00B7 {new Date(v.ts).toLocaleDateString("en-IN")}</div>
              </li>
            ))}
            {!voices.length && <li className="text-muted-foreground">No captured voice yet.</li>}
          </ul>
        </Panel>
      </div>

      <Panel title="People health \u00B7 load & burn" sub="Watch and burn flags drive coaching priority" className="mt-3">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {tcms.map((t) => (
            <div key={t.tcmId} className={cn(
              "rounded-lg border p-2.5 bg-card cursor-pointer hover:border-accent transition-colors",
              t.riskFlag === "burn" && "border-destructive/60",
              t.riskFlag === "watch" && "border-warning/60",
              t.riskFlag === "ok" && "border-border",
            )} onClick={() => setDrawer({ kind: "tcm", tcmId: t.tcmId, name: t.name })}>
              <div className="flex items-center justify-between">
                <div className="font-medium text-sm">{t.name}</div>
                <span className={cn(
                  "text-[10px] uppercase px-1.5 py-0.5 rounded",
                  t.riskFlag === "burn" && "bg-destructive/20 text-destructive",
                  t.riskFlag === "watch" && "bg-warning/20 text-warning",
                  t.riskFlag === "ok" && "bg-success/20 text-success",
                )}>{t.riskFlag}</span>
              </div>
              <div className="grid grid-cols-3 gap-1 mt-2 text-[11px]">
                <Stat k="Open" v={t.open} />
                <Stat k="Hot" v={t.hot} accent />
                <Stat k="Dormant" v={t.dormant} />
                <Stat k="Booked" v={t.booked} />
                <Stat k="Lost" v={t.lost} />
                <Stat k="CVR" v={pct(t.conversion)} />
              </div>
              <div className="mt-2 text-[10px] text-muted-foreground flex justify-between">
                <span>Pipeline {inrL(t.pipelineValue)}</span>
                <span>Age {t.avgAgeDays}d</span>
              </div>
              <div className="mt-1 h-1 rounded bg-muted overflow-hidden">
                <div className={cn(
                  "h-full",
                  t.loadScore > 80 ? "bg-destructive" : t.loadScore > 55 ? "bg-warning" : "bg-success",
                )} style={{ width: `${t.loadScore}%` }} />
              </div>
            </div>
          ))}
          {!tcms.length && <div className="text-muted-foreground text-xs">No TCM data.</div>}
        </div>
      </Panel>

      <div className="grid md:grid-cols-2 gap-3 mt-3">
        <Panel title="Area pulse" sub="Demand vs lost-rate by preferred area">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
              <tr><th className="text-left py-1.5">Area</th><th className="text-right">Leads</th><th className="text-right">Hot</th><th className="text-right">Booked</th><th className="text-right">Lost %</th><th className="text-right">Revenue</th><th className="text-left pl-2">Top objection</th></tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.area} className="border-b border-border/60">
                  <td className="py-1.5 font-medium">{a.area}</td>
                  <td className="text-right font-mono">{a.leads}</td>
                  <td className="text-right font-mono text-accent">{a.hot}</td>
                  <td className="text-right font-mono text-success">{a.booked}</td>
                  <td className={cn("text-right font-mono", a.lostRate > 0.4 && "text-destructive")}>{pct(a.lostRate)}</td>
                  <td className="text-right font-mono">{inrL(a.revenue)}</td>
                  <td className="pl-2 text-muted-foreground">{a.topObjection}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Source ROI" sub="Which channel actually books beds">
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-muted-foreground border-b border-border">
              <tr><th className="text-left py-1.5">Source</th><th className="text-right">Leads</th><th className="text-right">Booked</th><th className="text-right">CVR</th><th className="text-right">Avg \u20B9</th><th className="text-right">Revenue</th></tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s.source} className="border-b border-border/60">
                  <td className="py-1.5 font-medium capitalize">{s.source}</td>
                  <td className="text-right font-mono">{s.leads}</td>
                  <td className="text-right font-mono text-success">{s.booked}</td>
                  <td className="text-right font-mono">{pct(s.cvr)}</td>
                  <td className="text-right font-mono">{inrL(s.avgBudget)}</td>
                  <td className="text-right font-mono text-accent">{inrL(s.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      </div>

      {drawer?.kind === "lead" && <LeadDrawer row={drawer.row} onClose={() => setDrawer(null)} />}
      {drawer?.kind === "tcm" && <TcmDrawer tcmId={drawer.tcmId} name={drawer.name} rows={rows} onClose={() => setDrawer(null)} />}
    </div>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone: "success" | "info" | "accent" | "warn" | "danger" }) {
  const cls = {
    success: "text-success", info: "text-info", accent: "text-accent",
    warn: "text-warning", danger: "text-destructive",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={cn("text-xl font-display font-semibold", cls)}>{value}</div>
    </div>
  );
}

function Panel({ title, sub, children, className }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", className)}>
      <div className="mb-2">
        <div className="text-xs font-semibold">{title}</div>
        {sub && <div className="text-[10px] text-muted-foreground">{sub}</div>}
      </div>
      {children}
    </div>
  );
}

function Stat({ k, v, accent }: { k: string; v: string | number; accent?: boolean }) {
  return (
    <div>
      <div className="text-[9px] uppercase text-muted-foreground">{k}</div>
      <div className={cn("font-mono text-sm", accent && "text-accent")}>{v}</div>
    </div>
  );
}

function LeadDrawer({ row, onClose }: { row: AdminLeadRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-background border-l border-border overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-display font-semibold">{row.lead.name}</div>
            <div className="text-[11px] text-muted-foreground font-mono">{row.lead.phone}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat k="Stage" v={row.lead.stage} />
          <Stat k="Probability" v={`${row.probability}%`} accent />
          <Stat k="Status" v={row.status} />
          <Stat k="Expected ₹" v={inrL(row.expectedValue)} />
          <Stat k="TCM" v={row.tcm?.name ?? "—"} />
          <Stat k="Area" v={row.lead.preferredArea} />
          <Stat k="Tours / Visits" v={`${row.tours.length} / ${row.visits.length}`} />
          <Stat k="Budget" v={inrL(row.lead.budget)} />
        </div>

        <div className="rounded-md border border-border p-2 bg-muted/30 text-xs">
          <div className="text-[10px] uppercase text-muted-foreground">Why open</div>
          <div>{row.whyNotClosed}</div>
        </div>
      </div>
    </div>
  );
}

function TcmDrawer({ tcmId, name, rows, onClose }: { tcmId: string; name: string; rows: AdminLeadRow[]; onClose: () => void }) {
  const activeLeads = rows.filter(r => r.lead.assignedTcmId === tcmId && (r.status === "open" || r.status === "dormant"));
  const addNote = useAddCoachingNote();
  const [noteContent, setNoteContent] = useState("");
  const [selectedLeadId, setSelectedLeadId] = useState(activeLeads[0]?.lead.id || "");
  const [mandatoryFu, setMandatoryFu] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent || !selectedLeadId) return;
    const finalNote = mandatoryFu ? `[MANDATORY 2H SLA] ${noteContent}` : noteContent;
    await addNote.mutateAsync({ leadId: selectedLeadId, tcmId, note: finalNote });
    setNoteContent("");
    setMandatoryFu(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-background border-l border-border overflow-auto p-4 flex flex-col space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <div className="text-lg font-display font-semibold">{name}</div>
            <div className="text-xs text-muted-foreground">{activeLeads.length} active leads</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3 border border-border rounded-xl p-3 bg-muted/10">
          <div className="text-sm font-semibold">Write Coaching Note</div>
          <select 
            className="w-full text-xs rounded border border-border bg-background p-1.5"
            value={selectedLeadId}
            onChange={(e) => setSelectedLeadId(e.target.value)}
            required
          >
            <option value="" disabled>Select related lead...</option>
            {activeLeads.map(r => (
              <option key={r.lead.id} value={r.lead.id}>{r.lead.name} ({r.lead.stage})</option>
            ))}
          </select>
          <textarea
            className="w-full text-xs rounded border border-border bg-background p-2 min-h-[80px]"
            placeholder="Type your coaching instructions here..."
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            required
          />
          <div className="flex items-center gap-2 mt-1 mb-2">
            <input type="checkbox" id="mandatory-fu" checked={mandatoryFu} onChange={(e) => setMandatoryFu(e.target.checked)} />
            <label htmlFor="mandatory-fu" className="text-[11px] text-destructive font-medium cursor-pointer">Require follow-up within 2 hours (Enforced)</label>
          </div>
          <Button type="submit" disabled={addNote.isPending || !selectedLeadId || !noteContent} className="w-full h-8 text-xs">
            {addNote.isPending ? "Saving..." : "Add Coaching Note"}
          </Button>
        </form>

        <div className="flex-1 overflow-auto">
          <div className="text-xs font-semibold mb-2">Recent Notes</div>
          <div className="space-y-2">
            {activeLeads.flatMap(r => r.coachNotes).sort((a,b) => +new Date(b.ts) - +new Date(a.ts)).map((cn) => {
              const leadName = activeLeads.find(r => r.lead.id === cn.leadId)?.lead.name || "Unknown Lead";
              return (
                <div key={cn.id} className="text-xs border-l-2 border-accent pl-2 py-1">
                  <div className="text-foreground">{cn.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-1">Lead: {leadName}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
