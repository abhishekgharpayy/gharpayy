import { MongoClient } from "mongodb";
import { config } from "dotenv";
import * as path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

config({ path: path.join(__dirname, ".env") });

async function checkDb() {
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

    const collections = await db.listCollections().toArray();
    console.log("Collections in database:");
    for (const colInfo of collections) {
      const count = await db.collection(colInfo.name).countDocuments();
      console.log(` - ${colInfo.name}: ${count} documents`);
      if (count > 0) {
        // Sample some documents to see if they are dummy
        const docs = await db.collection(colInfo.name).find().limit(3).toArray();
        console.log(`   Samples for ${colInfo.name}:`);
        for (const doc of docs) {
          console.log(`     - id: ${doc.id}, _id: ${doc._id}, name: ${doc.name || doc.fullName || ''}`);
        }
      }
    }
  } catch (err) {
    console.error("Error checking db:", err);
  } finally {
    await client.close();
  }
}

checkDb();
