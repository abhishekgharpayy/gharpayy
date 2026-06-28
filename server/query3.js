import { setServers } from 'dns';
setServers(['8.8.8.8', '8.8.4.4']);
import { MongoClient } from 'mongodb';
import 'dotenv/config';

async function run() {
  const client = new MongoClient(process.env.MONGO_URL);
  await client.connect();
  
  const opsDb = client.db('ops');
  const opsCount = await opsDb.collection('leads').countDocuments();
  console.log('ops db leads:', opsCount);

  const gharpayyDb = client.db('gharpayy');
  const gharpayyCount = await gharpayyDb.collection('leads').countDocuments();
  console.log('gharpayy db leads:', gharpayyCount);

  await client.close();
}
run().catch(console.error);
