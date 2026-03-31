import { describe, it, expect, beforeAll } from "vitest";
import { isEncryptedArchive, encryptArchive, decryptArchive } from "@/lib/backup/archiveCrypto";

// archiveCrypto reads ENCRYPTION_KEY from env via deriveKey
const TEST_KEY = "a".repeat(64); // 64 hex chars = 32 bytes

beforeAll(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe("isEncryptedArchive", () => {
  it("returns false for plain buffer", () => {
    expect(isEncryptedArchive(Buffer.from("PK\x03\x04"))).toBe(false);
  });

  it("returns false for empty buffer", () => {
    expect(isEncryptedArchive(Buffer.alloc(0))).toBe(false);
  });

  it("returns true for buffer starting with magic header", () => {
    const magic = Buffer.from("FRMENC01");
    const buf = Buffer.concat([magic, Buffer.alloc(36)]); // magic + enough bytes
    expect(isEncryptedArchive(buf)).toBe(true);
  });
});

describe("encryptArchive / decryptArchive", () => {
  const plain = Buffer.from("fake zip content 12345");

  it("round-trips a buffer", () => {
    const enc = encryptArchive(plain);
    const dec = decryptArchive(enc);
    expect(dec.equals(plain)).toBe(true);
  });

  it("encrypted buffer is detected by isEncryptedArchive", () => {
    const enc = encryptArchive(plain);
    expect(isEncryptedArchive(enc)).toBe(true);
  });

  it("produces different ciphertexts each call (random IV)", () => {
    const a = encryptArchive(plain);
    const b = encryptArchive(plain);
    expect(a.equals(b)).toBe(false);
  });

  it("decryptArchive throws on tampered ciphertext", () => {
    const enc = encryptArchive(plain);
    enc[enc.length - 1] ^= 0xff;
    expect(() => decryptArchive(enc)).toThrow();
  });

  it("decryptArchive throws on plain buffer (no magic)", () => {
    expect(() => decryptArchive(plain)).toThrow();
  });

  it("decryptArchive throws on buffer with only magic bytes (no iv/tag/ciphertext)", () => {
    const tooShort = Buffer.concat([Buffer.from("FRMENC01"), Buffer.alloc(4)]);
    expect(() => decryptArchive(tooShort)).toThrow();
  });
});

describe("archiveCrypto — key rotation fallback", () => {
  const TEST_KEY_PREV = "b".repeat(64);
  const data = Buffer.from("rotation test payload");

  it("decrypts an archive encrypted with the previous key when ENCRYPTION_KEY_PREV is set", () => {
    // Encrypt with what will become the "previous" key
    process.env.ENCRYPTION_KEY = TEST_KEY_PREV;
    const enc = encryptArchive(data);

    // Rotate: new key becomes current, old key becomes prev
    process.env.ENCRYPTION_KEY      = "c".repeat(64);
    process.env.ENCRYPTION_KEY_PREV = TEST_KEY_PREV;

    try {
      const dec = decryptArchive(enc);
      expect(dec.equals(data)).toBe(true);
    } finally {
      process.env.ENCRYPTION_KEY = TEST_KEY;
      delete process.env.ENCRYPTION_KEY_PREV;
    }
  });

  it("throws when neither current nor previous key matches", () => {
    process.env.ENCRYPTION_KEY = TEST_KEY;
    const enc = encryptArchive(data);

    process.env.ENCRYPTION_KEY      = "d".repeat(64);
    process.env.ENCRYPTION_KEY_PREV = "e".repeat(64);

    try {
      expect(() => decryptArchive(enc)).toThrow();
    } finally {
      process.env.ENCRYPTION_KEY = TEST_KEY;
      delete process.env.ENCRYPTION_KEY_PREV;
    }
  });
});
