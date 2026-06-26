// Mock performance data removed — all data now comes from the server.
// This file is kept as a stub to avoid breaking any remaining imports.
export const mockSummary = {
  totalTours: 0,
  totalLeads: 0,
  totalBookings: 0,
  overallConversionRate: 0,
  totalRevenue: 0,
  activeTCMs: 0,
  activeFlowOps: 0,
  activePropertyOwners: 0,
};

export const mockTcmList: any[] = [];
export const mockTcmDetail = (id: string) => ({ userId: id, name: "", toursScheduled: 0, toursCompleted: 0, conversionRate: 0 });
export const mockFlowOpsList: any[] = [];
export const mockFlowOpsDetail = (id: string) => ({ userId: id, name: "", leadsContacted: 0, conversionRate: 0 });
export const mockOwnersList: any[] = [];
export const mockOwnerDetail = (id: string) => ({ userId: id, name: "", totalProperties: 0, bookingRate: 0 });
