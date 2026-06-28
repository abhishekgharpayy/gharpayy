import type { FastifyInstance } from "fastify";

/**
 * MYT Funnel — Revenue Intelligence Engine.
 *
 * POST /api/myt/funnel/process
 * Body: { tours, bookings }
 * Returns: 7 unique analytics features.
 */

interface TourInput {
  id: string;
  leadName: string;
  assignedTo: string;
  assignedToName: string;
  propertyName: string;
  area: string;
  zoneId: string;
  tourDate: string;
  tourTime: string;
  status: string;
  showUp: boolean | null;
  outcome: string | null;
  budget: number;
  createdAt: string;
  whyLost: string | null;
  intent: string;
  confirmationStrength: string;
}

interface BookingInput {
  id: string;
  leadName: string;
  propertyName: string;
  area: string;
  rentValue: number;
  viaTour: boolean;
  tourId: string | null;
  closedBy: string;
  closedByName: string;
  createdAt: string;
}

interface FunnelInput {
  tours: TourInput[];
  bookings: BookingInput[];
}

// ---------- 1. Revenue Waterfall ----------
// Shows ₹ value flowing through each stage with leak amounts
function computeWaterfall(tours: TourInput[], bookings: BookingInput[]) {
  const avgBudget = tours.length > 0
    ? tours.reduce((s, t) => s + t.budget, 0) / tours.length
    : 0;

  const scheduled = tours.length;
  const showed = tours.filter((t) => t.showUp === true).length;
  const completed = tours.filter((t) => t.status === "completed").length;
  const drafts = tours.filter((t) => t.outcome === "draft").length;
  const booked = tours.filter((t) => t.outcome === "booked" || t.outcome === "token-paid").length;

  const scheduledValue = scheduled * avgBudget;
  const showValue = showed * avgBudget;
  const draftValue = drafts * avgBudget;
  const bookedValue = bookings.reduce((s, b) => s + b.rentValue, 0);

  const noShowLeak = scheduledValue - showValue;
  const noDraftLeak = showValue - draftValue;
  const draftToBookLeak = draftValue - bookedValue;

  const stages = [
    { label: "Scheduled", value: Math.round(scheduledValue), count: scheduled, color: "#3b82f6" },
    { label: "Show-Ups", value: Math.round(showValue), count: showed, leak: Math.round(noShowLeak), color: "#8b5cf6" },
    { label: "Drafts", value: Math.round(draftValue), count: drafts, leak: Math.round(noDraftLeak), color: "#f59e0b" },
    { label: "Booked", value: Math.round(bookedValue), count: booked + bookings.filter((b) => !b.viaTour).length, leak: Math.round(draftToBookLeak), color: "#22c55e" },
  ];

  const totalLeak = noShowLeak + noDraftLeak + draftToBookLeak;
  const biggestLeak = Math.max(noShowLeak, noDraftLeak, draftToBookLeak);
  const leakLabel =
    biggestLeak === noShowLeak ? "No-shows"
      : biggestLeak === noDraftLeak ? "Show but no draft"
        : "Draft but no booking";

  return {
    stages,
    totalLeak: Math.round(totalLeak),
    leakLabel,
    conversionValue: Math.round(bookedValue),
    avgBudget: Math.round(avgBudget),
  };
}

// ---------- 2. Tour Time Heatmap ----------
// Day × Hour grid showing conversion rate for each slot
function computeTimeHeatmap(tours: TourInput[]) {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const hours = ["9am", "10am", "11am", "12pm", "1pm", "2pm", "3pm", "4pm", "5pm", "6pm", "7pm", "8pm"];

  const grid: { day: string; hour: string; tours: number; showUps: number; booked: number; rate: number }[] = [];

  for (const day of days) {
    for (const hour of hours) {
      const matching = tours.filter((t) => {
        const d = new Date(t.tourDate);
        const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0
        const tourHour = parseInt(t.tourTime?.split(":")[0] || "0", 10);
        const hourLabel = tourHour <= 12 ? `${tourHour}am` : `${tourHour - 12}pm`;
        return days[dayOfWeek] === day && hourLabel === hour;
      });
      const showUps = matching.filter((t) => t.showUp === true).length;
      const booked = matching.filter((t) => t.outcome === "booked" || t.outcome === "token-paid").length;
      grid.push({
        day,
        hour,
        tours: matching.length,
        showUps,
        booked,
        rate: matching.length > 0 ? Math.round((booked / matching.length) * 100) : 0,
      });
    }
  }

  return grid;
}

// ---------- 3. Loss Reason Intelligence ----------
// Breakdown of whyLost data with actionable recommendations
function computeLossReasons(tours: TourInput[]) {
  const lost = tours.filter((t) => t.whyLost && t.whyLost !== "null");
  const total = lost.length;

  const reasonCounts: Record<string, number> = {};
  for (const t of lost) {
    const r = t.whyLost!;
    reasonCounts[r] = (reasonCounts[r] || 0) + 1;
  }

  const recommendations: Record<string, string> = {
    price: "Consider offering flexible payment plans or a lower-floor unit",
    location: "Show properties in adjacent areas; highlight commute advantages",
    food: "Partner with nearby food courts; highlight pantry/kitchen options",
    delay: "Implement same-day tour scheduling; reduce wait time",
    comparing: "Create a comparison sheet vs competitors; offer limited-time perks",
    other: "Schedule a follow-up call to uncover the real objection",
  };

  return Object.entries(reasonCounts)
    .map(([reason, count]) => ({
      reason,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      recommendation: recommendations[reason] || "Investigate further",
    }))
    .sort((a, b) => b.count - a.count);
}

// ---------- 4. Budget vs Actual Rent Scatter ----------
// Tours plotted by budget vs actual rent, showing pricing alignment
function computeBudgetVsActual(tours: TourInput[], bookings: BookingInput[]) {
  const linked = bookings
    .filter((b) => b.viaTour && b.tourId)
    .map((b) => {
      const tour = tours.find((t) => t.id === b.tourId);
      if (!tour) return null;
      return {
        leadName: b.leadName,
        area: b.area,
        budget: tour.budget,
        actualRent: b.rentValue,
        gap: b.rentValue - tour.budget,
        gapPct: tour.budget > 0 ? Math.round(((b.rentValue - tour.budget) / tour.budget) * 100) : 0,
        tcmName: tour.assignedToName,
      };
    })
    .filter(Boolean);

  const avgGap = linked.length > 0
    ? linked.reduce((s, d) => s + (d!.gapPct), 0) / linked.length
    : 0;

  return {
    points: linked,
    avgGapPct: Math.round(avgGap),
    totalLinked: linked.length,
    overBudget: linked.filter((d) => d!.gap > 0).length,
    underBudget: linked.filter((d) => d!.gap < 0).length,
  };
}

// ---------- 5. TCM × Area Strength Matrix ----------
// Cross-tab showing which TCMs convert best in which areas
function computeTcmAreaMatrix(tours: TourInput[], bookings: BookingInput[]) {
  const tcmMap = new Map<string, Map<string, { tours: number; booked: number }>>();

  for (const t of tours) {
    if (!tcmMap.has(t.assignedTo)) tcmMap.set(t.assignedTo, new Map());
    const areaMap = tcmMap.get(t.assignedTo)!;
    const area = t.area || t.zoneId;
    if (!areaMap.has(area)) areaMap.set(area, { tours: 0, booked: 0 });
    areaMap.get(area)!.tours++;
    if (t.outcome === "booked" || t.outcome === "token-paid") {
      areaMap.get(area)!.booked++;
    }
  }

  // Find all unique areas and TCMs
  const allAreas = new Set<string>();
  const allTcms = new Set<string>();
  for (const t of tours) {
    allAreas.add(t.area || t.zoneId);
    allTcms.add(t.assignedTo);
  }

  const tcmNames: Record<string, string> = {};
  for (const t of tours) tcmNames[t.assignedTo] = t.assignedToName;

  return {
    areas: [...allAreas],
    tcmIds: [...allTcms].map((id) => ({
      id,
      name: tcmNames[id],
      areas: [...allAreas].map((area) => {
        const data = tcmMap.get(id)?.get(area);
        return {
          area,
          tours: data?.tours || 0,
          booked: data?.booked || 0,
          rate: data && data.tours > 0 ? Math.round((data.booked / data.tours) * 100) : -1, // -1 = no data
        };
      }),
    })),
  };
}

// ---------- 6. Stale Tour Radar ----------
// Tours aging without follow-up, sorted by urgency
function computeStaleTours(tours: TourInput[]) {
  const now = Date.now();
  const active = tours.filter(
    (t) => t.status !== "completed" && t.status !== "cancelled" && t.status !== "no-show"
  );

  return active
    .map((t) => {
      const createdAt = new Date(t.createdAt).getTime();
      const ageDays = Math.floor((now - createdAt) / 86_400_000);
      const tourDate = new Date(t.tourDate).getTime();
      const daysUntilTour = Math.floor((tourDate - now) / 86_400_000);

      let urgency: "critical" | "warning" | "info" = "info";
      if (ageDays >= 7 || daysUntilTour < 0) urgency = "critical";
      else if (ageDays >= 3) urgency = "warning";

      return {
        id: t.id,
        leadName: t.leadName,
        area: t.area,
        assignedToName: t.assignedToName,
        tourDate: t.tourDate,
        tourTime: t.tourTime,
        status: t.status,
        ageDays,
        daysUntilTour,
        urgency,
      };
    })
    .sort((a, b) => {
      const order = { critical: 0, warning: 1, info: 2 };
      return order[a.urgency] - order[b.urgency] || a.daysUntilTour - b.daysUntilTour;
    });
}

// ---------- 7. Conversion Velocity ----------
// Average days from tour schedule → show-up → draft → booking
function computeConversionVelocity(tours: TourInput[], bookings: BookingInput[]) {
  const now = Date.now();
  const dayMs = 86_400_000;

  // Time from creation to tour date
  const toTourDays = tours
    .filter((t) => t.tourDate && t.createdAt)
    .map((t) => (new Date(t.tourDate).getTime() - new Date(t.createdAt).getTime()) / dayMs)
    .filter((d) => d >= 0 && d < 90);

  // Time from tour date to booking creation (for tour-linked bookings)
  const toBookingDays = bookings
    .filter((b) => b.viaTour && b.tourId)
    .map((b) => {
      const tour = tours.find((t) => t.id === b.tourId);
      if (!tour) return null;
      return (new Date(b.createdAt).getTime() - new Date(tour.tourDate).getTime()) / dayMs;
    })
    .filter((d): d is number => d !== null && d >= 0 && d < 90);

  // Time from creation to booking (full cycle)
  const fullCycleDays = bookings
    .filter((b) => b.viaTour && b.tourId)
    .map((b) => {
      const tour = tours.find((t) => t.id === b.tourId);
      if (!tour) return null;
      return (new Date(b.createdAt).getTime() - new Date(tour.createdAt).getTime()) / dayMs;
    })
    .filter((d): d is number => d !== null && d >= 0 && d < 90);

  const avg = (arr: number[]) => arr.length > 0 ? Math.round((arr.reduce((s, d) => s + d, 0) / arr.length) * 10) / 10 : 0;
  const median = (arr: number[]) => {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };

  return {
    schedulingToTour: { avg: avg(toTourDays), median: Math.round(median(toTourDays) * 10) / 10 },
    tourToBooking: { avg: avg(toBookingDays), median: Math.round(median(toBookingDays) * 10) / 10 },
    fullCycle: { avg: avg(fullCycleDays), median: Math.round(median(fullCycleDays) * 10) / 10 },
    sampleSize: fullCycleDays.length,
  };
}

// ---------- Route Registration ----------
export function registerFunnelRoutes(app: FastifyInstance) {
  app.post("/api/myt/funnel/process", async (req, reply) => {
    const body = req.body as FunnelInput;
    const { tours = [], bookings = [] } = body;

    return reply.send({
      waterfall: computeWaterfall(tours, bookings),
      timeHeatmap: computeTimeHeatmap(tours),
      lossReasons: computeLossReasons(tours),
      budgetVsActual: computeBudgetVsActual(tours, bookings),
      tcmAreaMatrix: computeTcmAreaMatrix(tours, bookings),
      staleTours: computeStaleTours(tours),
      conversionVelocity: computeConversionVelocity(tours, bookings),
      processedAt: new Date().toISOString(),
    });
  });
}
