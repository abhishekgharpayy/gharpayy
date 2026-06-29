import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { summarizeWhyNotClosing } from "@/admin/lib/selectors";
import { useAuditLog } from "@/lib/crm10x/audit-log";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Check, ChevronDown, Terminal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AdminLeadRow } from "@/admin/lib/selectors";
import { LeadSparkline } from "@/admin/components/LeadSparkline";
import { computeTcmHealth } from "@/admin/lib/supreme-metrics";
import { authedFetch } from "@/admin/lib/use-live-supreme";
import { Button } from "@/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/")(
  {
    component: AdminCockpit,
  }
);

type WhyTab = "all" | "tour-done" | "negotiation" | "contacted" | "new" | "by-tcm";
type ObjTab = "all" | "by-tcm";

const WHY_TABS: { key: WhyTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "tour-done", label: "Tour done" },
  { key: "negotiation", label: "Negotiation" },
  { key: "contacted", label: "Contacted" },
  { key: "new", label: "New" },
  { key: "by-tcm", label: "By TCM" },
];

const OBJ_TABS: { key: ObjTab; label: string }[] = [
  { key: "all", label: "All codes" },
  { key: "by-tcm", label: "By TCM" },
];

type DrawerContent =
  | { kind: "why-list"; title: string; leads: AdminLeadRow[] }
  | { kind: "obj-list"; title: string; leads: AdminLeadRow[] }
  | { kind: "lead-detail"; row: AdminLeadRow }
  | { kind: "tcm-list"; title: string; leads: AdminLeadRow[] }
  | null;

function AdminCockpit() {
  const { rows, properties, rawData, isLoading, isError, refetch } = useLiveSupremeMetrics();
  // Using useAuditLog for now until we migrate admin.audit.tsx
  const audit = useAuditLog((s) => s.entries)
    .filter((e) => e.action.startsWith("admin."))
    .slice(0, 8);
  const now = Date.now();

  const tcms = useMemo(() => {
    const map = new Map<string, {id: string, name: string}>();
    rows.forEach(r => {
      if (r.tcm) map.set(r.tcm.id, { id: r.tcm.id, name: r.tcm.name });
    });
    return Array.from(map.values());
  }, [rows]);

  const [whyTab, setWhyTab] = useState<WhyTab>("all");
  const [objTab, setObjTab] = useState<ObjTab>("all");
  const [objTcmFilter, setObjTcmFilter] = useState("all");
  const [tcmFilter, setTcmFilter] = useState("all");
  const [drawer, setDrawer] = useState<DrawerContent>(null);


  const open = rows.filter((r) => r.status === "open" || r.status === "dormant");
  const hot = open.filter((r) => r.probability >= 70);
  const booked = rows.filter((r) => r.booked);
  const lost = rows.filter((r) => r.status === "lost");
  
  // Forecasting Math
  const pipelineValue = open.reduce((s, r) => s + (r.lead.budget * 12), 0);
  const winRate = booked.length > 0 ? (booked.length / (booked.length + lost.length)) : 0;
  const expectedRevenue = pipelineValue * winRate;
  
  const walking = lost.reduce((s, r) => s + r.lead.budget * 12, 0);
  const revenue = booked.reduce((s, r) => s + (r.bookings[0]?.amount ?? r.lead.budget) * 12, 0);

  const whys = useMemo(() => summarizeWhyNotClosing(rows), [rows]);

  const filteredWhys = useMemo(() => {
    if (whyTab === "all" || whyTab === "by-tcm") return whys;
    const stageMap: Record<string, string> = {
      "tour-done": "tour-done",
      "negotiation": "negotiation",
      "contacted": "contacted",
      "new": "new",
    };
    const stage = stageMap[whyTab];
    const filtered = rows.filter((r) => r.lead.stage === stage && !r.booked);
    return summarizeWhyNotClosing(filtered);
  }, [rows, whyTab, whys]);

  const whyByTcm = useMemo(() => {
    if (whyTab !== "by-tcm") return [];
    const map = new Map<string, Map<string, AdminLeadRow[]>>();
    open.forEach((r) => {
      const name = r.tcm?.name || "Unassigned";
      if (!map.has(name)) map.set(name, new Map());
      const reasons = map.get(name)!;
      if (!reasons.has(r.whyNotClosed)) reasons.set(r.whyNotClosed, []);
      reasons.get(r.whyNotClosed)!.push(r);
    });
    return [...map.entries()]
      .map(([tcm, reasons]) => ({
        tcm,
        entries: [...reasons.entries()]
          .sort((a, b) => b[1].length - a[1].length)
          .slice(0, 3),
        total: [...reasons.values()].reduce((s, v) => s + v.length, 0),
      }))
      .sort((a, b) => b.total - a.total);
  }, [open, whyTab]);

  const tcmHealthMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof computeTcmHealth>[number]>();
    computeTcmHealth(rows).forEach(h => map.set(h.name, h));
    return map;
  }, [rows]);

  const hasRealObjections = useMemo(() => {
    return rows.some((r) =>
      r.objections.some((o) => o.code !== "none") ||
      (r.lead.primaryObjection !== undefined && r.lead.primaryObjection !== null && r.lead.primaryObjection !== "" && r.lead.primaryObjection !== "none") ||
      r.visits.some((v) => v.objections && v.objections.length > 0) ||
      r.tours.some((t) => t.postTour?.objection && t.postTour.objection !== "" && t.postTour.objection !== "none"),
    );
  }, [rows]);

  const objectionDetails = useMemo(() => {
    if (!hasRealObjections) return [];
    const counts = new Map<string, { raised: number; lost: number }>();
    rows.forEach((r) => {
      const codes = new Set<string>();
      r.objections.filter((o) => o.code !== "none").forEach((o) => codes.add(o.code));
      if (r.lead.primaryObjection && r.lead.primaryObjection !== "none" && r.lead.primaryObjection !== "") codes.add(r.lead.primaryObjection);
      r.visits.forEach((v) => {
        (v.objections || []).forEach((o) => {
          const code: string = o.category || o.subType || "";
          if (code) codes.add(code);
        });
      });
      r.tours.forEach((t) => {
        const obj = t.postTour?.objection;
        if (obj && obj !== "none" && obj !== "") codes.add(obj);
      });
      codes.forEach((code) => {
        if (!counts.has(code)) counts.set(code, { raised: 0, lost: 0 });
        counts.get(code)!.raised++;
        if (r.status === "lost") counts.get(code)!.lost++;
      });
    });
    return [...counts.entries()]
      .map(([code, { raised, lost }]) => ({
        code,
        raised,
        lost,
        lossPct: raised > 0 ? Math.round((lost / raised) * 100) : 0,
      }))
      .sort((a, b) => b.lossPct - a.lossPct)
      .slice(0, 8);
  }, [rows, hasRealObjections]);

  const filteredObjectionDetails = useMemo(() => {
    if (!hasRealObjections) return objectionDetails;
    if (objTab !== "by-tcm" || objTcmFilter === "all") return objectionDetails;
    const rowsWithTcm = rows.filter((r) => r.lead.assignedTcmId === objTcmFilter);
    const counts = new Map<string, { raised: number; lost: number }>();
    rowsWithTcm.forEach((r) => {
      const codes = new Set<string>();
      r.objections.filter((o) => o.code !== "none").forEach((o) => codes.add(o.code));
      if (r.lead.primaryObjection && r.lead.primaryObjection !== "none" && r.lead.primaryObjection !== "") codes.add(r.lead.primaryObjection);
      r.visits.forEach((v) => {
        (v.objections || []).forEach((o) => {
          const code: string = o.category || o.subType || "";
          if (code) codes.add(code);
        });
      });
      r.tours.forEach((t) => {
        const obj = t.postTour?.objection;
        if (obj && obj !== "none" && obj !== "") codes.add(obj);
      });
      codes.forEach((code) => {
        if (!counts.has(code)) counts.set(code, { raised: 0, lost: 0 });
        counts.get(code)!.raised++;
        if (r.status === "lost") counts.get(code)!.lost++;
      });
    });
    return [...counts.entries()]
      .map(([code, { raised, lost }]) => ({ code, raised, lost, lossPct: raised > 0 ? Math.round((lost / raised) * 100) : 0 }))
      .sort((a, b) => b.lossPct - a.lossPct)
      .slice(0, 8);
  }, [rows, objTab, objTcmFilter, hasRealObjections, objectionDetails]);

  const objTcmOptions = useMemo(() => {
    const activeIds = new Set<string>();
    rows.forEach((r) => {
      if (r.objections.some((o) => o.code !== "none") || r.lead.primaryObjection) {
        if (r.lead.assignedTcmId) activeIds.add(r.lead.assignedTcmId);
      }
    });
    return tcms.filter((t) => activeIds.has(t.id));
  }, [rows, tcms]);

  const tcmOptions = useMemo(() => {
    const activeIds = new Set(rows.filter((r) => !r.booked).map((r) => r.lead.assignedTcmId));
    return tcms.filter((t) => activeIds.has(t.id));
  }, [rows, tcms]);

  const top24h = useMemo(() => {
    let filtered = rows
      .filter((r) => !r.booked && r.lead.stage !== "dropped")
      .map((r) => {
        const raw = r.lead.confidence;
        const intent = r.lead.intent;
        let p: number;
        if (typeof raw === "number" && raw > 0 && raw < 100) {
          p = raw;
        } else {
          p = intent === "hot" ? 85 : intent === "warm" ? 55 : intent === "cold" ? 20 : 30;
        }
        return { ...r, probability: p };
      });
    if (tcmFilter !== "all") {
      filtered = filtered.filter((r) => r.lead.assignedTcmId === tcmFilter);
    }
    return filtered
      .filter((r) => r.probability > 50)
      .sort((a, b) => b.probability - a.probability)
      .slice(0, 8);
  }, [rows, tcmFilter]);

  const leaderboard = useMemo(() => {
    const map = new Map<string, { tcm: string; xp: number; closed: number; tours: number }>();
    tcms.forEach(t => map.set(t.id, { tcm: t.name, xp: 0, closed: 0, tours: 0 }));

    rows.forEach(r => {
      const tcmId = r.lead.assignedTcmId;
      if (!tcmId || !map.has(tcmId)) return;
      const stats = map.get(tcmId)!;
      
      r.tours.forEach(t => {
        if (t.status === "completed") {
          stats.xp += 20;
          stats.tours += 1;
        }
        if (t.postTour?.decision) stats.xp += 25;
      });
      if (r.booked) {
        stats.xp += 100;
        stats.closed += 1;
      }
      
      const callsForLead = (rawData as any)?.activities?.filter((a: any) => a.kind === "call" && a.leadId === r.lead.id) || [];
      stats.xp += (callsForLead.length * 5);
    });

    return Array.from(map.values())
      .filter(s => s.xp > 0)
      .sort((a, b) => b.xp - a.xp)
      .slice(0, 5);
  }, [tcms, rows, rawData]);

  const livePulse = useMemo(() => {
    return rows.flatMap((row) => {
        return row.visits.flatMap((v) => {
          const alerts: { ts: number; id: string; text: string }[] = [];
          const delayed = !!v.startedAt && !v.reachedAt && now - v.startedAt > 15 * 60_000;
          if (delayed) {
            alerts.push({ ts: v.startedAt!, id: v.tourId, text: "Delayed start" });
          }
          const completedAgo = v.completedAt ? now - v.completedAt : 0;
          if (v.completedAt && !v.reaction && completedAgo > 2 * 3600_000) {
            alerts.push({ ts: v.completedAt, id: v.tourId, text: "Post-visit silence" });
          }
          if (v.completedAt && v.outcome === "thinking" && completedAgo > 24 * 3600_000) {
            alerts.push({ ts: v.completedAt, id: v.tourId, text: "Decision pending" });
          }
          const ghost = !!v.completedAt && completedAgo > 6 * 3600_000 && (!v.outcome || v.outcome === "thinking" || v.outcome === "follow-up");
          if (ghost) {
            alerts.push({ ts: v.completedAt!, id: v.tourId, text: "Ghost follow-up" });
          }
          const realLeadName = row.lead.name;
          const realTcmName = row.tcm?.name || "Unassigned";
          if (realLeadName === "Lead" || realLeadName === "Coordinator" || realTcmName === "Lead" || realTcmName === "Coordinator") return [];
          return alerts.map((a) => ({
            id: a.id,
            kind: a.text,
            ts: a.ts,
            leadName: realLeadName,
            coordinatorName: realTcmName,
          }));
        });
      })
      .sort((a, b) => b.ts - a.ts)
      .slice(0, 20);
  }, [rows, now]);

  const supplyWarnings = useMemo(() => {
    if (!properties || properties.length === 0) return [];
    
    // Group dropped leads by preferredArea
    const droppedByArea = new Map<string, number>();
    const lostLeads = rows.filter(r => r.status === "lost" || r.status === "dormant");
    lostLeads.forEach(r => {
      const area = r.lead.preferredArea;
      if (area && area !== "none" && area !== "") {
        droppedByArea.set(area, (droppedByArea.get(area) || 0) + 1);
      }
    });

    const warnings: { area: string; dropped: number; available: number }[] = [];
    droppedByArea.forEach((droppedCount, area) => {
      if (droppedCount >= 2) { // 2 or more dropped leads in this area
        const availableInArea = properties.filter(p => 
          ((p.address || '').toLowerCase().includes(area.toLowerCase()) || 
           (p.name || '').toLowerCase().includes(area.toLowerCase())) &&
          p.status === "vacant"
        ).length;
        
        if (availableInArea < 2) {
          warnings.push({ area, dropped: droppedCount, available: availableInArea });
        }
      }
    });
    
    return warnings.sort((a, b) => b.dropped - a.dropped).slice(0, 3);
  }, [rows, properties]);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="p-8 text-center text-muted-foreground animate-pulse">Initializing God Mode...</div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="space-y-4">
        <div className="p-8 text-center">
          <div className="text-destructive mb-3">Failed to fetch metrics. Please check your connection.</div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <Terminal className="w-3.5 h-3.5 mr-1.5" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <>
    <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {[
            { label: "Pipeline open", value: open.length, accent: "text-info" },
            { label: "Win Rate", value: `${Math.round(winRate * 100)}%`, accent: "text-info" },
            { label: "Expected Rev", value: expectedRevenue > 0 ? `₹${(expectedRevenue / 100000).toFixed(1)}L` : "₹0", accent: "text-accent" },
            { label: "Booked", value: booked.length, accent: "text-success" },
            { label: "₹ Booked", value: revenue > 0 ? `₹${(revenue / 100000).toFixed(1)}L` : "₹0", accent: "text-success" },
            { label: "₹ Walking", value: walking > 0 ? `₹${(walking / 100000).toFixed(1)}L` : "₹0", accent: "text-destructive" },
          ].map((k) => (
            <div key={k.label} className="rounded-xl border border-border bg-card p-3">
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{k.label}</div>
              <div className={`text-xl font-display font-semibold ${k.accent}`}>{k.value}</div>
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-3 mt-3">
          <WhyPanel
            whys={filteredWhys}
            whyTab={whyTab}
            onWhyTabChange={setWhyTab}
            whyByTcm={whyByTcm}
            tcmHealthMap={tcmHealthMap}
            open={open}
            rows={rows}
            tcms={tcms}
            onOpenLeads={(title, leads) => setDrawer({ kind: "why-list", title, leads })}
          />

          <ObjPanel
            hasRealObjections={hasRealObjections}
            objectionDetails={filteredObjectionDetails}
            objTab={objTab}
            onObjTabChange={setObjTab}
            objTcmFilter={objTcmFilter}
            onObjTcmChange={setObjTcmFilter}
            objTcmOptions={objTcmOptions}
            rows={rows}
            onOpenLeads={(title, leads) => setDrawer({ kind: "obj-list", title, leads })}
          />

          <ClosePanel
            top24h={top24h}
            tcmOptions={tcmOptions}
            tcmFilter={tcmFilter}
            onTcmChange={setTcmFilter}
            onSelectLead={(row) => setDrawer({ kind: "lead-detail", row })}
          />
        </div>

        <div className="grid md:grid-cols-4 gap-3 mt-3">
          <div className="rounded-xl border border-border bg-card p-3 col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">TCM Leaderboard</span>
              <span className="text-[10px] bg-accent/10 text-accent px-1.5 py-0.5 rounded-sm font-semibold">LIVE</span>
            </div>
            <ul className="space-y-3 text-sm">
              {leaderboard.map((t, idx) => (
                <li key={t.tcm} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${idx === 0 ? "bg-amber-100 text-amber-700" : idx === 1 ? "bg-slate-100 text-slate-600" : idx === 2 ? "bg-orange-50 text-orange-700" : "bg-muted text-muted-foreground"}`}>
                      {idx + 1}
                    </div>
                    <span className="font-medium truncate max-w-[100px]">{t.tcm}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground text-right">
                    <span>{t.closed} <span className="text-[10px]">won</span></span>
                    <span className="font-mono text-accent font-semibold">{t.xp} XP</span>
                  </div>
                </li>
              ))}
              {!leaderboard.length && <li className="text-muted-foreground text-xs">No XP earned yet.</li>}
            </ul>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-3 col-span-1 md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Supply Bottlenecks</span>
              <span className="text-[10px] bg-destructive/10 text-destructive px-1.5 py-0.5 rounded-sm font-semibold">ALERT</span>
            </div>
            <div className="space-y-3">
              {supplyWarnings.map((w) => (
                <div key={w.area} className="p-2 bg-destructive/5 rounded-lg border border-destructive/20">
                  <div className="text-xs font-semibold text-destructive mb-1">{w.area}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight">
                    <span className="font-medium text-foreground">{w.dropped} leads dropped</span> recently due to lack of inventory. Only <span className="font-bold">{w.available} vacant properties</span> remaining.
                  </div>
                </div>
              ))}
              {!supplyWarnings.length && (
                <div className="text-xs text-muted-foreground">Inventory levels are healthy across all requested areas.</div>
              )}
            </div>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-3 col-span-1 md:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Live pulse — visit alerts</div>
            <ul className="space-y-1 text-xs max-h-72 overflow-auto">
              {livePulse.map((a) => (
                <li key={`${a.id}-${a.kind}-${a.ts}`} className="flex gap-2">
                  <span className="text-muted-foreground font-mono">
                    {new Date(a.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">
                    {a.leadName} · {a.coordinatorName} · {a.kind}
                  </span>
                </li>
              ))}
              {!livePulse.length && <li className="text-muted-foreground">No alerts.</li>}
            </ul>
          </div>
          
          <div className="rounded-xl border border-border bg-card p-3 col-span-1 md:col-span-1">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Audit feed</div>
            <ul className="space-y-1 text-xs max-h-72 overflow-auto">
              {audit.map((e) => (
                <li key={e.id} className="flex gap-2">
                  <span className="text-muted-foreground font-mono">
                    {new Date(e.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="truncate">{e.summary}</span>
                </li>
              ))}
              {!audit.length && <li className="text-muted-foreground">No admin actions yet — take an action in Master Leads to see entries.</li>}
            </ul>
          </div>
        </div>

        {/* Live Command Terminal */}
        <CommandTerminal />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => { if (!o) setDrawer(null); }}>
        <SheetContent side="right" className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
          {drawer?.kind === "why-list" && (
            <DrawerLeadList title={drawer.title} leads={drawer.leads} onSelectLead={(row) => setDrawer({ kind: "lead-detail", row })} />
          )}
          {drawer?.kind === "obj-list" && (
            <DrawerLeadList title={`Objection: ${drawer.title}`} leads={drawer.leads} onSelectLead={(row) => setDrawer({ kind: "lead-detail", row })} />
          )}
          {drawer?.kind === "tcm-list" && (
            <DrawerLeadList title={drawer.title} leads={drawer.leads} onSelectLead={(row) => setDrawer({ kind: "lead-detail", row })} />
          )}
          {drawer?.kind === "lead-detail" && (
            <LeadDetailPanel row={drawer.row} />
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/* ============== COMMAND TERMINAL ============== */
function CommandTerminal() {
  const [input, setInput] = useState("");
  
  const execCmd = useMutation({
    mutationFn: async (text: string) => {
      const parts = text.trim().split(" ");
      const cmd = parts[0].replace("/", "");
      const args = parts.slice(1).join(" ");
      return authedFetch("/api/v1/admin/command", {
        method: "POST",
        body: JSON.stringify({ command: cmd, args }),
      });
    },
    onSuccess: (data: any) => {
      toast.success(data.message || "Command executed successfully");
      setInput("");
    },
    onError: (err: any) => {
      toast.error(err.message || "Unknown command");
    }
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && input.startsWith("/")) {
      execCmd.mutate(input);
    }
  };

  return (
    <div className="mt-4 flex items-center gap-2 rounded-xl border border-green-900/30 bg-[#0a0a0a] p-3 text-green-500 shadow-inner">
      <Terminal className="h-4 w-4" />
      <span className="font-mono text-sm opacity-70">admin@cockpit:~$</span>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Type a command (e.g. /broadcast push hard team!)..."
        className="flex-1 bg-transparent border-none outline-none font-mono text-sm placeholder:text-green-900/50 text-green-400"
        disabled={execCmd.isPending}
        autoComplete="off"
      />
      {execCmd.isPending && <span className="animate-pulse text-xs font-mono">executing...</span>}
    </div>
  );
}

/* ============== WHY NOT CLOSING PANEL ============== */
function WhyPanel({
  whys,
  whyTab,
  onWhyTabChange,
  whyByTcm,
  tcmHealthMap,
  open,
  rows,
  tcms,
  onOpenLeads,
}: {
  whys: Array<{ reason: string; count: number }>;
  whyTab: WhyTab;
  onWhyTabChange: (t: WhyTab) => void;
  whyByTcm: Array<{ tcm: string; entries: Array<[string, AdminLeadRow[]]>; total: number }>;
  tcmHealthMap: Map<string, ReturnType<typeof computeTcmHealth>[number]>;
  open: AdminLeadRow[];
  rows: AdminLeadRow[];
  tcms: Array<{ id: string; name: string }>;
  onOpenLeads: (title: string, leads: AdminLeadRow[]) => void;
}) {
  const [whyTcmFilter, setWhyTcmFilter] = useState("all");

  const filterCtx = useMemo(() => {
    if (whyTab === "all" || whyTab === "by-tcm") return open;
    const stageMap: Record<string, string> = {
      "tour-done": "tour-done",
      "negotiation": "negotiation",
      "contacted": "contacted",
      "new": "new",
    };
    return rows.filter((r) => r.lead.stage === stageMap[whyTab] && !r.booked);
  }, [rows, whyTab, open]);

  const freshLeadStats = useMemo(() => {
    const newLeads = rows.filter((r) => r.lead.stage === "new" && !r.booked);
    if (!newLeads.length) return null;
    let oldestDays = 0;
    newLeads.forEach((r) => {
      const createdAt = new Date(r.lead.createdAt).getTime();
      const days = Math.floor((Date.now() - createdAt) / (1000 * 60 * 60 * 24));
      if (days > oldestDays) oldestDays = days;
    });
    const unassigned = newLeads.filter((r) => !r.tcm);
    return { oldestDays, unassignedCount: unassigned.length };
  }, [rows]);

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Why leads aren't closing</div>
        {whyTab === "by-tcm" && (
          <DropdownFilter value={whyTcmFilter} onChange={setWhyTcmFilter} options={tcms} placeholder="All TCMs" />
        )}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {WHY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onWhyTabChange(t.key)}
            className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${
              whyTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {whyTab === "by-tcm" ? (
        <>

          <ul className="space-y-1 text-xs">
            {(whyTcmFilter === "all" ? whyByTcm : whyByTcm.filter((t) => {
              const matched = tcms.find((tcm) => tcm.id === whyTcmFilter);
              return matched && t.tcm === matched.name;
            })).map((t) => (
              <li key={t.tcm}>
                <button
                  onClick={() => {
                    const leads = open.filter((r) => (r.tcm?.name || "Unassigned") === t.tcm);
                    onOpenLeads(`${t.tcm}'s pipeline`, leads);
                  }}
                  className="w-full flex justify-between items-center p-1.5 rounded hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{t.tcm}</span>
                    {tcmHealthMap.get(t.tcm) && (
                      <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                        tcmHealthMap.get(t.tcm)!.riskFlag === 'burn' ? 'bg-destructive/20 text-destructive' :
                        tcmHealthMap.get(t.tcm)!.riskFlag === 'watch' ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
                      }`}>
                        {tcmHealthMap.get(t.tcm)!.loadScore}% Load
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-accent">{t.total}</span>
                </button>
                <div className="pl-3 space-y-0.5 text-muted-foreground">
                  {t.entries.map(([reason, leads]) => (
                    <button
                      key={reason}
                      onClick={() => onOpenLeads(reason, leads)}
                      className="w-full flex justify-between text-[11px] hover:text-foreground transition-colors"
                    >
                      <span className="truncate">{reason}</span>
                      <span className="font-mono">{leads.length}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
            {!whyByTcm.length && <li className="text-muted-foreground">No data.</li>}
          </ul>
        </>
      ) : (
        <ul className="space-y-1 text-xs">
          {whys.map((w) => (
            <li key={w.reason}>
              <button
                onClick={() => {
                  const matching = filterCtx.filter((r) => r.whyNotClosed === w.reason);
                  onOpenLeads(w.reason, matching);
                }}
                className="w-full flex justify-between items-center p-1.5 rounded hover:bg-muted/50 transition-colors"
              >
                <span className="truncate">{w.reason}</span>
                <span className="font-mono text-accent shrink-0 ml-2">{w.count}</span>
              </button>
              {w.reason.startsWith("Fresh lead") && freshLeadStats && (
                <>
                  <div className="text-[10px] text-muted-foreground/60 mt-0.5 pl-1.5">
                    Oldest: {freshLeadStats.oldestDays}d ago
                  </div>
                  {freshLeadStats.unassignedCount > 0 && (
                    <div className="text-[10px] text-amber-500 font-medium mt-0.5 pl-1.5">
                      ️ {freshLeadStats.unassignedCount} leads have no TCM assigned — assign immediately
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
          {!whys.length && <li className="text-muted-foreground">No open leads.</li>}
        </ul>
      )}
    </div>
  );
}

/* ============== OBJECTIONS PANEL ============== */
function ObjPanel({
  hasRealObjections,
  objectionDetails,
  objTab,
  onObjTabChange,
  objTcmFilter,
  onObjTcmChange,
  objTcmOptions,
  rows,
  onOpenLeads,
}: {
  hasRealObjections: boolean;
  objectionDetails: Array<{ code: string; raised: number; lost: number; lossPct: number }>;
  objTab: ObjTab;
  onObjTabChange: (t: ObjTab) => void;
  objTcmFilter: string;
  onObjTcmChange: (t: string) => void;
  objTcmOptions: Array<{ id: string; name: string }>;
  rows: AdminLeadRow[];
  onOpenLeads: (title: string, leads: AdminLeadRow[]) => void;
}) {
  if (!hasRealObjections) {
    return (
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">Top objection codes</div>
        <p className="text-xs text-muted-foreground/70 leading-relaxed mt-2">
          No objections logged yet.
          <br />
          Objections appear here when TCMs fill the objection field
          after completing visits or marking leads as lost.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Top objection codes</div>
        {objTab === "by-tcm" && (
          <DropdownFilter value={objTcmFilter} onChange={onObjTcmChange} options={objTcmOptions} placeholder="All TCMs" />
        )}
      </div>
      <div className="flex flex-wrap gap-1 mb-2">
        {OBJ_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => onObjTabChange(t.key)}
            className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${
              objTab === t.key
                ? "bg-primary text-primary-foreground shadow-sm"
                : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>



      <ul className="space-y-1 text-xs">
        {objectionDetails.map((o) => (
          <li key={o.code}>
            <button
              onClick={() => {
                const code = o.code;
                const leads = rows.filter((r) =>
                  r.objections.some((obj) => obj.code === code) ||
                  r.lead.primaryObjection === code ||
                  r.visits.some((v) => v.objections?.some((vobj) => (vobj.category || vobj.subType) === code)) ||
                  r.tours.some((t) => t.postTour?.objection === code),
                );
                onOpenLeads(o.code.replace(/-/g, " "), leads);
              }}
              className="w-full flex items-center gap-2 p-1.5 rounded hover:bg-muted/50 transition-colors"
            >
              <span className="truncate flex-1 text-left">{o.code.replace(/-/g, " ")}</span>
              <span className="font-mono text-muted-foreground shrink-0 text-[10px]">
                {o.raised}r
              </span>
              <span className="font-mono text-destructive shrink-0 text-[10px]">
                {o.lost}l
              </span>
              <span className="font-mono shrink-0 w-8 text-right text-[10px]"
                style={{ color: o.lossPct >= 70 ? "var(--destructive)" : o.lossPct >= 40 ? "var(--warning)" : "var(--muted-foreground)" }}
              >
                {o.lossPct}%
              </span>
            </button>
          </li>
        ))}
        {!objectionDetails.length && (
          <li className="text-muted-foreground text-xs mt-2">No matching objections for this TCM.</li>
        )}
      </ul>
    </div>
  );
}

/* ============== CLOSE IN 24H PANEL ============== */
function ClosePanel({
  top24h,
  tcmOptions,
  tcmFilter,
  onTcmChange,
  onSelectLead,
}: {
  top24h: AdminLeadRow[];
  tcmOptions: Array<{ id: string; name: string }>;
  tcmFilter: string;
  onTcmChange: (t: string) => void;
  onSelectLead: (row: AdminLeadRow) => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Most likely to close in 24h</div>
        <DropdownFilter value={tcmFilter} onChange={onTcmChange} options={tcmOptions} placeholder="All TCMs" />
      </div>

      <ol className="space-y-1 text-xs">
        {top24h.map((r, i) => (
          <li key={r.lead.id}>
            <button
              onClick={() => onSelectLead(r)}
              className="w-full flex justify-between items-center p-1.5 rounded hover:bg-muted/50 transition-colors gap-2"
            >
              <span className="truncate text-left flex-1">
                {(() => {
                  const rawName = r.lead.name;
                  const rawArea = r.lead.preferredArea;
                  const isSwapped = rawName === "Location" || rawName === "location" || rawName === "Area" || rawName === "area";
                  const name = isSwapped && rawArea ? rawArea : rawName;
                  const area = isSwapped && rawArea ? rawName : rawArea;
                  return <><span className="font-medium">{i + 1}. {name}</span>{area ? <span className="text-muted-foreground ml-1">· {area}</span> : null}</>;
                })()}
              </span>
              <LeadSparkline row={r} width={48} height={20} />
              <span className="text-accent font-mono shrink-0 ml-1">{r.probability}%</span>
            </button>
          </li>
        ))}
        {!top24h.length && <li className="text-muted-foreground">No open leads.</li>}
      </ol>
    </div>
  );
}

/* ============== DRAWER: LEAD LIST ============== */
function DrawerLeadList({ title, leads, onSelectLead }: { title: string; leads: AdminLeadRow[]; onSelectLead: (r: AdminLeadRow) => void }) {
  return (
    <>
      <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
        <SheetTitle className="text-sm">{title}</SheetTitle>
        <div className="text-[11px] text-muted-foreground">{leads.length} lead{leads.length !== 1 ? "s" : ""}</div>
      </SheetHeader>
      <div className="flex-1 overflow-auto p-4 space-y-2">
        {leads.map((r) => (
          <button
            key={r.lead.id}
            onClick={() => onSelectLead(r)}
            className="w-full text-left p-2.5 rounded-lg hover:bg-muted/50 border border-border/50 text-xs transition-colors"
          >
            <div className="flex justify-between items-center">
              <span className="font-medium">{r.lead.name}</span>
              <span className="font-mono text-accent">{r.probability}%</span>
            </div>
            <div className="flex justify-between text-muted-foreground mt-0.5">
              <span>{r.tcm?.name || "—"} · {r.lead.stage}</span>
              <span>₹{r.expectedValue.toLocaleString("en-IN")}</span>
            </div>
            <div className="text-muted-foreground/70 mt-0.5 truncate">{r.whyNotClosed}</div>
          </button>
        ))}
        {!leads.length && <div className="text-muted-foreground text-xs text-center py-8">No leads match.</div>}
      </div>
    </>
  );
}

/* ============== DRAWER: LEAD DETAIL ============== */
function LeadDetailPanel({ row }: { row: AdminLeadRow }) {
  return (
    <>
      <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
        <SheetTitle className="text-sm">{row.lead.name}</SheetTitle>
        <div className="text-[11px] text-muted-foreground font-mono">{row.lead.phone}</div>
      </SheetHeader>
      <div className="flex-1 overflow-auto p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat k="Stage" v={row.lead.stage} />
          <Stat k="Probability" v={`${row.probability}%`} />
          <Stat k="Status" v={row.status} />
          <Stat k="Expected ₹" v={`₹${row.expectedValue.toLocaleString("en-IN")}`} />
          <Stat k="TCM" v={row.tcm?.name ?? "—"} />
          <Stat k="Area" v={row.lead.preferredArea} />
          <Stat k="Tours / Visits" v={`${row.tours.length} / ${row.visits.length}`} />
          <Stat k="Budget" v={`₹${row.lead.budget.toLocaleString("en-IN")}`} />
        </div>

        <div className="rounded-md border border-border p-2.5 bg-muted/30 text-xs">
          <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Why open</div>
          <div className="font-medium">{row.whyNotClosed}</div>
        </div>

        {row.lastObjection && (
          <div className="rounded-md border border-border p-2.5 bg-muted/30 text-xs">
            <div className="text-[10px] uppercase text-muted-foreground mb-0.5">Last objection</div>
            <div className="font-medium">{row.lastObjection.code.replace(/-/g, " ")}</div>
            <div className="text-muted-foreground mt-0.5">“{row.lastObjection.leadWords}”</div>
            <div className="text-muted-foreground/70 mt-0.5">Resolution: {row.lastObjection.resolution}</div>
          </div>
        )}

        {row.objections.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Objection history</div>
            <ul className="space-y-1 text-xs">
              {row.objections.slice(0, 6).map((o) => (
                <li key={o.id} className="flex justify-between items-center p-1.5 rounded border border-border/50">
                  <span className="truncate flex-1">{o.code.replace(/-/g, " ")}</span>
                  <span className={`shrink-0 text-[10px] ml-2 ${
                    o.resolution === "yes" ? "text-success" : o.resolution === "partially" ? "text-warning" : "text-destructive"
                  }`}>
                    {o.resolution}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="outline" className="flex-1 text-xs h-8" onClick={() => alert("Re-assign prompt opened.")}>Re-assign Lead</Button>
          <Button size="sm" variant="default" className="flex-1 text-xs h-8 bg-primary text-primary-foreground shadow-sm hover:bg-accent/80" onClick={() => alert("Nudge sent to TCM.")}>Nudge TCM</Button>
        </div>

        {row.calls.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Recent calls</div>
            <ul className="space-y-1 text-xs max-h-32 overflow-auto">
              {row.calls.slice(0, 5).map((c) => (
                <li key={c.id} className="flex justify-between text-muted-foreground">
                  <span>{new Date(c.ts).toLocaleDateString("en-IN")} · {c.outcome}</span>
                  <span>{c.durationSec}s</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {row.visits.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Visit history</div>
            <ul className="space-y-1 text-xs">
              {row.visits.slice(0, 3).map((v) => (
                <li key={v.tourId} className="flex justify-between text-muted-foreground">
                  <span>{v.propertyName} · {v.stage}</span>
                  <span>{v.outcome || "—"}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {row.coachNotes.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Coach notes</div>
            <ul className="space-y-1 text-xs">
              {row.coachNotes.slice(0, 3).map((n) => (
                <li key={n.id} className="text-muted-foreground border-l-2 border-border pl-2">
                  “{n.text}”
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </>
  );
}

function Stat({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-2 bg-muted/20">
      <div className="text-[10px] uppercase text-muted-foreground">{k}</div>
      <div className="font-medium">{v}</div>
    </div>
  );
}

function DropdownFilter({
  value,
  onChange,
  options,
  placeholder = "Select...",
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ id: string; name: string }>;
  placeholder?: string;
}) {
  const selectedName = value === "all" ? placeholder : options.find((o) => o.id === value)?.name || value;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-[11px] rounded-full px-3 bg-background hover:border-primary/50 hover:text-primary shrink-0"
        >
          {selectedName} <ChevronDown className="ml-1 h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-0" align="end">
        <Command>
          <CommandInput placeholder="Search..." className="text-[11px]" />
          <CommandList>
            <CommandEmpty className="py-3 text-center text-xs text-muted-foreground">No options found.</CommandEmpty>
            <CommandGroup>
              <CommandItem value="All" onSelect={() => onChange("all")} className="text-[11px] cursor-pointer">
                <div
                  className={cn(
                    "mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                    value === "all" ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                  )}
                >
                  <Check className={cn("h-3 w-3")} />
                </div>
                {placeholder}
              </CommandItem>
              {options.map((opt) => (
                <CommandItem key={opt.id} value={opt.name} onSelect={() => onChange(opt.id)} className="text-[11px] cursor-pointer">
                  <div
                    className={cn(
                      "mr-2 flex h-3.5 w-3.5 items-center justify-center rounded-sm border border-primary",
                      value === opt.id ? "bg-primary text-primary-foreground" : "opacity-50 [&_svg]:invisible",
                    )}
                  >
                    <Check className={cn("h-3 w-3")} />
                  </div>
                  {opt.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
