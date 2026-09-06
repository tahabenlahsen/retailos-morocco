/**
 * Fixed-window rate limiter with two backends:
 *
 *  - Redis (when REDIS_URL is set): atomic INCR + PEXPIRE via a Lua script, shared across
 *    all application instances — required for horizontal scaling.
 *  - In-memory (default): single-instance fallback. Also used automatically when Redis is
 *    unreachable, so a Redis outage degrades protection instead of taking the app down.
 *
 * `checkRateLimit` returns true when the request is allowed.
 */
import Redis from "ioredis"

interface Bucket {
  count: number
  resetAt: number
}

// ---------- in-memory backend ----------
const store = new Map<string, Bucket>()
const SWEEP_INTERVAL = 60_000
let lastSweep = Date.now()
function sweep(now: number) {
  if (now - lastSweep < SWEEP_INTERVAL) return
  lastSweep = now
  for (const [key, bucket] of store) if (bucket.resetAt <= now) store.delete(key)
}
function memoryCheck(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  sweep(now)
  const bucket = store.get(key)
  if (!bucket || bucket.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  bucket.count += 1
  return bucket.count <= limit
}

// ---------- redis backend ----------
const INCR_SCRIPT = `
local current = redis.call('INCR', KEYS[1])
if current == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
return current
`
let redis: Redis | null | undefined // undefined = not initialised, null = disabled
let redisHealthy = true

function getRedis(): Redis | null {
  if (redis !== undefined) return redis
  const url = process.env.REDIS_URL
  if (!url) {
    redis = null
    return null
  }
  redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    connectTimeout: 2000,
    enableOfflineQueue: false,
    retryStrategy: (times) => Math.min(times * 500, 5000),
  })
  redis.on("error", (err) => {
    if (redisHealthy) console.error("[rate-limit] redis error, falling back to memory:", err.message)
    redisHealthy = false
  })
  redis.on("ready", () => {
    redisHealthy = true
  })
  void redis.connect().catch(() => {
    redisHealthy = false
  })
  return redis
}

async function redisCheck(client: Redis, key: string, limit: number, windowMs: number): Promise<boolean> {
  const count = (await client.eval(INCR_SCRIPT, 1, `rl:${key}`, String(windowMs))) as number
  return count <= limit
}

/**
 * Returns true if the request is allowed, false if the limit is exceeded.
 */
export async function checkRateLimit(key: string, limit: number, windowMs: number): Promise<boolean> {
  const client = getRedis()
  if (client && redisHealthy) {
    try {
      return await redisCheck(client, key, limit, windowMs)
    } catch (err) {
      redisHealthy = false
      console.error("[rate-limit] redis check failed, falling back to memory:", (err as Error).message)
    }
  }
  return memoryCheck(key, limit, windowMs)
}

export function rateLimitBackend(): "redis" | "memory" {
  return getRedis() && redisHealthy ? "redis" : "memory"
}

export function isRedisConfigured(): boolean {
  return Boolean(process.env.REDIS_URL)
}

export function getClientIp(headers: Headers): string {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
}
