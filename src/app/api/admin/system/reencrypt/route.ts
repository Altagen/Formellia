/**
 * POST /api/admin/system/reencrypt
 *
 * Re-encrypts all stored secrets from ENCRYPTION_KEY_PREV → ENCRYPTION_KEY.
 * Run this after rotating the key:
 *   1. Set ENCRYPTION_KEY_PREV = old ENCRYPTION_KEY
 *   2. Set ENCRYPTION_KEY      = new 64-hex key
 *   3. POST /api/admin/system/reencrypt
 *   4. Remove ENCRYPTION_KEY_PREV once migration reports 0 remaining
 *
 * Admin-only. Returns { migrated: { providers: N, emailKeys: N }, skipped: N }
 */
import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders, emailProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { logAdminEvent } from "@/lib/db/adminAudit";
import {
  encryptProviderConfig,
  decryptProviderConfig,
  needsReencrypt as providerNeedsReencrypt,
} from "@/lib/backup/providers";
import {
  encryptApiKey,
  decryptApiKey,
  needsReencrypt as emailNeedsReencrypt,
} from "@/lib/email/crypto";

export async function POST(req: NextRequest) {
  const guardMutation = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guardMutation) return guardMutation;

  const user = await validateAdminSession(req);
  if (!user) return NextResponse.json({ error: "Session expired" }, { status: 401 });

  let migratedProviders = 0;
  let migratedEmailKeys = 0;
  let skipped = 0;

  // ── 1. Backup providers ──────────────────────────────────────────────────
  const providers = await db.select().from(backupProviders);
  for (const provider of providers) {
    if (!providerNeedsReencrypt(provider.encryptedConfig)) {
      skipped++;
      continue;
    }
    try {
      const plain = decryptProviderConfig(provider.encryptedConfig);
      const reencrypted = encryptProviderConfig(plain);
      await db.update(backupProviders)
        .set({ encryptedConfig: reencrypted })
        .where(eq(backupProviders.id, provider.id));
      migratedProviders++;
    } catch {
      // Skip if decryption fails with both keys (corrupted or unknown key)
      skipped++;
    }
  }

  // ── 2. Email API keys in provider presets ────────────────────────────────
  const presets = await db.select().from(emailProviders);
  for (const preset of presets) {
    if (!preset.apiKeyEncrypted?.trim()) continue;
    if (!emailNeedsReencrypt(preset.apiKeyEncrypted)) {
      skipped++;
      continue;
    }
    try {
      const plain = decryptApiKey(preset.apiKeyEncrypted);
      const reencrypted = encryptApiKey(plain);
      await db.update(emailProviders)
        .set({ apiKeyEncrypted: reencrypted })
        .where(eq(emailProviders.id, preset.id));
      migratedEmailKeys++;
    } catch {
      skipped++;
    }
  }

  logAdminEvent({
    userId: user.id,
    userEmail: user.email,
    action: "system.reencrypt",
    details: { migratedProviders, migratedEmailKeys, skipped },
  });

  return NextResponse.json({
    migrated: { providers: migratedProviders, emailKeys: migratedEmailKeys },
    skipped,
  });
}
