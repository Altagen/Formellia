import { hkdfSync } from "node:crypto";

const KEY_RE = /^[0-9a-f]{64}$/i;

/**
 * Derives a 32-byte purpose-specific key from the given env variable using HKDF-SHA256.
 * Throws with a clear message if the env var is absent or malformed.
 */
export function deriveKeyFromEnv(envVar: string, purpose: string): Buffer {
  const raw = process.env[envVar] ?? "";
  if (!KEY_RE.test(raw)) {
    throw new Error(`${envVar} not configured or invalid. Contact your administrator.`);
  }
  const ikm = Buffer.from(raw, "hex");
  return Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(32, 0), purpose, 32));
}

/** Derives from ENCRYPTION_KEY (current key). Existing callers are unchanged. */
export function deriveKey(purpose: string): Buffer {
  return deriveKeyFromEnv("ENCRYPTION_KEY", purpose);
}

/** True when ENCRYPTION_KEY_PREV is present — indicates a rotation window is active. */
export function hasPrevKey(): boolean {
  return KEY_RE.test(process.env.ENCRYPTION_KEY_PREV ?? "");
}
