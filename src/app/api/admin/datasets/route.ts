import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";

const columnDefSchema = z.object({
  source: z.string(),
  label:  z.string().optional(),
  type:   z.enum(["text", "number", "date", "email", "currency", "boolean"]),
  role:           z.enum(["email", "submittedAt", "status", "priority", "dueDate", "amount"]).nullable().optional(),
  currencySymbol: z.string().max(10).optional(),
});

const datasetSchema = z.object({
  name:                z.string().min(1).max(255),
  description:         z.string().max(1000).optional().nullable(),
  sourceType:          z.enum(["file", "api"]),
  apiUrl:              z.string().url().optional().nullable(),
  apiHeaders:          z.record(z.string(), z.string()).optional().nullable(),
  pollIntervalMinutes: z.number().int().positive().optional().nullable(),
  importMode:          z.enum(["append", "replace", "dedup"]),
  dedupKey:            z.string().max(255).optional().nullable(),
  // fieldMap: source column → target field name (both must be plain strings)
  fieldMap:            z.record(z.string(), z.string()).optional().nullable(),
  columnDefs:          z.array(columnDefSchema).max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const datasets = await db
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
    .orderBy(desc(externalDatasets.createdAt));

  // Never expose apiHeaders — may contain auth tokens for third-party APIs
  return NextResponse.json(datasets.map(({ apiHeadersRaw, ...rest }) => ({
    ...rest,
    apiHeadersSet: apiHeadersRaw !== null && Object.keys(apiHeadersRaw as object).length > 0,
  })));
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = datasetSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 400 });
  }

  const { name, description, sourceType, apiUrl, apiHeaders, pollIntervalMinutes, importMode, dedupKey, fieldMap, columnDefs } = parsed.data;

  const [dataset] = await db
    .insert(externalDatasets)
    .values({
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
    .returning();

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "dataset.create", resourceType: "dataset", resourceId: dataset.id, details: { name: dataset.name } });

  return NextResponse.json(dataset, { status: 201 });
}
