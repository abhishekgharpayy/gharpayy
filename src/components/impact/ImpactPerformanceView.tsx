import { useState, useMemo, useEffect } from "react";
import type { Lead, Tour, ActivityLog, FollowUp, TCM } from "@/lib/types";
import {
  buildEnrichedPerformanceLeads,
  buildMyTeamNeedsAttentionSummary,
  buildTodayNeedsAttention,
  buildTopAtRiskLeads,
  buildTCMLeaderboard,
  MetricDrilldown
} from "@/lib/crm10x/performance-engine";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { QueueFilters } from "./ImpactQueueHeaderControls";
import { formatDistanceToNow, format } from "date-fns";
import { PhoneCall, ArrowRight, ShieldAlert, Users, Search, X, CheckSquare, EyeOff, Eye } from "lucide-react";
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
  const [hideInactive, setHideInactive] = useState(true);
  const [lastUpdated, setLastUpdated] = useState("");

  useEffect(() => {
    setLastUpdated(format(new Date(), "h:mm a"));
  }, [leads, tours]); // rough proxy for data updates

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

  const summaryLine = useMemo(() => buildMyTeamNeedsAttentionSummary(enriched), [enriched]);
  const todayNeedsAttention = useMemo(() => buildTodayNeedsAttention(enriched), [enriched]);
  const atRisk = useMemo(() => buildTopAtRiskLeads(enriched), [enriched]);
  const leaderboard = useMemo(() => buildTCMLeaderboard(enriched, tcms, hideInactive), [enriched, tcms, hideInactive]);

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
    alert(`Opening Board with filter: ${JSON.stringify(drilldown.filterPayload)}`);
    setDrilldown(null);
  };

  const MetricCard = ({ metric, colorClass, target }: { metric: MetricDrilldown, colorClass?: string, target?: number }) => {
    const isFailingTarget = target !== undefined && metric.count > target;
    const finalColor = isFailingTarget ? "text-danger" : colorClass || "text-slate-700 dark:text-foreground";
    const bgHover = isFailingTarget ? "hover:border-danger/50 border-danger/20" : "hover:border-accent/50";
    const bgClass = metric.count > 0 && isFailingTarget ? "bg-danger/5" : "bg-card";
    
    return (
      <div 
        onClick={() => handleDrilldown(metric)}
        className={`rounded-lg border border-border ${bgClass} p-3 ${bgHover} hover:shadow-sm cursor-pointer transition-all ${metric.count > 0 ? '' : 'opacity-60'}`}
      >
        <div className="text-[11px] font-bold text-slate-700 dark:text-muted-foreground uppercase tracking-wider mb-1.5 truncate" title={metric.label}>
          {metric.label}
        </div>
        <div className={`text-2xl font-bold ${finalColor}`}>{metric.count}</div>
      </div>
    );
  };

  return (
    <div className="space-y-6 pb-20 max-w-[1400px] mx-auto">
      {/* Manager Filters (Sticky Toolbar) */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 bg-background/95 backdrop-blur p-2 rounded-lg border border-border shadow-sm">
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
        <div className="ml-auto text-[10px] text-muted-foreground font-medium px-2">
          Last Updated: {lastUpdated}
        </div>
      </div>

      {/* MY TEAM NEEDS ATTENTION (Summary Strip) */}
      <div className="bg-accent/10 border border-accent/20 text-accent-foreground px-4 py-2 rounded-lg text-sm font-semibold flex flex-wrap gap-4 items-center shadow-sm">
        <span className="uppercase tracking-widest text-[10px] opacity-70">My Team Needs Attention</span>
        <div className="flex flex-wrap gap-3 items-center">
          <span>{summaryLine.activeLeads} Active</span>
          <span className="opacity-30">|</span>
          <span className={summaryLine.tfMissing > 0 ? 'text-danger' : ''}>{summaryLine.tfMissing} Feedback Missing</span>
          <span className="opacity-30">|</span>
          <span className={summaryLine.quotePending > 0 ? 'text-danger' : ''}>{summaryLine.quotePending} Quotes</span>
          <span className="opacity-30">|</span>
          <span className={summaryLine.moveIn7 > 0 ? 'text-warning' : ''}>{summaryLine.moveIn7} Move-ins</span>
          <span className="opacity-30">|</span>
          <span className={summaryLine.unassigned > 0 ? 'text-danger' : ''}>{summaryLine.unassigned} Unassigned</span>
        </div>
      </div>

      {/* 1. TODAY NEEDS ATTENTION */}
      <section>
        <h2 className="text-sm font-extrabold text-slate-800 dark:text-foreground mb-3 flex items-center gap-2 uppercase tracking-wide">
          <CheckSquare className="h-4 w-4 text-danger" /> Today Needs Attention
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          <MetricCard metric={todayNeedsAttention[0]} target={2} /> {/* Feedback Missing */}
          <MetricCard metric={todayNeedsAttention[1]} target={5} /> {/* Quote Pending */}
          <MetricCard metric={todayNeedsAttention[2]} target={10} colorClass="text-warning" /> {/* Move-In < 7 Days */}
          <MetricCard metric={todayNeedsAttention[3]} target={10} /> {/* No Activity > 48h */}
          <MetricCard metric={todayNeedsAttention[4]} target={0} /> {/* Unassigned */}
          <MetricCard metric={todayNeedsAttention[5]} target={5} /> {/* Property Not Selected */}
          <MetricCard metric={todayNeedsAttention[6]} target={5} /> {/* Tour Not Scheduled */}
        </div>
      </section>

      {/* 2. AT RISK LEADS */}
      <section>
        <h2 className="text-sm font-extrabold text-slate-800 dark:text-foreground mb-3 flex items-center gap-2 uppercase tracking-wide">
          <ShieldAlert className="h-4 w-4 text-danger" /> At Risk Leads
        </h2>
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Lead</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Issue</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Move In</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Owner</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px] text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {atRisk.map(r => {
                const moveInLabel = r.moveInDays !== null 
                  ? (r.moveInDays < 0 ? <Badge variant="destructive" className="text-[10px]">Expired</Badge> : `${r.moveInDays} days`) 
                  : <span className="text-muted-foreground">Missing</span>;
                
                const ownerLabel = r.ownerId ? (tcms.find(t => t.id === r.ownerId)?.name || 'Unknown') : <Badge variant="secondary" className="text-[10px] bg-warning/20 text-warning-foreground border-warning/30 hover:bg-warning/30 cursor-pointer">Needs Assignment</Badge>;
                
                return (
                  <tr key={r.lead.id} className="border-b border-border hover:bg-muted/10 transition-colors">
                    <td className="p-3 font-semibold text-slate-800 dark:text-foreground">{r.lead.name}</td>
                    <td className="p-3 text-danger font-semibold">{r.issue}</td>
                    <td className="p-3 font-medium text-slate-700 dark:text-foreground">{moveInLabel}</td>
                    <td className="p-3 font-medium text-slate-700 dark:text-foreground">{ownerLabel}</td>
                    <td className="p-3 text-right space-x-2 whitespace-nowrap">
                      <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={(e) => { e.stopPropagation(); selectLead(r.lead.id, "impact", "none", "none"); }}>Open</Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground hover:text-accent" onClick={(e) => { e.stopPropagation(); window.open(`tel:${r.lead.phone}`, '_self'); }}><PhoneCall className="h-3 w-3" /></Button>
                    </td>
                  </tr>
                );
              })}
              {atRisk.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">No at-risk leads found! All clear.</td>
                </tr>
              )}
            </tbody>
          </table>
          {atRisk.length >= 10 && (
            <div className="p-2 border-t border-border bg-muted/10 text-center">
              <Button variant="ghost" size="sm" className="text-xs w-full text-accent" onClick={() => handleDrilldown({ label: "At Risk Leads", count: atRisk.length, filterPayload: {}, leadIds: atRisk.map(a => a.lead.id) })}>View All At Risk</Button>
            </div>
          )}
        </div>
      </section>

      {/* 3. TEAM PERFORMANCE */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-extrabold text-slate-800 dark:text-foreground flex items-center gap-2 uppercase tracking-wide">
            <Users className="h-4 w-4 text-accent" /> Team Performance
          </h2>
          <Button variant="ghost" size="sm" className="h-6 text-[10px]" onClick={() => setHideInactive(!hideInactive)}>
            {hideInactive ? <><Eye className="h-3 w-3 mr-1" /> Show Inactive</> : <><EyeOff className="h-3 w-3 mr-1" /> Hide Inactive</>}
          </Button>
        </div>
        <div className="rounded-lg border border-border bg-card overflow-hidden shadow-sm">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/30 border-b border-border">
              <tr>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">TCM</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Leads</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Tours</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px]">Bookings</th>
                <th className="p-3 font-bold text-slate-600 dark:text-muted-foreground uppercase tracking-wider text-[10px] text-success">Conv %</th>
              </tr>
            </thead>
            <tbody>
              {leaderboard.map(r => (
                <tr 
                  key={r.tcm.id} 
                  className="border-b border-border hover:bg-muted/10 cursor-pointer transition-colors"
                  onClick={() => handleDrilldown(r.drilldown)}
                >
                  <td className="p-3 font-semibold text-slate-800 dark:text-foreground">{r.tcm.name}</td>
                  <td className="p-3 font-medium">{r.leads}</td>
                  <td className="p-3 font-medium">{r.tours}</td>
                  <td className="p-3 font-bold text-success">{r.bookings}</td>
                  <td className={`p-3 font-bold bg-success/5 ${r.conversion > 15 ? 'text-success' : 'text-slate-700 dark:text-foreground'}`}>{r.conversion}%</td>
                </tr>
              ))}
              {leaderboard.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-muted-foreground">No active team members.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Drilldown Modal */}
      <Dialog open={!!drilldown} onOpenChange={o => !o && setDrilldown(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-4 border-b border-border bg-muted/10">
            <DialogTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                {drilldown?.label}
                <Badge variant="secondary" className="text-xs bg-background">{drilldown?.leadIds.length} leads</Badge>
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
                  <div key={l.id} className="flex items-center justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/30 transition-colors">
                    <div className="flex-1">
                      <div className="font-bold text-sm text-slate-800 dark:text-foreground">{l.name}</div>
                      <div className="text-xs text-slate-500 dark:text-muted-foreground mt-1 flex gap-2 font-medium">
                        <span>{l.phone}</span>
                        <span>•</span>
                        <span>{formatDistanceToNow(new Date(l.stageEnteredAt || l.updatedAt))} stuck</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-xs text-slate-600 dark:text-muted-foreground w-28 truncate text-right font-medium">
                        {tcms.find(t => t.id === l.assignedTcmId)?.name || <span className="text-warning font-bold">Needs Assignment</span>}
                      </div>
                      <div className="flex gap-1.5">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:text-accent" title="Call" onClick={() => window.open(`tel:${l.phone}`, '_self')}>
                          <PhoneCall className="h-3.5 w-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" className="h-7 text-[10px] font-semibold" onClick={() => { setDrilldown(null); selectLead(l.id, "impact", "none", "none"); }}>Open Lead</Button>
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
