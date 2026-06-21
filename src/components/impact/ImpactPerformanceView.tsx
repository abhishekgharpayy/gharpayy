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
  buildPipelineHealth,
  buildTourPerformance,
  buildTCMLeaderboard,
  buildLeadOwnershipRisk,
  buildConversionOpportunitiesToday,
  buildBusinessImpact,
  MetricDrilldown
} from "@/lib/crm10x/performance-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { QueueFilters } from "./ImpactQueueHeaderControls";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, PhoneCall, UserPlus, ArrowRight, Activity, Clock, Users, Building, ShieldAlert, Target, Search, X, CheckCircle, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

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
  const [searchQuery, setSearchQuery] = useState("");

  const selectLead = useApp(s => s.selectLead);

  // Drilldown state
  const [drilldown, setDrilldown] = useState<{ label: string; leadIds: string[]; filterPayload: Partial<QueueFilters> } | null>(null);

  const zones = useMemo(() => Array.from(new Set(tcmOptions.map(t => t.zone).filter(Boolean))), [tcmOptions]);

  const filteredLeads = useMemo(() => {
    return leads.filter(l => {
      if (assignedTcm !== "all" && l.assignedTcmId !== assignedTcm) return false;
      if (stageFilter !== "all" && l.stage !== stageFilter) return false;
      if (zoneFilter !== "all" && l.zoneCategory !== zoneFilter) return false;
      
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const tcmName = tcms.find(t => t.id === l.assignedTcmId)?.name?.toLowerCase() || "";
        if (!l.name.toLowerCase().includes(q) && 
            !l.phone.includes(q) && 
            !(l as any).propertyName?.toLowerCase().includes(q) &&
            !tcmName.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [leads, assignedTcm, stageFilter, zoneFilter, searchQuery, tcms]);

  const enriched = useMemo(() => buildEnrichedPerformanceLeads(filteredLeads, tours, quotes, activities, followUps), [filteredLeads, tours, quotes, activities, followUps]);

  const oppsToday = useMemo(() => buildConversionOpportunitiesToday(enriched), [enriched]);
  const businessImpact = useMemo(() => buildBusinessImpact(enriched), [enriched]);
  const snapshot = useMemo(() => buildQueueHealthSnapshot(enriched), [enriched]);
  const slas = useMemo(() => buildWorkflowSLA(enriched), [enriched]);
  const focus = useMemo(() => buildTodaysFocus(enriched), [enriched]);
  const atRisk = useMemo(() => buildTopAtRiskLeads(enriched), [enriched]);
  const health = useMemo(() => buildWorkflowHealth(enriched), [enriched]);
  const pipelineHealth = useMemo(() => buildPipelineHealth(enriched), [enriched]);
  const leaderboard = useMemo(() => buildTCMLeaderboard(enriched, tcms), [enriched, tcms]);
  const ownershipRisk = useMemo(() => buildLeadOwnershipRisk(enriched), [enriched]);

  const handleDrilldown = (metric: MetricDrilldown) => {
    if (metric.count === 0) return;
    setDrilldown({ label: metric.label, leadIds: metric.leadIds, filterPayload: metric.filterPayload });
  };

  const resetFilters = () => {
    setDateRange("all");
    setAssignedTcm("all");
    setStageFilter("all");
    setZoneFilter("all");
    setSearchQuery("");
  };

  const handleOpenInBoard = () => {
    if (!drilldown) return;
    // Dispatches to board
    alert(`Opening Board with filter: ${JSON.stringify(drilldown.filterPayload)}`);
    setDrilldown(null);
  };

  const MetricCard = ({ metric, icon: Icon, colorClass, target, subtitle }: { metric: MetricDrilldown, icon?: any, colorClass?: string, target?: number, subtitle?: string }) => {
    const isFailingTarget = target !== undefined && metric.count > target;
    const finalColor = isFailingTarget ? "text-danger" : colorClass || "text-foreground";
    const bgHover = isFailingTarget ? "hover:border-danger/50 border-danger/20" : "hover:border-accent/50";
    
    return (
      <div 
        onClick={() => handleDrilldown(metric)}
        className={`rounded-xl border border-border bg-card p-3 ${bgHover} hover:shadow-sm cursor-pointer transition-all ${metric.count > 0 ? '' : 'opacity-60'}`}
      >
        <div className="flex justify-between items-start mb-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider truncate mr-2" title={metric.label}>{metric.label}</span>
          {Icon && <Icon className={`h-3 w-3 flex-shrink-0 ${finalColor}`} />}
        </div>
        <div className="flex items-end gap-2">
          <div className={`text-2xl font-bold ${finalColor}`}>{metric.count}</div>
          {target !== undefined && (
            <div className={`text-xs pb-1 font-medium ${isFailingTarget ? 'text-danger' : 'text-success'}`}>
              / Target &lt; {target}
            </div>
          )}
        </div>
        {subtitle && <div className="text-[10px] text-muted-foreground mt-1 line-clamp-1">{subtitle}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20">
      {/* Manager Filters (Sticky Toolbar) */}
      <div className="sticky top-0 z-10 flex flex-wrap gap-2 bg-background/95 backdrop-blur p-2 rounded-lg border border-border shadow-sm">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search leads, phone, property, TCM..." 
            className="h-9 pl-9 text-xs" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <select className="h-9 rounded-md border border-border bg-background px-3 text-xs" value={dateRange} onChange={e => setDateRange(e.target.value)}>
          <option value="all">All Time</option>
          <option value="this-month">This Month</option>
          <option value="this-week">This Week</option>
        </select>
        <select className="h-9 rounded-md border border-border bg-background px-3 text-xs" value={assignedTcm} onChange={e => setAssignedTcm(e.target.value)}>
          <option value="all">All Members</option>
          {tcms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select className="h-9 rounded-md border border-border bg-background px-3 text-xs" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">All Stages</option>
          <option value="new">New</option>
          <option value="contacted">Contacted</option>
          <option value="tour-done">Tour Done</option>
          <option value="negotiation">Negotiation</option>
        </select>
        {zones.length > 0 && (
          <select className="h-9 rounded-md border border-border bg-background px-3 text-xs" value={zoneFilter} onChange={e => setZoneFilter(e.target.value)}>
            <option value="all">All Zones</option>
            {zones.map(z => <option key={z as string} value={z as string}>{z as string}</option>)}
          </select>
        )}
        <Button variant="ghost" size="sm" className="h-9 text-xs px-3" onClick={resetFilters}>
          <X className="h-3 w-3 mr-1" /> Reset
        </Button>
      </div>

      {/* Section 0: Conversion Opportunities Today */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-success" /> Conversion Opportunities Today
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {oppsToday.map(m => <MetricCard key={m.label} metric={m} colorClass="text-success" />)}
        </div>
      </section>

      {/* Section 1: Business Impact */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-accent" /> Business Impact
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {businessImpact.map(m => <MetricCard key={m.label} metric={m} colorClass="text-accent" />)}
        </div>
      </section>

      {/* Section 2: Executive Summary */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" /> Executive Summary
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          {snapshot.metrics.map(m => <MetricCard key={m.label} metric={m} />)}
        </div>
      </section>

      {/* Section 3: Action Required Today */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Clock className="h-4 w-4 text-danger" /> Action Required Today
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <MetricCard metric={slas.find(m => m.label.includes('Tour Feedback')) || slas[3]} colorClass="text-danger" target={2} subtitle="Requires post-tour outcome" />
          <MetricCard metric={slas.find(m => m.label.includes('Quote Pending')) || slas[4]} colorClass="text-danger" target={5} subtitle="Waiting for pricing" />
          <MetricCard metric={slas.find(m => m.label.includes('No Activity > 48h')) || slas[1]} colorClass="text-danger" target={10} subtitle="Leads stalling in pipeline" />
          <MetricCard metric={ownershipRisk[0]} colorClass="text-danger" target={0} subtitle="Leads with no owner assigned" />
          <MetricCard metric={focus.find(m => m.label.includes('Move-In')) || focus[4]} colorClass="text-warning" subtitle="Urgent move-in timeframe" />
        </div>
      </section>

      {/* Section 4: Workflow Bottlenecks */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3">Workflow Bottlenecks</h2>
        <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
          {health.slice(0, 7).map(m => <MetricCard key={m.label} metric={m} />)}
        </div>
      </section>

      {/* Section 5: Pipeline Health (Merged) */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3">Pipeline Health</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Lead → Tour</span>
            <span className="text-3xl font-bold text-foreground">{pipelineHealth.velocity.leadToTour} <span className="text-sm font-normal text-muted-foreground">days</span></span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Tour → Quote</span>
            <span className="text-3xl font-bold text-foreground">{pipelineHealth.velocity.tourToQuote} <span className="text-sm font-normal text-muted-foreground">days</span></span>
          </div>
          <div className="rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center">
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Quote → Book</span>
            <span className="text-3xl font-bold text-success">{pipelineHealth.velocity.quoteToBook} <span className="text-sm font-normal text-muted-foreground">days</span></span>
          </div>
          <div 
            className={`rounded-xl border border-border bg-card p-4 flex flex-col justify-center items-center text-center transition-all ${pipelineHealth.biggestBottleneck.count > 0 ? 'hover:border-accent/50 cursor-pointer' : 'opacity-60'}`}
            onClick={() => handleDrilldown(pipelineHealth.biggestBottleneck)}
          >
            <span className="text-xs text-muted-foreground font-semibold uppercase tracking-wider mb-2">Biggest Bottleneck</span>
            <span className="text-lg font-bold text-danger line-clamp-2">{pipelineHealth.biggestBottleneck.label}</span>
            <span className="text-xs text-muted-foreground mt-1">({pipelineHealth.biggestBottleneck.count} leads)</span>
          </div>
        </div>
      </section>

      {/* Section 6: Team Performance */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2"><Users className="h-4 w-4 text-accent" /> Team Performance</h2>
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
                <tr 
                  key={r.tcm.id} 
                  className="border-b border-border hover:bg-muted/10 cursor-pointer transition-colors"
                  onClick={() => handleDrilldown(r.drilldown)}
                >
                  <td className="p-3 font-medium text-foreground">{r.tcm.name}</td>
                  <td className="p-3">{r.leads}</td>
                  <td className="p-3">{r.tours}</td>
                  <td className="p-3">{r.quotes}</td>
                  <td className="p-3 font-bold text-success">{r.bookings}</td>
                  <td className={`p-3 font-semibold bg-accent/5 ${r.leadToTour > 30 ? 'text-success' : r.leadToTour < 10 ? 'text-danger' : ''}`}>{r.leadToTour}%</td>
                  <td className="p-3 font-semibold bg-accent/5">{r.tourToQuote}%</td>
                  <td className={`p-3 font-bold bg-success/5 ${r.quoteToBook > 20 ? 'text-success' : ''}`}>{r.quoteToBook}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Section 7: At Risk Leads */}
      <section>
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-danger" /> At Risk Leads
        </h2>
        <div className="rounded-xl border border-border bg-card overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-semibold text-muted-foreground">Lead</th>
                <th className="p-3 font-semibold text-muted-foreground">Issue</th>
                <th className="p-3 font-semibold text-muted-foreground">Days To Move-In</th>
                <th className="p-3 font-semibold text-muted-foreground">Owner</th>
                <th className="p-3 font-semibold text-muted-foreground">Stage</th>
                <th className="p-3 font-semibold text-muted-foreground text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.slice(0, 10).map(r => {
                const moveInLabel = r.moveInDays !== null 
                  ? (r.moveInDays < 0 ? <Badge variant="destructive" className="text-[10px]">Expired</Badge> : `${r.moveInDays} days`) 
                  : <span className="text-muted-foreground">Missing</span>;
                
                const ownerLabel = r.ownerId ? (tcms.find(t => t.id === r.ownerId)?.name || 'Unknown') : <Badge variant="secondary" className="text-[10px] bg-warning/20 text-warning-foreground border-warning/30 hover:bg-warning/30 cursor-pointer">Needs Assignment</Badge>;
                
                return (
                  <tr key={r.lead.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-medium text-foreground">{r.lead.name}</td>
                    <td className="p-3 text-danger font-semibold">{r.issue}</td>
                    <td className="p-3">{moveInLabel}</td>
                    <td className="p-3">{ownerLabel}</td>
                    <td className="p-3 text-muted-foreground capitalize">{r.lead.stage.replace('-', ' ')}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); selectLead(r.lead.id, "impact", "none", "none"); }}>Open</Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-accent" onClick={(e) => { e.stopPropagation(); window.open(`tel:${r.lead.phone}`, '_self'); }}><PhoneCall className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                );
              })}
              {atRisk.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted-foreground">No at-risk leads found!</td>
                </tr>
              )}
            </tbody>
          </table>
          {atRisk.length > 10 && (
            <div className="p-2 border-t border-border bg-muted/10 text-center">
              <Button variant="ghost" size="sm" className="text-xs w-full" onClick={() => handleDrilldown({ label: "At Risk Leads", count: atRisk.length, filterPayload: {}, leadIds: atRisk.map(a => a.lead.id) })}>View All {atRisk.length}</Button>
            </div>
          )}
        </div>
      </section>

      {/* Drilldown Modal */}
      <Dialog open={!!drilldown} onOpenChange={o => !o && setDrilldown(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
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
                    <div className="flex-1">
                      <div className="font-semibold text-sm">{l.name}</div>
                      <div className="text-xs text-muted-foreground mt-1 flex gap-2">
                        <span>{l.phone}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(l.stageEnteredAt || l.updatedAt))} stuck</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground w-28 truncate text-right">
                        {tcms.find(t => t.id === l.assignedTcmId)?.name || <span className="text-warning font-semibold">Needs Assignment</span>}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-accent" title="Call" onClick={() => window.open(`tel:${l.phone}`, '_self')}>
                          <PhoneCall className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setDrilldown(null); selectLead(l.id, "impact", "none", "none"); }}>Open Lead</Button>
                      </div>
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
