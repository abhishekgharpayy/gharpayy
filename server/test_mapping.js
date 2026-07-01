import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db(process.env.MONGO_DB || 'gharpayy');
  
  const tenantId = 'gharpayy';
  const now = Date.now();
  const DAY = 86_400_000;

  console.log("Fetching data...");
  const [leads, tours, tcms, bookings, followUps, activities] = await Promise.all([
    db.collection("leads").find({ tenantId }).toArray(),
    db.collection("tours").find({ tenantId }).toArray(),
    db.collection("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
    db.collection("bookings").find({ tenantId }).toArray(),
    db.collection("follow_ups").find({ tenantId }).toArray(),
    db.collection("activities").find({ tenantId }).toArray(),
  ]);

  console.log("Data fetched. Mapping tcms...");
  const mappedTcms = tcms.map(u => ({
    id: u._id,
    name: u.fullName || u.username || "Unknown",
    role: u.role,
    zones: u.zones || [],
    phone: u.phone,
    email: u.email,
  }));

  console.log("Building maps...");
  const toursByLead = new Map();
  tours.forEach(t => { const arr = toursByLead.get(t.leadId) || []; arr.push(t); toursByLead.set(t.leadId, arr); });
  const bookingsByLead = new Map();
  bookings.forEach(b => { const leadId = b.leadId; if (leadId) { const arr = bookingsByLead.get(leadId) || []; arr.push(b); bookingsByLead.set(leadId, arr); } });
  const fuByLead = new Map();
  followUps.forEach(f => { if (f.leadId) { const arr = fuByLead.get(f.leadId) || []; arr.push(f); fuByLead.set(f.leadId, arr); } });
  const activitiesByLead = new Map();
  activities.forEach(a => { if (a.leadId) { const arr = activitiesByLead.get(a.leadId) || []; arr.push(a); activitiesByLead.set(a.leadId, arr); } });

  console.log("Computing rows...");
  try {
    const rows = leads.map(lead => {
      const leadTours = toursByLead.get(lead._id) || [];
      const leadBookings = bookingsByLead.get(lead._id) || [];
      const leadFollowUps = fuByLead.get(lead._id) || [];
      const leadActivities = activitiesByLead.get(lead._id) || [];
      const tcm = mappedTcms.find(t => t.id === lead.assignedTcmId);

      let probability = lead.confidence ?? 0;
      if (lead.stage === "booked") probability = 100;
      else if (lead.stage === "dropped") probability = 0;
      else {
        if (lead.stage === "negotiation") probability = Math.max(probability, 70);
        if (lead.stage === "tour-done") probability = Math.max(probability, 55);
        if (lead.stage === "tour-scheduled") probability = Math.max(probability, 40);
        if (leadTours.some(t => t.decision === "booked")) probability = 100;
        if (leadTours.some(t => t.postTour?.outcome === "thinking")) probability = Math.max(probability, 60);
        if (leadTours.some(t => t.postTour?.outcome === "not-interested")) probability = 5;
      }
      probability = Math.max(0, Math.min(100, Math.round(probability)));

      const expectedValue = Math.round((lead.budget || 0) * 12 * (probability / 100));

      const booked = lead.stage === "booked" || leadBookings.length > 0;
      const lastTouchTs = Math.max(
        +new Date(lead.updatedAt || lead.createdAt),
        ...leadTours.map(t => +new Date(t.updatedAt || t.createdAt)),
        ...leadActivities.map(a => +new Date(a.occurredAt || a.createdAt)),
      );
      const ageDays = Math.floor((now - lastTouchTs) / DAY);
      const dormantBucket =
        ageDays >= 90 ? "90d" : ageDays >= 60 ? "60d" : ageDays >= 30 ? "30d" : null;
      const status = booked ? "booked" : lead.stage === "dropped" ? "lost" : dormantBucket ? "dormant" : "open";

      let whyNotClosed = "";
      if (booked) whyNotClosed = "—";
      else if (lead.stage === "dropped") whyNotClosed = "Dropped";
      else if (lead.stage === "negotiation") whyNotClosed = "Stuck in negotiation";
      else if (lead.stage === "tour-done") whyNotClosed = "Post-tour follow-up overdue";
      else if (lead.stage === "tour-scheduled") whyNotClosed = "Awaiting tour";
      else if (lead.stage === "new" && ageDays > 1) whyNotClosed = `New for ${ageDays}d — never contacted`;
      else whyNotClosed = "Active — keep nurturing";

      return {
        lead: { ...lead, id: lead._id },
        tcm,
        tours: leadTours,
        bookings: leadBookings,
        followUps: leadFollowUps,
        lastTouchTs,
        probability,
        expectedValue,
        status,
        whyNotClosed,
        dormantBucket,
        hasVisit: leadTours.length > 0,
        booked,
        intervention: lead.intervention ?? null,
        currentStageAgeDays: (() => {
          const stageTs = +new Date(lead.updatedAt || lead.createdAt);
          return Math.floor((now - stageTs) / DAY);
        })(),
        isStuck: (() => {
          const stageTs = +new Date(lead.updatedAt || lead.createdAt);
          const days = Math.floor((now - stageTs) / DAY);
          const thresholds = {
            new: 1, contacted: 3, "tour-scheduled": 5, "tour-done": 3, negotiation: 3,
          };
          const threshold = thresholds[lead.stage] ?? 999;
          return days > threshold && !booked && lead.stage !== "dropped";
        })(),
      };
    });

    console.log("Successfully mapped", rows.length, "rows!");
  } catch (err) {
    console.error("CRASH DURING MAPPING:");
    console.error(err);
  }

  await client.close();
}
run().catch(console.error);
