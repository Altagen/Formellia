import { describe, it, expect } from "vitest";
import type { NextRequest } from "next/server";
import { validateCsrfOrigin } from "@/lib/security/csrf";

function makeRequest(headers: Record<string, string | null>): NextRequest {
  return {
    headers: {
      get: (key: string) => headers[key.toLowerCase()] ?? null,
    },
  } as unknown as NextRequest;
}

describe("validateCsrfOrigin", () => {
  it("returns true when no Origin header (same-origin assumption)", () => {
    const req = makeRequest({ host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns true when Origin matches Host exactly", () => {
    const req = makeRequest({ origin: "http://app.com", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns true when Origin has https:// scheme matching http host", () => {
    const req = makeRequest({ origin: "https://app.com", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(true);
  });

  it("returns false when Origin is from a different domain", () => {
    const req = makeRequest({ origin: "https://evil.com", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false when Origin is malformed (not a valid URL)", () => {
    const req = makeRequest({ origin: "not-a-valid-url", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false when no Host header", () => {
    const req = makeRequest({ origin: "https://app.com" });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false for subdomain attacks (evil.app.com vs app.com)", () => {
    const req = makeRequest({ origin: "https://evil.app.com", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(false);
  });

  it("returns false for attacker embedding app domain in path (app.com.evil.com)", () => {
    const req = makeRequest({ origin: "https://app.com.evil.com", host: "app.com" });
    expect(validateCsrfOrigin(req)).toBe(false);
  });
});
