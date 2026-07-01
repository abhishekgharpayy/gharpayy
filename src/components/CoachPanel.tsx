import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2, AlertOctagon, ListTodo, BookOpen, Flame, Trophy,
  Phone, MessageSquare, ChevronRight, Sparkles, Target, Radio, Users2, Zap,
} from "lucide-react";
import { useApp } from "@/lib/store";
import { useGame, whoKey } from "@/lib/gamification";
import { useMountedNow } from "@/hooks/use-now";
import { useConnectorFeed } from "@/hooks/use-connector-feed";
import { personName } from "@/lib/people";
import type { ConnectorEvent } from "@/lib/connectors";
import {
  buildCoachReport, HOW_TO, computeBadges,
  type CoachItem, type CoachKind,
} from "@/lib/coach";
import { useQuery } from "@tanstack/react-query";
import { API_URL } from "@/lib/api/client";
import { CoachAutoPilot } from "./CoachAutoPilot";
import { TcmCoachView } from "./TcmCoachView";
import { cn } from "@/lib/utils";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { useAuthUser } from "@/lib/auth-store";

interface Props {
  /** When true, panel renders compact (sidebar widget). */
  compact?: boolean;
}

export function CoachPanel({ compact = false }: Props) {
  const role            = useApp((s) => s.role);
  const currentTcmId    = useApp((s) => s.currentTcmId);
  const tcms            = useApp((s) => s.tcms);
  const leads           = useApp((s) => s.leads);
  const tours           = useApp((s) => s.tours);
  const followUps       = useApp((s) => s.followUps);
  const activitiesState = useApp((s) => s.activities);
  const bookings        = useApp((s) => s.bookings);
  const handoffs        = useApp((s) => s.handoffs);
  const selectLead      = useApp((s) => s.selectLead);
  const completeFollowUp= useApp((s) => s.completeFollowUp);
  const authUser        = useAuthUser((s) => s.user);
  const [now, mounted] = useMountedNow();
  const awardXp = useGame((s) => s.awardXp);
  const rolloverIfNeeded = useGame((s) => s.rolloverIfNeeded);
  const who = whoKey(role, currentTcmId);
  // Subscribe directly to this user's persisted slot so XP awards re-render.
  const userSlot = useGame((s) => s.byUser[who]);
  const stats = mounted
    ? useGame.getState().getStats(who)
    : { xp: 0, streak: 0, xpToday: 0, bookingsClosed: 0, cleared: {}, lastWinDate: null, todayKey: null };
  // ensure dependency tracking
  void userSlot;

  // Day rollover lives in an effect (no store writes from render).
  useEffect(() => {
    if (mounted) rolloverIfNeeded(who);
  }, [mounted, who, rolloverIfNeeded]);

  // Fetch real coaching notes from the backend
  const coachingNotesQuery = useQuery({
    queryKey: ["tcm", "coaching-notes"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/api/v1/tcm/coaching-notes`, {
        credentials: "include",
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.notes || []) as any[];
    },
    refetchInterval: 60_000,
  });

  const activities = useMemo(() => {
    const fetchedNotes = coachingNotesQuery.data || [];
    return [...activitiesState, ...fetchedNotes];
  }, [activitiesState, coachingNotesQuery.data]);

  const report = useMemo(() => {
    if (!mounted) return null;
    return buildCoachReport({
      role, currentTcmId, tcms, leads, tours, followUps,
      activities, bookings, handoffs, now,
      ownerSignals: { staleRooms: 0, pendingBlocks: 0 },
      authUserName: authUser?.name || authUser?.fullName,
    });
  }, [role, currentTcmId, tcms, leads, tours, followUps, activities, bookings, handoffs, now, mounted, authUser?.name, authUser?.fullName]);

  const badges = computeBadges(stats.xp, stats.streak, stats.bookingsClosed);

  if (!mounted || !report) return <CoachSkeleton />;

  const clearItem = (item: CoachItem, label: string) => {
    const earned = awardXp(who, item.xp, item.id);
    if (earned > 0) {
      toast.success(`+${earned} XP · ${label}`, {
        description: item.title,
      });
    }
  };

  const openLead = (leadId?: string) => {
    if (leadId) selectLead(leadId);
  };

  if (role === "tcm") {
    return <TcmCoachView compact={compact} />;
  }

  return (
    <div className={cn("flex flex-col h-full overflow-hidden gap-4", compact && "text-[13px]")}>
      {/* HEADER */}
      <div className="flex items-start gap-4 mb-2">
        <div className="flex-1 min-w-0">
          <div className="font-display text-2xl font-bold leading-tight truncate">
            {report.greeting}
          </div>
          <div className="text-sm text-muted-foreground mt-1">
            {report.missed.length > 0
              ? `${report.missed.length} items overdue.`
              : "Your queue is clean for now."}
          </div>
        </div>
      </div>

      {/* AUTO-PILOT (Coach 4.0) - top-3 plan with confidence + streak multiplier */}
      <CoachAutoPilot
        report={report}
        compact={compact}
        onClear={(item) => {
          const fu = followUps.find((f) => f.leadId === item.leadId && !f.done);
          if (fu) completeFollowUp(fu.id);
          clearItem(item, "Auto-Pilot");
        }}
        onOpenLead={openLead}
      />

      {/* TABS */}
      <Tabs defaultValue={report.missed.length > 0 ? "overdue" : "pending"} className="w-full flex-1 flex flex-col min-h-0">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="overdue" className="gap-1.5 data-[state=active]:text-destructive">
            <AlertOctagon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Overdue</span>
            <span className="text-[10px] opacity-70">({report.missed.length})</span>
          </TabsTrigger>
          <TabsTrigger value="pending" className="gap-1.5">
            <ListTodo className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Pending</span>
            <span className="text-[10px] opacity-70">({report.todo.length})</span>
          </TabsTrigger>
          <TabsTrigger value="completed" className="gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Completed</span>
            <span className="text-[10px] opacity-70">({report.done.length})</span>
          </TabsTrigger>
        </TabsList>

        {/* COMPLETED */}
        <TabsContent value="completed" className="mt-3 flex-1 overflow-y-auto min-h-0">
          <div className="pb-4">
            {report.done.length === 0 ? (
              <Empty
                icon={<Sparkles className="h-5 w-5" />}
                title="Nothing done yet today."
                hint="Clear one overdue item to get started."
              />
            ) : (
              <ul className="space-y-1.5 pr-2">
                {report.done.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 rounded-md border border-border bg-success/5 px-3 py-2">
                    <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
                    <span className="flex-1 text-sm truncate">{d.text}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* OVERDUE */}
        <TabsContent value="overdue" className="mt-3 flex-1 overflow-y-auto min-h-0">
          <div className="pb-4">
            {report.missed.length === 0 ? (
              <Empty
                icon={<CheckCircle2 className="h-5 w-5 text-success" />}
                title="No misses. Clean operator."
                hint="Keep this rolling to grow your streak."
              />
            ) : (
              <ul className="space-y-2 pr-2">
                {report.missed.map((m) => (
                  <ItemRow
                    key={m.id}
                    item={m}
                    severity="missed"
                    onOpen={() => openLead(m.leadId)}
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

        {/* PENDING */}
        <TabsContent value="pending" className="mt-3 flex-1 overflow-y-auto min-h-0">
          <div className="pb-4">
            {report.todo.length === 0 ? (
              <Empty
                icon={<Sparkles className="h-5 w-5" />}
                title="Inbox zero."
                hint="Use this hour to revive a cold lead or update notes."
              />
            ) : (
              <ul className="space-y-2 pr-2">
                {report.todo.map((t) => (
                  <ItemRow
                    key={t.id}
                    item={t}
                    severity="todo"
                    onOpen={() => openLead(t.leadId)}
                  />
                ))}
              </ul>
            )}
          </div>
        </TabsContent>

      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function ItemRow({
  item, severity, onOpen,
}: {
  item: CoachItem;
  severity: "missed" | "todo";
  onOpen: () => void;
}) {
  const parts = item.title.includes(" · ") ? item.title.split(" · ") : [item.title, ""];
  const actionName = parts[0];
  const leadName = parts.slice(1).join(" · ") || "";

  return (
    <li
      className={cn(
        "group flex items-center justify-between rounded-xl border p-3 transition-all cursor-pointer shadow-sm hover:shadow",
        severity === "missed" ? "border-red-200 bg-red-50/40 hover:bg-red-50/80 dark:border-red-900/50 dark:bg-red-900/10" : "border-border bg-card hover:bg-accent/5",
      )}
      onClick={onOpen}
    >
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-sm font-bold text-foreground truncate">
          {leadName ? (
            <>
              {leadName} <span className="font-normal text-muted-foreground mx-1">needs</span>
              <span className={cn("inline-flex px-1.5 py-0.5 rounded-md text-[11px] uppercase tracking-wider font-bold", severity === "missed" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400" : "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400")}>
                {actionName}
              </span>
            </>
          ) : (
            actionName
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1.5 font-medium line-clamp-1">
          {item.why}
        </div>
      </div>
    </li>
  );
}

function HowSection({ role }: { role: string }) {
  const kinds: CoachKind[] =
    role === "owner"
      ? ["owner-room-stale", "owner-block-pending"]
      : role === "flow-ops"
        ? ["first-response", "no-follow-up", "flowops-handoff-unread", "flowops-reassign-stuck", "post-tour-overdue"]
        : ["post-tour-overdue", "follow-up-overdue", "tour-today", "hot-untouched", "no-follow-up", "first-response"];

  return (
    <div className="space-y-3 pr-2">
      {kinds.map((k) => {
        const how = HOW_TO[k];
        return (
          <div key={k} className="rounded-md border border-border bg-card p-3">
            <div className="font-semibold text-sm mb-1">{how.goal}</div>
            <ol className="space-y-1.5 text-[12px] list-decimal list-inside text-muted-foreground">
              {how.steps.map((s, i) => (
                <li key={i}>
                  <span className="text-foreground">{s.step}</span>
                  {s.hint && <div className="ml-5 text-[11px] italic">{s.hint}</div>}
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
      <div className="mb-2">{icon}</div>
      <div className="text-sm font-medium text-foreground">{title}</div>
      <div className="text-xs mt-1">{hint}</div>
    </div>
  );
}

/* LIVE FEED - cross-role connector ticker. */
function LiveFeed({ compact }: { compact: boolean }) {
  const events = useConnectorFeed(40);
  if (events.length === 0) {
    return (
      <Empty
        icon={<Radio className="h-5 w-5" />}
        title="The team is quiet right now."
        hint="As Flow Ops, TCMs and Owners act, you'll see it here in real time."
      />
    );
  }
  return (
    <ul className="space-y-1.5 pr-2">
      {events.map((e) => (
        <li key={e.id} className={cn("flex items-start gap-2 rounded-md border border-border bg-card/40 px-2.5 py-1.5",
          e.kind === "booking.closed" && "border-success/40 bg-success/5",
          e.kind === "post_tour.filled" && "border-accent/30 bg-accent/5",
        )}>
          <FeedDot kind={e.kind} />
          <div className="flex-1 min-w-0">
            <div className={cn("text-[12px] truncate", e.kind === "booking.closed" && "font-medium")}>
              {e.text}
            </div>
            {e.assists && e.assists.length > 0 && (
              <div className="text-[10px] text-accent mt-0.5 inline-flex items-center gap-1">
                <Users2 className="h-3 w-3" /> assist · {e.assists.map((a) => personName(a.id, a.role)).join(", ")}
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground font-mono shrink-0">{relTime(e.ts)}</span>
        </li>
      ))}
      {compact && (
        <li className="text-[10px] text-muted-foreground text-center pt-2">- live across all roles -</li>
      )}
    </ul>
  );
}

function FeedDot({ kind }: { kind: ConnectorEvent["kind"] }) {
  const color =
    kind === "booking.closed" ? "bg-success" :
    kind === "post_tour.filled" ? "bg-accent" :
    kind === "tour.scheduled" ? "bg-info" :
    kind === "tour.completed" ? "bg-info" :
    kind === "owner.room_updated" || kind === "owner.block_decided" ? "bg-warning" :
    kind === "handoff.sent" ? "bg-primary" :
    "bg-muted-foreground";
  return <span className={cn("mt-1 h-1.5 w-1.5 rounded-full shrink-0", color)} />;
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const s = Math.round(diff / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.round(h / 24)}d`;
}

/* PREDICT-AND-SAVE - leads about to slip in next ~6 hours. */
function PredictBar({
  leads, tours, now, role, currentTcmId, onOpen,
}: {
  leads: ReturnType<typeof useApp.getState>["leads"];
  tours: ReturnType<typeof useApp.getState>["tours"];
  now: number;
  role: string;
  currentTcmId: string;
  onOpen: (id?: string) => void;
}) {
  const slipping = useMemo(() => {
    const filterTcm = role === "tcm" ? currentTcmId : undefined;
    return leads
      .filter((l) => (!filterTcm || l.assignedTcmId === filterTcm) && l.stage !== "booked" && l.stage !== "dropped")
      .map((l) => {
        const silentH = (now - +new Date(l.updatedAt)) / 36e5;
        const intentBoost = l.intent === "hot" ? 24 : l.intent === "warm" ? 12 : 4;
        // Risk score 0-100 - silence + intent + recent tour
        const hasUpcoming = tours.some((t) => t.leadId === l.id && t.status === "scheduled");
        const risk = Math.min(100, Math.round(silentH * 4 + intentBoost - (hasUpcoming ? 30 : 0)));
        return { lead: l, risk, silentH };
      })
      .filter((x) => x.risk >= 55)
      .sort((a, b) => b.risk - a.risk)
      .slice(0, 3);
  }, [leads, tours, now, role, currentTcmId]);

  if (slipping.length === 0) return null;
  return (
    <div className="rounded-md border border-warning/30 bg-warning/5 p-2.5">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-warning font-semibold mb-1.5">
        <Zap className="h-3 w-3" />
        Predicted to slip · save them now
      </div>
      <ul className="space-y-1">
        {slipping.map(({ lead, risk, silentH }) => (
          <li key={lead.id} className="flex items-center gap-2 text-[12px]">
            <span className="font-mono text-warning shrink-0 w-8">{risk}%</span>
            <span className="flex-1 truncate">
              <span className="font-medium">{lead.name}</span>
              <span className="text-muted-foreground"> · {Math.round(silentH)}h silent · {lead.intent}</span>
            </span>
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => onOpen(lead.id)}>
              Save
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CoachSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="flex gap-4">
        <div className="h-20 w-20 rounded-full bg-muted" />
        <div className="flex-1 space-y-2">
          <div className="h-5 w-1/2 bg-muted rounded" />
          <div className="h-3 w-3/4 bg-muted rounded" />
          <div className="h-3 w-1/3 bg-muted rounded" />
        </div>
      </div>
      <div className="h-10 bg-muted rounded" />
      <div className="h-32 bg-muted rounded" />
    </div>
  );
}

/* MISSION RING - circular progress with streak in center */
function MissionRing({ pct, streak }: { pct: number; streak: number }) {
  const size = 76;
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="currentColor" className="text-muted" strokeWidth={stroke} fill="none"
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          stroke="currentColor" className="text-accent transition-all duration-500"
          strokeWidth={stroke} fill="none"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className="h-3.5 w-3.5 text-warning" />
        <div className="text-base font-mono font-bold leading-none mt-0.5">{streak}</div>
        <div className="text-[8px] uppercase tracking-wider text-muted-foreground">streak</div>
      </div>
    </div>
  );
}
