import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

const columnDefSchema = z.object({
  source: z.string(),
  label:  z.string().optional(),
  type:   z.enum(["text", "number", "date", "email", "currency", "boolean"]),
  role:           z.enum(["email", "submittedAt", "status", "priority", "dueDate", "amount"]).nullable().optional(),
  currencySymbol: z.string().max(10).optional(),
});

const updateSchema = z.object({
  name:                z.string().min(1).max(255),
  description:         z.string().max(1000).optional().nullable(),
  sourceType:          z.enum(["file", "api"]),
  apiUrl:              z.string().url().optional().nullable(),
  apiHeaders:          z.record(z.string(), z.string()).optional().nullable(),
  pollIntervalMinutes: z.number().int().positive().optional().nullable(),
  importMode:          z.enum(["append", "replace", "dedup"]),
  dedupKey:            z.string().max(255).optional().nullable(),
  fieldMap:            z.record(z.string(), z.string()).optional().nullable(),
  columnDefs:          z.array(columnDefSchema).max(500).optional().nullable(),
});

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const [dataset] = await db
    .select({
      id:                  externalDatasets.id,
      name:                externalDatasets.name,
      description:         externalDatasets.description,
      sourceType:          externalDatasets.sourceType,
      apiUrl:              externalDatasets.apiUrl,
      apiHeadersRaw:       externalDatasets.apiHeaders, // mapped to boolean below, never returned
      pollIntervalMinutes: externalDatasets.pollIntervalMinutes,
      importMode:          externalDatasets.importMode,
      dedupKey:            externalDatasets.dedupKey,
      fieldMap:            externalDatasets.fieldMap,
      columnDefs:          externalDatasets.columnDefs,
      recordCount:         externalDatasets.recordCount,
      lastImportedAt:      externalDatasets.lastImportedAt,
      createdAt:           externalDatasets.createdAt,
    })
    .from(externalDatasets)
    .where(eq(externalDatasets.id, id));
  if (!dataset) return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 });

  // Never expose apiHeaders — may contain auth tokens for third-party APIs
  const { apiHeadersRaw, ...rest } = dataset;
  return NextResponse.json({
    ...rest,
    apiHeadersSet: apiHeadersRaw !== null && Object.keys(apiHeadersRaw as object).length > 0,
  });
}

export async function PUT(req: NextRequest, { params }: Props) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { name, description, sourceType, apiUrl, apiHeaders, pollIntervalMinutes, importMode, dedupKey, fieldMap, columnDefs } = parsed.data;

  const [updated] = await db
    .update(externalDatasets)
    .set({
      name,
      description: description ?? null,
      sourceType,
      apiUrl: apiUrl ?? null,
      apiHeaders: apiHeaders ?? null,
      pollIntervalMinutes: pollIntervalMinutes ?? null,
      importMode,
      dedupKey: dedupKey ?? null,
      fieldMap: fieldMap ?? null,
      columnDefs: columnDefs ?? null,
    })
    .where(eq(externalDatasets.id, id))
    .returning();

  if (!updated) return NextResponse.json({ error: "Ressource introuvable" }, { status: 404 });

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "dataset.update", resourceType: "dataset", resourceId: id, details: { name: updated.name } });

  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest, { params }: Props) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;

  const [existing] = await db.select({ name: externalDatasets.name }).from(externalDatasets).where(eq(externalDatasets.id, id));
  await db.delete(externalDatasets).where(eq(externalDatasets.id, id));

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "dataset.delete", resourceType: "dataset", resourceId: id, details: { name: existing?.name ?? id } });

  return NextResponse.json({ ok: true });
}
