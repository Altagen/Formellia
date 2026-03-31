import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { parseCsv, applyFieldMap, applyColumnDefs, importRecords, importDatasetFromApi } from "@/lib/utils/datasetImport";
import type { ColumnDef } from "@/types/datasets";

interface Props {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Props) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;

  // Rate limit: 10 imports per user per 10 minutes
  const sessionUser = await validateAdminSession(req);
  const rl = checkAdminRateLimit(`dataset-import:${sessionUser?.id ?? "anon"}`, 10, 10 * 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const [dataset] = await db.select().from(externalDatasets).where(eq(externalDatasets.id, id));
  if (!dataset) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const fieldMap = dataset.fieldMap as Record<string, string> | null;
  const columnDefs = dataset.columnDefs as ColumnDef[] | null;
  const mode = (dataset.importMode ?? "append") as "append" | "replace" | "dedup";
  const dedupKey = dataset.dedupKey;

  let rows: Record<string, unknown>[];

  const contentType = req.headers.get("content-type") ?? "";

  const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 413 });
    }

    const text = await file.text();
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith(".json")) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        import("@/lib/logger").then(({ logger }) => logger.error({ err }, "Import JSON parse error"));
        return NextResponse.json({ error: "Invalid JSON file" }, { status: 400 });
      }
      if (!Array.isArray(parsed)) return NextResponse.json({ error: "JSON must be an array" }, { status: 400 });
      rows = parsed as Record<string, unknown>[];
    } else {
      // CSV (default)
      rows = parseCsv(text);
    }
  } else if (dataset.sourceType === "api" && dataset.apiUrl) {
    let result: { inserted: number; skipped: number; total: number };
    try {
      result = await importDatasetFromApi(dataset);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur inconnue";
      const status = msg.includes("URL") || msg.includes("interne") ? 400 : 502;
      return NextResponse.json({ error: msg }, { status });
    }
    const actor = await validateAdminSession(req);
    logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "dataset.import", resourceType: "dataset", resourceId: id, details: result });
    return NextResponse.json(result);
  } else {
    return NextResponse.json({ error: "No file and no API URL configured" }, { status: 400 });
  }

  // Cap row count to prevent a single insert from exhausting DB/memory
  const MAX_ROWS = 100_000;
  if (rows.length > MAX_ROWS) {
    return NextResponse.json(
      { error: `Le fichier contient trop de lignes (${rows.length.toLocaleString("fr")} — max ${MAX_ROWS.toLocaleString("fr")})` },
      { status: 413 }
    );
  }

  // columnDefs takes precedence over fieldMap when both are present
  if (columnDefs && columnDefs.length > 0) {
    rows = applyColumnDefs(rows, columnDefs);
  } else {
    rows = applyFieldMap(rows, fieldMap);
  }
  const result = await importRecords(id, rows, mode, dedupKey);

  const actor = await validateAdminSession(req);
  logAdminEvent({ userId: actor?.id ?? null, userEmail: actor?.email ?? null, action: "dataset.import", resourceType: "dataset", resourceId: id, details: { total: rows.length, ...result } });

  return NextResponse.json({ ...result, total: rows.length });
}
