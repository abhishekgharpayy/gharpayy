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

  const [leads, tours, tcms, bookings, followUps, activities] = await Promise.all([
    db.collection("leads").find({ tenantId }).toArray(),
    db.collection("tours").find({ tenantId }).toArray(),
    db.collection("users").find({ tenantId, role: { $in: ["tcm", "member"] } }).toArray(),
    db.collection("bookings").find({ tenantId }).toArray(),
    db.collection("follow_ups").find({ tenantId }).toArray(),
    db.collection("activities").find({ tenantId }).toArray(),
  ]);

  const mappedTcms = tcms.map(u => ({ id: u._id, name: u.fullName }));

  const toursByLead = new Map(); tours.forEach(t => { const arr = toursByLead.get(t.leadId) || []; arr.push(t); toursByLead.set(t.leadId, arr); });
  const bookingsByLead = new Map(); bookings.forEach(b => { const leadId = b.leadId; if (leadId) { const arr = bookingsByLead.get(leadId) || []; arr.push(b); bookingsByLead.set(leadId, arr); } });
  const fuByLead = new Map(); followUps.forEach(f => { if (f.leadId) { const arr = fuByLead.get(f.leadId) || []; arr.push(f); fuByLead.set(f.leadId, arr); } });
  const activitiesByLead = new Map(); activities.forEach(a => { if (a.leadId) { const arr = activitiesByLead.get(a.leadId) || []; arr.push(a); activitiesByLead.set(a.leadId, arr); } });

  const rows = leads.map(lead => {
    return {
      lead,
      tcm: mappedTcms.find(t => t.id === lead.assignedTcmId),
      tours: toursByLead.get(lead._id) || [],
      bookings: bookingsByLead.get(lead._id) || [],
      followUps: fuByLead.get(lead._id) || [],
      probability: 50,
      expectedValue: 1000,
      status: 'open',
      whyNotClosed: 'test'
    };
  });

  const payload = JSON.stringify({ rows, tcms: mappedTcms });
  console.log("Payload size:", (payload.length / 1024 / 1024).toFixed(2), "MB");
  
  await client.close();
}
run().catch(console.error);
