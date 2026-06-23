import { useAppState } from "@/myt/lib/app-context";
import { useAuthUser } from "@/lib/auth-store";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Clock, AlertCircle } from "lucide-react";
import { LeadControlPanel } from "@/myt/components/LeadControlPanel";

export default function PostTours() {
  const { tours } = useAppState();
  const authUser = useAuthUser((s) => s.user);
  const leads = useApp((s) => s.leads);

  const myId = authUser?.id;

  // Helper to filter out fake/mock leads
  const isRealTour = (t: any) => {
    const leadName = t.leadName || getLead(t.leadId)?.name || "";
    return !(t.budget === 0 && typeof leadName === "string" && leadName.startsWith("Customer "));
  };

  const getLead = (leadId: string) => leads.find((l) => l.id === leadId);

  // All tours assigned to me that are completed but post-tour not filled
  const pendingPostTours = tours.filter(
    (t) =>
      (t.assignedTo === myId) &&
      t.status === "completed" &&
      !(t as any).postTour?.filledAt &&
      isRealTour(t)
  );

  // All tours assigned to me where post-tour IS filled — show as done
  const completedPostTours = tours.filter(
    (t) =>
      (t.assignedTo === myId) &&
      t.status === "completed" &&
      !!(t as any).postTour?.filledAt &&
      isRealTour(t)
  );

  return (
    <div className="space-y-6 animate-slide-up">
      <div>
        <h1 className="text-xl font-heading font-bold">Post Tours</h1>
        <p className="text-xs text-muted-foreground">
          Fill post-tour outcomes after each visit — this unlocks quoting and booking
        </p>
      </div>

      {/* Pending section */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-semibold">
            Pending ({pendingPostTours.length})
          </span>
        </div>

        {pendingPostTours.length === 0 ? (
          <div className="rounded-lg border border-border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
            All caught up — no pending post-tours
          </div>
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {pendingPostTours.map((tour) => {
              const lead = getLead((tour as any).leadId);
              const tourDate = (tour as any).tourDate || 
                (tour as any).scheduledAt?.split("T")[0] || "";
              const hoursAgo = (tour as any).updatedAt
                ? Math.floor(
                    (Date.now() - new Date((tour as any).updatedAt).getTime()) /
                      (1000 * 60 * 60)
                  )
                : null;

              return (
                <div
                  key={(tour as any)._id || (tour as any).id}
                  className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 space-y-2"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">
                        {(tour as any).leadName || lead?.name || "Unknown Lead"}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {(tour as any).propertyName || "Property"} · {tourDate}
                      </div>
                    </div>
                    {hoursAgo !== null && hoursAgo > 6 && (
                      <span className="text-[10px] rounded-full bg-red-500/10 text-red-500 px-2 py-0.5 font-medium flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {hoursAgo}h overdue
                      </span>
                    )}
                  </div>
                  <LeadControlPanel
                    subject={{ kind: 'tour', tour: tour as any }}
                    defaultTab="post-tour"
                    trigger={
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs"
                      >
                        Fill post-tour →
                      </Button>
                    }
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completed section */}
      {completedPostTours.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-success" />
            <span className="text-sm font-semibold">
              Completed ({completedPostTours.length})
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {completedPostTours.map((tour) => {
              const lead = getLead((tour as any).leadId);
              return (
                <div
                  key={(tour as any)._id || (tour as any).id}
                  className="rounded-lg border border-border bg-muted/20 p-3 space-y-1"
                >
                  <div className="text-sm font-semibold">
                    {(tour as any).leadName || lead?.name || "Unknown Lead"}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Outcome: <span className="font-medium text-foreground capitalize">
                      {(tour as any).postTour?.outcome ?? "—"}
                    </span>
                    {" · "}
                    Confidence: {(tour as any).postTour?.confidence ?? "—"}%
                  </div>
                  <div className="text-[10px] text-success">
                    Filled {(tour as any).postTour?.filledAt
                      ? new Date((tour as any).postTour.filledAt).toLocaleDateString()
                      : ""}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
