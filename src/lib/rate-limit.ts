/**
 * In-memory rate limiter using sliding window algorithm.
 * No external dependencies — works with any Node.js runtime.
 *
 * Usage:
 *   const limiter = createRateLimiter({ windowMs: 60_000, maxRequests: 60 });
 *   const { allowed, remaining, resetMs } = limiter.check(ip);
 */

interface RateLimitEntry {
  timestamps: number[];
}

interface RateLimiterOptions {
  /** Time window in milliseconds (default: 60 000 = 1 min) */
  windowMs?: number;
  /** Max requests per window (default: 60) */
  maxRequests?: number;
  /** Cleanup interval in ms — removes stale entries (default: 5 min) */
  cleanupIntervalMs?: number;
}

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function createRateLimiter(opts: RateLimiterOptions = {}) {
  const windowMs = opts.windowMs ?? 60_000;
  const maxRequests = opts.maxRequests ?? 60;
  const cleanupIntervalMs = opts.cleanupIntervalMs ?? 5 * 60_000;

  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup to prevent unbounded growth
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
      if (entry.timestamps.length === 0) store.delete(key);
    }
  }, cleanupIntervalMs);

  // Allow GC if the module is unloaded
  if (cleanup.unref) cleanup.unref();

  function check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = store.get(key);
    if (!entry) {
      entry = { timestamps: [] };
      store.set(key, entry);
    }

    // Slide the window — drop old timestamps
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

    if (entry.timestamps.length >= maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      return {
        allowed: false,
        remaining: 0,
        resetMs: oldestInWindow + windowMs - now,
      };
    }

    entry.timestamps.push(now);
    return {
      allowed: true,
      remaining: maxRequests - entry.timestamps.length,
      resetMs: windowMs,
    };
  }

  return { check };
}

// ── Pre-configured limiters ─────────────────────────────────────────

/** General API limiter: 100 req / 60 s per IP */
export const apiLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 100,
});

/** Webhook limiter: 30 req / 60 s per IP */
export const webhookLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 30,
});

/** Auth / sensitive endpoints: 10 req / 60 s per IP */
export const authLimiter = createRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
});
