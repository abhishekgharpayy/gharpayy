import { MongoClient } from "mongodb";
import { config } from "dotenv";
import * as path from "path";

// Load .env from the server folder
config({ path: path.join(process.cwd(), ".env") });

async function seedData() {
  const MONGO_URL = process.env.MONGO_URL;
  const DB_NAME = process.env.MONGO_DB || "ops";

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL in server/.env");
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URL);
  
  try {
    console.log("Connecting to MongoDB...");
    await client.connect();
    const db = client.db(DB_NAME);

    console.log("Seeding dummy data for testing...");
    
    // 1. Create TCMs
    const tcms = [
      { id: "tcm1", name: "Alice Johnson", role: "tcm", email: "alice@example.com" },
      { id: "tcm2", name: "Bob Smith", role: "tcm", email: "bob@example.com" },
      { id: "tcm3", name: "Charlie Davis", role: "tcm", email: "charlie@example.com" }
    ];
    
    for (const t of tcms) {
      await db.collection("users").updateOne({ id: t.id }, { $set: t }, { upsert: true });
    }

    // 2. Create 50 Leads
    const stages = ["new", "contacted", "tour-scheduled", "on-tour", "tour-done", "negotiation", "quote-sent", "booked", "dropped"];
    const now = Date.now();
    const leads = [];

    for (let i = 1; i <= 50; i++) {
        const stage = stages[Math.floor(Math.random() * stages.length)];
        const assigneeId = tcms[Math.floor(Math.random() * tcms.length)].id;
        leads.push({
            id: `lead_${i}`,
            name: `Test Lead ${i}`,
            phone: `+9198765432${String(i).padStart(2, '0')}`,
            stage: stage,
            assignedTcmId: assigneeId,
            assigneeId: assigneeId,
            createdAt: new Date(now - Math.random() * 30 * 86400000).toISOString(),
            updatedAt: new Date().toISOString()
        });
    }

    // Insert or update leads
    for (const l of leads) {
        await db.collection("leads").updateOne({ id: l.id }, { $set: l }, { upsert: true });
    }

    // 3. Create 150 FollowUps
    const reasons = ["initial_contact", "schedule_tour", "post_tour_feedback", "negotiation", "payment_reminder", "check_in"];
    const followUps = [];

    for (let i = 1; i <= 150; i++) {
        const lead = leads[Math.floor(Math.random() * leads.length)];
        const isDone = Math.random() > 0.4; // 60% completion rate

        // Randomize due date between 10 days ago and 5 days in the future
        const dueAtMs = now - (10 * 86400000) + (Math.random() * 15 * 86400000); 
        
        // Randomize creation time (2 days before due date)
        const createdAtMs = dueAtMs - (Math.random() * 2 * 86400000);
        
        // Randomize completion time (shortly after due date, or way later)
        const updatedAtMs = isDone ? dueAtMs + (Math.random() * 24 * 3600000) : now;

        followUps.push({
            id: `task_${i}`,
            leadId: lead.id,
            tcmId: lead.assignedTcmId,
            reason: reasons[Math.floor(Math.random() * reasons.length)],
            dueAt: new Date(dueAtMs).toISOString(),
            createdAt: new Date(createdAtMs).toISOString(),
            updatedAt: new Date(updatedAtMs).toISOString(),
            done: isDone,
            priority: Math.random() > 0.8 ? "high" : "normal"
        });
    }

    // Clear old mock tasks and insert new ones
    console.log("Replacing followUps collection with fresh dummy data...");
    await db.collection("followUps").deleteMany({ id: { $regex: "^task_" } });
    await db.collection("followUps").insertMany(followUps);

    console.log("✅ Successfully seeded the database!");
    console.log("Check your dashboard at http://localhost:55318/admin/impact");

  } catch (err) {
    console.error("Error seeding data:", err);
  } finally {
    await client.close();
  }
}

seedData();
