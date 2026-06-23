import { MongoClient } from 'mongodb';

async function main() {
  const uri = 'mongodb+srv://goravgharpayy_db_user2:P7ccpHN4EojV3I4D@cluster0.bzvtk4h.mongodb.net/ops?appName=Cluster0';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("Connected to MongoDB.");
    
    const db = client.db('ops');

    // Find Ananya Sharma assignments
    const assignments = await db.collection('assignment_notifications').find({ leadName: 'Ananya Sharma' }).toArray();
    const ananyaIds = assignments.map(a => a._id);

    console.log(`Found ${ananyaIds.length} Ananya Sharma assignments.`);

    // Delete everything else
    const res1 = await db.collection('assignment_notifications').deleteMany({ _id: { $nin: ananyaIds } });
    console.log(`Deleted ${res1.deletedCount} assignment notifications.`);

    const res2 = await db.collection('app_notifications').deleteMany({});
    console.log(`Deleted ${res2.deletedCount} regular notifications.`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
