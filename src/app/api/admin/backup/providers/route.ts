import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptProviderConfig } from "@/lib/backup/providers/index";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Validation schemas
// ─────────────────────────────────────────────────────────

const retentionPolicySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("keep_all") }),
  z.object({ type: z.literal("keep_last_n"),   n:    z.number().int().min(1).max(9999) }),
  z.object({ type: z.literal("keep_last_days"), days: z.number().int().min(1).max(3650) }),
]);

const localConfigSchema = z.object({
  path: z.string().min(1).max(500),
});

const s3ConfigSchema = z.object({
  endpoint:        z.string().url(),
  region:          z.string().min(1).max(64),
  bucket:          z.string().min(1).max(255),
  accessKeyId:     z.string().min(1).max(255),
  secretAccessKey: z.string().min(1).max(512),
  forcePathStyle:  z.boolean().optional(),
  prefix:          z.string().max(500).optional(),
});

const createSchema = z.object({
  name:            z.string().min(1).max(100),
  type:            z.enum(["local", "s3"]),
  config:          z.record(z.string(), z.unknown()),
  enabled:         z.boolean().optional().default(true),
  encryptBackup:   z.boolean().optional().default(false),
  retentionPolicy: retentionPolicySchema.optional().default({ type: "keep_all" }),
});

function validateConfig(type: "local" | "s3", config: Record<string, unknown>) {
  if (type === "local") return localConfigSchema.safeParse(config);
  return s3ConfigSchema.safeParse(config);
}

// ─────────────────────────────────────────────────────────
// GET — list all backup providers
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const rows = await db.select({
    id:              backupProviders.id,
    name:            backupProviders.name,
    type:            backupProviders.type,
    enabled:         backupProviders.enabled,
    encryptBackup:   backupProviders.encryptBackup,
    retentionPolicy: backupProviders.retentionPolicy,
    createdAt:       backupProviders.createdAt,
    updatedAt:       backupProviders.updatedAt,
    // encryptedConfig intentionally omitted — never returned to client
  }).from(backupProviders).orderBy(backupProviders.createdAt);

  return NextResponse.json(rows);
}

// ─────────────────────────────────────────────────────────
// POST — create a backup provider
// ─────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const { name, type, config, enabled, encryptBackup, retentionPolicy } = parsed.data;

  // Validate provider-specific config fields
  const cfgValidation = validateConfig(type, config as Record<string, unknown>);
  if (!cfgValidation.success) {
    return NextResponse.json({ error: cfgValidation.error.issues[0]?.message }, { status: 422 });
  }

  let encryptedConfig: string;
  try {
    encryptedConfig = encryptProviderConfig(JSON.stringify(cfgValidation.data));
  } catch {
    return NextResponse.json(
      { error: "Le service de chiffrement n'est pas disponible. Contactez votre administrateur." },
      { status: 503 }
    );
  }

  const [row] = await db.insert(backupProviders).values({
    name,
    type,
    encryptedConfig,
    enabled,
    encryptBackup,
    retentionPolicy,
  }).returning({
    id: backupProviders.id, name: backupProviders.name, type: backupProviders.type,
    enabled: backupProviders.enabled, encryptBackup: backupProviders.encryptBackup,
    retentionPolicy: backupProviders.retentionPolicy,
    createdAt: backupProviders.createdAt, updatedAt: backupProviders.updatedAt,
  });

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "backup.provider.create", resourceType: "backup_provider", resourceId: row.id,
    details: { name, type },
  });

  return NextResponse.json(row, { status: 201 });
}
