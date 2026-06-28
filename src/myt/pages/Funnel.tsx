import { useEffect, useState, useMemo } from 'react';
import { useApp } from '@/lib/store';
import { api } from '@/lib/api/client';
import { AlertTriangle, Activity, Target, BarChart3, UserCheck, Clock, Zap, DollarSign, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export default function Funnel() {
  const { tours: dbTours, bookings: dbBookings, leads, properties, tcms } = useApp();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const mappedTours = useMemo(() => {
    return dbTours.map((t) => {
      const lead = leads.find((l) => l.id === t.leadId);
      const property = properties.find((p) => p.id === t.propertyId);
      const tcm = tcms.find((u) => u.id === t.tcmId);
      
      const tourDateStr = t.scheduledAt ? new Date(t.scheduledAt).toISOString().split('T')[0] : '';
      const tourTimeStr = t.scheduledAt ? new Date(t.scheduledAt).toTimeString().split(' ')[0].slice(0, 5) : '';

      return {
        id: t.id,
        leadName: lead?.name || "Unknown",
        assignedTo: t.tcmId || "",
        assignedToName: tcm?.name || "Unknown",
        propertyName: property?.name || t.customPropertyName || "Unknown",
        area: property?.area || "",
        zoneId: lead?.zoneCategory || "",
        tourDate: tourDateStr,
        tourTime: tourTimeStr,
        status: t.status || "",
        showUp: t.showUp,
        outcome: t.decision || t.postTour?.outcome || null,
        budget: lead?.budget || 0,
        createdAt: t.createdAt || new Date().toISOString(),
        whyLost: t.postTour?.objection || null,
        intent: lead?.intent || "warm",
        confirmationStrength: t.postTour?.confidence ? String(t.postTour.confidence) : "50",
      };
    });
  }, [dbTours, leads, properties, tcms]);

  const mappedBookings = useMemo(() => {
    return dbBookings.map((b) => {
      const lead = leads.find((l) => l.id === b.leadId);
      const property = properties.find((p) => p.id === b.propertyId);
      const tcm = tcms.find((u) => u.id === b.tcmId);

      return {
        id: b.id,
        leadName: lead?.name || b.tenantName || "Unknown",
        propertyName: property?.name || "Unknown",
        area: property?.area || "",
        rentValue: b.amount || 0,
        viaTour: !!b.tourId,
        tourId: b.tourId || null,
        closedBy: b.tcmId || "",
        closedByName: tcm?.name || "Unknown",
        createdAt: b.ts || b.updatedAt || new Date().toISOString(),
      };
    });
  }, [dbBookings, leads, properties, tcms]);

  useEffect(() => {
    setLoading(true);
    api.funnel.process({ tours: mappedTours, bookings: mappedBookings }).then((result) => {
      setData(result);
      setLoading(false);
    });
  }, [mappedTours, mappedBookings]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data) return null;

  const { waterfall, timeHeatmap, lossReasons, budgetVsActual, tcmAreaMatrix, staleTours, conversionVelocity } = data;

  return (
    <div className="space-y-4 md:space-y-6 animate-slide-up">
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">Funnel Intelligence</h1>
        <p className="text-xs text-muted-foreground">Revenue waterfall, time heatmap, loss analysis & more</p>
      </div>

      {/* 1. Revenue Waterfall */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-4">
          <DollarSign className="h-4 w-4 text-accent" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Revenue Waterfall</h3>
        </div>
        <div className="space-y-2">
          {waterfall.stages.map((stage: any) => (
            <div key={stage.label} className="relative">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-foreground font-medium">{stage.label}</span>
                <span className="text-muted-foreground">
                  ₹{stage.value.toLocaleString()} ({stage.count})
                  {stage.leak !== undefined && stage.leak > 0 && (
                    <span className="text-danger ml-2">-₹{stage.leak.toLocaleString()}</span>
                  )}
                </span>
              </div>
              <div className="h-6 bg-surface-2 rounded-full overflow-hidden relative">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (stage.value / Math.max(1, waterfall.stages[0].value)) * 100)}%`, backgroundColor: stage.color }}
                />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-xs">
          <AlertTriangle className="h-3 w-3 text-danger" />
          <span className="text-muted-foreground">Biggest leak: <span className="text-danger font-medium">{waterfall.leakLabel}</span> (₹{waterfall.totalLeak.toLocaleString()})</span>
        </div>
      </div>

      {/* 2. Tour Time Heatmap */}
      <div className="glass-card p-4 md:p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-role-tcm" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Tour Time Heatmap</h3>
          <span className="text-[9px] text-muted-foreground ml-auto">% conversion by slot</span>
        </div>
        <div className="min-w-[600px]">
          <div className="grid grid-cols-[60px_repeat(7,1fr)] gap-px">
            <div className="text-[9px] text-muted-foreground" />
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} className="text-[9px] text-muted-foreground text-center">{d}</div>
            ))}
            {["9am","10am","11am","12pm","1pm","2pm","3pm","4pm","5pm","6pm","7pm","8pm"].map(hour => (
              <>
                <div key={hour} className="text-[9px] text-muted-foreground flex items-center">{hour}</div>
                {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(day => {
                  const cell = timeHeatmap.find((c: any) => c.day === day && c.hour === hour);
                  const rate = cell?.rate ?? 0;
                  const intensity = rate > 60 ? 'bg-success/40' : rate > 30 ? 'bg-accent/30' : rate > 0 ? 'bg-surface-2' : 'bg-surface-1/50';
                  return (
                    <div key={`${day}-${hour}`} className={cn('h-6 rounded flex items-center justify-center text-[8px]', intensity)} title={`${day} ${hour}: ${cell?.tours ?? 0} tours, ${rate}% conv`}>
                      {cell?.tours ? `${rate}%` : ''}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* 3. Loss Reason Intelligence */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Target className="h-4 w-4 text-danger" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Loss Reason Intelligence</h3>
        </div>
        {lossReasons.length > 0 ? (
          <div className="space-y-2">
            {lossReasons.map((r: any) => (
              <div key={r.reason} className="p-2.5 bg-surface-2 rounded-lg">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-foreground capitalize">{r.reason}</span>
                  <span className="text-[10px] text-muted-foreground">{r.count} ({r.percentage}%)</span>
                </div>
                <div className="h-1.5 bg-surface-1 rounded-full overflow-hidden">
                  <div className="h-full bg-danger rounded-full" style={{ width: `${r.percentage}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground mt-1">{r.recommendation}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No loss reasons recorded yet</p>
        )}
      </div>

      {/* 4. Budget vs Actual Rent */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-role-hr" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Budget vs Actual Rent</h3>
        </div>
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-center p-2 bg-surface-2 rounded-lg">
            <p className="text-lg font-heading font-bold text-foreground">{budgetVsActual.totalLinked}</p>
            <p className="text-[9px] text-muted-foreground">Linked deals</p>
          </div>
          <div className="text-center p-2 bg-surface-2 rounded-lg">
            <p className="text-lg font-heading font-bold text-role-tcm">{budgetVsActual.overBudget}</p>
            <p className="text-[9px] text-muted-foreground">Over budget</p>
          </div>
          <div className="text-center p-2 bg-surface-2 rounded-lg">
            <p className="text-lg font-heading font-bold text-muted-foreground">{budgetVsActual.underBudget}</p>
            <p className="text-[9px] text-muted-foreground">Under budget</p>
          </div>
        </div>
        <div className="text-xs">
          {budgetVsActual.points.length > 0 ? (
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {budgetVsActual.points.map((p: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-[10px] py-0.5 border-b border-border/30">
                  <span className="text-foreground truncate max-w-[120px]">{p.leadName}</span>
                  <span className="text-muted-foreground">₹{p.budget.toLocaleString()} → ₹{p.actualRent.toLocaleString()}</span>
                  <span className={cn('font-medium', p.gap > 0 ? 'text-role-tcm' : 'text-danger')}>
                    {p.gapPct > 0 ? '+' : ''}{p.gapPct}%
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">No tour-linked bookings yet</p>
          )}
        </div>
      </div>

      {/* 5. TCM × Area Strength Matrix */}
      <div className="glass-card p-4 md:p-6 overflow-x-auto">
        <div className="flex items-center gap-2 mb-3">
          <UserCheck className="h-4 w-4 text-role-tcm" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">TCM × Area Strength Matrix</h3>
          <span className="text-[9px] text-muted-foreground ml-auto">conversion %</span>
        </div>
        <div className="min-w-[500px]">
          <div className="grid gap-px" style={{ gridTemplateColumns: `120px repeat(${tcmAreaMatrix.areas.length}, 1fr)` }}>
            <div className="text-[9px] text-muted-foreground p-1">TCM</div>
            {tcmAreaMatrix.areas.map((area: string) => (
              <div key={area} className="text-[9px] text-muted-foreground text-center p-1 truncate" title={area}>{area}</div>
            ))}
            {tcmAreaMatrix.tcmIds.map((tcm: any) => (
              <>
                <div key={tcm.id} className="text-[10px] text-foreground font-medium p-1 truncate">{tcm.name}</div>
                {tcm.areas.map((a: any) => (
                  <div key={`${tcm.id}-${a.area}`} className={cn(
                    'h-8 flex items-center justify-center text-[9px] rounded',
                    a.rate >= 50 ? 'bg-success/30 text-success' :
                    a.rate >= 20 ? 'bg-accent/20 text-accent' :
                    a.tours > 0 ? 'bg-surface-2 text-muted-foreground' : 'bg-surface-1/30 text-muted-foreground/50'
                  )}>
                    {a.tours > 0 ? `${a.rate}%` : '-'}
                  </div>
                ))}
              </>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Stale Tour Radar */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="h-4 w-4 text-warning" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Stale Tour Radar</h3>
          <span className="text-[9px] text-muted-foreground ml-auto">{staleTours.length} active tours</span>
        </div>
        {staleTours.length > 0 ? (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {staleTours.slice(0, 10).map((t: any) => (
              <div key={t.id} className={cn(
                'flex items-center justify-between p-2 rounded-lg text-xs',
                t.urgency === 'critical' ? 'bg-danger/10 border border-danger/20' :
                t.urgency === 'warning' ? 'bg-warning/10' : 'bg-surface-2'
              )}>
                <div className="flex items-center gap-2 min-w-0">
                  <div className={cn(
                    'w-1.5 h-1.5 rounded-full shrink-0',
                    t.urgency === 'critical' ? 'bg-danger' :
                    t.urgency === 'warning' ? 'bg-warning' : 'bg-muted-foreground'
                  )} />
                  <div className="min-w-0">
                    <p className="text-foreground font-medium truncate">{t.leadName}</p>
                    <p className="text-[9px] text-muted-foreground">{t.assignedToName} · {t.area}</p>
                  </div>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className={cn(
                    'font-medium text-[10px]',
                    t.urgency === 'critical' ? 'text-danger' : t.urgency === 'warning' ? 'text-warning' : 'text-muted-foreground'
                  )}>
                    {t.ageDays > 0 ? `${t.ageDays}d old` : `${Math.abs(t.daysUntilTour)}d left`}
                  </p>
                  <p className="text-[9px] text-muted-foreground">{t.tourDate?.slice(5)} {t.tourTime}</p>
                </div>
              </div>
            ))}
            {staleTours.length > 10 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">+{staleTours.length - 10} more</p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">No stale tours</p>
        )}
      </div>

      {/* 7. Conversion Velocity */}
      <div className="glass-card p-4 md:p-6">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-accent" />
          <h3 className="font-heading font-semibold text-xs md:text-sm text-foreground">Conversion Velocity</h3>
          <span className="text-[9px] text-muted-foreground ml-auto">avg days per stage</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center p-3 bg-surface-2 rounded-lg">
            <p className="text-2xl font-heading font-bold text-foreground">{conversionVelocity.schedulingToTour.avg}d</p>
            <p className="text-[9px] text-muted-foreground mt-1">Schedule → Tour</p>
          </div>
          <div className="text-center p-3 bg-surface-2 rounded-lg">
            <p className="text-2xl font-heading font-bold text-role-tcm">{conversionVelocity.tourToBooking.avg}d</p>
            <p className="text-[9px] text-muted-foreground mt-1">Tour → Booking</p>
          </div>
          <div className="text-center p-3 bg-surface-2 rounded-lg">
            <p className="text-2xl font-heading font-bold text-accent">{conversionVelocity.fullCycle.avg}d</p>
            <p className="text-[9px] text-muted-foreground mt-1">Full Cycle</p>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground text-center mt-2">Based on {conversionVelocity.sampleSize} completed cycles</p>
      </div>
    </div>
  );
}
