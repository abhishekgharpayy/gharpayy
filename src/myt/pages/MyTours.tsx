import { useMemo, useState } from "react";
import { useAppState } from "@/myt/lib/app-context";
import { useAuthUser } from "@/lib/auth-store";
import { useAssignmentNotifications } from "@/lib/assignment-notifications-store";
import { cn } from "@/lib/utils";
import { TourDetailPanel } from "@/myt/components/TourDetailPanel";

type StatusFilter = "all" | "scheduled" | "completed" | "cancelled" | "no-show" | "has-clash";

export default function MyTours() {
  const { tours } = useAppState();
  const authUser = useAuthUser((s) => s.user);
  const myId = authUser?.id;

  const [filter, setFilter] = useState<StatusFilter>("all");
  const [selectedTour, setSelectedTour] = useState<any>(null);

  // Local date string YYYY-MM-DD
  const today = (() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  })();

  const { pending } = useAssignmentNotifications();
  const pendingTourIds = useMemo(() => new Set(pending.filter(p => p.type === "tour" && p.status === "pending").map(p => p.entityId)), [pending]);

  const myTours = useMemo(() => {
    return tours
      .filter((t: any) => 
        t.assignedTo === myId && 
        !pendingTourIds.has(t.id || t._id) &&
        !(t.budget === 0 && typeof t.leadName === 'string' && t.leadName.startsWith("Customer "))
      )
      .sort((a: any, b: any) => {
        // Today's tours first, then by date, then by time
        const aIsToday = a.tourDate === today;
        const bIsToday = b.tourDate === today;
        if (aIsToday && !bIsToday) return -1;
        if (!aIsToday && bIsToday) return 1;
        const dateCompare = (a.tourDate || "").localeCompare(b.tourDate || "");
        if (dateCompare !== 0) return dateCompare;
        return (a.tourTime || "").localeCompare(b.tourTime || "");
      });
  }, [tours, myId, today]);

  // Clash detection — tours on same date with overlapping times for this TCM
  const clashes = useMemo(() => {
    const clashIds = new Set<string>();
    const byDate: Record<string, any[]> = {};
    myTours.forEach((t: any) => {
      if (!t.tourDate || t.status === "cancelled") return;
      if (!byDate[t.tourDate]) byDate[t.tourDate] = [];
      byDate[t.tourDate].push(t);
    });
    Object.values(byDate).forEach((dayTours) => {
      for (let i = 0; i < dayTours.length; i++) {
        for (let j = i + 1; j < dayTours.length; j++) {
          if (dayTours[i].tourTime === dayTours[j].tourTime) {
            clashIds.add(dayTours[i].id || dayTours[i]._id);
            clashIds.add(dayTours[j].id || dayTours[j]._id);
          }
        }
      }
    });
    return clashIds;
  }, [myTours]);

  const filtered = useMemo(() => {
    if (filter === "all") return myTours;
    if (filter === "scheduled") return myTours.filter((t: any) => t.status === "scheduled");
    if (filter === "completed") return myTours.filter((t: any) => t.status === "completed");
    if (filter === "cancelled") return myTours.filter((t: any) => t.status === "cancelled");
    if (filter === "no-show") return myTours.filter((t: any) => t.showUp === false);
    if (filter === "has-clash") return myTours.filter((t: any) => clashes.has(t.id));
    return myTours;
  }, [myTours, filter, clashes]);

  // Today's metrics
  const todayTours = myTours.filter((t: any) => t.tourDate === today);
  const todayCompleted = todayTours.filter((t: any) => t.status === "completed").length;
  const todayPending = todayTours.filter((t: any) => t.status === "scheduled").length;
  const pendingPostTour = myTours.filter((t: any) =>
    t.status === "completed" && !t.postTour?.filledAt
  ).length;

  const FILTERS: { key: StatusFilter; label: string }[] = [
    { key: "all", label: `All (${myTours.length})` },
    ...(clashes.size > 0 ? [{ key: "has-clash" as StatusFilter, label: `Clashes (${myTours.filter((t:any) => clashes.has(t.id)).length})` }] : []),
    { key: "scheduled", label: `Scheduled (${myTours.filter((t:any) => t.status === "scheduled").length})` },
    { key: "completed", label: `Done (${myTours.filter((t:any) => t.status === "completed").length})` },
    { key: "cancelled", label: `Cancelled (${myTours.filter((t:any) => t.status === "cancelled").length})` },
    { key: "no-show", label: `No-show (${myTours.filter((t:any) => t.showUp === false).length})` },
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] min-h-0">
      {/* Left: Tour list */}
      <div className={cn(
        "flex flex-col min-h-0 border-r border-border",
        selectedTour ? "hidden lg:flex flex-1" : "flex-1"
      )}>
        {/* Metrics bar */}
        <div className="px-4 pt-4 pb-3 border-b border-border bg-background">
          <h1 className="text-lg font-bold mb-3">My Tours</h1>
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: "Total", value: myTours.length },
              { label: "Today", value: todayTours.length, highlight: todayTours.length > 0 },
              { label: "Done today", value: todayCompleted },
              { label: "Post-tour pending", value: pendingPostTour, alert: pendingPostTour > 0 },
            ].map((m) => (
              <div
                key={m.label}
                className={cn(
                  "rounded-lg border p-2 text-center",
                  m.alert ? "border-red-300 bg-red-50" : "border-border bg-muted/20"
                )}
              >
                <div className={cn(
                  "text-xl font-bold",
                  m.alert ? "text-red-600" : "text-foreground"
                )}>
                  {m.value}
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{m.label}</div>
              </div>
            ))}
          </div>

          {/* Today pending alert */}
          {todayPending > 0 && (
            <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-1.5 text-xs text-amber-800">
              {todayPending} tour{todayPending > 1 ? "s" : ""} scheduled today — {todayCompleted} done
            </div>
          )}

          {/* Clash warning */}
          {clashes.size > 0 && (
            <button 
              onClick={() => setFilter("has-clash")}
              className="mt-2 w-full text-left rounded-md bg-red-50 hover:bg-red-100 transition-colors border border-red-200 px-3 py-1.5 text-xs text-red-800 font-medium">
              ⚠ {myTours.filter((t:any) => clashes.has(t.id || t._id)).length} tour{myTours.filter((t:any) => clashes.has(t.id || t._id)).length > 1 ? "s have" : " has"} a time clash — tap to view
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                filter === f.key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Tour list */}
        <div className="flex-1 overflow-y-auto divide-y divide-border">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No tours in this category
            </div>
          ) : (
            filtered.map((tour: any) => (
              <TourRow
                key={tour.id || tour._id}
                tour={tour}
                isToday={tour.tourDate === today}
                hasClash={clashes.has(tour.id || tour._id)}
                isSelected={(selectedTour?.id || selectedTour?._id) === (tour.id || tour._id)}
                onClick={() => setSelectedTour(tour)}
              />
            ))
          )}
        </div>
      </div>

      {/* Right: Tour detail panel */}
      {selectedTour && (
        <div className="flex-1 min-h-0">
          <TourDetailPanel
            tour={selectedTour}
            onClose={() => setSelectedTour(null)}
            onUpdate={(updates: any) => {
              setSelectedTour((prev: any) => ({ ...prev, ...updates }));
            }}
          />
        </div>
      )}
    </div>
  );
}

function formatTime12(timeStr: string) {
  if (!timeStr) return "";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const h = parseInt(parts[0], 10);
  if (isNaN(h)) return timeStr;
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 || 12;
  return `${h12}:${parts[1]} ${ampm}`;
}

function formatDateReadable(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  return `${day} ${months[month]}, ${year}`;
}

// Tour row component
function TourRow({ tour, isToday, hasClash, isSelected, onClick }: {
  tour: any;
  isToday: boolean;
  hasClash: boolean;
  isSelected: boolean;
  onClick: () => void;
}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const isOverdue = tour.status === "scheduled" && tour.tourDate < todayStr;
  const needsPostTour = (tour.status === "completed" || isOverdue) && !tour.postTour?.filledAt;
  
  const statusColors: Record<string, string> = {
    scheduled: isOverdue ? "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200" : "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
    completed: "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-200",
    cancelled: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
    "no-show": "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-200",
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-4 py-3 hover:bg-muted/40 transition-colors",
        isSelected && "bg-primary/5 border-l-2 border-primary",
        hasClash && "bg-red-50 dark:bg-red-900/20",
        isOverdue && !isSelected && !hasClash && "bg-amber-50 dark:bg-amber-900/20"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm truncate">{tour.leadName || "Unknown"}</span>
            {isToday && (
              <span className="shrink-0 text-[9px] font-bold uppercase bg-primary text-primary-foreground rounded px-1.5 py-0.5">
                Today
              </span>
            )}
            {hasClash && (
              <span className="shrink-0 text-[9px] font-bold uppercase bg-red-500 text-white rounded px-1.5 py-0.5">
                Clash
              </span>
            )}
            {needsPostTour && (
              <span className="shrink-0 text-[9px] font-bold uppercase bg-amber-500 text-white rounded px-1.5 py-0.5">
                Fill outcome
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-1 font-medium uppercase tracking-wide">
            {tour.propertyName || "No property"}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {tour.area} · ₹{(tour.budget || 0).toLocaleString()}/mo
          </div>
          {/* Cancellation reason */}
          {tour.status === "cancelled" && tour.cancellationReason && (
            <div className="text-xs text-red-600 mt-1">
              Reason: {tour.cancellationReason}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right flex flex-col items-end">
          <span className={cn(
            "text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5 mb-1.5",
            statusColors[tour.status] || "bg-gray-100 text-gray-600"
          )}>
            {isOverdue && tour.status === "scheduled" ? "OVERDUE" : tour.status}
          </span>
          <div className={cn("text-[11px] font-medium", isOverdue ? "text-amber-600 font-bold" : "text-muted-foreground")}>
            {formatDateReadable(tour.tourDate)}
          </div>
          <div className="text-xs font-bold text-foreground mt-0.5">{formatTime12(tour.tourTime)}</div>
        </div>
      </div>
    </button>
  );
}
