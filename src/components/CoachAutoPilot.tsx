/**
 * Coach 4.0 - Auto-Pilot card.
 * Renders the 3-step plan + streak multiplier badge.
 * Drop-in surface used by CoachPanel and the Today page.
 */
import { useEffect, useMemo, useState } from "react";
import { Sparkles, Zap, Clock, Target } from "lucide-react";
import { autoPilotPlan, streakMultiplier, tickMultiplier, multiplierLabel, type MultiplierState } from "@/lib/coach-pilot";
import type { CoachReport, CoachItem } from "@/lib/coach";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "gharpayy.coach.multiplier.v1";

function loadMult(): MultiplierState {
  if (typeof window === "undefined") return { lastClearedAt: null, comboCount: 0 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { lastClearedAt: null, comboCount: 0 };
    return JSON.parse(raw) as MultiplierState;
  } catch { return { lastClearedAt: null, comboCount: 0 }; }
}
function saveMult(m: MultiplierState) {
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(m)); } catch { /* ignore */ }
}

export function useCoachMultiplier() {
  const [state, setState] = useState<MultiplierState>(() => loadMult());
  useEffect(() => { saveMult(state); }, [state]);
  const bump = () => setState((s) => tickMultiplier(s));
  const mult = streakMultiplier(state);
  return { mult, bump, state };
}

export function CoachAutoPilot({
  report,
  onClear,
  onOpenLead,
  compact = false,
}: {
  report: CoachReport;
  onClear?: (item: CoachItem) => void;
  onOpenLead?: (leadId: string) => void;
  compact?: boolean;
}) {
  const plan = useMemo(() => autoPilotPlan(report), [report]);
  const { mult, bump } = useCoachMultiplier();
  const [analyzing, setAnalyzing] = useState(false);

  // Simulate "real-time Grok API" thinking when the top pick changes
  const topPickId = plan.picks[0]?.item.id;
  useEffect(() => {
    if (topPickId) {
      setAnalyzing(true);
      const t = setTimeout(() => setAnalyzing(false), 600);
      return () => clearTimeout(t);
    }
  }, [topPickId]);

  if (plan.picks.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-3 text-xs text-muted-foreground flex items-center gap-2">
        <Sparkles className="h-3.5 w-3.5 text-success" />
        Queue clear. Grok AI is standing by.
      </div>
    );
  }

  const topPick = plan.picks[0];

  return (
    <div className="space-y-3 mt-4">
      <div className="flex items-center gap-1.5 px-1 text-xs font-bold text-foreground uppercase tracking-wider">
        <Sparkles className="h-4 w-4 text-blue-500" />
         AI Suggested Next Action
      </div>

      <div className="flex items-center gap-4 rounded-xl border border-blue-200 bg-blue-50/40 dark:border-blue-900 dark:bg-blue-900/10 px-4 py-3 shadow-sm transition-all duration-300">
        <div className="flex-1 min-w-0">
          {analyzing ? (
            <div className="h-8 flex flex-col justify-center space-y-2">
              <div className="h-3 w-1/3 bg-blue-200/50 rounded animate-pulse" />
              <div className="h-2 w-1/2 bg-blue-100/50 rounded animate-pulse" />
            </div>
          ) : (
            <>
              <div className="text-sm font-bold text-foreground truncate">
                {topPick.item.title}
              </div>
              <div className="text-xs text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                <span className="font-semibold text-blue-600 dark:text-blue-400">Why:</span> {topPick.item.why}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0 items-end">
          <button
            type="button"
            disabled={analyzing}
            onClick={() => {
              if (topPick.item.leadId && onOpenLead) {
                onOpenLead(topPick.item.leadId);
              }
            }}
            className="inline-flex h-8 items-center justify-center rounded-md bg-blue-600 text-white px-4 text-xs font-bold shadow hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:opacity-50 disabled:pointer-events-none transition-colors"
          >
            Do it
          </button>
        </div>
      </div>
    </div>
  );
}
