/**
 * Optional AES-256-GCM encryption for backup ZIP archives.
 *
 * Binary wire format (stored as raw bytes):
 *   MAGIC(8) | iv(12) | authTag(16) | ciphertext(N)
 *
 * Magic bytes: "FRMENC01" — used to detect encrypted archives on restore.
 * Key: HKDF-derived from ENCRYPTION_KEY with purpose "backup-archive-v1".
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { deriveKey, deriveKeyFromEnv, hasPrevKey } from "@/lib/security/deriveKey";

const ARCHIVE_PURPOSE = "backup-archive-v1";
const MAGIC = Buffer.from("FRMENC01");

/** Returns true when the buffer starts with the magic header. */
export function isEncryptedArchive(buf: Buffer): boolean {
  return buf.length > MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);
}

/** Encrypts a ZIP buffer in-place. Returns MAGIC + iv + authTag + ciphertext. */
export function encryptArchive(plain: Buffer): Buffer {
  const key = deriveKey(ARCHIVE_PURPOSE);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([MAGIC, iv, authTag, ciphertext]);
}

/** Decrypts an archive encrypted with encryptArchive(). Throws on invalid magic or auth failure. */
export function decryptArchive(enc: Buffer): Buffer {
  if (!isEncryptedArchive(enc)) {
    throw new Error("Archive does not start with the expected encryption header.");
  }
  const iv      = enc.subarray(MAGIC.length,          MAGIC.length + 12);
  const authTag = enc.subarray(MAGIC.length + 12,     MAGIC.length + 28);
  const ctxt    = enc.subarray(MAGIC.length + 28);

  function tryWithKey(key: Buffer): Buffer {
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ctxt), decipher.final()]);
  }

  // Try current key first
  try {
    return tryWithKey(deriveKey(ARCHIVE_PURPOSE));
  } catch {
    // On key rotation, fall back to ENCRYPTION_KEY_PREV if available
    if (hasPrevKey()) {
      try {
        return tryWithKey(deriveKeyFromEnv("ENCRYPTION_KEY_PREV", ARCHIVE_PURPOSE));
      } catch {
        throw new Error("Archive decryption failed. Encryption key does not match.");
      }
    }
    throw new Error("Archive decryption failed. Encryption key does not match.");
  }
}
