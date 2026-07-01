import { col, connectMongo as connectDb, disconnectMongo as disconnectDb } from "./mongo.js";
import { ulid } from "../../../src/contracts/ids.js";
import { env } from "../config/env.js";

const tenantId = env.DEFAULT_TENANT || "tenant_1";

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function runSeed() {
  console.log("Connecting to MongoDB...");
  await connectDb();

  console.log("Wiping existing follow_ups to clean up orphans...");
  await col("follow_ups").deleteMany({ tenantId });

  console.log("Fetching existing seeded leads...");
  const leads = await col("leads").find({ tenantId }).toArray();
  
  if (leads.length === 0) {
    console.log("No leads found! Run the main seed script first.");
    await disconnectDb();
    return;
  }

  console.log(`Seeding follow_ups for ${leads.length} leads to populate Impact tab...`);
  let followUpCount = 0;

  for (const lead of leads) {
    // Generate 1-4 follow-ups per lead
    const numFollowUps = randInt(1, 4);
    for (let i = 0; i < numFollowUps; i++) {
      const isCompleted = Math.random() > 0.3; // 70% completion rate
      const priority = Math.random() > 0.8 ? "urgent" : Math.random() > 0.5 ? "high" : "medium";
      
      const leadCreatedTime = new Date(lead.createdAt).getTime();
      const now = Date.now();
      
      // Due date between lead creation and now + 2 days
      const dueTime = leadCreatedTime + Math.random() * (now - leadCreatedTime + 2 * 86400000);
      const dueAt = new Date(dueTime).toISOString();
      
      let completedAt = undefined;
      if (isCompleted) {
        // Completed between due time minus 2 hours and due time plus 24 hours
        const compTime = dueTime - 7200000 + Math.random() * 93600000;
        completedAt = new Date(Math.min(compTime, now)).toISOString();
      }

      await col("follow_ups").insertOne({
        _id: "fu_" + ulid(),
        tenantId,
        leadId: lead._id,
        tcmId: lead.assignedTcmId,
        dueAt,
        priority,
        reason: "Follow up regarding " + lead.preferredArea,
        status: isCompleted ? "completed" : "pending",
        completedAt,
        createdAt: new Date(dueTime - 86400000).toISOString(),
      });
      followUpCount++;
    }
  }

  console.log(`\nSeed Complete! Generated ${followUpCount} realistic tasks for the Impact tab.`);
  await disconnectDb();
}

runSeed().catch(console.error);
