import { MongoClient } from "mongodb";
import { config } from "dotenv";
import * as fs from "fs";
import * as path from "path";

config({ path: path.join(process.cwd(), "server", ".env") });

async function generateReport() {
  const MONGO_URL = process.env.MONGO_URL!;
  const DB_NAME = process.env.MONGO_DB || "ops";

  const client = new MongoClient(MONGO_URL);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);

    const followUps = await db.collection("followUps").find().sort({ updatedAt: -1, createdAt: -1 }).limit(50).toArray();
    const leadIds = [...new Set(followUps.map(f => f.leadId))];
    const tcmIds = [...new Set(followUps.map(f => f.tcmId))];

    const leads = await db.collection("leads").find({ id: { $in: leadIds } }).toArray();
    const tcms = await db.collection("users").find({ id: { $in: tcmIds } }).toArray();

    let md = "# Impact Queue Audit Report\n\n";
    md += "This report shows the latest 50 actions and tasks in the Impact Queue.\n\n";
    md += "| Timestamp | TCM | Lead Name | Task Type | Status |\n";
    md += "| :--- | :--- | :--- | :--- | :--- |\n";

    for (const f of followUps) {
      const lead = leads.find(l => l.id === f.leadId);
      const tcm = tcms.find(t => t.id === f.tcmId);
      
      const timeStr = new Date(f.updatedAt || f.createdAt || f.dueAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
      const tcmName = tcm ? tcm.name : (f.tcmId || "Unassigned");
      const leadName = lead ? lead.name : "Unknown Lead";
      const type = (f.reason || "follow_up").replace(/_/g, " ");
      const status = f.done ? "✅ Completed" : "⏳ Pending";

      md += `| ${timeStr} | ${tcmName} | ${leadName} | ${type} | ${status} |\n`;
    }

    fs.writeFileSync(path.join(process.cwd(), "impact_queue_audit_report.md"), md);
    console.log("Report generated at impact_queue_audit_report.md");

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

generateReport();
