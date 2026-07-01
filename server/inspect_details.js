import { MongoClient } from "mongodb";
import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, ".env"), override: true });
console.log("process.env.MONGO_URL inside script:", process.env.MONGO_URL);

async function inspectDb() {
  const MONGO_URL = process.env.MONGO_URL;
  const DB_NAME = process.env.MONGO_DB || "ops";

  if (!MONGO_URL) {
    console.error("Missing MONGO_URL in server/.env");
    process.exit(1);
  }

  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    // Inspect users
    const users = await db.collection("users").find().toArray();
    console.log("USERS:");
    users.forEach(u => console.log(`  - _id: ${u._id}, id: ${u.id}, name: ${u.name || u.fullName}, email: ${u.email}, role: ${u.role}`));

    // Inspect leads
    const dummyLeads = await db.collection("leads").find({
      $or: [
        { id: { $regex: "^lead_" } },
        { name: { $regex: "Test Lead" } }
      ]
    }).toArray();
    console.log(`DUMMY LEADS (found ${dummyLeads.length}):`);
    dummyLeads.slice(0, 5).forEach(l => console.log(`  - _id: ${l._id}, id: ${l.id}, name: ${l.name}, phone: ${l.phone}`));

    // Inspect follow_ups
    const followUps = await db.collection("follow_ups").find().limit(5).toArray();
    console.log("FOLLOW UPS samples:");
    followUps.forEach(f => console.log(`  - _id: ${f._id}, leadId: ${f.leadId}, tcmId: ${f.tcmId}, reason: ${f.reason}`));

    // Inspect activities
    const activities = await db.collection("activities").find().limit(5).toArray();
    console.log("ACTIVITIES samples:");
    activities.forEach(a => console.log(`  - _id: ${a._id}, entityType: ${a.entityType}, entityId: ${a.entityId}, kind: ${a.kind}, actor: ${a.actor}`));

    // Inspect zones
    const zones = await db.collection("zones").find().toArray();
    console.log("ZONES:");
    zones.forEach(z => console.log(`  - _id: ${z._id}, name: ${z.name}, city: ${z.city}`));

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await client.close();
  }
}

inspectDb();
