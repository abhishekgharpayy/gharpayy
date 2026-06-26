import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  const db = client.db('ops');
  const docs = await db.collection('leads').aggregate([{ $group: { _id: '$stage', count: { $sum: 1 } } }]).toArray();
  console.log(docs);
  await client.close();
}
run().catch(console.error);
