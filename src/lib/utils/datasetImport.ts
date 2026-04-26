import { parse } from "csv-parse/sync";
import { db } from "@/lib/db";
import { externalDatasets, externalRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { ColumnDef } from "@/types/datasets";
import { isSsrfUrl } from "@/lib/security/ssrfCheck";

export function parseCsv(text: string): Record<string, string>[] {
  return parse(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as Record<string, string>[];
}

export function applyFieldMap(
  rows: Record<string, unknown>[],
  fieldMap: Record<string, string> | null | undefined
): Record<string, unknown>[] {
  if (!fieldMap || Object.keys(fieldMap).length === 0) return rows;
  return rows.map(row => {
    const mapped: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      const newKey = fieldMap[key] ?? key;
      mapped[newKey] = value;
    }
    return mapped;
  });
}

// ── Robust date parser ───────────────────────────────────────────────────────

/**
 * Parses a date string in various formats to an ISO string.
 * - Handles EU format DD/MM/YYYY or DD-MM-YYYY (not natively supported by Date)
 * - Handles "March 19, 2026", ISO, US format MM/DD/YYYY, etc.
 * - Defaults to noon (12:00) when no time component to avoid timezone day-shifts.
 */
export function parseDateRobust(raw: string): string | null {
  let str = raw.trim();

  // EU format: DD/MM/YYYY or DD-MM-YYYY → convert to ISO-friendly YYYY-MM-DD
  const euMatch = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (euMatch) {
    str = `${euMatch[3]}-${euMatch[2].padStart(2, "0")}-${euMatch[1].padStart(2, "0")}`;
  }

  const d = new Date(str);
  if (isNaN(d.getTime())) return null;

  // If no time component in original value → noon to avoid TZ day-shift
  const hasTime = /\d{1,2}:\d{2}/.test(raw);
  if (!hasTime) d.setHours(12, 0, 0, 0);

  return d.toISOString();
}

// ── Auto-detect column roles and types from column name heuristics ──────────

export function inferColumnType(colName: string, values: unknown[]): ColumnDef["type"] {
  const lower = colName.toLowerCase();
  if (lower.includes("email")) return "email";
  if (lower.includes("amount") || lower.includes("price") || lower.includes("spent") || lower.includes("total") || lower.includes("revenue")) return "currency";
  // Check values for dates
  const sample = values.filter(v => v != null && v !== "").slice(0, 8);
  if (sample.length > 0 && sample.every(v => parseDateRobust(String(v)) !== null)) return "date";
  if (sample.length > 0 && sample.every(v => v === true || v === false || v === "true" || v === "false")) return "boolean";
  if (sample.length > 0 && sample.every(v => !isNaN(Number(v)) && String(v).trim() !== "")) return "number";
  return "text";
}

export function inferColumnRole(colName: string, type: ColumnDef["type"]): ColumnDef["role"] {
  const lower = colName.toLowerCase();
  if (lower.includes("email")) return "email";
  if (lower.includes("date") || lower.includes("since") || lower.includes("created") || lower.endsWith("_at")) return "submittedAt";
  if (lower === "status" || lower.includes("status")) return "status";
  if (lower === "priority") return "priority";
  if (lower.includes("echeance") || lower.includes("deadline") || lower.includes("due")) return "dueDate";
  if (type === "currency" || lower.includes("amount") || lower.includes("spent") || lower.includes("revenue") || lower.includes("price")) return "amount";
  return null;
}

export function buildAutoColumnDefs(rows: Record<string, unknown>[]): ColumnDef[] {
  if (rows.length === 0) return [];
  const columns = Object.keys(rows[0]);
  return columns.map(col => {
    const values = rows.map(r => r[col]);
    const type = inferColumnType(col, values);
    const role = inferColumnRole(col, type);
    return { source: col, type, role: role ?? undefined };
  });
}

// ── Apply columnDefs: rename by role + cast types ────────────────────────────

export function applyColumnDefs(
  rows: Record<string, unknown>[],
  defs: ColumnDef[]
): Record<string, unknown>[] {
  if (defs.length === 0) return rows;

  return rows.map(row => {
    const out: Record<string, unknown> = {};

    for (const def of defs) {
      const raw = row[def.source];
      const key = def.role ?? def.source;

      let value: unknown = raw;
      if (raw != null && raw !== "") {
        switch (def.type) {
          case "number":
          case "currency":
            value = Number(raw);
            if (isNaN(value as number)) value = raw;
            break;
          case "date":
            if (typeof raw === "string" || typeof raw === "number") {
              value = parseDateRobust(String(raw)) ?? raw;
            }
            break;
          case "boolean":
            value = raw === "true" || raw === true || raw === 1 || raw === "1";
            break;
          default:
            value = raw;
        }
      }

      out[key] = value;
    }

    // Preserve columns not covered by any def
    for (const [k, v] of Object.entries(row)) {
      const hasDef = defs.some(d => d.source === k);
      if (!hasDef) out[k] = v;
    }

    return out;
  });
}

export async function importRecords(
  datasetId: string,
  rows: Record<string, unknown>[],
  mode: "append" | "replace" | "dedup",
  dedupKey?: string | null
): Promise<{ inserted: number; skipped: number }> {
  let inserted = 0;
  let skipped = 0;

  if (mode === "replace") {
    await db.delete(externalRecords).where(eq(externalRecords.datasetId, datasetId));
    await db.insert(externalRecords).values(
      rows.map(data => ({ datasetId, data }))
    );
    inserted = rows.length;
  } else if (mode === "append") {
    await db.insert(externalRecords).values(
      rows.map(data => ({ datasetId, data }))
    );
    inserted = rows.length;
  } else if (mode === "dedup" && dedupKey) {
    // Fetch existing dedup key values
    const existing = await db
      .select({ data: externalRecords.data })
      .from(externalRecords)
      .where(eq(externalRecords.datasetId, datasetId));

    const existingKeys = new Set(
      existing.map(r => String((r.data as Record<string, unknown>)[dedupKey] ?? ""))
    );

    const toInsert = rows.filter(row => {
      const val = String(row[dedupKey] ?? "");
      if (existingKeys.has(val)) {
        skipped++;
        return false;
      }
      existingKeys.add(val);
      return true;
    });

    if (toInsert.length > 0) {
      await db.insert(externalRecords).values(
        toInsert.map(data => ({ datasetId, data }))
      );
    }
    inserted = toInsert.length;
  } else {
    // dedup without key falls back to append
    await db.insert(externalRecords).values(
      rows.map(data => ({ datasetId, data }))
    );
    inserted = rows.length;
  }

  // Update dataset metadata
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(externalRecords)
    .where(eq(externalRecords.datasetId, datasetId));

  await db
    .update(externalDatasets)
    .set({
      recordCount: countResult[0]?.count ?? 0,
      lastImportedAt: new Date(),
    })
    .where(eq(externalDatasets.id, datasetId));

  return { inserted, skipped };
}

// ── API import (shared between HTTP route and scheduler job) ─────────────────

const FORBIDDEN_HEADERS = new Set([
  "host", "cookie", "set-cookie",
  "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto",
  "x-real-ip", "proxy-authorization",
  "x-aws-", "x-amz-", "x-goog-", "x-cloud-trace-context",
]);

const MAX_ROWS = 100_000;

export async function importDatasetFromApi(
  dataset: typeof externalDatasets.$inferSelect,
): Promise<{ inserted: number; skipped: number; total: number }> {
  if (!dataset.apiUrl) throw new Error("Dataset has no API URL configured");
  if (isSsrfUrl(dataset.apiUrl)) throw new Error("Internal/private URLs are not allowed");

  try { new URL(dataset.apiUrl); } catch { throw new Error("URL du dataset invalide"); }

  const rawHeaders = (dataset.apiHeaders as Record<string, string>) ?? {};
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(rawHeaders)) {
    const kl = k.toLowerCase();
    if (!FORBIDDEN_HEADERS.has(kl) && !Array.from(FORBIDDEN_HEADERS).some(f => kl.startsWith(f))) {
      headers[k] = v;
    }
  }

  let response: Response;
  try {
    response = await fetch(dataset.apiUrl, { headers, signal: AbortSignal.timeout(10_000) });
  } catch {
    throw new Error("API fetch failed (timeout or unreachable URL)");
  }
  if (!response.ok) throw new Error(`API fetch failed: ${response.status}`);

  let json: unknown;
  try { json = await response.json(); } catch { throw new Error("API did not return valid JSON"); }
  if (!Array.isArray(json)) throw new Error("API must return a JSON array");

  let rows = json as Record<string, unknown>[];
  if (rows.length > MAX_ROWS) throw new Error(`Trop de lignes (${rows.length} — max ${MAX_ROWS})`);

  const columnDefs = dataset.columnDefs as ColumnDef[] | null;
  const fieldMap = dataset.fieldMap as Record<string, string> | null;
  if (columnDefs && columnDefs.length > 0) {
    rows = applyColumnDefs(rows, columnDefs);
  } else {
    rows = applyFieldMap(rows, fieldMap);
  }

  const mode = (dataset.importMode ?? "append") as "append" | "replace" | "dedup";
  const result = await importRecords(dataset.id, rows, mode, dataset.dedupKey);
  return { ...result, total: rows.length };
}
