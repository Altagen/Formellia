import { db } from "@/lib/db";
import { dataPools, dataPoolSources } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { dedupKeysAcrossLists } from "./dedup";
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
 * source form instances), then search + pagination are applied in the app.
 * Two layers of filtering combine:
 *   1. `submissions.excludedFromDataPools = true` removes the row from every
 *      pool at once (the global soft-exclude flag).
 *   2. `data_pool_submission_exclusions(pool_id, submission_id)` masks a
 *      specific submission from this pool only.
 *
 * Both filters are FK-based: the email value is never duplicated. When the
 * submission is hard-deleted (Art. 17 erasure), both filters disappear with
 * it — which is the right behaviour: a re-submission is a new act of consent.
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

  // Each formId is bound as its own parameter — `sql.join` produces an `IN ($1, $2, ...)`
  // clause from a list of parameterised SQL fragments, which is safer than building the
  // ID list by string concatenation.
  const idList = sql.join(
    formIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  // DISTINCT ON keeps one row per `LOWER(key)`; ORDER BY ... submitted_at DESC
  // makes that row the most recent contributing submission. Empty / null keys
  // are rejected at the WHERE clause so the pool is always materially useful.
  // The LEFT JOIN + IS NULL filter masks submissions excluded from THIS pool.
  const result = await db.execute<{
    submission_id: string;
    key_value: string;
    form_data: Record<string, unknown>;
    submitted_at: Date;
    form_instance_id: string;
  }>(sql`
    SELECT DISTINCT ON (LOWER(s.form_data->>${pool.keyField}))
      s.id                          AS submission_id,
      s.form_data->>${pool.keyField} AS key_value,
      s.form_data                   AS form_data,
      s.submitted_at,
      s.form_instance_id
    FROM submissions s
    LEFT JOIN data_pool_submission_exclusions e
      ON e.submission_id = s.id AND e.data_pool_id = ${poolId}::uuid
    WHERE s.form_instance_id IN (${idList})
      AND s.excluded_from_data_pools = false
      AND e.id IS NULL
      AND s.form_data->>${pool.keyField} IS NOT NULL
      AND s.form_data->>${pool.keyField} <> ''
    ORDER BY LOWER(s.form_data->>${pool.keyField}), s.submitted_at DESC
  `);

  let entries: DataPoolEntry[] = result.rows.map((row) => {
    const additional: Record<string, string> = {};
    for (const field of pool.additionalFields) {
      const v = row.form_data[field];
      additional[field] = v == null ? "" : String(v);
    }
    return {
      key: String(row.key_value),
      additional,
      sourceSubmissionId: row.submission_id,
      sourceFormInstanceId: row.form_instance_id,
      lastSubmittedAt: row.submitted_at,
    };
  });

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
  return dedupKeysAcrossLists(lists);
}
