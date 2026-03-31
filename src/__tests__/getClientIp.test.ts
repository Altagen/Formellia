import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import { getClientIp } from "@/lib/security/getClientIp";

function makeRequest(headers: Record<string, string | null>): NextRequest {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe("getClientIp", () => {
  const originalTrustedProxy = process.env.TRUSTED_PROXY;

  afterEach(() => {
    if (originalTrustedProxy === undefined) {
      delete process.env.TRUSTED_PROXY;
    } else {
      process.env.TRUSTED_PROXY = originalTrustedProxy;
    }
  });

  it('returns "unknown" when TRUSTED_PROXY is not set', () => {
    delete process.env.TRUSTED_PROXY;
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it('returns "unknown" when TRUSTED_PROXY=false', () => {
    process.env.TRUSTED_PROXY = "false";
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    expect(getClientIp(req)).toBe("unknown");
  });

  it("when TRUSTED_PROXY=true: returns X-Real-IP value", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({ "x-real-ip": "1.2.3.4" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("when TRUSTED_PROXY=true and no X-Real-IP: returns last entry of X-Forwarded-For", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1, 10.0.0.2, 1.2.3.4" });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it('when TRUSTED_PROXY=true and no headers: returns "unknown"', () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({});
    expect(getClientIp(req)).toBe("unknown");
  });

  it("X-Forwarded-For with multiple IPs returns the LAST one (rightmost)", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({ "x-forwarded-for": "203.0.113.1, 198.51.100.1, 192.0.2.1" });
    expect(getClientIp(req)).toBe("192.0.2.1");
  });

  it("trims whitespace from returned IP (X-Real-IP)", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({ "x-real-ip": "  1.2.3.4  " });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });

  it("trims whitespace from returned IP (X-Forwarded-For)", () => {
    process.env.TRUSTED_PROXY = "true";
    const req = makeRequest({ "x-forwarded-for": "10.0.0.1,   1.2.3.4  " });
    expect(getClientIp(req)).toBe("1.2.3.4");
  });
});
