import { col, connectMongo as connectDb, disconnectMongo as disconnectDb } from "./mongo.js";
import { ulid } from "../../../src/contracts/ids.js";
import { env } from "../config/env.js";
import argon2 from "argon2";
import fs from "fs";
import path from "path";

const tenantId = env.DEFAULT_TENANT || "tenant_1";

const AREAS = ["Whitefield", "Indiranagar", "HSR Layout", "Koramangala", "Marathahalli", "Bellandur", "Electronic City", "BTM Layout", "Jayanagar", "JP Nagar"];
const NAMES = ["Rahul Sharma", "Priya Singh", "Amit Kumar", "Neha Gupta", "Vikram Reddy", "Anjali Desai", "Suresh Iyer", "Kavita Rao", "Ravi Verma", "Sneha Patil", "Karthik Nair", "Pooja Menon", "Arun Bhat", "Deepa Joshi", "Gaurav Chawla", "Ritu Jain", "Sandeep Bose", "Divya Sen", "Manoj Das", "Swati Mukherjee", "Rakesh M", "Suman K", "Vinay S", "Asha P", "Nitin T"];
const OBJECTIONS = ["budget too high", "room size small", "far from office", "no balcony", "deposit too high", "poor ventilation", "no covered parking", "old building", "too noisy"];
const TCM_NAMES = ["Aryan T", "Ishika M", "Kabir S", "Riya K", "Dev V"];
const SOURCES = ["Facebook", "Instagram", "Google Ads", "Organic", "Referral", "Broker"];
const INTENTS = ["hot", "warm", "cold"] as const;

function random<T>(arr: readonly T[]): T {
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

async function downloadSampleImages() {
  const uploadsDir = path.join(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const sampleImages = [
    { name: "room1.jpg", url: "https://picsum.photos/seed/room1/800/600.jpg" },
    { name: "room2.jpg", url: "https://picsum.photos/seed/room2/800/600.jpg" },
    { name: "room3.jpg", url: "https://picsum.photos/seed/room3/800/600.jpg" },
  ];

  for (const img of sampleImages) {
    const dest = path.join(uploadsDir, img.name);
    if (!fs.existsSync(dest)) {
      try {
        console.log(`Downloading sample image: ${img.name}...`);
        const res = await fetch(img.url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          fs.writeFileSync(dest, buffer);
        }
      } catch (err) {
        console.warn(`Failed to download ${img.name}:`, err);
      }
    }
  }
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
  
  // Wipe 4 features data
  await col("property_media").deleteMany({ tenantId });
  await col("whatsapp_conversations").deleteMany({ tenantId });
  await col("whatsapp_messages").deleteMany({ tenantId });
  await col("agreements").deleteMany({ tenantId });
  await col("alerts").deleteMany({ tenantId });

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
  const propertyDocs: any[] = [];
  for (let i = 0; i < 20; i++) {
    const id = "prop_" + ulid();
    propertyIds.push(id);
    const area = random(AREAS);
    const propDoc = {
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
    };
    propertyDocs.push(propDoc);
    await col("properties").insertOne(propDoc);
  }

  console.log("Seeding Property Media...");
  await downloadSampleImages();
  for (const propId of propertyIds) {
    await col("property_media").insertOne({
      _id: "med_" + ulid(),
      tenantId,
      propertyId: propId,
      roomId: "",
      originalName: "room1.jpg",
      fileName: "room1.jpg",
      mimeType: "image/jpeg",
      size: 120000,
      caption: "Living Room",
      isPrimary: true,
      createdAt: new Date().toISOString()
    });
    await col("property_media").insertOne({
      _id: "med_" + ulid(),
      tenantId,
      propertyId: propId,
      roomId: "room_1",
      originalName: "room2.jpg",
      fileName: "room2.jpg",
      mimeType: "image/jpeg",
      size: 95000,
      caption: "Bedroom 1",
      isPrimary: false,
      createdAt: new Date().toISOString()
    });
  }

  console.log("Seeding Leads, Tours, Bookings & Activities...");
  let closedCount = 0;
  const seededLeads: any[] = [];
  const bookedLeads: any[] = [];
  
  for (let i = 0; i < 150; i++) {
    const leadId = "lead_" + ulid();
    const tcmId = random(tcmIds);
    const createdAt = randomDate(60, 0); // created within last 60 days
    const budget = randInt(15, 40) * 1000;
    const stage = random(["new", "contacted", "tour_scheduled", "tour_completed", "negotiation", "booked", "lost", "dormant"]);
    const intent = random(INTENTS);
    const whyNotClosed = stage === "lost" ? random(OBJECTIONS) : undefined;
    const isBooked = stage === "booked";
    
    const leadName = random(NAMES);
    const leadPhone = `+9198${randInt(10000000, 99999999)}`;
    const leadEmail = `user${i}@example.com`;

    const leadDoc = {
      _id: leadId,
      tenantId,
      name: leadName,
      phone: leadPhone,
      email: leadEmail,
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
    };

    seededLeads.push(leadDoc);
    if (isBooked) {
      bookedLeads.push(leadDoc);
    }

    // Create Lead
    await col("leads").insertOne(leadDoc);

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

  console.log("Seeding WhatsApp Conversations & Messages...");
  const whatsappLeads = seededLeads.slice(0, 10);
  for (let idx = 0; idx < whatsappLeads.length; idx++) {
    const lead = whatsappLeads[idx];
    const convId = "conv_" + ulid();
    const lastMsgText = idx % 2 === 0 ? "Hi, when can I visit the property?" : "Sounds good, thank you!";
    const lastMsgAt = new Date(Date.now() - idx * 3600000).toISOString();
    
    await col("whatsapp_conversations").insertOne({
      _id: convId,
      tenantId,
      leadId: lead._id,
      leadName: lead.name,
      phone: lead.phone,
      assignedTo: lead.assignedTcmId,
      lastMessage: lastMsgText,
      lastMessageAt: lastMsgAt,
      unreadCount: idx % 3 === 0 ? 1 : 0,
      status: "active",
      tags: [],
      createdAt: lead.createdAt,
      updatedAt: lastMsgAt
    });

    // Messages
    await col("whatsapp_messages").insertOne({
      _id: "wmsg_" + ulid(),
      tenantId,
      conversationId: convId,
      direction: "inbound",
      text: "Hi, I'm interested in renting a property",
      mediaUrl: "",
      status: "read",
      sentById: "",
      sentByName: lead.name,
      createdAt: new Date(new Date(lastMsgAt).getTime() - 7200000).toISOString()
    });

    await col("whatsapp_messages").insertOne({
      _id: "wmsg_" + ulid(),
      tenantId,
      conversationId: convId,
      direction: "outbound",
      text: "Hello! We have multiple options available in HSR Layout and Koramangala. What is your budget?",
      mediaUrl: "",
      status: "read",
      sentById: lead.assignedTcmId,
      sentByName: "Agent",
      createdAt: new Date(new Date(lastMsgAt).getTime() - 3600000).toISOString()
    });

    await col("whatsapp_messages").insertOne({
      _id: "wmsg_" + ulid(),
      tenantId,
      conversationId: convId,
      direction: idx % 2 === 0 ? "inbound" : "outbound",
      text: lastMsgText,
      mediaUrl: "",
      status: "read",
      sentById: idx % 2 === 0 ? "" : lead.assignedTcmId,
      sentByName: idx % 2 === 0 ? lead.name : "Agent",
      createdAt: lastMsgAt
    });
  }

  console.log("Seeding Rental Agreements...");
  for (let idx = 0; idx < bookedLeads.length; idx++) {
    const lead = bookedLeads[idx];
    const propId = random(propertyIds);
    const prop = propertyDocs.find(p => p._id === propId);
    const propName = prop ? prop.name : "Sunrise Apartments";
    const propAddr = prop ? prop.address : "123 MG Road, Bangalore";
    const rent = prop ? prop.rentAmount : lead.budget;
    const deposit = prop ? prop.depositAmount : lead.budget * 2;
    
    await col("agreements").insertOne({
      _id: "agr_" + ulid(),
      tenantId,
      bookingId: "bk_" + ulid(),
      leadId: lead._id,
      tenantName: lead.name,
      tenantPhone: lead.phone,
      propertyName: propName,
      propertyAddress: propAddr,
      roomNumber: "A-" + randInt(101, 308),
      rent,
      deposit,
      moveInDate: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
      duration: 11,
      noticePeriod: 30,
      status: idx % 3 === 0 ? "signed" : (idx % 3 === 1 ? "sent" : "draft"),
      signedByTenantAt: idx % 3 === 0 ? new Date().toISOString() : "",
      signedByOwnerAt: idx % 3 === 0 ? new Date().toISOString() : "",
      pdfData: "",
      createdBy: lead.assignedTcmId,
      createdAt: lead.createdAt,
      updatedAt: new Date().toISOString()
    });
  }

  console.log("Seeding Smart Alerts...");
  const alertSamples = [
    {
      type: "rent_overdue" as const,
      title: "Rent overdue: Rahul Sharma",
      body: "Rahul Sharma's rent of ₹25,000 for 2026-06 is 5d overdue.",
      severity: "warning" as const,
      link: "/admin/rents",
    },
    {
      type: "booking_approval" as const,
      title: "Booking pending approval: Priya Singh",
      body: "Priya Singh's booking at Green Valley PG needs owner approval.",
      severity: "warning" as const,
      link: "/admin/bookings",
    },
    {
      type: "tenant_exited" as const,
      title: "Tenant vacated: Amit Kumar",
      body: "Amit Kumar has vacated. Update room availability and finalize deposit return.",
      severity: "info" as const,
      link: "/admin/tenants",
    }
  ];

  for (const sample of alertSamples) {
    await col("alerts").insertOne({
      _id: "alr_" + ulid(),
      tenantId,
      type: sample.type,
      title: sample.title,
      body: sample.body,
      severity: sample.severity,
      link: sample.link,
      read: false,
      dismissed: false,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    });
  }

  console.log(`\nSeed Complete! Successfully generated 150 realistic leads.`);
  console.log(`Generated ${closedCount} Closed Bookings for Revenue math.`);
  console.log(`Successfully seeded WhatsApp, Rental Agreements, Smart Alerts, and Property Media.`);
  await disconnectDb();
}

runSeed().catch(console.error);
