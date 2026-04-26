/**
 * Shared AES-256-GCM primitives.
 * Wire format: iv(12) || authTag(16) || ciphertext, base64-encoded.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function aesGcmEncrypt(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ctxt = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ctxt]).toString("base64");
}

export function aesGcmDecrypt(b64: string, key: Buffer): string {
  const buf = Buffer.from(b64, "base64");
  const iv   = buf.subarray(0,  12);
  const tag  = buf.subarray(12, 28);
  const ctxt = buf.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ctxt).toString("utf8") + decipher.final("utf8");
}
