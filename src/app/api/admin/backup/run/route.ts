import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProvider } from "@/lib/backup/providers/index";
import { composeBackup, makeBackupFilename } from "@/lib/backup/composer";
import { applyRetentionPolicy } from "@/lib/backup/retention";
import { encryptArchive } from "@/lib/backup/archiveCrypto";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";

// Allow up to 5 minutes for large backups (Vercel / Next.js route timeout hint)
export const maxDuration = 300;

const BACKUP_TIMEOUT_MS = 4 * 60 * 1000; // 4 min — leave 1 min for upload + margin

const runSchema = z.object({
  providerId:   z.string().uuid(),
  formSlugs:    z.array(z.string()).optional(),
  datasetNames: z.array(z.string()).optional(),
});

/**
 * POST /api/admin/backup/run
 * Triggers a manual backup to the given provider.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const { providerId, formSlugs, datasetNames } = parsed.data;

  const [providerRow] = await db.select().from(backupProviders).where(eq(backupProviders.id, providerId)).limit(1);
  if (!providerRow) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });
  if (!providerRow.enabled) return NextResponse.json({ error: "This provider is disabled" }, { status: 409 });

  const provider = await buildProvider(providerRow.type as "local" | "s3", providerRow.encryptedConfig);

  // Compose + upload with a hard timeout to avoid hanging indefinitely
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("BACKUP_TIMEOUT")), BACKUP_TIMEOUT_MS)
  );

  let zipBuffer: Buffer;
  try {
    zipBuffer = await Promise.race([composeBackup({ formSlugs, datasetNames }), timeoutPromise]);
  } catch (err) {
    if (err instanceof Error && err.message === "BACKUP_TIMEOUT") {
      return NextResponse.json({ error: "Backup exceeded the maximum timeout (4 min)." }, { status: 504 });
    }
    throw err;
  }

  const filename  = makeBackupFilename();

  // Optionally encrypt the archive before uploading
  const uploadBuffer = providerRow.encryptBackup ? encryptArchive(zipBuffer) : zipBuffer;

  // Upload
  await provider.upload(filename, uploadBuffer);

  // Apply retention policy
  const deleted = await applyRetentionPolicy(provider, providerRow.retentionPolicy);

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "backup.run", resourceType: "backup_provider", resourceId: providerId,
    details: { filename, sizeBytes: uploadBuffer.length, encrypted: providerRow.encryptBackup, deleted },
  });

  return NextResponse.json({
    success:   true,
    filename,
    sizeBytes: uploadBuffer.length,
    encrypted: providerRow.encryptBackup,
    deleted,
  });
}
