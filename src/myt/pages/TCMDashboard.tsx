import { useState, useEffect, useMemo } from 'react';
import { useAppState } from '@/myt/lib/app-context';
import { useAuthUser } from '@/lib/auth-store';
import { MetricCard } from '@/myt/components/MetricCard';
import { TourCard } from '@/myt/components/TourCard';
import { CalendarCheck, TrendingUp, FileText, Target } from 'lucide-react';
import { Tour } from '@/myt/lib/types';
import { GlueFeed } from '@/components/GlueFeed';
import { CoachInline } from '@/components/CoachInline';
import { bestInventoryFits, availableBedsForProperty, supplyHubProperties } from '@/myt/lib/inventory-intelligence';

const intentRank: Record<Tour['intent'], number> = { hard: 0, medium: 1, soft: 2 };

export default function TCMDashboard() {
  const { tours, setTours, currentMemberId, rooms, blocks } = useAppState();
  const authUser = useAuthUser((s) => s.user);
  const actorId = currentMemberId || (authUser?.role === "tcm" ? authUser.id : null);
  const [, setTick] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(interval);
  }, []);

  const today = (() => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  })();

  const myTours = useMemo(() => {
    if (!actorId) return [];
    return tours.filter((t: any) => {
      const isAssignedToMe = 
        t.assignedTo === actorId || 
        t.assignedTo === authUser?.id;
      if (!isAssignedToMe) return false;
      // tourDate is "2026-06-24" format — use local date not UTC
      const tourDateStr = t.tourDate || t.scheduledAt?.slice(0, 10) || "";
      return tourDateStr === today;
    });
  }, [tours, actorId, authUser?.id, today]);

  const allMyTours = useMemo(() => {
    if (!actorId) return [];
    return tours
      .filter((t) => t.assignedTo === actorId || t.assignedTo === authUser?.id)
      .sort((a, b) => {
        const dateA = (a as any).scheduledAt || (a as any).tourDate || "";
        const dateB = (b as any).scheduledAt || (b as any).tourDate || "";
        return dateB.localeCompare(dateA); // newest first
      });
  }, [tours, actorId, authUser?.id]);

  console.log("[TCM Debug]", {
    actorId,
    authUserId: authUser?.id,
    totalTours: tours.length,
    myToursCount: myTours.length,
    allMyToursCount: allMyTours.length,
    sampleTour: tours[0],
  });

  // Sort: hard first, then by time
  const sortedTours = [...myTours].sort((a, b) => {
    const r = intentRank[a.intent] - intentRank[b.intent];
    return r !== 0 ? r : (a.tourTime || "").localeCompare(b.tourTime || "");
  });

  const completed = myTours.filter(t => t.status === 'completed').length;
  const noShows = myTours.filter(t => t.showUp === false).length;
  const showUps = myTours.filter(t => t.showUp === true).length;
  const bookings = myTours.filter(t => 
    (t as any).postTour?.outcome === 'booked' || (t as any).postTour?.outcome === 'draft'
  ).length;

  const pendingPostTours = allMyTours.filter(t => 
    t.status === 'completed' && !(t as any).postTour?.filledAt
  ).length;
  const dailyTarget = 10;
  const targetPct = Math.min(100, Math.round((myTours.length / dailyTarget) * 100));

  const updateTour = (tourId: string, updates: Partial<Tour>) => {
    setTours(prev => prev.map(t => t.id === tourId ? { ...t, ...updates } : t));
  };

  return (
    <div className="space-y-4 md:space-y-6 animate-slide-up">
      <CoachInline page="tcm" />
      {pendingPostTours > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-amber-600">
              {pendingPostTours} post-tour{pendingPostTours > 1 ? "s" : ""} pending
            </div>
            <div className="text-xs text-muted-foreground">
              Fill post-tour outcomes to unlock next steps
            </div>
          </div>
          <a
            href="/myt/post-tours"
            className="text-xs font-medium text-amber-600 underline underline-offset-2"
          >
            Fill now →
          </a>
        </div>
      )}
      <div>
        <h1 className="text-xl md:text-2xl font-heading font-bold text-foreground">Today's Tours</h1>
        <p className="text-xs text-muted-foreground">
          {actorId ? 'Sorted by intent - fight for hard ones first' : 'Sign in as a TCM to see your tours'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
        <MetricCard 
          label="All My Tours" 
          value={allMyTours.length} 
          color="green" 
          icon={<CalendarCheck className="h-4 w-4" />} 
        />
        <MetricCard 
          label="Today" 
          value={myTours.length} 
          color={myTours.length > 0 ? "green" : "amber"} 
          icon={<TrendingUp className="h-4 w-4" />} 
        />
        <MetricCard 
          label="Completed" 
          value={allMyTours.filter(t => t.status === "completed").length} 
          color="green" 
        />
        <MetricCard 
          label="Pending Post-tours" 
          value={allMyTours.filter(t => t.status === "completed" && !(t as any).postTour?.filledAt).length} 
          color="red" 
          icon={<FileText className="h-4 w-4" />} 
        />
      </div>

      <div className="glass-card p-3 md:p-4 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-heading font-semibold text-sm text-foreground">Property Win Cards</h3>
            <p className="text-xs text-muted-foreground">Close using the room that matches area, budget and live availability.</p>
          </div>
          <span className="text-[10px] rounded-full bg-role-tcm/10 px-2 py-1 text-role-tcm">TCM goal: close every Tour</span>
        </div>
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {sortedTours.slice(0, 3).map((tour) => {
            const fit = bestInventoryFits({ areaText: tour.area, budget: tour.budget, rooms, blocks, limit: 1 })[0];
            const prop = supplyHubProperties.find((p) => p.name === tour.propertyName) ?? (fit ? supplyHubProperties.find((p) => p.id === fit.propertyId) : undefined);
            const inv = prop ? availableBedsForProperty(prop.id, rooms, blocks) : null;
            return (
              <div key={tour.id} className="rounded-lg border border-border bg-surface-2/40 p-3">
                <div className="text-sm font-semibold truncate">{tour.leadName}</div>
                <div className="text-[11px] text-muted-foreground truncate">{prop?.name ?? tour.propertyName} · {inv?.beds ?? fit?.availableBeds ?? 0} beds live</div>
                <div className="mt-2 text-[11px] text-foreground/80">Pitch: {fit?.reason ?? 'Use best available room and protect price objection.'}</div>
                <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] text-muted-foreground">
                  <span>Confirm arrival</span><span>Show best room</span><span>Handle objection</span><span>Mark outcome</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Daily target */}
      <div className="glass-card p-3 md:p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <span className="text-xs font-semibold text-foreground">Daily Target</span>
          </div>
          <span className="text-xs font-mono tabular-nums text-foreground">{myTours.length} / {dailyTarget}</span>
        </div>
        <div className="h-2 rounded-full bg-surface-2 overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${targetPct}%` }} />
        </div>
      </div>

      {/* Today's tours */}
      {sortedTours.length === 0 ? (
        <div className="glass-card p-6 text-center text-muted-foreground text-sm">
          No tours scheduled for today
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
          {sortedTours.map(t => (
            <TourCard key={t.id || (t as any)._id} tour={t} onUpdate={updateTour} />
          ))}
        </div>
      )}

      {/* All tours history */}
      {allMyTours.length > myTours.length && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-foreground">All Tours ({allMyTours.length})</h3>
          <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
            {allMyTours
              .filter(t => {
                const rawDate = (t as any).scheduledAt || (t as any).tourDate || "";
                return rawDate.slice(0, 10) !== today; // exclude today — already shown above
              })
              .map(t => (
                <TourCard key={t.id || (t as any)._id} tour={t} onUpdate={updateTour} />
              ))
            }
          </div>
        </div>
      )}
      <GlueFeed limit={20} title="Closed-loop activity · TCM" />
    </div>
  );
}
