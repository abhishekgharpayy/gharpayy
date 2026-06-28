import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('ops');
  
  const users = await db.collection("users").find({ tenantId: "gharpayy", role: { $in: ["tcm", "member"] } }).toArray();
  console.log("Users count:", users.length);
  users.forEach(u => {
    console.log(`ID: ${u._id}, fullName: "${u.fullName}", username: "${u.username}", role: ${u.role}`);
  });
  
  await client.close();
}
run().catch(console.error);
