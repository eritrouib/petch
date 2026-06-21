import { RateLimitConfig, PetchRateLimitError } from "./types.js";

export class RateLimiter {
  private requests: number[] = [];
  private readonly maxRequests: number;
  private readonly windowMs: number;

  constructor(config: RateLimitConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs ?? 1000;
  }

  async throttle(): Promise<void> {
    const now = Date.now();
    // Remove timestamps outside the current window
    this.requests = this.requests.filter((t) => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const retryAfter = this.windowMs - (now - oldest);
      throw new PetchRateLimitError(retryAfter);
    }

    this.requests.push(now);
  }

  /** Wait until a slot is available instead of throwing */
  async wait(): Promise<void> {
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0];
      const waitMs = this.windowMs - (now - oldest);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      return this.wait();
    }

    this.requests.push(Date.now());
  }
}
