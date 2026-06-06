import { useMemo } from "react";
import {
  pickLeadsForHardAction,
  topSuggestion,
  mapNbaToFocusAction,
  type HardActionKey,
  type LeadFocusAction,
  type ImpactEnrichedPick,
} from "@/lib/crm10x/impact-hard-actions";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  FileText,
  Flame,
  Handshake,
  Home,
  KeyRound,
  Phone,
  RotateCcw,
  Sparkles,
  ArchiveX,
} from "lucide-react";

type ActionDef = {
  key: HardActionKey;
  label: string;
  sub?: string;
  icon: typeof Phone;
  className: string;
};

const ACTIONS: ActionDef[] = [
  { key: "call-hot", label: "Call", sub: "HOT", icon: Flame, className: "border-danger/30 bg-danger/5 text-danger hover:bg-danger/10" },
  { key: "schedule", label: "Schedule", icon: Calendar, className: "border-warning/40 bg-warning/10 text-warning hover:bg-warning/20" },
  { key: "quote", label: "Quote", icon: FileText, className: "border-border bg-card hover:border-warning/40 hover:bg-warning/5" },
  { key: "negotiate", label: "Negotiate", icon: Handshake, className: "border-destructive/30 bg-destructive/5 text-destructive hover:bg-destructive/10" },
  { key: "book", label: "Book", icon: Home, className: "border-success/40 bg-success/10 text-success hover:bg-success/20" },
  { key: "checkin", label: "Check-in", icon: KeyRound, className: "border-border bg-card hover:border-accent/40 hover:bg-accent/5" },
  { key: "revive", label: "Revive", icon: RotateCcw, className: "border-border bg-card hover:border-muted-foreground/50 hover:bg-muted/40" },
];

function leadFirst(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

export function ImpactHardActionsBar({
  enriched,
  onPickLead,
  onOpenDropped,
}: {
  enriched: ImpactEnrichedPick[];
  onPickLead: (leadId: string, name: string, action: LeadFocusAction) => void;
  onOpenDropped?: () => void;
}) {
  const picks = useMemo(() => {
    const map = {} as Record<HardActionKey, ImpactEnrichedPick[]>;
    (["call-hot", "schedule", "quote", "negotiate", "book", "checkin", "revive"] as HardActionKey[]).forEach(
      (key) => {
        map[key] = pickLeadsForHardAction(key, enriched, 8);
      },
    );
    return map;
  }, [enriched]);

  const suggested = useMemo(() => topSuggestion(enriched), [enriched]);

  return (
    <div className="overflow-hidden rounded-lg bg-transparent">
      {/* Suggested now — one clear directive */}
      {suggested && suggested.nba.verb !== "rest" && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/20 bg-gradient-to-r from-accent/15 via-card to-primary/10 px-2.5 py-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Suggested now
            </div>
            <div className="text-xs font-semibold truncate">
              {suggested.nba.label} · <span className="text-accent">{suggested.lead.name}</span>
            </div>
            <div className="text-[10px] text-muted-foreground truncate">{suggested.nba.reason}</div>
          </div>
          <Button
            size="sm"
            className="h-7 text-[11px] shrink-0"
            onClick={() =>
              onPickLead(
                suggested.lead.id,
                suggested.lead.name,
                mapNbaToFocusAction(
                  suggested.nba.verb,
                  suggested.column,
                  Boolean(suggested.lastQuote),
                ),
              )
            }
          >
            Do it
          </Button>
        </div>
      )}

      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
          Hard actions
        </span>
        {ACTIONS.map((action) => {
          const list = picks[action.key];
          const top = list[0];
          const Icon = action.icon;

          return (
            <button
              key={action.key}
              type="button"
              disabled={!top}
              onClick={() => top && onPickLead(top.lead.id, top.lead.name, action.key)}
              title={top ? `${action.label} · ${top.lead.name}` : `No leads need ${action.label} right now`}
              className={`inline-flex h-7 items-center gap-1 rounded-full border px-2 text-[11px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-45 ${action.className}`}
            >
              <span className="inline-flex items-center gap-1">
                <Icon className="h-3.5 w-3.5" />
                {action.label}
                {action.sub ? <span className="text-[9px] uppercase">{action.sub}</span> : null}
              </span>
              <span className="rounded-full bg-background/70 px-1.5 py-0.5 text-[9px] text-muted-foreground">
                {list.length}
              </span>
              {top ? (
                <span className="max-w-[58px] truncate text-[10px] opacity-75">
                  {leadFirst(top.lead.name)}
                </span>
              ) : null}
            </button>
          );
        })}
        {onOpenDropped && (
          <button
            type="button"
            onClick={onOpenDropped}
            title="View dropped or lost leads"
            className="ml-auto inline-flex h-7 items-center gap-1 rounded-full border border-destructive/30 bg-destructive/5 px-3 text-[11px] font-semibold text-destructive transition hover:bg-destructive/10"
          >
            <ArchiveX className="h-3.5 w-3.5" />
            Dropped
          </button>
        )}
      </div>
    </div>
  );
}
