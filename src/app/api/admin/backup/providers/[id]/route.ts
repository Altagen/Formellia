import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { encryptProviderConfig, buildProvider } from "@/lib/backup/providers/index";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";

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

const patchSchema = z.object({
  name:            z.string().min(1).max(100).optional(),
  config:          z.record(z.string(), z.unknown()).optional(),
  enabled:         z.boolean().optional(),
  encryptBackup:   z.boolean().optional(),
  retentionPolicy: retentionPolicySchema.optional(),
});

// ─────────────────────────────────────────────────────────
// GET — get a single provider (without config secrets)
// ─────────────────────────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const [row] = await db.select({
    id:              backupProviders.id,
    name:            backupProviders.name,
    type:            backupProviders.type,
    enabled:         backupProviders.enabled,
    encryptBackup:   backupProviders.encryptBackup,
    retentionPolicy: backupProviders.retentionPolicy,
    createdAt:       backupProviders.createdAt,
    updatedAt:       backupProviders.updatedAt,
  }).from(backupProviders).where(eq(backupProviders.id, id)).limit(1);

  if (!row) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  return NextResponse.json(row);
}

// ─────────────────────────────────────────────────────────
// PATCH — update a provider
// ─────────────────────────────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const [existing] = await db.select().from(backupProviders).where(eq(backupProviders.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  let encryptedConfig: string | undefined;

  if (parsed.data.config !== undefined) {
    const cfgValidation = existing.type === "local"
      ? localConfigSchema.safeParse(parsed.data.config)
      : s3ConfigSchema.safeParse(parsed.data.config);
    if (!cfgValidation.success) {
      return NextResponse.json({ error: cfgValidation.error.issues[0]?.message }, { status: 422 });
    }
    try {
      encryptedConfig = encryptProviderConfig(JSON.stringify(cfgValidation.data));
    } catch {
      return NextResponse.json(
        { error: "Le service de chiffrement n'est pas disponible. Contactez votre administrateur." },
        { status: 503 }
      );
    }
  }

  await db.update(backupProviders).set({
    ...(parsed.data.name            !== undefined ? { name:            parsed.data.name }            : {}),
    ...(parsed.data.enabled         !== undefined ? { enabled:         parsed.data.enabled }         : {}),
    ...(parsed.data.encryptBackup   !== undefined ? { encryptBackup:   parsed.data.encryptBackup }   : {}),
    ...(parsed.data.retentionPolicy !== undefined ? { retentionPolicy: parsed.data.retentionPolicy } : {}),
    ...(encryptedConfig             !== undefined ? { encryptedConfig }                              : {}),
    updatedAt: new Date(),
  }).where(eq(backupProviders.id, id));

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "backup.provider.update", resourceType: "backup_provider", resourceId: id,
    details: { fields: Object.keys(parsed.data) },
  });

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────
// DELETE — remove a provider
// ─────────────────────────────────────────────────────────

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const [existing] = await db.select({ id: backupProviders.id, name: backupProviders.name }).from(backupProviders).where(eq(backupProviders.id, id)).limit(1);
  if (!existing) return NextResponse.json({ error: "Fournisseur introuvable" }, { status: 404 });

  await db.delete(backupProviders).where(eq(backupProviders.id, id));

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "backup.provider.delete", resourceType: "backup_provider", resourceId: id,
    details: { name: existing.name },
  });

  return NextResponse.json({ success: true });
}

// ─────────────────────────────────────────────────────────
// POST .../[id]/test — test provider connection
// (This sub-route is handled in providers/[id]/test/route.ts)
// ─────────────────────────────────────────────────────────

// Handled by the dedicated /test sub-route.
// This file intentionally does NOT include a test action.
// See: /api/admin/backup/providers/[id]/test/route.ts
