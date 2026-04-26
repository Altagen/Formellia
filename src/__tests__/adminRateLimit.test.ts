import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";

// Each test uses a unique key to avoid cross-test pollution from the module-level Map.

describe("checkAdminRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("first request is never blocked", () => {
    const result = checkAdminRateLimit("key-first-request", 5, 60_000);
    expect(result.blocked).toBe(false);
  });

  it("requests within limit are not blocked", () => {
    const key = "key-within-limit";
    for (let i = 0; i < 5; i++) {
      const result = checkAdminRateLimit(key, 5, 60_000);
      expect(result.blocked).toBe(false);
    }
  });

  it("request exceeding limit is blocked", () => {
    const key = "key-exceeds-limit";
    // Fill the window up to maxRequests
    for (let i = 0; i < 5; i++) {
      checkAdminRateLimit(key, 5, 60_000);
    }
    // One over the limit
    const result = checkAdminRateLimit(key, 5, 60_000);
    expect(result.blocked).toBe(true);
  });

  it("window resets after windowMs expires", () => {
    const key = "key-window-reset";
    const windowMs = 60_000;

    // Fill up to maxRequests and then exceed
    for (let i = 0; i < 6; i++) {
      checkAdminRateLimit(key, 5, windowMs);
    }
    expect(checkAdminRateLimit(key, 5, windowMs).blocked).toBe(true);

    // Advance time past the window
    vi.advanceTimersByTime(windowMs + 1);

    // Window should have reset — first request in new window is allowed
    const result = checkAdminRateLimit(key, 5, windowMs);
    expect(result.blocked).toBe(false);
  });

  it("different keys do not affect each other", () => {
    const keyA = "key-isolation-a";
    const keyB = "key-isolation-b";

    // Exhaust keyA
    for (let i = 0; i < 6; i++) {
      checkAdminRateLimit(keyA, 5, 60_000);
    }
    expect(checkAdminRateLimit(keyA, 5, 60_000).blocked).toBe(true);

    // keyB should be unaffected
    const result = checkAdminRateLimit(keyB, 5, 60_000);
    expect(result.blocked).toBe(false);
  });

  it("retryAfterMs is positive when blocked", () => {
    const key = "key-retry-after-positive";
    for (let i = 0; i < 6; i++) {
      checkAdminRateLimit(key, 5, 60_000);
    }
    const result = checkAdminRateLimit(key, 5, 60_000);
    expect(result.blocked).toBe(true);
    expect(result.retryAfterMs).toBeGreaterThan(0);
  });

  it("retryAfterMs is 0 when not blocked", () => {
    const result = checkAdminRateLimit("key-retry-after-zero", 5, 60_000);
    expect(result.blocked).toBe(false);
    expect(result.retryAfterMs).toBe(0);
  });

  it("exactly at maxRequests is not blocked, one over is blocked", () => {
    const key = "key-boundary";
    const maxRequests = 3;

    // Request 1 opens the window (count=1), requests 2 and 3 reach maxRequests (count=3)
    for (let i = 0; i < maxRequests; i++) {
      const result = checkAdminRateLimit(key, maxRequests, 60_000);
      expect(result.blocked).toBe(false);
    }

    // Request maxRequests+1 pushes count above maxRequests
    const over = checkAdminRateLimit(key, maxRequests, 60_000);
    expect(over.blocked).toBe(true);
  });
});
