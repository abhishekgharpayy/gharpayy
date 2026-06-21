import { col, connectMongo as connectDb, disconnectMongo as disconnectDb } from "./mongo.js";
import { ulid } from "../../../src/contracts/ids.js";
import { env } from "../config/env.js";
import argon2 from "argon2";

const tenantId = env.DEFAULT_TENANT || "tenant_1";

const AREAS = ["Whitefield", "Indiranagar", "HSR Layout", "Koramangala", "Marathahalli", "Bellandur", "Electronic City", "BTM Layout", "Jayanagar", "JP Nagar"];
const NAMES = ["Rahul Sharma", "Priya Singh", "Amit Kumar", "Neha Gupta", "Vikram Reddy", "Anjali Desai", "Suresh Iyer", "Kavita Rao", "Ravi Verma", "Sneha Patil", "Karthik Nair", "Pooja Menon", "Arun Bhat", "Deepa Joshi", "Gaurav Chawla", "Ritu Jain", "Sandeep Bose", "Divya Sen", "Manoj Das", "Swati Mukherjee", "Rakesh M", "Suman K", "Vinay S", "Asha P", "Nitin T"];
const OBJECTIONS = ["budget too high", "room size small", "far from office", "no balcony", "deposit too high", "poor ventilation", "no covered parking", "old building", "too noisy"];
const TCM_NAMES = ["Aryan T", "Ishika M", "Kabir S", "Riya K", "Dev V"];
const SOURCES = ["Facebook", "Instagram", "Google Ads", "Organic", "Referral", "Broker"];
const INTENTS = ["hot", "warm", "cold"] as const;

function random<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomDate(daysAgoStart: number, daysAgoEnd: number): string {
  const now = Date.now();
  const start = now - daysAgoStart * 24 * 3600 * 1000;
  const end = now - daysAgoEnd * 24 * 3600 * 1000;
  return new Date(start + Math.random() * (end - start)).toISOString();
}

async function runSeed() {
  console.log("Connecting to MongoDB...");
  await connectDb();

  console.log(`Wiping existing data for tenant: ${tenantId}...`);
  await col("leads").deleteMany({ tenantId });
  await col("tours").deleteMany({ tenantId });
  await col("bookings").deleteMany({ tenantId });
  await col("activities").deleteMany({ tenantId });
  await col("properties").deleteMany({ tenantId });
  await col("users").deleteMany({ tenantId, role: { $in: ["tcm", "member", "owner", "manager", "admin"] } }); // Keep super_admin

  console.log("Seeding Users (TCMs & FlowOps)...");
  const tcmIds: string[] = [];
  for (const name of TCM_NAMES) {
    const id = "usr_" + ulid();
    tcmIds.push(id);
    await col("users").insertOne({
      _id: id,
      username: name.toLowerCase().replace(" ", "") + "@gharpayy.com",
      email: name.toLowerCase().replace(" ", "") + "@gharpayy.com",
      fullName: name,
      passwordHash: await argon2.hash("password123"),
      role: "tcm",
      status: "active",
      zones: ["Bangalore East", "Bangalore South"],
      tenantId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  // Flow Ops
  const flowOpsId = "usr_" + ulid();
  await col("users").insertOne({
    _id: flowOpsId,
    username: "flowops@gharpayy.com",
    email: "flowops@gharpayy.com",
    fullName: "Flow Ops Central",
    passwordHash: await argon2.hash("password123"),
    role: "manager",
    status: "active",
    zones: ["Bangalore East", "Bangalore South"],
    tenantId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });

  console.log("Seeding Properties...");
  const propertyIds: string[] = [];
  for (let i = 0; i < 20; i++) {
    const id = "prop_" + ulid();
    propertyIds.push(id);
    const area = random(AREAS);
    await col("properties").insertOne({
      _id: id,
      tenantId,
      name: `Gharpayy Premium ${area} ${i + 1}`,
      address: `123 Main St, ${area}, Bangalore`,
      zoneId: "Bangalore East",
      bhk: random([1, 2, 3]),
      rentAmount: randInt(15, 45) * 1000,
      depositAmount: randInt(40, 100) * 1000,
      status: random(["vacant", "occupied", "maintenance"]),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
  }

  console.log("Seeding Leads, Tours, Bookings & Activities...");
  let closedCount = 0;
  for (let i = 0; i < 150; i++) {
    const leadId = "lead_" + ulid();
    const tcmId = random(tcmIds);
    const createdAt = randomDate(60, 0); // created within last 60 days
    const budget = randInt(15, 40) * 1000;
    const stage = random(["new", "contacted", "tour_scheduled", "tour_completed", "negotiation", "booked", "lost", "dormant"]);
    const intent = random(INTENTS);
    const whyNotClosed = stage === "lost" ? random(OBJECTIONS) : undefined;
    const isBooked = stage === "booked";
    
    // Create Lead
    await col("leads").insertOne({
      _id: leadId,
      tenantId,
      name: random(NAMES),
      phone: `+9198${randInt(10000000, 99999999)}`,
      email: `user${i}@example.com`,
      budget,
      preferredArea: random(AREAS),
      source: random(SOURCES),
      intent,
      stage,
      assignedTcmId: tcmId,
      confidence: randInt(10, 90),
      createdAt,
      updatedAt: randomDate(5, 0),
      whyNotClosed
    });

    // Generate Activities & Funnel Progression
    const logActivity = async (kind: string, text: string, actor: string, ts: string) => {
      await col("activities").insertOne({
        _id: "act_" + ulid(),
        tenantId,
        leadId,
        tcmId,
        kind,
        text,
        actor,
        createdAt: ts,
        ts
      });
    };

    await logActivity("lead_added", "Lead entered system", flowOpsId, createdAt);
    
    if (stage !== "new") {
      const contactTs = new Date(new Date(createdAt).getTime() + randInt(5, 60) * 60000).toISOString();
      await logActivity("call_logged", "Initial discovery call completed", tcmId, contactTs);
    }

    let tourId;
    if (["tour_scheduled", "tour_completed", "negotiation", "booked", "lost"].includes(stage)) {
      tourId = "tour_" + ulid();
      const tourTs = new Date(new Date(createdAt).getTime() + randInt(1, 3) * 86400000).toISOString();
      
      const tourStatus = ["tour_completed", "negotiation", "booked", "lost"].includes(stage) ? "completed" : "scheduled";
      
      await col("tours").insertOne({
        _id: tourId,
        tenantId,
        leadId,
        propertyId: random(propertyIds),
        tcmId,
        status: tourStatus,
        scheduledAt: tourTs,
        createdAt,
        updatedAt: tourTs,
        postTour: tourStatus === "completed" ? {
          decision: isBooked ? "booked" : (stage === "lost" ? "not-interested" : "thinking"),
          objection: whyNotClosed || "none",
          filledAt: new Date(new Date(tourTs).getTime() + 3600000).toISOString()
        } : undefined
      });

      await logActivity("tour_scheduled", "Scheduled a site visit", tcmId, new Date(new Date(tourTs).getTime() - 86400000).toISOString());
      
      if (tourStatus === "completed") {
        await logActivity("tour_completed", "Completed site visit", tcmId, tourTs);
        await logActivity("post_tour_filled", "Filled post-tour feedback", tcmId, new Date(new Date(tourTs).getTime() + 3600000).toISOString());
      }

      if (isBooked) {
        closedCount++;
        const bookTs = new Date(new Date(tourTs).getTime() + randInt(1, 2) * 86400000).toISOString();
        await col("bookings").insertOne({
          _id: "bk_" + ulid(),
          tenantId,
          leadId,
          tcmId,
          propertyId: random(propertyIds),
          status: "paid",
          amount: budget,
          createdAt: bookTs,
          ts: bookTs
        });
        await logActivity("decision_logged", "Client decided to Book!", tcmId, bookTs);
        await logActivity("booking_closed", `Closed booking for ₹${budget.toLocaleString()}`, tcmId, bookTs);
      }
    }
  }

  console.log(`\nSeed Complete! Successfully generated 150 realistic leads.`);
  console.log(`Generated ${closedCount} Closed Bookings for Revenue math.`);
  await disconnectDb();
}

runSeed().catch(console.error);
