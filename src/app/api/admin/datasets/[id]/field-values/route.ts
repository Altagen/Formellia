import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { externalRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { requireRole } from "@/lib/auth/validateSession";

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Returns all distinct values per field across ALL records of a dataset.
 * Uses PostgreSQL jsonb_each_text to unnest every key-value pair in one query,
 * then groups by key — no client-side sampling, no 100-record cap.
 *
 * Response: { fields: string[], values: Record<string, string[]> }
 */
export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;

  // Verify dataset exists (also acts as ownership check via session)
  const exists = await db
    .select({ id: externalRecords.datasetId })
    .from(externalRecords)
    .where(eq(externalRecords.datasetId, id))
    .limit(1);

  if (exists.length === 0) {
    // Dataset exists but has no records — return empty
    return NextResponse.json({ fields: [], values: {} });
  }

  // One query: unnest all JSONB key-value pairs, group by key, collect distinct non-empty values
  const result = await db.execute<{ key: string; values: string[] }>(sql`
    SELECT
      kv.key,
      array_agg(DISTINCT kv.val ORDER BY kv.val) FILTER (WHERE kv.val IS NOT NULL AND kv.val <> '') AS values
    FROM ${externalRecords} r,
         jsonb_each_text(r.data) AS kv(key, val)
    WHERE r.dataset_id = ${id}
    GROUP BY kv.key
    ORDER BY kv.key
  `);

  const fields: string[] = [];
  const values: Record<string, string[]> = {};

  for (const row of result.rows) {
    fields.push(row.key);
    values[row.key] = row.values ?? [];
  }

  return NextResponse.json({ fields, values });
}
