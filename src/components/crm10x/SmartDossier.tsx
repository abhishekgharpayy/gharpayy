import { useMemo } from "react";
import { useApp } from "@/lib/store";
import type { Lead } from "@/lib/types";
import { formatINR, useQuotationsQuery } from "@/lib/crm10x/quotations";
import { useLeadInterests } from "@/lib/crm10x/lead-interests";
import { Badge } from "@/components/ui/badge";
import { Brain, Target, AlertTriangle, Heart } from "lucide-react";

/**
 * Smart Dossier — 3-line auto-summary of a lead, derived from store data.
 * Drop into any drawer/sheet for an instant context bite.
 */
export function SmartDossier({ lead }: { lead: Lead }) {
  const tours = useApp((s) => s.tours);
  const properties = useApp((s) => s.properties);
  const activities = useApp((s) => s.activities);
  const { data: quotes = [] } = useQuotationsQuery(lead.id);
  const { data: interests = [] } = useLeadInterests(lead.id);

  const summary = useMemo(() => {
    const leadTours = tours.filter((t) => t.leadId === lead.id);
    const lastTour = [...leadTours].sort((a, b) => +new Date(b.scheduledAt) - +new Date(a.scheduledAt))[0];
    const lastQuote = quotes
      .filter((q) => q.leadId === lead.id)
      .sort((a, b) => +new Date(b.sentAt) - +new Date(a.sentAt))[0];
    const lastNote = activities
      .filter((a) => a.leadId === lead.id && a.kind === "note_added")
      .sort((a, b) => +new Date(b.ts) - +new Date(a.ts))[0];

    // Line 1 — budget + area + move-in
    const budgetLine = `${formatINR(lead.budget)}/mo · ${lead.preferredArea}${lead.moveInDate ? ` · move-in ${lead.moveInDate}` : ""}`;

    // Line 2 — must-haves (from tags) + interested properties
    const mustHaves = (lead.tags ?? []).filter((t) => !["hot", "warm", "cold"].includes(t)).slice(0, 3);
    const liked = interests
      .map((pid) => properties.find((p) => p.id === pid)?.name)
      .filter(Boolean)
      .slice(0, 2)
      .join(", ");
    const wantsLine =
      [mustHaves.length ? `Wants: ${mustHaves.join(" · ")}` : null, liked ? `Liked: ${liked}` : null]
        .filter(Boolean)
        .join("  ·  ") || "No stated preferences yet.";

    // Line 3 — last objection / blocker / signal
    const objection = lastTour?.postTour?.objection ?? lastTour?.postTour?.objectionNote;
    const blockerLine = objection
      ? `Last blocker: ${objection}`
      : lastQuote
        ? `Quote sent ${new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(new Date(lastQuote.sentAt))} · awaiting reply.`
        : lastNote
          ? `Latest note: ${lastNote.text.slice(0, 90)}${lastNote.text.length > 90 ? "…" : ""}`
          : "No blocker logged. Fresh lead.";

    return { budgetLine, wantsLine, blockerLine, lastTour, lastQuote };
  }, [lead, tours, properties, activities, quotes, interests]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-accent/30 bg-gradient-to-br from-accent/5 via-card to-primary/5 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-md bg-accent/15 text-accent flex items-center justify-center">
          <Brain className="h-3.5 w-3.5" />
        </div>
        <div className="text-[10px] uppercase tracking-[0.18em] font-semibold text-accent">Smart dossier</div>
        <Badge variant="outline" className="text-[9px] ml-auto">{lead.intent}</Badge>
        <Badge variant="outline" className="text-[9px]">{lead.confidence}% conf</Badge>
      </div>
      <div className="space-y-1.5 text-xs">
        <div className="flex items-start gap-2">
          <Target className="h-3 w-3 text-primary mt-0.5 shrink-0" />
          <span className="text-foreground">{summary.budgetLine}</span>
        </div>
        <div className="flex items-start gap-2">
          <Heart className="h-3 w-3 text-danger mt-0.5 shrink-0" />
          <span className="text-foreground">{summary.wantsLine}</span>
        </div>
        <div className="flex items-start gap-2">
          <AlertTriangle className="h-3 w-3 text-warning mt-0.5 shrink-0" />
          <span className="text-foreground">{summary.blockerLine}</span>
        </div>
      </div>
    </div>
  );
}