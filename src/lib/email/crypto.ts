/**
 * AES-256-GCM encryption for email provider API keys.
 *
 * Wire format written by encryptApiKey():
 *   "cur:" + base64( iv(12) || authTag(16) || ciphertext )
 *
 * Key rotation:
 *   - Set ENCRYPTION_KEY_PREV = old value of ENCRYPTION_KEY
 *   - Set ENCRYPTION_KEY      = new 64-hex key
 *   - Run POST /api/admin/system/reencrypt to migrate all stored values
 *   - Remove ENCRYPTION_KEY_PREV once migration is complete
 *
 * Backward compatibility:
 *   Legacy values without the "cur:" prefix are decrypted with ENCRYPTION_KEY
 *   (with PREV fallback), so no immediate migration is required on upgrade.
 */
import { aesGcmEncrypt, aesGcmDecrypt } from "@/lib/security/aesGcm";

const KEY_RE = /^[0-9a-f]{64}$/i;
const PREFIX  = "cur:";

function currentKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  if (!KEY_RE.test(raw)) {
    throw new Error("ENCRYPTION_KEY not configured or invalid. Contact your administrator.");
  }
  return Buffer.from(raw, "hex");
}

function prevKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY_PREV ?? "";
  return KEY_RE.test(raw) ? Buffer.from(raw, "hex") : null;
}

/**
 * Encrypts a plaintext API key.
 * Always uses the current ENCRYPTION_KEY and writes the "cur:" version prefix.
 */
export function encryptApiKey(plain: string): string {
  return PREFIX + aesGcmEncrypt(plain, currentKey());
}

/**
 * Decrypts an API key produced by encryptApiKey() or by a legacy version.
 * Falls back to ENCRYPTION_KEY_PREV when the current key fails, to support
 * in-flight key rotations without downtime.
 */
export function decryptApiKey(encrypted: string): string {
  const b64 = encrypted.startsWith(PREFIX) ? encrypted.slice(PREFIX.length) : encrypted;

  try {
    return aesGcmDecrypt(b64, currentKey());
  } catch {
    const prev = prevKey();
    if (prev) {
      try {
        return aesGcmDecrypt(b64, prev);
      } catch {
        // Both keys failed — fall through to error below
      }
    }
    throw new Error("Cannot decrypt API key — check ENCRYPTION_KEY.");
  }
}

/**
 * Returns true if the value was encrypted with a previous key and needs migration.
 * Used by the re-encryption job.
 */
export function needsReencrypt(encrypted: string): boolean {
  if (!encrypted.startsWith(PREFIX)) return true; // legacy format
  const b64 = encrypted.slice(PREFIX.length);
  try {
    aesGcmDecrypt(b64, currentKey());
    return false; // decrypts fine with current key — already migrated
  } catch {
    return true; // current key fails — must be encrypted with PREV
  }
}
