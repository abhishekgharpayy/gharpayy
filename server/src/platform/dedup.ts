// Idempotency helpers: Redis SETNX guard for at-least-once consumers.
// Mongo-side correctness is enforced by unique indexes; this is the fast path.
// When Redis is unavailable (dev without Redis), we skip the fast-path and let
// Mongo's unique indexes be the sole idempotency guard.
import { redis, isRedisAvailable } from "../db/redis.js";

const TTL_DAYS = 1;
const TTL_SECS = TTL_DAYS * 24 * 60 * 60;

/** Returns true the FIRST time this (eventId, consumer) pair is seen. */
export async function claimEvent(eventId: string, consumer: string): Promise<boolean> {
  if (!(await isRedisAvailable())) return true; // allow through; Mongo unique index guards
  try {
    const key = `evt:done:${eventId}:${consumer}`;
    const ok = await redis.set(key, "1", "EX", TTL_SECS, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}

/** Manual release in case of error — lets the next delivery retry the consumer. */
export async function releaseEvent(eventId: string, consumer: string): Promise<void> {
  if (!(await isRedisAvailable())) return;
  try {
    await redis.del(`evt:done:${eventId}:${consumer}`);
  } catch {
    // no-op
  }
}

/** Cheap pre-DB idempotency for the command bus (the durable ledger is the truth). */
export async function maybeReserveCommand(cmdId: string): Promise<boolean> {
  if (!(await isRedisAvailable())) return true; // allow through; Mongo handles dedup
  try {
    const ok = await redis.set(`idem:cmd:${cmdId}`, "1", "EX", 60, "NX");
    return ok === "OK";
  } catch {
    return true;
  }
}
