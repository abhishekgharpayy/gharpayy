/**
 * People seed - multiple humans per role so HR has comparison fodder
 * and "View as" can switch identities to test cross-role flows.
 *
 * IDs here intentionally match the TCM ids in `mock-data.ts` so the
 * existing engine + activity stream keep working.
 */

export interface Person {
  id: string;
  name: string;
  initials: string;
  role: "hr" | "flow-ops" | "tcm" | "owner";
  /** main responsibility / focus area shown in HR comparison */
  focus: string;
  /** rolling stats for HR War Room (mocked but consistent) */
  stats: {
    /** Mission completion % (today) */
    missionPct: number;
    /** Day streak */
    streak: number;
    /** Lifetime XP */
    xp: number;
    /** Closes this month (TCM/Flop assist) */
    closes: number;
    /** Avg first-response minutes */
    avgResponseMins: number;
  };
}

export const HR_PEOPLE: Person[] = [];

export const FLOWOPS_PEOPLE: Person[] = [];

/** TCM stats for HR comparison - keyed by the 4 core TCM ids. */
export const TCM_STATS: Record<string, Person["stats"] & { name: string; focus: string }> = {};

/** All people indexed by id (for quick lookup in connector feeds). */
export const PEOPLE_BY_ID: Record<string, { name: string; role: Person["role"] }> = {};

export function personName(id: string | undefined, fallback = "Someone"): string {
  if (!id) return fallback;
  return PEOPLE_BY_ID[id]?.name ?? fallback;
}
