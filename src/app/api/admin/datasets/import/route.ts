import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/serialization/parseBody";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";

const columnDefSchema = z.object({
  source:         z.string(),
  label:          z.string().optional(),
  type:           z.enum(["text", "number", "date", "email", "currency", "boolean"]),
  role:           z.enum(["email", "submittedAt", "status", "priority", "dateEcheance", "amount"]).nullable().optional(),
  currencySymbol: z.string().max(10).optional(),
});

const datasetEntrySchema = z.object({
  name:                z.string().min(1).max(255),
  description:         z.string().max(1000).optional().nullable(),
  sourceType:          z.enum(["file", "api"]),
  apiUrl:              z.string().url().optional().nullable(),
  // apiHeaders absent from schema — must be injected via env var at deploy time
  pollIntervalMinutes: z.number().int().positive().optional().nullable(),
  importMode:          z.enum(["append", "replace", "dedup"]),
  dedupKey:            z.string().max(255).optional().nullable(),
  fieldMap:            z.record(z.string(), z.string()).optional().nullable(),
  columnDefs:          z.array(columnDefSchema).max(500).optional().nullable(),
});

const bodySchema = z.object({
  datasets: z.array(datasetEntrySchema).min(1, "datasets must contain at least one item"),
  mode:     z.enum(["append", "replace"]).default("replace"),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  let rawParsed: unknown;
  try {
    rawParsed = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  const parsed = bodySchema.safeParse(rawParsed);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 422 });
  }

  const { datasets: incoming, mode } = parsed.data;
  const existing = await db.select({ id: externalDatasets.id, name: externalDatasets.name }).from(externalDatasets);
  const nameMap = new Map(existing.map(d => [d.name, d.id]));

  const created: string[] = [];
  const updated: string[] = [];
  const errors: Array<{ name: string; message: string }> = [];

  for (const dataset of incoming) {
    const existingId = nameMap.get(dataset.name);
    try {
      if (existingId && mode === "append") {
        errors.push({ name: dataset.name, message: `Dataset "${dataset.name}" already exists (append mode)` });
        continue;
      }
      if (existingId) {
        await db.update(externalDatasets)
          .set({
            description:         dataset.description ?? null,
            sourceType:          dataset.sourceType,
            apiUrl:              dataset.apiUrl ?? null,
            pollIntervalMinutes: dataset.pollIntervalMinutes ?? null,
            importMode:          dataset.importMode,
            dedupKey:            dataset.dedupKey ?? null,
            fieldMap:            dataset.fieldMap ?? null,
            columnDefs:          dataset.columnDefs ?? null,
            // apiHeaders preserved from DB — not overwritten by import
          })
          .where(eq(externalDatasets.id, existingId));
        updated.push(dataset.name);
      } else {
        await db.insert(externalDatasets).values({
          name:                dataset.name,
          description:         dataset.description ?? null,
          sourceType:          dataset.sourceType,
          apiUrl:              dataset.apiUrl ?? null,
          apiHeaders:          null, // injected separately via env var
          pollIntervalMinutes: dataset.pollIntervalMinutes ?? null,
          importMode:          dataset.importMode,
          dedupKey:            dataset.dedupKey ?? null,
          fieldMap:            dataset.fieldMap ?? null,
          columnDefs:          dataset.columnDefs ?? null,
        });
        created.push(dataset.name);
      }
    } catch (e: unknown) {
      errors.push({ name: dataset.name, message: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "datasets.import", resourceType: "external_datasets", resourceId: "batch",
    details: { created: created.length, updated: updated.length, errors: errors.length, mode },
  });

  return NextResponse.json({ created, updated, errors });
}
