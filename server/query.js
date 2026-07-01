import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('ops');
  const docs = await db.collection('leads').find({}).limit(5).toArray();
  console.log(docs.map(d => ({id: d._id, tenantId: d.tenantId, name: d.name})));
  await client.close();
}
run().catch(console.error);
