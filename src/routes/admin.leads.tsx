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
import { Layers, Upload, Download, MoreHorizontal, Trophy, X, Bell, User, SearchX, AlertCircle, Phone, Copy, Check } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination"; // If real component available, but usually used with its subcomponents. Let's just use a simple styled div for pagination.

export const Route = createFileRoute("/admin/leads")({
  beforeLoad: () => {
    const role = useAuthUser.getState().user?.role;
    if (role !== "super_admin") throw redirect({ to: "/" });
  },
  component: AdminLeads,
});

const INTERVENTION_CATEGORIES = [
  { value: "pricing_dispute", label: "Pricing Dispute" },
  { value: "tcm_unresponsive", label: "TCM Unresponsive" },
  { value: "special_reqs", label: "Special Requirements" },
  { value: "bad_experience", label: "Bad Experience" },
  { value: "other", label: "Other" },
] as const;

type InterventionCategory = typeof INTERVENTION_CATEGORIES[number]["value"];

function getAgingColor(days: number, isStuck: boolean) {
  if (isStuck) return { bg: "bg-red-50 text-red-500 border-red-200", text: "text-red-500", label: "Stuck" };
  if (days >= 60) return { bg: "bg-red-50 text-red-500 border-red-200", text: "text-red-500", label: "Stale" };
  if (days >= 30) return { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "text-amber-700", label: "Aging" };
  return { bg: "bg-gray-100 text-gray-600 border-gray-200", text: "text-gray-600", label: "Fresh" };
}

function getStagePill(stage: string) {
  const map: Record<string, string> = {
    "new": "bg-blue-50 text-blue-600 border-blue-200",
    "contacted": "bg-purple-50 text-purple-600 border-purple-200",
    "tour-scheduled": "bg-amber-50 text-amber-700 border-amber-200",
    "tour-done": "bg-teal-50 text-teal-600 border-teal-200",
    "negotiation": "bg-orange-50 text-orange-600 border-orange-200",
    "booked": "bg-green-50 text-green-600 border-green-200",
    "dropped": "bg-red-50 text-red-500 border-red-200",
  };
  return map[stage] || "bg-gray-100 text-gray-600 border-gray-200";
}

function getStatusPill(status: string) {
  const map: Record<string, string> = {
    "open": "bg-green-50 text-green-700 border-green-200",
    "lost": "bg-red-50 text-red-600 border-red-200",
    "dormant": "bg-gray-100 text-gray-500 border-gray-200",
    "booked": "bg-emerald-50 text-emerald-700 border-emerald-200",
  };
  return map[status] || "bg-gray-100 text-gray-600 border-gray-200";
}

function AdminLeads() {
  const queryClient = useQueryClient();
  const rows = useAdminRows();
  const { data: adminData, isLoading } = useAdminLeads();
  const tcms = adminData?.tcms ?? [];
  const leads = useMemo(() => rows.map((r) => r.lead), [rows]);
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
  const [visibleCount, setVisibleCount] = useState(25);

  const sources = useMemo(() => Array.from(new Set(leads.map((l) => l.source))), [leads]);
  const addedByOptions = useMemo(() => Array.from(new Set(leads.map((l) => l.createdBy || "system"))).sort(), [leads]);
  
  const filtered = useMemo(() => {
    let result = applyFilters(rows, filters);
    if (filterFlagged) result = result.filter(r => r.intervention?.isFlagged);
    if (filterStuck) result = result.filter(r => r.isStuck);
    return result;
  }, [rows, filters, filterFlagged, filterStuck]);

  const todayLeads = useMemo(() => leads.filter((l) => isTodayIST(l.createdAt)), [leads]);

  const kpis = useMemo(() => {
    const activeInterventions = rows.filter((r) => r.intervention?.isFlagged).length;
    const stuckLeads = rows.filter((r) => r.isStuck).length;
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
    if (fmt === "csv") downloadCsv(`gharpayy-leads-${stamp}.csv`, data);
    else if (fmt === "json") downloadJson(`gharpayy-leads-${stamp}.json`, data);
    else if (fmt === "xlsx")
      downloadAdminWorkbook(`gharpayy-leads-${stamp}.xlsx`, filtered).catch(() => toast.error("XLSX export failed"));
    else if (fmt === "pdf")
      downloadAdminPdf(`gharpayy-leads-${stamp}.pdf`, filtered).catch(() => toast.error("PDF export failed"));
  };

  return (
    <TooltipProvider>
      <div className="space-y-4 pb-20">
        {/* ── Header ─────────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <h1 className="text-lg font-semibold text-gray-900">Master Lead Console</h1>
          <span className="bg-orange-50 text-orange-600 text-[10px] font-semibold px-2 py-0.5 rounded-full">
            {filtered.length} of {rows.length} leads · full control
          </span>
        </div>

        {/* ── KPI Cards ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            label="Active Interventions"
            value={kpis.activeInterventions}
            borderColor="border-amber-500"
            onClick={() => setFilterFlagged(!filterFlagged)}
          />
          <KpiCard
            label="Stuck Leads"
            value={kpis.stuckLeads}
            borderColor="border-red-500"
            onClick={() => setFilterStuck(!filterStuck)}
          />
          <KpiCard
            label="Expected Revenue"
            value={`₹${(kpis.totalExpectedRevenue / 100000).toFixed(1)}L`}
            borderColor="border-[#F97316]"
            onClick={() => {}}
          />
          <KpiCard
            label="Fresh Leads"
            value={kpis.freshLeads}
            borderColor="border-blue-500"
            onClick={() => {
              const cur = filters.dateAdded || [];
              const next = (cur.includes("today") ? cur.filter((v) => v !== "today") : [...cur, "today"]) as ("today" | "yesterday" | "this-week" | "this-month")[];
              setFilters({ ...filters, dateAdded: next });
            }}
          />
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <AdminFilterBar
          filters={filters}
          onChange={setFilters}
          tcms={tcms.map((t) => ({ ...t, zone: t.zones?.[0] || "" }))}
          sources={sources}
          addedByOptions={addedByOptions}
        />

        {/* ── Action Bar ─────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setFilterFlagged(!filterFlagged)}
            className={`text-xs font-mono font-semibold rounded-full px-3 py-1 transition-colors border cursor-pointer ${
              filterFlagged ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100"
            }`}
          >
            Flagged ({rows.filter(r => r.intervention?.isFlagged).length})
          </button>
          <button
            onClick={() => setFilterStuck(!filterStuck)}
            className={`text-xs font-mono font-semibold rounded-full px-3 py-1 transition-colors border cursor-pointer ${
              filterStuck ? "bg-red-100 text-red-800 border-red-300" : "bg-red-50 text-red-600 border-red-200 hover:bg-red-100"
            }`}
          >
            Stuck ({rows.filter(r => r.isStuck).length})
          </button>
          
          <div className="flex-1" />

          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowBulkPanel(!showBulkPanel)}
            className={`h-8 text-xs bg-background hover:bg-muted/50 ${showBulkPanel ? "bg-muted" : ""}`}
          >
            <Layers className="h-3.5 w-3.5 mr-1.5" /> Bulk Panel
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowImport(!showImport)}
            className={`h-8 text-xs bg-background hover:bg-muted/50 ${showImport ? "bg-muted" : ""}`}
          >
            <Upload className="h-3.5 w-3.5 mr-1.5" /> Import CSV/JSON
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportRows("xlsx")}
            className="h-8 text-xs bg-background hover:bg-muted/50"
            disabled={!isAdmin}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" /> Export
          </Button>
        </div>

        {/* ── Import Panel ───────────────────────────────────────────────────── */}
        {showImport && (
          <div className="rounded-xl border border-border bg-background p-4 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="text-sm font-semibold text-gray-900 mb-2">Bulk Lead Import</div>
            <BulkFileImport onImportComplete={() => { invalidateLeads(); toast.success("Import complete — refreshing…"); }} />
          </div>
        )}

        {/* ── Bulk Actions Panel ─────────────────────────────────────────────── */}
        {showBulkPanel && (
          <div className="rounded-xl border border-border bg-background p-3 flex items-center justify-between flex-wrap gap-2 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="text-xs text-muted-foreground font-medium">
              {selected.size > 0 ? <span className="text-primary font-semibold">{selected.size} selected</span> : "Select rows for bulk actions"}
            </div>
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
                    <SelectTrigger className="h-8 w-44 text-xs bg-background">
                      <SelectValue placeholder={isAdmin ? "Bulk reassign to…" : "Admin only"} />
                    </SelectTrigger>
                    <SelectContent>{tcms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs bg-background hover:bg-green-50 hover:text-green-700 hover:border-green-200"
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
                    className="h-8 text-xs bg-background hover:bg-red-50 hover:text-red-600 hover:border-red-200"
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
            </div>
          </div>
        )}

        {/* ── Data Table ─────────────────────────────────────────────────────── */}
        <div className="rounded-xl border border-border bg-background overflow-hidden shadow-sm">
          <div className="overflow-auto max-h-[60vh]">
            <table className="w-full text-xs">
              <thead className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
                <tr className="text-left text-gray-500 font-semibold uppercase tracking-wider text-[10px]">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={selected.size === filtered.length && filtered.length > 0}
                      onChange={(e) =>
                        setSelected(e.target.checked ? new Set(filtered.map((r) => r.lead.id || r.lead._id)) : new Set())
                      }
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                  </th>
                  <th className="p-3">Name</th>
                  <th className="p-3">Stage</th>
                  <th className="p-3">Age</th>
                  <th className="p-3">Created</th>
                  <th className="p-3">TCM</th>
                  <th className="p-3">Area</th>
                  <th className="p-3 text-right">Prob</th>
                  <th className="p-3 text-right">Exp ₹</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Why open</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i} className="min-h-[56px]">
                      <td className="p-3"><Skeleton className="h-4 w-4 rounded" /></td>
                      <td className="p-3 flex items-center gap-2"><Skeleton className="h-8 w-8 rounded-full" /><div className="space-y-1"><Skeleton className="h-3 w-24" /><Skeleton className="h-2 w-16" /></div></td>
                      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="p-3"><Skeleton className="h-5 w-12 rounded-full" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-20" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-16" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-24" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-12 ml-auto" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-16 ml-auto" /></td>
                      <td className="p-3"><Skeleton className="h-5 w-16 rounded-full" /></td>
                      <td className="p-3"><Skeleton className="h-3 w-28" /></td>
                      <td className="p-3 text-right"><Skeleton className="h-6 w-16 inline-block" /></td>
                    </tr>
                  ))
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={12} className="p-12 text-center text-muted-foreground bg-gray-50/50">
                      <SearchX className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                      <div className="text-sm text-gray-500 font-medium">No leads match your filters</div>
                      <Button variant="outline" size="sm" onClick={() => setFilters(defaultAdminFilters)} className="mt-3 bg-white">
                        Clear all filters
                      </Button>
                    </td>
                  </tr>
                ) : (
                  filtered.slice(0, visibleCount).map((r) => {
                    const aging = getAgingColor(r.currentStageAgeDays ?? 0, r.isStuck ?? false);
                    const isFlagged = r.intervention?.isFlagged;
                    const stagePill = getStagePill(r.lead.stage);
                    const statusPill = getStatusPill(r.status);
                    
                    const probValue = r.probability;
                    const probObj = probValue >= 70 ? { color: "bg-green-500", text: "text-green-600", label: "Hot" } : 
                                    probValue >= 30 ? { color: "bg-amber-500", text: "text-amber-600", label: "Warm" } : 
                                    { color: "bg-red-500", text: "text-gray-500", label: "Cold" };

                    return (
                      <tr 
                        key={r.lead.id || r.lead._id} 
                        className={`min-h-[56px] hover:bg-orange-50/20 transition-colors cursor-pointer ${isFlagged ? "bg-amber-50/30" : "bg-white"}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest("button, input, [role='menuitem']")) return;
                          setDrawer(r);
                        }}
                      >
                        <td className="p-3">
                          <input type="checkbox" className="rounded border-gray-300 text-primary focus:ring-primary" checked={selected.has(r.lead.id || r.lead._id)} onChange={() => toggle(r.lead.id || r.lead._id)} />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-2.5">
                            <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center flex-shrink-0">
                              <User className="w-4 h-4" />
                            </div>
                            <div>
                              <div className="font-semibold text-gray-900 leading-tight">
                                {r.lead.name}
                              </div>
                              <div className="text-[11px] text-gray-400 font-mono mt-0.5">{r.lead.phone}</div>
                            </div>
                          </div>
                        </td>
                        <td className="p-3">
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${stagePill}`}>{r.lead.stage}</span>
                        </td>
                        <td className="p-3">
                          <span className={`border rounded-full text-xs px-2 py-0.5 ${aging.bg}`} title={`${r.currentStageAgeDays ?? 0}d in ${r.lead.stage}`}>
                            {r.currentStageAgeDays ?? 0}d
                          </span>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="text-xs font-medium text-gray-700">{fmtTourScheduleLabel(r.lead.createdAt)}</div>
                        </td>
                        <td className="p-3 font-medium text-gray-700">{r.tcm?.name ?? "—"}</td>
                        <td className="p-3 max-w-[140px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate text-gray-700 cursor-help">{r.lead.preferredArea || "—"}</div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">{r.lead.preferredArea}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1.5">
                            <span className={`w-1.5 h-1.5 rounded-full ${probObj.color}`} />
                            <span className={`text-xs ${probObj.text}`}>{probObj.label}</span>
                          </div>
                        </td>
                        <td className="p-3 text-right font-mono text-gray-900 font-medium">₹{((r.expectedValue || 0) / 1000).toFixed(0)}k</td>
                        <td className="p-3">
                          <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusPill}`}>{r.status}</span>
                        </td>
                        <td className="p-3 max-w-[140px]">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="truncate text-[11px] text-gray-500 italic cursor-help">{r.whyNotClosed || "—"}</div>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p className="max-w-xs">{r.whyNotClosed}</p>
                            </TooltipContent>
                          </Tooltip>
                        </td>
                        <td className="p-3 text-right whitespace-nowrap">
                          <div className="flex items-center justify-end gap-1">
                            {r.status !== "booked" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-green-700 hover:bg-green-100 hover:text-green-800 rounded-md"
                                onClick={() => forceCloseLead(r.lead.id || r.lead._id, "won", r.lead.budget)}
                                title="Mark as Won"
                              >
                                <Trophy className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {r.status !== "lost" && (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:bg-red-100 hover:text-red-700 rounded-md"
                                onClick={() => forceCloseLead(r.lead.id || r.lead._id, "lost", "admin force-close")}
                                title="Mark as Lost"
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {isFlagged ? (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-amber-600 hover:bg-amber-100 rounded-md"
                                onClick={() => handleResolve(r.lead.id || r.lead._id)}
                                title="Resolve Intervention"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </Button>
                            ) : (
                              <Button size="icon" variant="ghost" className="h-7 w-7 text-blue-600 hover:bg-blue-100 rounded-md"
                                onClick={() => setShowFlagModal(r.lead.id || r.lead._id)}
                                title="Flag for Follow Up / Intervention"
                              >
                                <Bell className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button size="icon" variant="ghost" className="h-7 w-7 rounded-md text-gray-500 hover:text-gray-900">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => setDrawer(r)}>View Details</DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowFlagModal(r.lead.id || r.lead._id)}>Add Note / Flag</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-red-600 font-medium" onClick={() => forceCloseLead(r.lead.id || r.lead._id, "lost", "admin force-close")}>
                                  Mark as Dropped
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
            {filtered.length > visibleCount && (
              <div className="p-4 border-t border-gray-100 bg-white flex justify-center">
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="bg-white"
                  onClick={() => setVisibleCount(v => v + 25)}
                >
                  Load More ({filtered.length - visibleCount} remaining)
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* ── Selection Floating Action Bar ─────────────────────────────────────────────── */}
        {selected.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white rounded-xl shadow-xl px-4 py-3 flex items-center gap-4 animate-in slide-in-from-bottom-5">
            <div className="text-sm font-semibold">{selected.size} leads selected</div>
            <div className="h-4 w-px bg-gray-700" />
            <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-gray-800 hover:text-white" onClick={() => setShowBulkPanel(true)}>
              Bulk Actions
            </Button>
            <Button size="sm" variant="ghost" className="h-8 text-xs hover:bg-gray-800 hover:text-red-400 text-red-400" onClick={() => {
              if (!confirm(`Mark ${selected.size} leads as dropped?`)) return;
              [...selected].forEach((id) => forceCloseLead(id, "lost", "bulk admin close"));
              setSelected(new Set());
              invalidateLeads();
            }}>
              Mark Dropped
            </Button>
          </div>
        )}

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

        {/* ── Lead Detail Sheet ────────────────────────────────────────────────────── */}
        <Sheet open={!!drawer} onOpenChange={(open) => !open && setDrawer(null)}>
          <SheetContent className="w-full sm:max-w-md p-0 overflow-hidden flex flex-col">
            {drawer && <LeadSheetContent row={drawer} tcms={tcms} onResolve={handleResolve} invalidateLeads={invalidateLeads} onClose={() => setDrawer(null)} />}
          </SheetContent>
        </Sheet>
      </div>
    </TooltipProvider>
  );
}

// ── KPI Card Component ───────────────────────────────────────────────────────
function KpiCard({ label, value, borderColor, onClick }: { label: string; value: React.ReactNode; borderColor: string; onClick: () => void }) {
  return (
    <div 
      className={`rounded-xl border border-border bg-white p-4 shadow-sm border-l-4 ${borderColor} hover:bg-orange-50/30 transition-colors cursor-pointer`}
      onClick={onClick}
    >
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      <div className="text-3xl font-mono font-bold text-gray-900">{value}</div>
    </div>
  );
}

// ── Lead Detail Sheet Content ──────────────────────────────────────────────────────────────
function LeadSheetContent({ row, tcms, onResolve, invalidateLeads, onClose }: {
  row: AdminLeadRow;
  tcms: any[];
  onResolve: (leadId: string) => void;
  invalidateLeads: () => void;
  onClose: () => void;
}) {
  const aging = getAgingColor(row.currentStageAgeDays ?? 0, row.isStuck ?? false);
  const stagePill = getStagePill(row.lead.stage);
  const statusPill = getStatusPill(row.status);
  
  const probValue = row.probability;
  const probObj = probValue >= 70 ? { color: "bg-green-500", text: "text-green-600", label: "Hot" } : 
                  probValue >= 30 ? { color: "bg-amber-500", text: "text-amber-600", label: "Warm" } : 
                  { color: "bg-red-500", text: "text-gray-500", label: "Cold" };

  const [noteContent, setNoteContent] = useState("");

  const handleCopyPhone = () => {
    navigator.clipboard.writeText(row.lead.phone);
    toast.success("Phone copied to clipboard");
  };

  return (
    <div className="flex flex-col h-full bg-[#FAF8F5]">
      {/* Header */}
      <div className="bg-white p-6 border-b border-border space-y-3 shrink-0">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{row.lead.name}</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${stagePill}`}>{row.lead.stage}</span>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full border ${statusPill}`}>{row.status}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-sm font-mono text-gray-500 bg-gray-50 border border-gray-100 rounded-md px-3 py-1.5 w-fit hover:bg-gray-100 cursor-pointer transition-colors" onClick={handleCopyPhone}>
          <Phone className="h-3.5 w-3.5" />
          {row.lead.phone}
          <Copy className="h-3 w-3 opacity-50 ml-1" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="w-full grid grid-cols-3 mb-6 bg-gray-200/50 p-1 rounded-lg">
            <TabsTrigger value="overview" className="rounded-md text-xs">Overview</TabsTrigger>
            <TabsTrigger value="timeline" className="rounded-md text-xs">Timeline</TabsTrigger>
            <TabsTrigger value="actions" className="rounded-md text-xs">Actions</TabsTrigger>
          </TabsList>
          
          <TabsContent value="overview" className="space-y-6 mt-0">
            {/* Probability & Revenue */}
            <div className="flex items-center gap-4">
              <div className="flex-1 bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-center">
                <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider mb-2">Probability</div>
                <div className="flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${probObj.color}`} />
                  <span className="text-xl font-semibold">{probValue}%</span>
                </div>
              </div>
              <div className="flex-1 bg-white p-4 rounded-xl border border-border shadow-sm flex flex-col justify-center items-center">
                <div className="text-[10px] uppercase font-semibold text-gray-500 tracking-wider mb-2">Expected ₹</div>
                <div className="text-xl font-mono font-bold text-[#F97316]">₹{(row.expectedValue || 0).toLocaleString("en-IN")}</div>
              </div>
            </div>

            {/* Grid details */}
            <div className="grid grid-cols-2 gap-3">
              <DetailBox label="TCM Assigned" value={row.tcm?.name ?? "—"} />
              <DetailBox label="Preferred Area" value={row.lead.preferredArea || "—"} />
              <DetailBox label="Created" value={fmtTourScheduleLabel(row.lead.createdAt)} />
              <DetailBox label="Stage Age" value={<span className={aging.text}>{row.currentStageAgeDays ?? 0}d ({aging.label})</span>} />
              <DetailBox label="Source" value={row.lead.source || "—"} />
              <DetailBox label="Budget" value={`₹${(row.lead.budget || 0).toLocaleString("en-IN")}`} />
            </div>

            {/* Why Not Closed Note */}
            <div className="bg-white rounded-xl border border-border p-4 shadow-sm">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-gray-500 mb-2">Current Context / Why Open</div>
              <p className="text-sm text-gray-700 italic leading-relaxed">{row.whyNotClosed || "No context provided."}</p>
            </div>
            
            {row.intervention?.isFlagged && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2 text-amber-700 font-semibold text-sm">
                    <AlertCircle className="w-4 h-4" /> Active Intervention
                  </div>
                  <Button size="sm" variant="outline" className="h-7 text-xs bg-white text-amber-700 border-amber-300 hover:bg-amber-100" onClick={() => onResolve(row.lead.id || row.lead._id)}>
                    Resolve
                  </Button>
                </div>
                <div className="text-xs text-amber-900 mb-1"><span className="font-semibold">Category:</span> {row.intervention.category}</div>
                <div className="text-xs text-amber-900"><span className="font-semibold">Note:</span> {row.intervention.note}</div>
              </div>
            )}
          </TabsContent>
          
          <TabsContent value="timeline" className="mt-0">
            <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
              <div className="text-sm text-gray-500 italic text-center py-8">
                Timeline visualization coming soon.<br/>
                (Entity events will be mapped here)
              </div>
            </div>
          </TabsContent>
          
          <TabsContent value="actions" className="mt-0 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <Button className="w-full bg-green-50 text-green-700 border-green-200 hover:bg-green-100 border shadow-sm" onClick={() => { forceCloseLead(row.lead.id || row.lead._id, "won", row.lead.budget); invalidateLeads(); onClose(); }}>
                <Trophy className="w-4 h-4 mr-2" /> Mark Won
              </Button>
              <Button className="w-full bg-red-50 text-red-600 border-red-200 hover:bg-red-100 border shadow-sm" onClick={() => { forceCloseLead(row.lead.id || row.lead._id, "lost", "admin force-close"); invalidateLeads(); onClose(); }}>
                <X className="w-4 h-4 mr-2" /> Mark Lost
              </Button>
            </div>

            <div className="bg-white rounded-xl border border-border p-4 shadow-sm space-y-4">
              <div>
                <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1.5 block">Reassign TCM</label>
                <Select onValueChange={(v) => { reassignLead(row.lead.id || row.lead._id, v); invalidateLeads(); }}>
                  <SelectTrigger className="w-full text-sm">
                    <SelectValue placeholder="Select a new TCM..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tcms.map((t) => <SelectItem key={t.id} value={t.id}>{t.name} · {t.zones?.[0] ?? ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-[10px] uppercase font-semibold text-gray-500 mb-1.5 block">Add Note</label>
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full h-24 rounded-md border border-input bg-background p-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                  placeholder="Type a new internal note..."
                />
                <Button size="sm" className="w-full mt-2" disabled={!noteContent.trim()}>Submit Note</Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function DetailBox({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-border p-3 shadow-sm">
      <div className="text-[10px] uppercase tracking-widest font-semibold text-gray-500 mb-1">{label}</div>
      <div className="text-sm font-medium text-gray-900 truncate">{value}</div>
    </div>
  );
}
