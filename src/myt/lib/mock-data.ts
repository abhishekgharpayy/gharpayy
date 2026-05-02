import { Zone, TeamMember, Tour, HeatmapData, Lead, Booking, DateRange } from './types';

export const zones: Zone[] = [];
export const teamMembers: TeamMember[] = [];
export const tours: Tour[] = [];
export const initialLeads: Lead[] = [];
export const initialBookings: Booking[] = [];
export const heatmapData: HeatmapData[] = [];

export function filterToursByDateRange(tourList: Tour[], range: DateRange): Tour[] {
  return [];
}

export function getZonePerformance(tourList: Tour[]) {
  return [];
}

export function getMemberPerformance(tourList: Tour[]) {
  return [];
}
