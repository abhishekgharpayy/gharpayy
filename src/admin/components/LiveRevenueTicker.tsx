/**
 * LiveRevenueTicker — animated revenue number that counts up whenever
 * the booked revenue changes. Shows pipeline vs booked side by side.
 * Used in AdminShell header.
 */
import { useEffect, useRef, useState } from "react";
import { useLiveSupremeMetrics } from "@/admin/lib/use-live-supreme";
import { computeMoneyMap } from "@/admin/lib/supreme-metrics";
import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { TrendingUp } from "lucide-react";

function useAnimatedNumber(target: number, duration = 800) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current;
    const diff = target - start;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(start + diff * eased));
      if (t < 1) {
        frame.current = requestAnimationFrame(tick);
      } else {
        prev.current = target;
      }
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return display;
}

function inrShort(n: number): string {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`;
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`;
  return `₹${n}`;
}

export function LiveRevenueTicker() {
  const { rows, isLoading } = useLiveSupremeMetrics();
  const money = useMemo(() => computeMoneyMap(rows), [rows]);

  const bookedDisplay = useAnimatedNumber(money.bookedRevenue);
  const pipelineDisplay = useAnimatedNumber(money.pipelineRevenue);

  if (isLoading && money.bookedRevenue === 0) {
    return (
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground animate-pulse">
        <TrendingUp className="h-3 w-3" />
        Loading revenue…
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-[11px]">
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Booked</span>
        <span
          className={cn(
            "font-mono font-semibold tabular-nums transition-colors",
            money.bookedRevenue > 0 ? "text-success" : "text-muted-foreground",
          )}
        >
          {inrShort(bookedDisplay)}
        </span>
      </div>
      <div className="w-px h-3 bg-border" />
      <div className="flex items-center gap-1.5">
        <span className="text-muted-foreground">Pipeline</span>
        <span className="font-mono font-semibold tabular-nums text-info">
          {inrShort(pipelineDisplay)}
        </span>
      </div>
      <TrendingUp className="h-3 w-3 text-muted-foreground" />
    </div>
  );
}
