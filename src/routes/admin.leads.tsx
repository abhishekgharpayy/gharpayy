import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo, useState, useCallback } from "react";
import { AdminFilterBar } from "@/admin/components/AdminFilterBar";
import { useAdminRows } from "@/admin/lib/use-admin-rows";
import { applyFilters, defaultAdminFilters, type AdminFilters } from "@/admin/lib/filter-schema";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { reassignLead, forceCloseLead, flagIntervention, resolveIntervention } from "@/admin/lib/admin-actions";
import { downloadCsv, downloadJson } from "@/admin/lib/exporters/csv";
import { downloadAdminWorkbook } from "@/admin/lib/exporters/xlsx";
import { downloadAdminPdf } from "@/admin/lib/exporters/pdf";
import { toast } from "sonner";
import type { AdminLeadRow } from "@/hooks/api/useAdminLeads";
import { useAdminLeads, adminLeadsKeys } from "@/hooks/api/useAdminLeads";
import { BulkFileImport } from "@/components/leads/BulkFileImport";
import { useAuthUser } from "@/lib/auth-store";
import { fmtTourScheduleLabel, isTodayIST } from "@/lib/crm10x/dates";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/admin/leads")(
  {
    beforeLoad: () => {
      const role = useAuthUser.getState().user?.role;
      if (role !== "super_admin") throw redirect({ to: "/" });
    },
    component: AdminLeads,
  }
);

// ── Intervention Category Labels ─────────────────────────────────────────────
const INTERVENTION_CATEGORIES = [
  { value: "pricing_dispute", label: "Pricing Dispute" },
  { value: "tcm_unresponsive", label: "TCM Unresponsive" },
  { value: "special_reqs", label: "Special Requirements" },
  { value: "bad_experience", label: "Bad Experience" },
  { value: "other", label: "Other" },
] as const;

type InterventionCategory = typeof INTERVENTION_CATEGORIES[number]["value"];

// ── Stage Aging Thresholds ───────────────────────────────────────────────────
function getAgingColor(days: number, isStuck: boolean): { bg: string; text: string; label: string } {
  if (isStuck) return { bg: "bg-rose-500/10", text: "text-rose-500", label: "Stuck" };
  if (days >= 3) return { bg: "bg-amber-500/10", text: "text-amber-500", label: "Aging" };
  return { bg: "bg-emerald-500/10", text: "text-emerald-500", label: "Fresh" };
}

// ── Main Component ───────────────────────────────────────────────────────────
function AdminLeads() {
  const queryClient = useQueryClient();
  const rows = useAdminRows();
  const { data: adminData } = useAdminLeads();
  const tcms = adminData?.tcms ?? [];
  const leads = useMemo(() => rows.map(r => r.lead), [rows]);
  const userRole = useAuthUser.getState().user?.role;
  const isAdmin = userRole === "super_admin";
  const [filters, setFilters] = useState<AdminFilters>(defaultAdminFilters);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<AdminLeadRow | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState<string | null>(null);
  const [flagCategory, setFlagCategory] = useState<InterventionCategory>("other");
  const [flagNote, setFlagNote] = useState("");
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [filterStuck, setFilterStuck] = useState(false);
  const [showBulkPanel, setShowBulkPanel] = useState(false);

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source))), [leads]);
  const addedByOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.createdBy || "system"))).sort(), [leads]);
  const filtered = useMemo(() => {
    let result = applyFilters(rows, filters);
    if (filterFlagged) result = result.filter(r => r.intervention?.isFlagged);
    if (filterStuck) result = result.filter(r => r.isStuck);
    return result;
  }, [rows, filters, filterFlagged, filterStuck]);

  const todayLeads = useMemo(() => leads.filter((l) => isTodayIST(l.createdAt)), [leads]);
  const todaySummary = useMemo(() => {
    const counts = new Map<string, number>();
    todayLeads.forEach(l => {
      const by = l.createdBy || "system";
      counts.set(by, (counts.get(by) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([by, count]) => `${count} by ${by}`).join(", ");
  }, [todayLeads]);

  // ── KPI Metrics ──────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const activeInterventions = rows.filter(r => r.intervention?.isFlagged).length;
    const stuckLeads = rows.filter(r => r.isStuck).length;
    const totalExpectedRevenue = rows.reduce((sum, r) => sum + (r.expectedValue || 0), 0);
    const freshLeads = todayLeads.length;
    return { activeInterventions, stuckLeads, totalExpectedRevenue, freshLeads };
  }, [rows, todayLeads]);

  const toggle = (id: string) => {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  };

  const invalidateLeads = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: adminLeadsKeys.all });
  }, [queryClient]);

  const handleFlag = async () => {
    if (!showFlagModal) return;
    await flagIntervention(showFlagModal, flagCategory, flagNote);
    setShowFlagModal(null);
    setFlagCategory("other");
    setFlagNote("");
    invalidateLeads();
  };

  const handleResolve = async (leadId: string) => {
    await resolveIntervention(leadId);
    invalidateLeads();
  };

  const exportRows = (fmt: "csv" | "xlsx" | "pdf" | "json") => {
    const data = filtered.map((r) => ({
      name: r.lead.name,
      phone: r.lead.phone,
      source: r.lead.source,
      stage: r.lead.stage,
      tcm: r.tcm?.name ?? "",
      zone: r.tcm?.zones?.[0] ?? "",
      area: r.lead.preferredArea,
      budget: r.lead.budget,
      probability: r.probability,
      expectedValue: r.expectedValue,
      status: r.status,
      whyNotClosed: r.whyNotClosed,
      tours: r.tours.length,
      stageAgeDays: r.currentStageAgeDays,
      isStuck: r.isStuck,
      flagged: r.intervention?.isFlagged ? "Yes" : "No",
      lastTouch: new Date(r.lastTouchTs).toISOString(),
    }));
    const stamp = new Date().toISOString().slice(0, 10);
    if (fmt === "csv") downloadCsv(`admin-leads-${stamp}.csv`, data);
    else if (fmt === "json") downloadJson(`admin-leads-${stamp}.json`, data);
    else if (fmt === "xlsx")
      downloadAdminWorkbook(`admin-leads-${stamp}.xlsx`, filtered).catch(() => toast.error("XLSX export failed"));
    else if (fmt === "pdf")
      downloadAdminPdf(`admin-leads-${stamp}.pdf`, filtered).catch(() => toast.error("PDF export failed"));
  };

  return (
    <div className="space-y-4">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div>
        <h1 className="text-lg font-semibold">Master Lead Console</h1>
        <p className="text-sm text-muted-foreground">{filtered.length} of {rows.length} leads · full control</p>
      </div>

      {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard
          label="Active Interventions"
          value={kpis.activeInterventions}
          accent={kpis.activeInterventions > 0 ? "text-amber-500" : "text-muted-foreground"}
          sub="Flagged leads"
        />
        <KpiCard
          label="Stuck Leads"
          value={kpis.stuckLeads}
          accent={kpis.stuckLeads > 0 ? "text-rose-500" : "text-muted-foreground"}
          sub="Exceeded stage SLA"
        />
        <KpiCard
          label="Expected Revenue"
          value={`₹${(kpis.totalExpectedRevenue / 100000).toFixed(1)}L`}
          accent="text-emerald-500"
          sub="Weighted pipeline"
        />
        <KpiCard
          label="Fresh Leads"
          value={kpis.freshLeads}
          accent="text-sky-500"
          sub={todaySummary || "None today"}
        />
      </div>

      {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
      <AdminFilterBar filters={filters} onChange={setFilters} tcms={tcms.map(t => ({ ...t, zone: t.zones?.[0] || "" }))} sources={sources} addedByOptions={addedByOptions} />

      {/* ── Extra Filter Pills ─────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setFilterFlagged(!filterFlagged)}
          className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${filterFlagged ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"}`}
        >
          🚩 Flagged ({rows.filter(r => r.intervention?.isFlagged).length})
        </button>
        <button
          onClick={() => setFilterStuck(!filterStuck)}
          className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${filterStuck ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"}`}
        >
          ⏰ Stuck ({rows.filter(r => r.isStuck).length})
        </button>
        <button
          onClick={() => setShowBulkPanel(!showBulkPanel)}
          className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${showBulkPanel ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"}`}
        >
          📥 Bulk Panel
        </button>
        <button
          onClick={() => setShowImport(!showImport)}
          className={`text-[11px] font-medium rounded-full px-3 py-1 transition-colors ${showImport ? "bg-primary text-primary-foreground shadow-sm" : "bg-card text-muted-foreground border border-border hover:bg-muted/50 hover:text-foreground"}`}
        >
          📤 Import CSV/JSON
        </button>
      </div>

      {/* ── Import Panel ───────────────────────────────────────────────────── */}
      {showImport && (
        <div className="rounded-xl border border-border bg-card/60 p-4">
          <div className="text-sm font-medium mb-2">Bulk Lead Import</div>
          <BulkFileImport onImportComplete={() => { invalidateLeads(); toast.success("Import complete — refreshing…"); }} />
        </div>
      )}

      {/* ── Bulk Actions Panel ─────────────────────────────────────────────── */}
      {showBulkPanel && (
        <div className="rounded-xl border border-border bg-card/60 p-3 flex items-center justify-between flex-wrap gap-2">
          <div className="text-xs text-muted-foreground">{selected.size > 0 ? `${selected.size} selected` : "Select rows for bulk actions"}</div>
          <div className="flex items-center gap-2 flex-wrap">
            {selected.size > 0 && (
              <>
                <Select
                  disabled={!isAdmin}
                  onValueChange={(tcmId) => {
                    [...selected].forEach((id) => reassignLead(id, tcmId, "Bulk reassign"));
                    setSelected(new Set());
                    invalidateLeads();
                  }}
                >
                  <SelectTrigger className="h-8 w-44 text-xs">
                    <SelectValue placeholder={isAdmin ? "Bulk reassign to…" : "Admin only"} />
                  </SelectTrigger>
                  <SelectContent>{tcms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!isAdmin}
                  onClick={() => {
                    if (!confirm(`Close ${selected.size} leads as WON?`)) return;
                    [...selected].forEach((id) => {
                      const row = rows.find(r => r.lead.id === id || r.lead._id === id);
                      forceCloseLead(id, "won", row?.lead.budget ?? 0);
                    });
                    setSelected(new Set());
                    invalidateLeads();
                  }}
                >
                  Bulk Won
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  disabled={!isAdmin}
                  onClick={() => {
                    if (!confirm(`Close ${selected.size} leads as LOST?`)) return;
                    [...selected].forEach((id) => forceCloseLead(id, "lost", "bulk admin close"));
                    setSelected(new Set());
                    invalidateLeads();
                  }}
                >
                  Bulk Lost
                </Button>
              </>
            )}
            <Button size="sm" variant="outline" onClick={() => exportRows("csv")} className="h-8 text-xs" disabled={!isAdmin}>CSV</Button>
            <Button size="sm" variant="outline" onClick={() => exportRows("xlsx")} className="h-8 text-xs" disabled={!isAdmin}>XLSX</Button>
            <Button size="sm" variant="outline" onClick={() => exportRows("pdf")} className="h-8 text-xs" disabled={!isAdmin}>PDF</Button>
            <Button size="sm" variant="outline" onClick={() => exportRows("json")} className="h-8 text-xs" disabled={!isAdmin}>JSON</Button>
          </div>
        </div>
      )}

      {/* ── Data Table ─────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="overflow-auto max-h-[60vh]">
          <table className="w-full text-xs">
            <thead className="bg-muted/40 sticky top-0">
              <tr className="text-left">
                <th className="p-2 w-8">
                  <input
                    type="checkbox"
                    checked={selected.size === filtered.length && filtered.length > 0}
                    onChange={(e) =>
                      setSelected(e.target.checked ? new Set(filtered.map((r) => r.lead.id || r.lead._id)) : new Set())
                    }
                  />
                </th>
                <th className="p-2">Name</th>
                <th className="p-2">Stage</th>
                <th className="p-2">Age</th>
                <th className="p-2">Created</th>
                <th className="p-2">TCM</th>
                <th className="p-2">Area</th>
                <th className="p-2 text-right">Prob</th>
                <th className="p-2 text-right">Exp ₹</th>
                <th className="p-2">Status</th>
                <th className="p-2">Why open</th>
                <th className="p-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const aging = getAgingColor(r.currentStageAgeDays ?? 0, r.isStuck ?? false);
                const isFlagged = r.intervention?.isFlagged;
                return (
                  <tr key={r.lead.id || r.lead._id} className={`border-t border-border hover:bg-muted/30 ${isFlagged ? "bg-amber-500/5" : ""}`}>
                    <td className="p-2">
                      <input type="checkbox" checked={selected.has(r.lead.id || r.lead._id)} onChange={() => toggle(r.lead.id || r.lead._id)} />
                    </td>
                    <td className="p-2">
                      <div className="flex items-center gap-1.5">
                        {isFlagged && <span title={`Flagged: ${r.intervention?.category}`}>🚩</span>}
                        <div>
                          <button onClick={() => setDrawer(r)} className="font-medium hover:underline text-left">
                            {r.lead.name}
                          </button>
                          <div className="text-[10px] text-muted-foreground font-mono">{r.lead.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="p-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">{r.lead.stage}</span>
                    </td>
                    <td className="p-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${aging.bg} ${aging.text}`} title={`${r.currentStageAgeDays ?? 0}d in ${r.lead.stage} · ${aging.label}`}>
                        {r.currentStageAgeDays ?? 0}d
                      </span>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <div className="text-[11px]">{fmtTourScheduleLabel(r.lead.createdAt)}</div>
                      <div className="text-[10px] text-muted-foreground">{r.lead.createdBy || "system"}</div>
                    </td>
                    <td className="p-2">{r.tcm?.name ?? "—"}</td>
                    <td className="p-2 truncate max-w-[120px]">{r.lead.preferredArea}</td>
                    <td className="p-2 text-right font-mono text-accent">{r.probability}%</td>
                    <td className="p-2 text-right font-mono">₹{((r.expectedValue || 0) / 1000).toFixed(0)}k</td>
                    <td className="p-2 text-[10px]">{r.status}</td>
                    <td className="p-2 text-[10px] text-muted-foreground truncate max-w-[180px]">{r.whyNotClosed}</td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                          onClick={() => forceCloseLead(r.lead.id || r.lead._id, "won", r.lead.budget)}
                        >Won</Button>
                        <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                          onClick={() => forceCloseLead(r.lead.id || r.lead._id, "lost", "admin force-close")}
                        >Lost</Button>
                        {isFlagged ? (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px] text-amber-500"
                            onClick={() => handleResolve(r.lead.id || r.lead._id)}
                          >Resolve</Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="h-6 text-[10px]"
                            onClick={() => setShowFlagModal(r.lead.id || r.lead._id)}
                          >Flag</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!filtered.length && (
                <tr>
                  <td colSpan={12} className="p-6 text-center text-muted-foreground">
                    No leads match filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Intervention Flag Modal ────────────────────────────────────────── */}
      {showFlagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-xl p-5 w-full max-w-md space-y-4 shadow-xl">
            <div className="font-semibold text-sm">Flag Lead for Intervention</div>
            <p className="text-xs text-muted-foreground">Select a category and add a note describing why this lead requires manual admin intervention.</p>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground block mb-1">Category</label>
              <Select value={flagCategory} onValueChange={(v) => setFlagCategory(v as InterventionCategory)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {INTERVENTION_CATEGORIES.map(c => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground block mb-1">Note</label>
              <textarea
                value={flagNote}
                onChange={(e) => setFlagNote(e.target.value)}
                className="w-full h-20 rounded-md border border-border bg-card p-2 text-xs resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                placeholder="Describe the issue…"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="outline" onClick={() => { setShowFlagModal(null); setFlagNote(""); setFlagCategory("other"); }}>Cancel</Button>
              <Button size="sm" onClick={handleFlag} disabled={!flagNote.trim()}>Flag Lead</Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Lead Drawer ────────────────────────────────────────────────────── */}
      {drawer && <LeadDrawer row={drawer} tcms={tcms} onClose={() => setDrawer(null)} onResolve={handleResolve} invalidateLeads={invalidateLeads} />}
    </div>
  );
}

// ── KPI Card Component ───────────────────────────────────────────────────────
function KpiCard({ label, value, accent, sub }: { label: string; value: React.ReactNode; accent: string; sub: string }) {
  return (
    <div className="rounded-xl border border-border bg-card/60 p-3">
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
      <div className={`text-xl font-semibold ${accent}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>
    </div>
  );
}

// ── Lead Drawer ──────────────────────────────────────────────────────────────
function LeadDrawer({ row, tcms, onClose, onResolve, invalidateLeads }: {
  row: AdminLeadRow;
  tcms: any[];
  onClose: () => void;
  onResolve: (leadId: string) => void;
  invalidateLeads: () => void;
}) {
  const aging = getAgingColor(row.currentStageAgeDays ?? 0, row.isStuck ?? false);

  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-full max-w-md bg-background border-l border-border overflow-auto p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-display font-semibold flex items-center gap-2">
              {row.intervention?.isFlagged && <span title="Flagged">🚩</span>}
              {row.lead.name}
            </div>
            <div className="text-[11px] text-muted-foreground font-mono">{row.lead.phone}</div>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <Stat k="Stage" v={row.lead.stage} />
          <Stat k="Stage Age" v={
            <span className={`${aging.text}`}>{row.currentStageAgeDays ?? 0}d · {aging.label}</span>
          } />
          <Stat k="Probability" v={`${row.probability}%`} />
          <Stat k="Status" v={row.status} />
          <Stat k="Expected ₹" v={`₹${(row.expectedValue || 0).toLocaleString("en-IN")}`} />
          <Stat k="TCM" v={row.tcm?.name ?? "—"} />
          <Stat k="Area" v={row.lead.preferredArea} />
          <Stat k="Budget" v={`₹${(row.lead.budget || 0).toLocaleString("en-IN")}`} />
        </div>

        <div className="rounded-md border border-border p-2 bg-muted/30 text-xs">
          <div className="text-[10px] uppercase text-muted-foreground">Why open</div>
          <div>{row.whyNotClosed}</div>
        </div>

        {/* ── Intervention Status ─────────────────────────────────────────── */}
        {row.intervention?.isFlagged && (
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
            <div className="flex items-center justify-between">
              <div className="text-[10px] uppercase text-amber-600 font-medium">🚩 Intervention Active</div>
              <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => onResolve(row.lead.id || row.lead._id)}>
                Resolve
              </Button>
            </div>
            <div><span className="text-muted-foreground">Category:</span> {row.intervention.category}</div>
            <div><span className="text-muted-foreground">Note:</span> {row.intervention.note}</div>
            <div className="text-[10px] text-muted-foreground">Flagged {row.intervention.flaggedAt ? new Date(row.intervention.flaggedAt).toLocaleDateString("en-IN") : "—"}</div>
          </div>
        )}

        {tcms.length > 0 && (
          <div>
            <div className="text-[10px] uppercase text-muted-foreground mb-1">Reassign TCM</div>
            <Select onValueChange={(v) => { reassignLead(row.lead.id || row.lead._id, v); invalidateLeads(); }}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="Pick TCM…" />
              </SelectTrigger>
              <SelectContent>{tcms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.zones?.[0] ?? ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Button size="sm" variant="outline" onClick={() => { forceCloseLead(row.lead.id || row.lead._id, "won", row.lead.budget); invalidateLeads(); }}>
            Force Won
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { forceCloseLead(row.lead.id || row.lead._id, "lost", "admin"); invalidateLeads(); }}>
            Force Lost
          </Button>
        </div>
      </div>
    </div>
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
