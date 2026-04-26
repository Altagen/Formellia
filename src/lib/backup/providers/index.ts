import { aesGcmEncrypt, aesGcmDecrypt } from "@/lib/security/aesGcm";
import { deriveKey, deriveKeyFromEnv } from "@/lib/security/deriveKey";
import type { BackupProvider, LocalProviderConfig, ProviderType, S3ProviderConfig } from "../types";

// ─────────────────────────────────────────────────────────
// Encryption — AES-256-GCM with HKDF-derived purpose key
//
// Wire format written by encryptProviderConfig():
//   "cur:" + base64( iv(12) || authTag(16) || ciphertext )
//
// Key rotation: same mechanism as email/crypto.ts.
// Set ENCRYPTION_KEY_PREV before changing ENCRYPTION_KEY,
// then run POST /api/admin/system/reencrypt to migrate.
// ─────────────────────────────────────────────────────────

const BACKUP_PURPOSE = "backup-credentials-v1";
const PREFIX = "cur:";

export function encryptProviderConfig(plain: string): string {
  return PREFIX + aesGcmEncrypt(plain, deriveKey(BACKUP_PURPOSE));
}

export function decryptProviderConfig(encrypted: string): string {
  const b64 = encrypted.startsWith(PREFIX) ? encrypted.slice(PREFIX.length) : encrypted;

  try {
    return aesGcmDecrypt(b64, deriveKey(BACKUP_PURPOSE));
  } catch {
    if (process.env.ENCRYPTION_KEY_PREV && /^[0-9a-f]{64}$/i.test(process.env.ENCRYPTION_KEY_PREV)) {
      try {
        return aesGcmDecrypt(b64, deriveKeyFromEnv("ENCRYPTION_KEY_PREV", BACKUP_PURPOSE));
      } catch {
        // Both keys failed — fall through
      }
    }
    throw new Error("Cannot decrypt backup provider configuration — check ENCRYPTION_KEY.");
  }
}

export function needsReencrypt(encrypted: string): boolean {
  if (!encrypted.startsWith(PREFIX)) return true;
  const b64 = encrypted.slice(PREFIX.length);
  try {
    aesGcmDecrypt(b64, deriveKey(BACKUP_PURPOSE));
    return false;
  } catch {
    return true;
  }
}

// ─────────────────────────────────────────────────────────
// Factory — instantiate the right provider from a DB row
// ─────────────────────────────────────────────────────────

export async function buildProvider(type: ProviderType, encryptedConfig: string): Promise<BackupProvider> {
  const plain = decryptProviderConfig(encryptedConfig);
  const config = JSON.parse(plain) as LocalProviderConfig | S3ProviderConfig;

  if (type === "local") {
    const { LocalProvider } = await import("./local");
    return new LocalProvider(config as LocalProviderConfig);
  }

  if (type === "s3") {
    const { S3Provider } = await import("./s3");
    return new S3Provider(config as S3ProviderConfig);
  }

  throw new Error(`Type de fournisseur inconnu : ${type}`);
}
