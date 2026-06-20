// Run with: npx tsx src/scripts/reset-superadmin.ts
import { setServers } from "dns";
setServers(["8.8.8.8", "8.8.4.4"]);

import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import argon2 from "argon2";
import { MongoClient } from "mongodb";

const here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(here, "../../.env") });

const MONGO_URL = process.env.MONGO_URL!;
const NEW_PASSWORD = "Admin1234";
const EMAIL = "superadmin@gharpayy.com";

const client = new MongoClient(MONGO_URL, { family: 4 });
await client.connect();
console.log("✓ Connected to MongoDB");

const db = client.db(process.env.MONGO_DB ?? "ops");
const hash = await argon2.hash(NEW_PASSWORD);
const result = await db.collection("users").updateOne(
  { email: EMAIL },
  { $set: { passwordHash: hash, updatedAt: new Date().toISOString() } }
);

if (result.matchedCount === 0) {
  console.log("No user found — inserting super admin...");
  // If not found, delete any existing and re-insert
}

console.log(`✓ Updated ${result.modifiedCount} user(s)`);
console.log(`✓ Login: ${EMAIL} / ${NEW_PASSWORD}`);
await client.close();
