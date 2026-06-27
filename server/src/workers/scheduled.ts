import { Worker, Queue, type Job } from "bullmq";
import { redis } from "../db/redis.js";
import { col } from "../db/mongo.js";
import type { Lead, Todo } from "../../../src/contracts/entities.js";
import { newId } from "../platform/id.js";
import { emit } from "../platform/bus.js";

export const SCHEDULED_QUEUE = "scheduled-tasks";
export const SCHEDULED_CONSUMER = "scheduled-worker";

export const scheduledQueue = new Queue(SCHEDULED_QUEUE, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: true,
    removeOnFail: false,
  },
});

export async function startScheduledWorker() {
  new Worker(
    SCHEDULED_QUEUE,
    async (job: Job) => {
      console.log(`[scheduled] processing ${job.name} (job: ${job.id})`);
      const now = Date.now();

      if (job.name === "sla-breach-check") {
        const { leadId, stage } = job.data;
        const lead = await col<Lead>("leads").findOne({ _id: leadId });
        if (lead && lead.stage === stage) {
          // Breach! Emitting an event that the frontend can catch
          await emit({
            _id: newId(),
            type: "evt.alert.sla_breach",
            payload: { leadId, stage, breachHours: 48 },
            occurredAt: new Date().toISOString(),
            actor: "system",
            tenantId: "system",
            correlationId: job.id ?? newId(),
            causationId: null,
            version: 1,
          } as any);
          console.log(`[scheduled] SLA Breach for lead ${leadId} at stage ${stage}`);
        } else {
          console.log(`[scheduled] SLA Breach avoided for lead ${leadId} (stage is now ${lead?.stage})`);
        }
      } 
      
      else if (job.name === "daily-reengagement") {
        // Find leads that haven't been updated in 7 days
        const sevenDaysAgo = now - 7 * 24 * 3600 * 1000;
        const coldLeads = await col<Lead>("leads").find({
          stage: { $nin: ["booked", "lost", "dormant"] },
          updatedAt: { $lt: sevenDaysAgo }
        }).toArray();
        
        let flagged = 0;
        for (const lead of coldLeads) {
          if (!lead.assignedTo) continue;
          
          // Check if there is already a pending follow-up
          const existing = await col<Todo>("todos").findOne({ leadId: lead._id, done: false });
          if (!existing) {
            const todo: Todo = {
              _id: newId(),
              leadId: lead._id,
              tcmId: lead.assignedTo,
              type: "call",
              dueAt: now + 3600 * 1000, // due in 1 hour
              done: false,
              note: "Automated Re-engagement: Lead has been inactive for 7 days.",
              createdAt: now,
              updatedAt: now,
            };
            await col<Todo>("todos").insertOne(todo);
            await emit({
              _id: newId(),
              type: "evt.todo.created",
              payload: { todo },
              occurredAt: new Date().toISOString(),
              actor: "system",
              tenantId: "system",
              correlationId: job.id ?? newId(),
              causationId: null,
              version: 1,
            });
            console.log(`[scheduled] Created re-engagement follow-up for lead ${lead._id}`);
            flagged++;
          }
        }
        console.log(`[scheduled] Daily Re-engagement flagged ${flagged} cold leads.`);
      }

      else if (job.name === "daily-ops-summary") {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        const booked = await col<Lead>("leads").countDocuments({ stage: "booked", updatedAt: { $gte: startOfDay.getTime() } });
        const tours = await col("tours").countDocuments({ status: "completed", updatedAt: { $gte: startOfDay.getTime() } });
        
        await emit({
          _id: newId(),
          type: "evt.alert.daily_summary",
          payload: { date: startOfDay.toISOString(), coldLeadsFlagged: 0, slaBreaches: 0, toursCompleted: tours },
          occurredAt: new Date().toISOString(),
          actor: "system",
          tenantId: "system",
          correlationId: job.id ?? newId(),
          causationId: null,
          version: 1,
        } as any);
        console.log(`[scheduled] Daily Operations Summary generated: ${booked} booked, ${tours} tours completed`);
      }
    },
    { connection: redis }
  );

  // Register recurring jobs
  await scheduledQueue.add("daily-reengagement", {}, {
    repeat: { pattern: "0 9 * * *" } // 9 AM every day
  });
  
  await scheduledQueue.add("daily-ops-summary", {}, {
    repeat: { pattern: "0 20 * * *" } // 8 PM every day
  });
  
  console.log("✓ Scheduled worker started · queue=" + SCHEDULED_QUEUE);
}
