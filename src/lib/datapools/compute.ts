import { db } from "@/lib/db";
import { dataPools, dataPoolSources, dataPoolExclusions } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import type { DataPoolEntry, DataPoolPreview } from "./types";

interface ComputeOptions {
  /** Paginated slice — applied AFTER all filtering. */
  limit?: number;
  offset?: number;
  /** Substring match across `key` and `additional` values (case-insensitive). */
  search?: string;
}

/**
 * Compute a DataPool's distinct entries on the fly.
 *
 * The aggregation runs entirely in Postgres (`DISTINCT ON` over the requested
 * source form instances), then exclusions / search / pagination are applied in
 * the app. Two layers of filtering combine:
 *   1. `submissions.excludedFromDataPools = true` removes the row from every
 *      pool at once (the global soft-exclude).
 *   2. `data_pool_exclusions(pool_id, key_value)` masks a single value from
 *      this pool only.
 *
 * Dedup is case-insensitive (`LOWER(form_data->>keyField)`) — useful for
 * emails like `Alice@Example.com` vs `alice@example.com`. Display keeps the
 * latest submission's original casing.
 *
 * Returns `{ entries, total }` — `total` is the count BEFORE pagination but
 * AFTER search filtering, so the UI can show "Showing 50 of 137".
 */
export async function getDataPoolEntries(
  poolId: string,
  opts: ComputeOptions = {},
): Promise<DataPoolPreview> {
  const [pool] = await db.select().from(dataPools).where(eq(dataPools.id, poolId)).limit(1);
  if (!pool) throw new Error(`DataPool ${poolId} not found`);

  const sources = await db
    .select({ formInstanceId: dataPoolSources.formInstanceId })
    .from(dataPoolSources)
    .where(eq(dataPoolSources.dataPoolId, poolId));
  if (sources.length === 0) return { entries: [], total: 0 };
  const formIds = sources.map((s) => s.formInstanceId);

  const exclusions = await db
    .select({ keyValue: dataPoolExclusions.keyValue })
    .from(dataPoolExclusions)
    .where(eq(dataPoolExclusions.dataPoolId, poolId));
  const excludedSet = new Set(exclusions.map((e) => e.keyValue.toLowerCase()));

  // DISTINCT ON keeps one row per `LOWER(key)`; ORDER BY ... submitted_at DESC
  // makes that row the most recent contributing submission. Empty / null keys
  // are rejected at the WHERE clause so the pool is always materially useful.
  // Each formId is bound as its own parameter — `sql.join` produces an `IN ($1, $2, ...)`
  // clause from a list of parameterised SQL fragments, which is safer than building the
  // ID list by string concatenation.
  const idList = sql.join(
    formIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const result = await db.execute<{
    key_value: string;
    form_data: Record<string, unknown>;
    submitted_at: Date;
    form_instance_id: string;
  }>(sql`
    SELECT DISTINCT ON (LOWER(form_data->>${pool.keyField}))
      form_data->>${pool.keyField}  AS key_value,
      form_data                     AS form_data,
      submitted_at,
      form_instance_id
    FROM submissions
    WHERE form_instance_id IN (${idList})
      AND excluded_from_data_pools = false
      AND form_data->>${pool.keyField} IS NOT NULL
      AND form_data->>${pool.keyField} <> ''
    ORDER BY LOWER(form_data->>${pool.keyField}), submitted_at DESC
  `);

  let entries: DataPoolEntry[] = result.rows
    .map((row) => {
      const additional: Record<string, string> = {};
      for (const field of pool.additionalFields) {
        const v = row.form_data[field];
        additional[field] = v == null ? "" : String(v);
      }
      return {
        key: String(row.key_value),
        additional,
        sourceFormInstanceId: row.form_instance_id,
        lastSubmittedAt: row.submitted_at,
      };
    })
    .filter((e) => !excludedSet.has(e.key.toLowerCase()));

  if (opts.search) {
    const needle = opts.search.toLowerCase();
    entries = entries.filter(
      (e) =>
        e.key.toLowerCase().includes(needle) ||
        Object.values(e.additional).some((v) => v.toLowerCase().includes(needle)),
    );
  }

  const total = entries.length;
  if (opts.offset !== undefined || opts.limit !== undefined) {
    const offset = opts.offset ?? 0;
    const limit = opts.limit ?? entries.length;
    entries = entries.slice(offset, offset + limit);
  }
  return { entries, total };
}

/**
 * Recipient-list helper for the email composer (and any future consumer that
 * just needs the unique key values, no decoration).
 */
export async function getDataPoolKeys(poolId: string): Promise<string[]> {
  const { entries } = await getDataPoolEntries(poolId);
  return entries.map((e) => e.key);
}

/**
 * Union of several pools' key values, deduplicated again at the union level.
 * Used by the broadcast composer when an operator picks more than one pool —
 * an address present in 3 pools is sent to once.
 */
export async function getMergedDataPoolKeys(poolIds: string[]): Promise<string[]> {
  const lists = await Promise.all(poolIds.map((id) => getDataPoolKeys(id)));
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const key of list) {
      const k = key.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(key);
      }
    }
  }
  return merged;
}
