import { describe, it, expect } from "vitest";
import { randomBytes } from "node:crypto";
import { aesGcmEncrypt, aesGcmDecrypt } from "@/lib/security/aesGcm";

describe("aesGcmEncrypt / aesGcmDecrypt", () => {
  const key = randomBytes(32);

  it("round-trips plain text", () => {
    const plain = "hello world 🔐";
    expect(aesGcmDecrypt(aesGcmEncrypt(plain, key), key)).toBe(plain);
  });

  it("round-trips empty string", () => {
    expect(aesGcmDecrypt(aesGcmEncrypt("", key), key)).toBe("");
  });

  it("produces distinct ciphertexts for same input (random IV)", () => {
    const a = aesGcmEncrypt("same", key);
    const b = aesGcmEncrypt("same", key);
    expect(a).not.toBe(b);
  });

  it("throws when ciphertext is tampered", () => {
    const enc = aesGcmEncrypt("secret", key);
    const buf = Buffer.from(enc, "base64");
    // Flip a byte in the ciphertext region
    buf[buf.length - 1] ^= 0xff;
    expect(() => aesGcmDecrypt(buf.toString("base64"), key)).toThrow();
  });

  it("throws when wrong key is used", () => {
    const wrongKey = randomBytes(32);
    const enc = aesGcmEncrypt("secret", key);
    expect(() => aesGcmDecrypt(enc, wrongKey)).toThrow();
  });

  it("returns a valid base64 string", () => {
    const enc = aesGcmEncrypt("test", key);
    expect(() => Buffer.from(enc, "base64")).not.toThrow();
    // Length: iv(12) + tag(16) + ciphertext(4) = 32 bytes → ceil(32/3)*4=44 chars
    expect(Buffer.from(enc, "base64").length).toBe(32);
  });
});
