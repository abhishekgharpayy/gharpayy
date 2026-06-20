// Run with: node reset-pass.cjs
const dns = require("dns");
dns.setServers(["8.8.8.8", "8.8.4.4"]);

const argon2 = require("argon2");
const { MongoClient } = require("mongodb");

const MONGO_URL =
  "mongodb+srv://abhishek1gharpayy_db_user:DsSIPqv8zv7g6ypb@cluster0.39qcapj.mongodb.net/ops?appName=Cluster0";
const NEW_PASSWORD = "Admin1234";
const EMAIL = "superadmin@gharpayy.com";

async function run() {
  const client = new MongoClient(MONGO_URL, { family: 4 });
  await client.connect();
  console.log("Connected to MongoDB");
  const db = client.db("ops");
  const hash = await argon2.hash(NEW_PASSWORD);
  const result = await db
    .collection("users")
    .updateOne({ email: EMAIL }, { $set: { passwordHash: hash, updatedAt: new Date().toISOString() } });
  console.log("Updated:", result.modifiedCount, "user(s)");
  console.log("✓ Login with:", EMAIL, "/", NEW_PASSWORD);
  await client.close();
}

run().catch((e) => {
  console.error("FAILED:", e.message);
  process.exit(1);
});
