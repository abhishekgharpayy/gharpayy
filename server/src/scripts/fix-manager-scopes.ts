import { col, connectMongo as connectDb, disconnectMongo as disconnectDb } from "../db/mongo.js";
import { DEFAULT_SCOPES } from "../../../src/contracts/roles";

async function run() {
  await connectDb();
  console.log("Updating all managers and hr roles with the latest scopes...");
  
  const users = col("users");
  const res = await users.updateMany(
    { role: { $in: ["manager", "hr"] } },
    { $set: { scopes: DEFAULT_SCOPES["manager"] } }
  );
  
  console.log(`Updated ${res.modifiedCount} users.`);
  await disconnectDb();
  process.exit(0);
}

run().catch(console.error);
