import { useState } from "react";
import { X, Phone, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppState } from "@/myt/lib/app-context";
import { dispatch } from "@/lib/api/command-bus";
import { toast } from "sonner";

type Tab = "brief" | "post-tour";

const CANCELLATION_REASONS = [
  "Lead not responding",
  "Lead cancelled",
  "Lead rescheduled",
  "Property not available",
  "TCM unavailable",
  "Wrong area / location",
  "Budget mismatch",
  "Lead booked elsewhere",
  "Other",
];

const OUTCOMES = [
  { v: "booked", label: "Booked & Paid Token" },
  { v: "will-book", label: "Will Book Soon" },
  { v: "follow-up", label: "Needs Follow-up" },
  { v: "rejected", label: "Not Interested" },
];

const OBJECTIONS = [
  "Price too high",
  "Location issue",
  "Room size",
  "Food preference",
  "Safety concern",
  "Parents not convinced",
  "Comparing options",
  "Move-in date mismatch",
  "Other",
];

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

export function TourDetailPanel({ tour, onClose, onUpdate }: {
  tour: any;
  onClose: () => void;
  onUpdate: (updates: any) => void;
}) {
  const [tab, setTab] = useState<Tab>(
    tour.status === "completed" && !tour.postTour?.filledAt ? "post-tour" : "brief"
  );
  const [showPhone, setShowPhone] = useState(false);
  const [saving, setSaving] = useState(false);

  // Brief tab state
  const [status, setStatus] = useState(tour.status || "scheduled");
  const [showUp, setShowUp] = useState<boolean | null>(tour.showUp ?? null);
  const [cancellationReason, setCancellationReason] = useState(tour.cancellationReason || "");

  // Post-tour state
  const [outcome, setOutcome] = useState(tour.postTour?.outcome || "");
  const [confidence, setConfidence] = useState(tour.postTour?.confidence ?? 50);
  const [objection, setObjection] = useState(tour.postTour?.objection || "");
  const [objectionNote, setObjectionNote] = useState(tour.postTour?.objectionNote || "");
  const [decisionDate, setDecisionDate] = useState(tour.postTour?.expectedDecisionAt?.slice(0, 10) || "");
  const [followUpDate, setFollowUpDate] = useState(
    tour.postTour?.nextFollowUpAt?.slice(0, 10) ||
    new Date().toISOString().slice(0, 10)
  );

  const { setTours } = useAppState();

  const saveStatus = async () => {
    setSaving(true);
    try {
      const result = await dispatch({
        type: "cmd.tour.update",
        payload: {
          tourId: tour.id || tour._id,
          status,
          showUp,
          cancellationReason: status === "cancelled" ? cancellationReason : undefined,
        } as any,
      });
      if (!result.ok) { toast.error("Failed to save"); return; }
      onUpdate({ status, showUp, cancellationReason });
      setTours((prev: any[]) => prev.map((t: any) =>
        (t.id === tour.id || t._id === tour._id)
          ? { ...t, status, showUp, cancellationReason }
          : t
      ));
      toast.success("Saved");
      // Auto-switch to post-tour if completed
      if (status === "completed") setTab("post-tour");
    } catch { toast.error("Error saving"); }
    finally { setSaving(false); }
  };

  const savePostTour = async () => {
    if (!outcome) { toast.error("Select an outcome"); return; }
    if (!followUpDate) { toast.error("Set follow-up date"); return; }
    setSaving(true);
    try {
      const result = await dispatch({
        type: "cmd.tour.update_post_tour",
        payload: {
          tourId: tour.id || tour._id,
          outcome,
          confidence,
          objection: objection || null,
          objectionNote,
          expectedDecisionAt: decisionDate || null,
          nextFollowUpAt: followUpDate,
          filledAt: new Date().toISOString(),
        } as any,
      });
      if (!result.ok) { toast.error("Failed to save post-tour"); return; }
      const postTour = { outcome, confidence, objection, objectionNote,
        expectedDecisionAt: decisionDate, nextFollowUpAt: followUpDate,
        filledAt: new Date().toISOString() };
      onUpdate({ postTour });
      setTours((prev: any[]) => prev.map((t: any) =>
        (t.id === tour.id || t._id === tour._id)
          ? { ...t, postTour }
          : t
      ));
      toast.success("Post-tour saved");
    } catch { toast.error("Error saving"); }
    finally { setSaving(false); }
  };

  const needsPostTour = tour.status === "completed" && !tour.postTour?.filledAt;

  return (
    <div className="flex flex-col h-full bg-background min-h-0">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1 pr-4">
            <div className="font-extrabold text-xl truncate text-foreground tracking-tight">{tour.leadName}</div>
            <div className="text-sm font-bold text-primary mt-1 inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1">
              {tour.propertyName}
            </div>
            <div className="text-xs text-muted-foreground mt-2 font-medium">
              {tour.area} · ₹{(tour.budget || 0).toLocaleString()}/mo
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-full p-2 bg-muted hover:bg-muted/80 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Phone */}
        <div className="mt-4">
          <div
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-muted/50 px-4 py-2 border border-border"
          >
            <Phone className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-bold text-foreground tracking-wide">
              {tour.phone || "No phone number"}
            </span>
          </div>
        </div>

        {/* Pending post-tour alert */}
        {needsPostTour && (
          <div className="mt-2 rounded-md bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="inline h-3.5 w-3.5 mr-1" /> Tour done — fill the outcome to unlock next steps
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        {(["brief", "post-tour"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-xs font-medium transition-colors capitalize",
              tab === t
                ? "border-b-2 border-primary text-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "brief" ? "Tour Details" : "Post-tour Outcome"}
            {t === "post-tour" && needsPostTour && (
              <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4">

        {/* Brief tab */}
        {tab === "brief" && (
          <div className="space-y-4">
            {/* Lead info */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="text-[10px] font-bold uppercase text-muted-foreground">Lead Info</div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Name</div>
                  <div className="font-semibold">{tour.leadName}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Budget</div>
                  <div className="font-semibold">₹{(tour.budget || 0).toLocaleString()}/mo</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-0.5">Area</div>
                  <div className="font-semibold">{tour.area}</div>
                </div>
                <div>
                  <div className="text-[10px] font-bold text-primary uppercase tracking-wider mb-0.5">Tour Time</div>
                  <div className="font-bold text-primary">{formatDateReadable(tour.tourDate)} · {formatTime12(tour.tourTime)}</div>
                </div>
              </div>
            </div>

            {/* Show-up */}
            <div className="pt-2">
              <div className="text-xs font-bold mb-2 uppercase text-muted-foreground tracking-wider">Did they show up?</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: true, label: "Yes, Showed Up", activeClass: "bg-emerald-500 text-white border-emerald-500" },
                  { v: false, label: "No Show", activeClass: "bg-red-500 text-white border-red-500" },
                ].map((opt) => (
                  <button
                    key={String(opt.v)}
                    onClick={() => {
                      setShowUp(opt.v);
                      if (opt.v === true && status !== "completed") setStatus("completed");
                      if (opt.v === false && status !== "no-show") setStatus("no-show");
                    }}
                    className={cn(
                      "rounded-xl border-2 py-3 text-sm font-bold transition-colors shadow-sm",
                      showUp === opt.v ? opt.activeClass : "bg-background border-border hover:bg-muted text-muted-foreground"
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tour status */}
            <div className="pt-2">
              <div className="text-xs font-bold mb-2 uppercase text-muted-foreground tracking-wider">Update Tour Status</div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { v: "completed", label: "Tour Done" },
                  { v: "no-show", label: "No Show" },
                  { v: "rescheduled", label: "Rescheduled" },
                  { v: "cancelled", label: "Cancelled" },
                  { v: "scheduled", label: "Still Scheduled" },
                ].map((s) => (
                  <button
                    key={s.v}
                    onClick={() => {
                      setStatus(s.v);
                      if (s.v === "completed") setShowUp(true);
                      if (s.v === "no-show") setShowUp(false);
                    }}
                    className={cn(
                      "rounded-xl border-2 py-2.5 text-xs font-bold transition-colors",
                      status === s.v
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "bg-background border-border hover:bg-muted text-foreground"
                    )}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cancellation reason — only if cancelled */}
            {status === "cancelled" && (
              <div className="bg-muted/30 rounded-xl p-3 border border-border">
                <div className="text-[10px] font-bold uppercase text-muted-foreground tracking-wider mb-2.5">Reason for cancellation</div>
                <div className="flex flex-wrap gap-2">
                  {CANCELLATION_REASONS.map((r) => {
                    const isSelected = cancellationReason === r || (r === "Other" && !CANCELLATION_REASONS.includes(cancellationReason) && cancellationReason !== "");
                    return (
                      <button
                        key={r}
                        onClick={() => setCancellationReason(r === "Other" ? "" : r)}
                        className={cn(
                          "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors shadow-sm",
                          isSelected
                            ? "bg-foreground text-background border-foreground"
                            : "bg-background border-border hover:bg-muted text-muted-foreground"
                        )}
                      >
                        {r}
                      </button>
                    );
                  })}
                </div>
                {(!CANCELLATION_REASONS.includes(cancellationReason) && cancellationReason !== "" || cancellationReason === "Other" || !CANCELLATION_REASONS.includes(cancellationReason) && document.activeElement?.getAttribute('name') === 'customReason') && (
                  <input
                    type="text"
                    name="customReason"
                    placeholder="Type the exact reason..."
                    value={CANCELLATION_REASONS.includes(cancellationReason) ? "" : cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className="mt-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                    autoFocus
                  />
                )}
              </div>
            )}

            <button
              onClick={saveStatus}
              disabled={saving}
              className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        )}

        {/* Post-tour tab */}
        {tab === "post-tour" && (
          <div className="space-y-4">
            {/* Outcome */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">What happened? *</div>
              <div className="grid grid-cols-2 gap-2">
                {OUTCOMES.map((o) => (
                  <button
                    key={o.v}
                    onClick={() => {
                      setOutcome(o.v);
                      if (o.v === "booked") setConfidence(100);
                      else if (o.v === "rejected") setConfidence(0);
                    }}
                    className={cn(
                      "rounded-xl border-2 py-2 px-3 text-xs font-bold text-center transition-all",
                      outcome === o.v
                        ? "bg-foreground text-background border-foreground shadow-sm"
                        : "bg-background border-border hover:bg-muted"
                    )}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Confidence */}
            <div>
              <div className="text-xs font-semibold mb-2">
                How likely to book? — <span className="text-primary">{confidence}%</span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={10}
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="w-full accent-primary"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Not likely</span>
                <span>Very likely</span>
              </div>
            </div>

            {/* Objection */}
            <div>
              <div className="text-xs font-semibold mb-2">Main objection (if any)</div>
              <div className="flex flex-wrap gap-2">
                {OBJECTIONS.map((o) => {
                  const isSelected = objection === o || (o === "Other" && !OBJECTIONS.includes(objection) && objection !== "");
                  return (
                    <button
                      key={o}
                      onClick={() => setObjection(o === "Other" ? "" : o)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors shadow-sm",
                        isSelected
                          ? "bg-foreground text-background border-foreground"
                          : "bg-background border-border hover:bg-muted text-muted-foreground"
                      )}
                    >
                      {o}
                    </button>
                  );
                })}
              </div>
              {(!OBJECTIONS.includes(objection) && objection !== "" || objection === "Other" || !OBJECTIONS.includes(objection) && document.activeElement?.getAttribute('name') === 'customObjection') && (
                <input
                  type="text"
                  name="customObjection"
                  placeholder="Type the exact objection..."
                  value={OBJECTIONS.includes(objection) ? "" : objection}
                  onChange={(e) => setObjection(e.target.value)}
                  className="mt-3 flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
                  autoFocus
                />
              )}
            </div>

            {/* Notes */}
            <div>
              <div className="text-xs font-semibold mb-1">What exactly did they say?</div>
              <textarea
                value={objectionNote}
                onChange={(e) => setObjectionNote(e.target.value)}
                placeholder="Write their exact words — this helps Flow-Ops follow up correctly"
                rows={3}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs resize-none"
              />
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs font-semibold mb-1">Expected decision date</div>
                <input
                  type="date"
                  value={decisionDate}
                  onChange={(e) => setDecisionDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
              <div>
                <div className="text-xs font-semibold mb-1">Follow-up date *</div>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={(e) => setFollowUpDate(e.target.value)}
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs"
                />
              </div>
            </div>

            <button
              onClick={savePostTour}
              disabled={saving || !outcome}
              className="w-full rounded-lg bg-primary text-primary-foreground py-3 text-sm font-semibold disabled:opacity-50"
            >
              {saving ? "Saving..." : "Submit post-tour"}
            </button>

            <p className="text-[10px] text-center text-muted-foreground">
              This goes to Flow-Ops immediately after you submit
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
