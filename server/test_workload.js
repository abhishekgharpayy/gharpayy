import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('ops');
  
  const tcms = await db.collection("users").find({
    tenantId: "gharpayy",
    status: "active",
    $or: [{ role: "tcm" }, { role: "member", isTcm: true }],
  }).toArray();
  
  console.log("Users found:", tcms.length);
  tcms.forEach(tcm => {
    const name = tcm.fullName || tcm.username || "Unknown";
    console.log(`[${name}] id: ${tcm._id}, fullName: '${tcm.fullName}', username: '${tcm.username}'`);
  });
  
  await client.close();
}
run().catch(console.error);
