import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProvider } from "@/lib/backup/providers/index";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";
import AdmZip from "adm-zip";
import { isEncryptedArchive, decryptArchive } from "@/lib/backup/archiveCrypto";

// Only allow safe filenames: no path separators, no hidden files, must end in .zip.
// This is a defence-in-depth measure — LocalProvider also checks path confinement.
const SAFE_KEY_RE = /^[a-zA-Z0-9][a-zA-Z0-9_\-\.]*\.zip$/;

const restoreSchema = z.object({
  providerId: z.string().uuid(),
  key:        z.string().min(1).max(255).regex(SAFE_KEY_RE, "Invalid key format (.zip filename expected)"),
  mode:       z.enum(["append", "replace"]).default("replace"),
  sections:   z.array(z.enum(["forms", "scheduledJobs", "datasets", "admin", "app"])).optional(),
});

/** Maximum ZIP size we are willing to buffer in memory (100 MB). */
const MAX_BACKUP_BYTES = 100 * 1024 * 1024;

/**
 * POST /api/admin/backup/restore
 * Downloads a ZIP backup from a provider and delegates to the existing
 * /api/admin/config/backup POST endpoint logic.
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  // Rate limit: 3 restores per user per 15 minutes (ZIP decompression is expensive)
  const user = await validateAdminSession(req);
  const rl = checkAdminRateLimit(`backup-restore:${user?.id ?? "anon"}`, 3, 15 * 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = restoreSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const { providerId, key, mode, sections } = parsed.data;

  const [providerRow] = await db.select().from(backupProviders).where(eq(backupProviders.id, providerId)).limit(1);
  if (!providerRow) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  // Download ZIP
  const provider = await buildProvider(providerRow.type as "local" | "s3", providerRow.encryptedConfig);
  let zipBuffer: Buffer;
  try {
    zipBuffer = await provider.download(key);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Fichier introuvable" }, { status: 404 });
  }

  // Guard against oversized files that could exhaust server memory
  if (zipBuffer.length > MAX_BACKUP_BYTES) {
    return NextResponse.json(
      { error: `Backup file exceeds the maximum size (${Math.round(MAX_BACKUP_BYTES / 1024 / 1024)} MB)` },
      { status: 413 }
    );
  }

  // Decrypt if the archive was encrypted at upload time
  let archiveBuffer = zipBuffer;
  if (isEncryptedArchive(zipBuffer)) {
    try {
      archiveBuffer = decryptArchive(zipBuffer);
    } catch {
      return NextResponse.json({ error: "Cannot decrypt archive — check ENCRYPTION_KEY." }, { status: 422 });
    }
  }

  // Parse ZIP — extract config.yaml (the canonical config section)
  let zip: AdmZip;
  try {
    zip = new AdmZip(archiveBuffer);
  } catch {
    return NextResponse.json({ error: "Le fichier n'est pas un ZIP valide" }, { status: 422 });
  }
  const configEntry = zip.getEntry("config.yaml");
  if (!configEntry) {
    return NextResponse.json({ error: "Le fichier backup ne contient pas de config.yaml" }, { status: 422 });
  }

  // Guard against zip-bomb: check uncompressed size before decompressing
  const MAX_YAML_BYTES = 5 * 1024 * 1024; // 5 MB — ample for any real config
  if (configEntry.header.size > MAX_YAML_BYTES) {
    return NextResponse.json(
      { error: "config.yaml file exceeds the maximum allowed size (5 MB)." },
      { status: 413 }
    );
  }

  const yamlContent = configEntry.getData().toString("utf8");

  // Parse YAML once here; restoreFromObject takes a pre-parsed object.
  let incoming: Record<string, unknown>;
  try {
    const { load } = await import("js-yaml");
    const parsed = load(yamlContent);
    if (typeof parsed !== "object" || parsed === null) {
      return NextResponse.json({ error: "Le fichier config.yaml ne contient pas un objet YAML valide" }, { status: 422 });
    }
    incoming = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "YAML invalide dans config.yaml" }, { status: 422 });
  }

  // Call the restore logic directly — avoids any HTTP self-call
  // and eliminates the Host-header spoofing surface of a loopback fetch.
  const { restoreFromObject } = await import("@/lib/backup/restoreFromYaml");
  const actor = await import("@/lib/auth/validateSession").then(m => m.validateAdminSession(req));
  const restoreBody = await restoreFromObject(incoming, { mode, sections }, actor);

  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "backup.restore", resourceType: "backup_provider", resourceId: providerId,
    details: { key, mode, sections: sections ?? "all" },
  });

  return NextResponse.json(restoreBody);
}
