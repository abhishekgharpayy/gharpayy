import { MongoClient } from 'mongodb';

async function main() {
  const uri = 'mongodb+srv://goravgharpayy_db_user2:P7ccpHN4EojV3I4D@cluster0.bzvtk4h.mongodb.net/ops?appName=Cluster0';
  const client = new MongoClient(uri);
  
  try {
    await client.connect();
    console.log("Connected to MongoDB.");
    
    const db = client.db('ops');

    // Find Ananya Sharma lead
    const ananya = await db.collection('leads').findOne({ name: /Ananya Sharma/i });
    
    let leadIdToKeep = null;
    if (ananya) {
      leadIdToKeep = ananya._id;
      console.log(`Found Ananya Sharma lead: ${leadIdToKeep}`);
    } else {
      console.log("Ananya Sharma lead not found.");
    }

    // Delete all tours except Ananya's
    const query = leadIdToKeep ? { leadId: { $ne: leadIdToKeep } } : {};
    const resTours = await db.collection('tours').deleteMany(query);
    console.log(`Deleted ${resTours.deletedCount} old tours.`);

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main().catch(console.error);
