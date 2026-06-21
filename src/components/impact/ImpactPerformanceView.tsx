import { useState, useMemo } from "react";
import type { Lead, Tour, ActivityLog, FollowUp, TCM } from "@/lib/types";
import {
  buildEnrichedPerformanceLeads,
  buildQueueHealthSnapshot,
  buildWorkflowSLA,
  buildTodaysFocus,
  buildTopAtRiskLeads,
  buildWorkflowHealth,
  buildStageAging,
  buildPipelineLeakage,
  buildConversionVelocity,
  buildTourPerformance,
  buildTCMLeaderboard,
  buildLeadOwnershipRisk,
  MetricDrilldown
} from "@/lib/crm10x/performance-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { QueueFilters } from "./ImpactQueueHeaderControls";
import { formatDistanceToNow, format } from "date-fns";
import { AlertCircle, PhoneCall, UserPlus, ArrowRight, Activity, Clock, Users, Building, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface Props {
  leads: Lead[];
  tours: Tour[];
  quotes: any[];
  activities: ActivityLog[];
  followUps: FollowUp[];
  tcms: TCM[];
  tcmOptions: TCM[];
}

export function ImpactPerformanceView({ leads, tours, quotes, activities, followUps, tcms, tcmOptions }: Props) {
  // Manager Filters
  const [dateRange, setDateRange] = useState("all");
  const [assignedTcm, setAssignedTcm] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");
  const [zoneFilter, setZoneFilter] = useState("all");

  const selectLead = useApp(s => s.selectLead);

  // Drilldown state
  const [drilldown, setDrilldown] = useState<{ label: string; leadIds: string[]; filterPayload: Partial<QueueFilters> } | null>(null);

  const zones = useMemo(() => Array.from(new Set(tcmOptions.map(t => t.zone).filter(Boolean))), [tcmOptions]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (assignedTcm !== "all" && l.assignedTcmId !== assignedTcm) return false;
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (zoneFilter !== "all" && l.zoneCategory !== zoneFilter) return false;
      // Date range omitted for brevity, but would filter by createdAt or stageEnteredAt
      return true;
    });
  }, [leads, assignedTcm, stageFilter, zoneFilter]);

  const enriched = useMemo(() => buildEnrichedPerformanceLeads(filteredLeads, tours, quotes, activities, followUps), [filteredLeads, tours, quotes, activities, followUps]);

  const snapshot = useMemo(() => buildQueueHealthSnapshot(enriched), [enriched]);
  const slas = useMemo(() => buildWorkflowSLA(enriched), [enriched]);
  const focus = useMemo(() => buildTodaysFocus(enriched), [enriched]);
  const atRisk = useMemo(() => buildTopAtRiskLeads(enriched), [enriched]);
  const health = useMemo(() => buildWorkflowHealth(enriched), [enriched]);
  const aging = useMemo(() => buildStageAging(enriched), [enriched]);
  const leakage = useMemo(() => buildPipelineLeakage(enriched), [enriched]);
  const velocity = useMemo(() => buildConversionVelocity(enriched), [enriched]);
  const tourPerf = useMemo(() => buildTourPerformance(enriched, tours), [enriched, tours]);
  const leaderboard = useMemo(() => buildTCMLeaderboard(enriched, tcms), [enriched, tcms]);
  const ownershipRisk = useMemo(() => buildLeadOwnershipRisk(enriched), [enriched]);

  const handleDrilldown = (metric: MetricDrilldown) => {
    if (metric.count === 0) return;
    setDrilldown({ label: metric.label, leadIds: metric.leadIds, filterPayload: metric.filterPayload });
  };

  const handleOpenInBoard = () => {
    if (!drilldown) return;
    // Here we would ideally set the ImpactQueue filters.
    // For V1, the user requested it to just log or simulate navigating.
    // Assuming ImpactQueue is handling state via global store or we can trigger it.
    // Since ImpactQueue state is local to ImpactQueue, we might just toast for now or
    // dispatch an event. In a full implementation, QueueFilters state would be lifted.
    alert(`Opening Board with filter: ${JSON.stringify(drilldown.filterPayload)}`);
    setDrilldown(null);
  };

  const MetricCard = ({ metric, icon: Icon, colorClass }: { metric: MetricDrilldown, icon?: any, colorClass?: string }) => (
    <div 
      onClick={() => handleDrilldown(metric)}
      className={`rounded-xl border border-border bg-card p-4 hover:border-accent/50 hover:shadow-sm cursor-pointer transition-all ${metric.count > 0 ? '' : 'opacity-60'}`}
    >
      <div className="flex justify-between items-start mb-2">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{metric.label}</span>
        {Icon && <Icon className={`h-4 w-4 ${colorClass || 'text-muted-foreground'}`} />}
      </div>
      <div className={`text-3xl font-bold ${colorClass || 'text-foreground'}`}>{metric.count}</div>
    </div>
  );

  return (
    <div className="space-y-6 pb-20">
      {/* Manager Filters */}
      <div className="flex flex-wrap gap-3 bg-muted/20 p-3 rounded-lg border border-border">
        <select className="h-8 rounded-md border border-border bg-background px-3 text-xs" value={dateRange} onChange={e => setDateRange(e.target.value)}>
          <option value="all">All Time</option>
          <option value="this-month">This Month</option>
          <option value="this-week">This Week</option>
        </select>
        <select className="h-8 rounded-md border border-border bg-background px-3 text-xs" value={assignedTcm} onChange={e => setAssignedTcm(e.target.value)}>
          <option value="all">All Members</option>
          {tcms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="h-8 rounded-md border border-border bg-background px-3 text-xs" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All Stages</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="tour-done">Tour Done</option>
          <option value="negotiation">Negotiation</option>
        </select>
        {zones.length > 0 && (
          <select className="h-8 rounded-md border border-border bg-background px-3 text-xs" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z as string} value={z as string}>{z as string}</option>)}
          </select>
        )}
      </div>

      {/* 1. Queue Health Snapshot */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Activity className="h-4 w-4 text-accent" /> Queue Health Snapshot</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 mb-3">
          {snapshot.metrics.map(m => <MetricCard key={m.label} metric={m} />)}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {snapshot.bottlenecks.map(m => <MetricCard key={m.label} metric={m} colorClass="text-danger" />)}
        </div>
      </section>

      {/* 2. Workflow SLA */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-warning" /> Workflow SLA Violations</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {slas.map(m => <MetricCard key={m.label} metric={m} colorClass={m.count > 0 ? "text-warning" : "text-success"} />)}
        </div>
      </section>

      {/* 3. Today's Focus */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><AlertCircle className="h-4 w-4 text-accent" /> Today's Focus</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {focus.map(m => <MetricCard key={m.label} metric={m} colorClass={m.count > 0 ? "text-accent" : ""} />)}
        </div>
      </section>

      {/* 4. Top 20 At-Risk Leads */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-danger" /> Top 20 At-Risk Leads</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-semibold text-muted-foreground">Lead</th>
                <th className="p-3 font-semibold text-muted-foreground">Issue</th>
                <th className="p-3 font-semibold text-muted-foreground">Move In</th>
                <th className="p-3 font-semibold text-muted-foreground">Owner</th>
                <th className="p-3 font-semibold text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map(r => (
                <tr key={r.lead.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                  <td className="p-3 font-medium text-foreground">{r.lead.name}</td>
                  <td className="p-3 text-danger font-semibold">{r.issue}</td>
                  <td className="p-3 text-muted-foreground">{r.moveInDays !== null ? `${r.moveInDays} days` : 'Missing'}</td>
                  <td className="p-3 text-muted-foreground">{tcms.find(t => t.id === r.ownerId)?.name || 'Unassigned'}</td>
                  <td className="p-3 text-right space-x-2">
                    <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => selectLead(r.lead.id, "impact", "none", "none")}>Open Lead</Button>
                  </td>
                </tr>
              ))}
              {atRisk.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-6 text-center text-muted-foreground">No at-risk leads found!</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Workflow Health */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3">Workflow Health Gaps</h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {health.map(m => <MetricCard key={m.label} metric={m} />)}
        </div>
      </section>

      {/* 6. Stage Aging */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3">Stage Aging</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-semibold text-muted-foreground">Stage</th>
                <th className="p-3 font-semibold text-muted-foreground">Total</th>
                <th className="p-3 font-semibold text-muted-foreground">0-1 Day</th>
                <th className="p-3 font-semibold text-muted-foreground">2-3 Days</th>
                <th className="p-3 font-semibold text-muted-foreground">4-7 Days</th>
                <th className="p-3 font-semibold text-muted-foreground">7+ Days</th>
              </tr>
            </thead>
            <tbody>
              {aging.map(row => (
                <tr key={row.stage} className="border-b border-border hover:bg-muted/10">
                  <td className="p-3 font-medium text-foreground">{row.stage}</td>
                  <td className="p-3 font-bold">{row.total}</td>
                  <td className="p-3 text-success cursor-pointer hover:underline" onClick={() => handleDrilldown(row.day0_1)}>{row.day0_1.count}</td>
                  <td className="p-3 cursor-pointer hover:underline" onClick={() => handleDrilldown(row.day2_3)}>{row.day2_3.count}</td>
                  <td className="p-3 text-warning cursor-pointer hover:underline" onClick={() => handleDrilldown(row.day4_7)}>{row.day4_7.count}</td>
                  <td className="p-3 text-danger font-bold cursor-pointer hover:underline" onClick={() => handleDrilldown(row.day7plus)}>{row.day7plus.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 7. Pipeline Leakage & Conversion Velocity */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <section>
          <h2 className="text-sm font-bold text-foreground mb-3">Pipeline Leakage</h2>
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <table className="w-full text-left text-xs">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="p-3 font-semibold text-muted-foreground">Stage</th>
                  <th className="p-3 font-semibold text-muted-foreground">Count</th>
                  <th className="p-3 font-semibold text-muted-foreground">Avg Days Stuck</th>
                </tr>
              </thead>
              <tbody>
                {leakage.map(l => (
                  <tr key={l.stage} className="border-b border-border hover:bg-muted/10">
                    <td className="p-3 font-medium text-foreground">{l.stage}</td>
                    <td className="p-3 cursor-pointer hover:underline" onClick={() => handleDrilldown(l.countAndDrill)}>{l.countAndDrill.count}</td>
                    <td className={`p-3 font-semibold ${l.avgDaysStuck > 5 ? 'text-danger' : ''}`}>{l.avgDaysStuck}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><ArrowRight className="h-4 w-4 text-success" /> Conversion Velocity</h2>
          <div className="grid grid-cols-3 gap-3 h-[calc(100%-2rem)]">
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Lead → Tour</span>
              <span className="text-3xl font-bold text-foreground">{velocity.leadToTour} <span className="text-sm font-normal text-muted-foreground">days</span></span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Tour → Quote</span>
              <span className="text-3xl font-bold text-foreground">{velocity.tourToQuote} <span className="text-sm font-normal text-muted-foreground">days</span></span>
            </div>
            <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
              <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Quote → Book</span>
              <span className="text-3xl font-bold text-success">{velocity.quoteToBook} <span className="text-sm font-normal text-muted-foreground">days</span></span>
            </div>
          </div>
        </section>
      </div>

      {/* 9. Tour Performance */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Building className="h-4 w-4 text-muted-foreground" /> Tour Performance</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {tourPerf.map(m => <MetricCard key={m.label} metric={m} colorClass={m.label === 'Feedback Missing' ? 'text-danger' : ''} />)}
        </div>
      </section>

      {/* 10. TCM Leaderboard */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> TCM Leaderboard</h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-semibold text-muted-foreground">TCM</th>
                <th className="p-3 font-semibold text-muted-foreground">Leads</th>
                <th className="p-3 font-semibold text-muted-foreground">Tours</th>
                <th className="p-3 font-semibold text-muted-foreground">Quotes</th>
                <th className="p-3 font-semibold text-muted-foreground">Bookings</th>
                <th className="p-3 font-semibold text-muted-foreground bg-accent/10">L → T %</th>
                <th className="p-3 font-semibold text-muted-foreground bg-accent/10">T → Q %</th>
                <th className="p-3 font-semibold text-muted-foreground bg-success/10 text-success">Q → B %</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(r => (
                <tr key={r.tcm.id} className="border-b border-border hover:bg-muted/10">
                  <td className="p-3 font-medium text-foreground">{r.tcm.name}</td>
                  <td className="p-3">{r.leads}</td>
                  <td className="p-3">{r.tours}</td>
                  <td className="p-3">{r.quotes}</td>
                  <td className="p-3 font-bold text-success">{r.bookings}</td>
                  <td className="p-3 font-semibold bg-accent/5">{r.leadToTour}%</td>
                  <td className="p-3 font-semibold bg-accent/5">{r.tourToQuote}%</td>
                  <td className="p-3 font-bold text-success bg-success/5">{r.quoteToBook}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 11. Lead Ownership Risk */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><UserPlus className="h-4 w-4 text-warning" /> Lead Ownership Risk</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {ownershipRisk.map(m => <MetricCard key={m.label} metric={m} colorClass="text-warning" />)}
        </div>
      </section>

      {/* Drilldown Modal */}
      <Dialog open={!!drilldown} onOpenChange={o => !o && setDrilldown(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b border-border">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {drilldown?.label}
                <Badge variant="secondary" className="text-xs">{drilldown?.leadIds.length} leads</Badge>
              </span>
              <Button size="sm" onClick={handleOpenInBoard} className="h-8 gap-1.5 text-xs">
                Open in Board <ArrowRight className="h-3 w-3" />
              </Button>
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto p-4 flex-1">
            <div className="space-y-2">
              {drilldown?.leadIds.map(id => {
                const l = leads.find(x => x.id === id);
                if (!l) return null;
                return (
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30">
                    <div>
                      <div className="font-semibold text-sm">{l.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                        <span>{l.phone}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(l.stageEnteredAt || l.updatedAt))} stuck</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-24 truncate">{tcms.find(t => t.id === l.assignedTcmId)?.name || 'Unassigned'}</div>
                      <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => selectLead(l.id, "impact", "none", "none")}>Open</Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
