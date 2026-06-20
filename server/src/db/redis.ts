import Redis from "ioredis";
import { env } from "../config/env.js";

const redisOptions: ConstructorParameters<typeof Redis>[1] = {
  maxRetriesPerRequest: null,
  lazyConnect: true,
  enableOfflineQueue: false,
  // In dev, stop retrying after 1 attempt so startup isn't blocked
  retryStrategy: env.NODE_ENV === "development" ? () => null : undefined,
};

export const redis    = new Redis(env.REDIS_URL, redisOptions);
export const redisPub = new Redis(env.REDIS_URL, redisOptions);
export const redisSub = new Redis(env.REDIS_URL, redisOptions);

// Suppress noisy connection error logs in dev when Redis isn't running
if (env.NODE_ENV === "development") {
  redis.on("error", () => {});
  redisPub.on("error", () => {});
  redisSub.on("error", () => {});
}

/** Shared Redis pub/sub channel names. Keep in sync across all subscribers. */
export const REDIS_CHANNELS = {
  events: "gharpayy:domain_events",
} as const;

/**
 * In dev mode, Redis is optional. Returns true if Redis is reachable.
 */
export async function isRedisAvailable(): Promise<boolean> {
  if (env.NODE_ENV !== "development") return true;
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
