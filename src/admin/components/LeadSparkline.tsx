/**
 * LeadSparkline — inline SVG confidence trend for a single AdminLeadRow.
 *
 * We synthesize a 7-point heat history from the lead's stage progression,
 * tour outcomes, and current confidence score. Since we don't store point-in-
 * time confidence snapshots, we reconstruct a plausible curve:
 *   - Start at the lead's initial confidence (default 30 for new)
 *   - Bump at each tour / visit
 *   - Apply any post-tour outcome effect
 *   - Land at current probability
 *
 * Width: 64px  Height: 24px  — fits inline in a table cell or card.
 */
import type { AdminLeadRow } from "@/admin/lib/selectors";

interface Props {
  row: AdminLeadRow;
  width?: number;
  height?: number;
  color?: string;
}

export function LeadSparkline({ row, width = 64, height = 24, color }: Props) {
  const points = buildPoints(row);
  const path = toPath(points, width, height);
  const last = points[points.length - 1];
  const first = points[0];
  const trending = last > first + 5 ? "up" : last < first - 5 ? "down" : "flat";

  const lineColor =
    color ??
    (trending === "up"
      ? "var(--success, #22c55e)"
      : trending === "down"
      ? "var(--destructive, #ef4444)"
      : "var(--muted-foreground, #94a3b8)");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      fill="none"
      aria-label={`Confidence trend: ${first}% → ${last}%`}
      className="shrink-0"
    >
      {/* Area fill */}
      <path
        d={`${path} L ${width} ${height} L 0 ${height} Z`}
        fill={lineColor}
        fillOpacity="0.08"
      />
      {/* Line */}
      <path d={path} stroke={lineColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle
        cx={width}
        cy={height - (last / 100) * (height - 4) - 2}
        r="2"
        fill={lineColor}
      />
    </svg>
  );
}

/** Generate 7 confidence values (0-100) representing the lead's journey */
function buildPoints(row: AdminLeadRow): number[] {
  const { lead, tours, visits, probability } = row;

  // Stage-to-base-confidence mapping
  const STAGE_BASE: Record<string, number> = {
    new: 25,
    contacted: 35,
    "tour-scheduled": 45,
    "on-tour": 55,
    "tour-done": 60,
    negotiation: 72,
    "quote-sent": 78,
    booked: 100,
    dropped: 5,
  };

  const base = STAGE_BASE[lead.stage] ?? 30;
  const current = probability;

  // Build a 7-point curve from initial → current
  // Anchor point 0: likely ~25 (new lead)
  const start = 25;

  // Tour bumps
  const tourCount = Math.min(tours.length + visits.length, 3);
  const hasBadOutcome = tours.some((t) =>
    ["not-interested", "dropped", "follow-up"].includes(t.postTour?.outcome ?? ""),
  );
  const hasGoodOutcome = tours.some((t) =>
    ["booked", "thinking", "token-paid"].includes(t.postTour?.outcome ?? ""),
  );

  // Build 7 interpolated points with organic variation
  const mid = Math.round((start + base) / 2);
  const p: number[] = [
    start,
    Math.round(start + (mid - start) * 0.3),
    mid,
    Math.round(mid + (base - mid) * 0.3 + (tourCount > 0 ? 5 : 0)),
    Math.round(mid + (base - mid) * 0.6 + (tourCount > 1 ? 5 : 0) - (hasBadOutcome ? 10 : 0)),
    Math.round(base + (current - base) * 0.5 + (hasGoodOutcome ? 5 : 0)),
    current,
  ];

  return p.map((v) => Math.max(0, Math.min(100, v)));
}

/** Convert an array of 0-100 values to an SVG path string */
function toPath(points: number[], w: number, h: number): string {
  const pad = 2;
  const step = (w - pad) / (points.length - 1);
  return points
    .map((v, i) => {
      const x = pad / 2 + i * step;
      const y = h - pad - (v / 100) * (h - pad * 2);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}
