import { useMemo } from "react";
import type { TCM } from "@/lib/types";
import {
  pickLeadsForHardAction,
  topSuggestion,
  classifyImpactPriority,
  IMPACT_PRIORITY_META,
  mapNbaToFocusAction,
  type HardActionKey,
  type LeadFocusAction,
  type ImpactEnrichedPick,
} from "@/lib/crm10x/impact-hard-actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import {
  Calendar,
  ChevronDown,
  FileText,
  Flame,
  Handshake,
  Home,
  KeyRound,
  Phone,
  RotateCcw,
  Sparkles,
} from "lucide-react";

type ActionDef = {
  key: HardActionKey;
  label: string;
  sub?: string;
  icon: typeof Phone;
  className: string;
};

const ACTIONS: ActionDef[] = [
  { key: "call-hot", label: "Call", sub: "HOT", icon: Flame, className: "bg-card border-border hover:border-danger/50" },
  { key: "schedule", label: "Schedule", icon: Calendar, className: "bg-warning/10 border-warning/40 text-warning hover:bg-warning/20" },
  { key: "quote", label: "Quote", icon: FileText, className: "bg-warning/5 border-warning/30 hover:bg-warning/10" },
  { key: "negotiate", label: "Negotiate", icon: Handshake, className: "bg-destructive/5 border-destructive/30 hover:bg-destructive/10" },
  { key: "book", label: "Book", icon: Home, className: "bg-success/10 border-success/40 text-success hover:bg-success/20" },
  { key: "checkin", label: "Check-in", icon: KeyRound, className: "bg-card border-border hover:border-accent/50" },
  { key: "revive", label: "Revive", icon: RotateCcw, className: "bg-card border-border hover:border-muted-foreground" },
];

function leadFirst(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

function tcmFirst(tcms: TCM[], id: string) {
  const t = tcms.find((x) => x.id === id);
  return t ? leadFirst(t.name) : "";
}

export function ImpactHardActionsBar({
  enriched,
  tcms,
  onPickLead,
}: {
  enriched: ImpactEnrichedPick[];
  tcms: TCM[];
  onPickLead: (leadId: string, name: string, action: LeadFocusAction) => void;
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
    <div className="rounded-lg border border-border bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Suggested now — one clear directive */}
      {suggested && suggested.nba.verb !== "rest" && (
        <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-accent/15 via-card to-primary/10 border-b border-border">
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

      <div className="px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold shrink-0 mr-1">
            Hard actions
          </span>

          {ACTIONS.map((action) => {
            const key = action.key;
            const list = picks[key];
            const top = list[0];
            const assignee = top ? tcmFirst(tcms, top.lead.assignedTcmId) : "";
            const Icon = action.icon;

            return (
              <div
                key={key}
                className={`inline-flex h-7 items-stretch rounded-full border text-[11px] font-medium overflow-hidden ${action.className}`}
              >
                <button
                  type="button"
                  className="inline-flex items-center gap-1 px-2 hover:bg-black/5 transition"
                  title={top ? `Open ${action.label} for ${top.lead.name}` : `No lead for ${action.label}`}
                  disabled={!top}
                  onClick={() => top && onPickLead(top.lead.id, top.lead.name, key)}
                >
                  <Icon className="h-3 w-3 shrink-0" />
                  <span>{action.label}</span>
                  {action.sub && (
                    <span className="text-[10px] font-bold uppercase opacity-90">{action.sub}</span>
                  )}
                  {top && (
                    <span className="text-[10px] opacity-80 max-w-[56px] truncate">
                      · {leadFirst(top.lead.name)}
                    </span>
                  )}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="px-1.5 border-l border-current/20 hover:bg-black/5 flex items-center"
                      aria-label={`More leads for ${action.label}`}
                    >
                      <ChevronDown className="h-3 w-3 opacity-70" />
                    </button>
                  </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs">
                    {action.label}
                    {list.length > 0 ? ` · ${list.length} lead${list.length === 1 ? "" : "s"}` : ""}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {list.length === 0 ? (
                    <DropdownMenuItem disabled className="text-xs">
                      No leads need this right now
                    </DropdownMenuItem>
                  ) : (
                    list.map((e) => {
                      const pri = classifyImpactPriority(e);
                      const meta = IMPACT_PRIORITY_META[pri];
                      return (
                        <DropdownMenuItem
                          key={e.lead.id}
                          className="text-xs flex flex-col items-start gap-0.5 py-2"
                          onClick={() => onPickLead(e.lead.id, e.lead.name, key)}
                        >
                          <div className="flex items-center gap-2 w-full">
                            <span className={`h-2 w-2 rounded-full shrink-0 ${meta.dot}`} />
                            <span className="font-semibold truncate flex-1">{e.lead.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase">{e.lead.intent}</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground pl-4 truncate w-full">
                            Move-in: {(() => {
                              if (!e.lead.moveInDate) return "TBD";
                              const d = new Date(e.lead.moveInDate);
                              if (isNaN(d.getTime())) return "TBD";
                              return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(d);
                            })()} · {e.lead.propertyName || e.lead.preferredArea || "Any Property"}
                            {e.openTour && (() => {
                              const d = new Date(e.openTour.scheduledAt);
                              const label = isNaN(d.getTime()) ? "TBD" : new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
                              return <> · Tour: {label}</>;
                            })()}
                          </span>
                        </DropdownMenuItem>
                      );
                    })
                  )}
                </DropdownMenuContent>
                </DropdownMenu>
              </div>
            );
          })}
        </div>

        <div className="hidden flex-wrap items-center gap-3 pt-1 border-t border-border/80">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-semibold">
            Priority
          </span>
          {(Object.keys(IMPACT_PRIORITY_META) as Array<keyof typeof IMPACT_PRIORITY_META>).map((p) => (
            <span key={p} className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${IMPACT_PRIORITY_META[p].dot}`} />
              {IMPACT_PRIORITY_META[p].label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
