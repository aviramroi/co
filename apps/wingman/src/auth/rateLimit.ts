// Fixed-window, in-memory rate limiter. Good enough for a single-process
// self-hosted agent; put a real limiter (Redis) in front if you scale out.

interface Bucket {
  count: number;
  resetAt: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true if the request is allowed; false if the key is over its limit. */
  check(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt < now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.windowMs });
      return true;
    }
    if (b.count >= this.max) return false;
    b.count++;
    return true;
  }

  /** Opportunistic cleanup so the map doesn't grow unbounded. */
  sweep() {
    const now = Date.now();
    for (const [k, b] of this.buckets) if (b.resetAt < now) this.buckets.delete(k);
  }
}
