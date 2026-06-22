export const mockSummary = {
  totalTours: 1245,
  totalLeads: 4520,
  totalBookings: 890,
  overallConversionRate: 23.4,
  totalRevenue: 15400000,
  activeTCMs: 12,
  activeFlowOps: 8,
  activePropertyOwners: 34,
};

export const mockTcmList = [
  {
    userId: "tcm_1", name: "Rahul Sharma", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Rahul",
    toursScheduled: 120, toursCompleted: 105, toursCancelled: 15, bookingsConverted: 42, conversionRate: 40.0,
    leadsHandedOff: 8, avgTourDuration: 38,
    dailyTrend: Array.from({length: 14}).map((_, i) => ({ date: `2024-06-${(i+1).toString().padStart(2,'0')}`, toursCompleted: Math.floor(Math.random()*5)+2, bookings: Math.floor(Math.random()*3) }))
  },
  {
    userId: "tcm_2", name: "Priya Desai", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Priya",
    toursScheduled: 95, toursCompleted: 90, toursCancelled: 5, bookingsConverted: 45, conversionRate: 50.0,
    leadsHandedOff: 2, avgTourDuration: 45,
    dailyTrend: Array.from({length: 14}).map((_, i) => ({ date: `2024-06-${(i+1).toString().padStart(2,'0')}`, toursCompleted: Math.floor(Math.random()*4)+1, bookings: Math.floor(Math.random()*4) }))
  },
  {
    userId: "tcm_3", name: "Amit Kumar", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Amit",
    toursScheduled: 150, toursCompleted: 130, toursCancelled: 20, bookingsConverted: 39, conversionRate: 30.0,
    leadsHandedOff: 12, avgTourDuration: 35,
    dailyTrend: Array.from({length: 14}).map((_, i) => ({ date: `2024-06-${(i+1).toString().padStart(2,'0')}`, toursCompleted: Math.floor(Math.random()*8)+2, bookings: Math.floor(Math.random()*2) }))
  }
];

export const mockTcmDetail = (id: string) => ({
  userId: id, name: mockTcmList.find(t=>t.userId===id)?.name || "Agent", avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${id}`,
  email: `${id}@gharpayy.com`, phone: "+91 98765 43210", joinDate: "2023-01-15T00:00:00Z",
  toursScheduled: 120, toursCompleted: 105, toursCancelled: 15, bookingsConverted: 42, conversionRate: 40.0,
  avgTourDuration: 42, leadsReceived: 140,
  toursList: Array.from({length: 20}).map((_, i) => ({
    tourId: `tour_${i}`, propertyName: `Skyline Towers Apt ${100+i}`, clientName: `Client ${i}`,
    scheduledAt: `2024-06-${(i%28+1).toString().padStart(2,'0')}T14:00:00Z`, outcome: i%5 === 0 ? "cancelled" : "completed"
  })),
  bookingsList: Array.from({length: 10}).map((_, i) => ({
    bookingId: `bk_${i}`, propertyName: `Skyline Towers Apt ${100+i}`, clientName: `Client ${i}`,
    value: 15000 + (i*1000), date: `2024-06-${(i%28+1).toString().padStart(2,'0')}T15:00:00Z`
  })),
  cancellationsList: [],
  weeklyTrend: [
    { week: "2024-05-w1", toursCompleted: 20, bookings: 5 }, { week: "2024-05-w2", toursCompleted: 22, bookings: 7 },
    { week: "2024-05-w3", toursCompleted: 25, bookings: 10 }, { week: "2024-05-w4", toursCompleted: 18, bookings: 6 },
    { week: "2024-06-w1", toursCompleted: 28, bookings: 12 }, { week: "2024-06-w2", toursCompleted: 24, bookings: 9 }
  ],
  peakHours: Array.from({length: 12}).map((_, i) => ({ hour: `${i+9}:00`, toursCount: Math.floor(Math.random()*20) })),
  comparisonToTeamAvg: [
    { metric: "Tours Completed", userValue: 105, teamAverage: 85 },
    { metric: "Conversion Rate (%)", userValue: 40, teamAverage: 35 },
    { metric: "Bookings", userValue: 42, teamAverage: 30 }
  ]
});

export const mockFlowOpsList = [
  {
    userId: "fo_1", name: "Neha Singh", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Neha",
    leadsContacted: 450, toursScheduled: 180, leadsDropped: 60, followUpRate: 95.0, conversionRate: 40.0, avgResponseTime: 1.5,
    dailyTrend: Array.from({length: 14}).map((_, i) => ({ date: `2024-06-${(i+1).toString().padStart(2,'0')}`, leadsContacted: Math.floor(Math.random()*40)+10, toursScheduled: Math.floor(Math.random()*15)+5 }))
  },
  {
    userId: "fo_2", name: "Vikas Reddy", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Vikas",
    leadsContacted: 320, toursScheduled: 95, leadsDropped: 80, followUpRate: 75.0, conversionRate: 29.6, avgResponseTime: 4.2,
    dailyTrend: Array.from({length: 14}).map((_, i) => ({ date: `2024-06-${(i+1).toString().padStart(2,'0')}`, leadsContacted: Math.floor(Math.random()*30)+5, toursScheduled: Math.floor(Math.random()*10)+2 }))
  }
];

export const mockFlowOpsDetail = (id: string) => ({
  userId: id, name: mockFlowOpsList.find(f=>f.userId===id)?.name || "Agent", avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${id}`,
  email: `${id}@gharpayy.com`, phone: "+91 98765 43210", joinDate: "2023-03-10T00:00:00Z",
  leadsContacted: 450, toursScheduled: 180, leadsDropped: 60, followUpRate: 95.0, avgResponseTime: 1.5, conversionRate: 40.0,
  weeklyTrend: [],
  leadSourceBreakdown: [ { source: "Website", count: 200 }, { source: "Instagram", count: 150 }, { source: "Referral", count: 100 } ],
  responseTimeDistribution: [ { bucket: "< 1hr", count: 300 }, { bucket: "1-4hr", count: 100 }, { bucket: "4-24hr", count: 40 }, { bucket: "24hr+", count: 10 } ],
  leadsList: Array.from({length: 15}).map((_, i) => ({
    leadId: `lead_${i}`, leadName: `Lead ${i}`, phone: `98765432${i.toString().padStart(2,'0')}`, source: i%3===0?"Instagram":"Website",
    status: i%4===0?"dropped":"tour_scheduled", firstContactedAt: `2024-06-${(i%28+1).toString().padStart(2,'0')}T10:00:00Z`, followUpCount: Math.floor(Math.random()*5)+1, tourScheduled: i%4!==0, outcome: i%4===0?"dropped":"won"
  })),
  followUpTimeline: Array.from({length: 15}).map((_, i) => ({
    leadId: `lead_${i}`, leadName: `Lead ${i}`,
    contacts: [
      { contactedAt: `2024-06-${(i%28+1).toString().padStart(2,'0')}T10:00:00Z`, method: "whatsapp", response: "Replied" },
      { contactedAt: `2024-06-${(i%28+1).toString().padStart(2,'0')}T14:30:00Z`, method: "call", response: "Tour Scheduled" }
    ]
  })),
  comparisonToTeamAvg: [
    { metric: "Leads Contacted", userValue: 450, teamAverage: 380 },
    { metric: "Conversion Rate (%)", userValue: 40, teamAverage: 32 }
  ]
});

export const mockOwnersList = [
  {
    userId: "ow_1", name: "Karan Patel", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Karan",
    totalProperties: 12, propertiesWithZeroTours: 1, toursReceived: 45, bookings: 15, bookingRate: 33.3, revenueGenerated: 450000
  },
  {
    userId: "ow_2", name: "Suresh Gupta", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Suresh",
    totalProperties: 4, propertiesWithZeroTours: 0, toursReceived: 22, bookings: 8, bookingRate: 36.3, revenueGenerated: 185000
  },
  {
    userId: "ow_3", name: "Anjali Mehta", avatar: "https://api.dicebear.com/7.x/initials/svg?seed=Anjali",
    totalProperties: 25, propertiesWithZeroTours: 5, toursReceived: 120, bookings: 42, bookingRate: 35.0, revenueGenerated: 1250000
  }
];

export const mockOwnerDetail = (id: string) => ({
  userId: id, name: mockOwnersList.find(o=>o.userId===id)?.name || "Owner", avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${id}`,
  email: `${id}@gharpayy.com`, phone: "+91 98765 43210", joinDate: "2022-11-20T00:00:00Z",
  totalProperties: 12, toursReceived: 45, bookings: 15, bookingRate: 33.3, totalRevenue: 450000, pendingApprovals: 2,
  revenueByMonth: [ { month: "Jan", revenue: 50000 }, { month: "Feb", revenue: 65000 }, { month: "Mar", revenue: 90000 }, { month: "Apr", revenue: 110000 }, { month: "May", revenue: 135000 } ],
  propertiesList: Array.from({length: 12}).map((_, i) => ({
    propertyId: `prop_${i}`, name: `Sunshine Villa ${i}`, location: "Bandra West", tours: Math.floor(Math.random()*15),
    bookings: Math.floor(Math.random()*5), occupancyRate: Math.floor(Math.random()*40)+60, revenue: Math.floor(Math.random()*100000)+20000, status: "active"
  })),
  occupancyByProperty: Array.from({length: 12}).map((_, i) => ({ propertyId: `prop_${i}`, propertyName: `Sunshine Villa ${i}`, occupancyRate: Math.floor(Math.random()*40)+60 })),
  toursList: Array.from({length: 15}).map((_, i) => ({
    tourId: `tour_${i}`, propertyName: `Sunshine Villa ${i%12}`, clientName: `Client ${i}`, tcmName: "Rahul Sharma",
    scheduledAt: `2024-06-${(i%28+1).toString().padStart(2,'0')}T14:00:00Z`, outcome: i%5===0?"cancelled":"completed"
  })),
  bookingsList: Array.from({length: 15}).map((_, i) => ({
    bookingId: `bk_${i}`, propertyName: `Sunshine Villa ${i%12}`, clientName: `Client ${i}`, value: 25000 + (i*1000), date: `2024-06-${(i%28+1).toString().padStart(2,'0')}T14:00:00Z`
  })),
  comparisonToOwnerAvg: [
    { metric: "Total Revenue", userValue: 450000, teamAverage: 300000 },
    { metric: "Booking Rate (%)", userValue: 33, teamAverage: 28 }
  ]
});
