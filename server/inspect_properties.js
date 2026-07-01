import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('ops');
  
  const properties = await db.collection("properties").find({ tenantId: "gharpayy" }).limit(5).toArray();
  console.log("Properties:", JSON.stringify(properties, null, 2));
  
  await client.close();
}
run().catch(console.error);
