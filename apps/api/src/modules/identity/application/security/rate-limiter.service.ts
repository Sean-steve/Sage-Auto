// ============================================================================
// CAR HIRE OS — RATE LIMITER SERVICE (DEV-004, SEC-007)
// In-memory sliding window rate limiter for brute-force protection
// ============================================================================

import { AUTH_CONFIG } from "@carhire/constants";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

export class RateLimiterService {
  private readonly store = new Map<string, RateLimitRecord>();
  private readonly maxAttempts: number;
  private readonly windowMs: number;

  constructor(
    maxAttempts: number = AUTH_CONFIG.MAX_LOGIN_ATTEMPTS_PER_WINDOW,
    windowSec: number = AUTH_CONFIG.RATE_LIMIT_WINDOW_SEC
  ) {
    this.maxAttempts = maxAttempts;
    this.windowMs = windowSec * 1000;
  }

  /**
   * Checks whether the key has exceeded the limit and increments count.
   * Returns { allowed: boolean, remaining: number, retryAfterSec: number }
   */
  consume(key: string, customLimit?: number): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const limit = customLimit || this.maxAttempts;
    const now = Date.now();
    const existing = this.store.get(key);

    if (!existing || now > existing.resetAt) {
      this.store.set(key, { count: 1, resetAt: now + this.windowMs });
      return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
    }

    if (existing.count >= limit) {
      const retryAfterSec = Math.ceil((existing.resetAt - now) / 1000);
      return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, retryAfterSec) };
    }

    existing.count += 1;
    this.store.set(key, existing);
    return {
      allowed: true,
      remaining: limit - existing.count,
      retryAfterSec: 0,
    };
  }

  /**
   * Resets rate limit for a key (e.g. after a successful login)
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Clean up expired records
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, record] of this.store.entries()) {
      if (now > record.resetAt) {
        this.store.delete(key);
      }
    }
  }
}
