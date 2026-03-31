import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { deriveKey, deriveKeyFromEnv, hasPrevKey } from "@/lib/security/deriveKey";

const VALID_KEY = "0123456789abcdef".repeat(4); // 64 hex chars

describe("deriveKey", () => {
  beforeEach(() => {
    process.env.ENCRYPTION_KEY = VALID_KEY;
  });

  afterEach(() => {
    delete process.env.ENCRYPTION_KEY;
    delete process.env.ENCRYPTION_KEY_PREV;
  });

  it("returns a 32-byte Buffer", () => {
    const key = deriveKey("test-purpose");
    expect(Buffer.isBuffer(key)).toBe(true);
    expect(key.length).toBe(32);
  });

  it("is deterministic for the same purpose", () => {
    const a = deriveKey("same-purpose");
    const b = deriveKey("same-purpose");
    expect(a.equals(b)).toBe(true);
  });

  it("produces different keys for different purposes", () => {
    const a = deriveKey("purpose-a");
    const b = deriveKey("purpose-b");
    expect(a.equals(b)).toBe(false);
  });

  it("throws when ENCRYPTION_KEY is missing", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => deriveKey("x")).toThrow();
  });

  it("throws when ENCRYPTION_KEY is malformed (too short)", () => {
    process.env.ENCRYPTION_KEY = "deadbeef";
    expect(() => deriveKey("x")).toThrow();
  });

  it("throws when ENCRYPTION_KEY has non-hex chars", () => {
    process.env.ENCRYPTION_KEY = "z".repeat(64);
    expect(() => deriveKey("x")).toThrow();
  });
});

describe("deriveKeyFromEnv", () => {
  afterEach(() => {
    delete process.env.TEST_KEY_VAR;
  });

  it("derives key from a custom env var", () => {
    process.env.TEST_KEY_VAR = VALID_KEY;
    const key = deriveKeyFromEnv("TEST_KEY_VAR", "purpose");
    expect(key.length).toBe(32);
  });

  it("throws when the env var is absent", () => {
    expect(() => deriveKeyFromEnv("TEST_KEY_VAR", "purpose")).toThrow();
  });
});

describe("hasPrevKey", () => {
  afterEach(() => {
    delete process.env.ENCRYPTION_KEY_PREV;
  });

  it("returns false when ENCRYPTION_KEY_PREV is absent", () => {
    expect(hasPrevKey()).toBe(false);
  });

  it("returns false when ENCRYPTION_KEY_PREV is invalid", () => {
    process.env.ENCRYPTION_KEY_PREV = "short";
    expect(hasPrevKey()).toBe(false);
  });

  it("returns true when ENCRYPTION_KEY_PREV is a valid 64-hex key", () => {
    process.env.ENCRYPTION_KEY_PREV = VALID_KEY;
    expect(hasPrevKey()).toBe(true);
  });
});
