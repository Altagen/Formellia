import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { encryptApiKey, decryptApiKey, needsReencrypt } from "@/lib/email/crypto";

const KEY_A = "a".repeat(64);
const KEY_B = "b".repeat(64);

describe("email crypto", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.ENCRYPTION_KEY = KEY_A;
    delete process.env.ENCRYPTION_KEY_PREV;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("encrypts + decrypts round-trip with the current key", () => {
    const enc = encryptApiKey("re_secret_1234567890abcdef");
    expect(enc.startsWith("cur:")).toBe(true);
    expect(enc).not.toContain("re_secret");
    expect(decryptApiKey(enc)).toBe("re_secret_1234567890abcdef");
  });

  it("produces a distinct ciphertext each call (fresh IV)", () => {
    const a = encryptApiKey("same-plain");
    const b = encryptApiKey("same-plain");
    expect(a).not.toBe(b);
    expect(decryptApiKey(a)).toBe("same-plain");
    expect(decryptApiKey(b)).toBe("same-plain");
  });

  it("decrypts with ENCRYPTION_KEY_PREV when the current key is rotated", () => {
    const encWithA = encryptApiKey("pre-rotation");
    process.env.ENCRYPTION_KEY      = KEY_B;
    process.env.ENCRYPTION_KEY_PREV = KEY_A;
    expect(decryptApiKey(encWithA)).toBe("pre-rotation");
  });

  it("throws when both keys fail (missing / mismatched)", () => {
    const enc = encryptApiKey("x");
    process.env.ENCRYPTION_KEY = KEY_B;
    delete process.env.ENCRYPTION_KEY_PREV;
    expect(() => decryptApiKey(enc)).toThrow(/Cannot decrypt/);
  });

  it("throws when ENCRYPTION_KEY is missing / malformed", () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encryptApiKey("x")).toThrow(/ENCRYPTION_KEY/);
  });

  it("needsReencrypt: false for values encrypted with the current key", () => {
    const enc = encryptApiKey("x");
    expect(needsReencrypt(enc)).toBe(false);
  });

  it("needsReencrypt: true for values encrypted with the previous key", () => {
    const encWithA = encryptApiKey("x");
    process.env.ENCRYPTION_KEY      = KEY_B;
    process.env.ENCRYPTION_KEY_PREV = KEY_A;
    expect(needsReencrypt(encWithA)).toBe(true);
  });

  it("needsReencrypt: true for legacy (no cur: prefix) values", () => {
    const enc = encryptApiKey("x").slice(4);
    expect(needsReencrypt(enc)).toBe(true);
  });
});
