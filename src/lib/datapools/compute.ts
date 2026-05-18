import { db } from "@/lib/db";
import { dataPools, dataPoolSources } from "@/lib/db/schema";
import { eq, sql, type SQL } from "drizzle-orm";
import { dedupKeysAcrossLists } from "./dedup";
import type { DataPoolEntry, DataPoolPreview } from "./types";

/**
 * Several form fields are hoisted out of the JSONB `form_data` into dedicated
 * columns on `submissions` when a submission is created (see the form submit
 * API). For these well-known ids the data lives ONLY in the column, not the
 * JSON — so the DataPool aggregation must read from the column directly.
 * Everything else still falls through to `form_data->>keyField`.
 */
const EXTRACTED_COLUMNS: Record<string, string> = {
  email:       "email",
  dueDate:     "due_date",
  receivedAt:  "received_at",
  status:      "status",
  priority:    "priority",
  submittedAt: "submitted_at",
};

// Defense in depth — the API boundary (Zod fieldIdSchema) already enforces
// this, but pool.keyField may also be loaded from existing DB rows (YAML
// restore, future bulk imports), so we re-validate here before letting the
// value reach SQL. Anything outside this charset throws loud and clear.
//
// Why `sql.raw` instead of parameter binding: this expression is reused in
// three places of the query (DISTINCT ON, two PARTITION BY clauses, ORDER
// BY) and Postgres demands them to be *textually identical* for DISTINCT
// ON + ORDER BY to validate. Drizzle's `sql\`…${keyField}…\`` template
// creates a fresh `$N` placeholder for each interpolation, so the three
// expressions become `COALESCE(…->>$1, …)`, `COALESCE(…->>$2, …)`, etc. —
// Postgres treats those as different expressions and rejects the query
// with 42P10 "INVALID COLUMN REFERENCE". The regex below restricts the
// input to a safe identifier charset BEFORE it reaches the raw splice.
const KEY_FIELD_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/;

function keyFieldExpr(keyField: string): SQL {
  if (!KEY_FIELD_PATTERN.test(keyField)) {
    throw new Error(`Invalid keyField identifier: ${JSON.stringify(keyField)}`);
  }
  const column = EXTRACTED_COLUMNS[keyField];
  // COALESCE both the dedicated column (when applicable) and the JSON path so
  // we transparently support extracted fields, custom fields, and historic
  // submissions that may have had the value in either place.
  if (column) {
    return sql.raw(`COALESCE(s.form_data->>'${keyField}', s.${column}::text)`);
  }
  return sql.raw(`s.form_data->>'${keyField}'`);
}

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
  // Window functions compute first-seen / submission-count across the partition
  // BEFORE DISTINCT ON drops the duplicates, so the picked row carries the full
  // history of that key.
  const keyExpr = keyFieldExpr(pool.keyField);
  const result = await db.execute<{
    submission_id: string;
    key_value: string;
    extracted_email: string | null;
    form_data: Record<string, unknown>;
    submitted_at: Date;
    form_instance_id: string;
    first_submitted_at: Date;
    submission_count: number;
  }>(sql`
    SELECT DISTINCT ON (LOWER(${keyExpr}))
      s.id          AS submission_id,
      ${keyExpr}    AS key_value,
      s.email       AS extracted_email,
      s.form_data   AS form_data,
      s.submitted_at,
      s.form_instance_id,
      MIN(s.submitted_at) OVER (PARTITION BY LOWER(${keyExpr})) AS first_submitted_at,
      COUNT(*)            OVER (PARTITION BY LOWER(${keyExpr})) AS submission_count
    FROM submissions s
    LEFT JOIN data_pool_submission_exclusions e
      ON e.submission_id = s.id AND e.data_pool_id = ${poolId}::uuid
    WHERE s.form_instance_id IN (${idList})
      AND s.excluded_from_data_pools = false
      AND e.id IS NULL
      AND ${keyExpr} IS NOT NULL
      AND ${keyExpr} <> ''
    ORDER BY LOWER(${keyExpr}), s.submitted_at DESC
  `);

  let entries: DataPoolEntry[] = result.rows.map((row) => {
    const additional: Record<string, string> = {};
    for (const field of pool.additionalFields) {
      // Same hoisting trick: if the operator picked an extracted field as an
      // additional column, surface the dedicated column value when the JSON is
      // empty. `email` is the typical case.
      const fromJson = row.form_data[field];
      let value: unknown = fromJson;
      if ((value == null || value === "") && field === "email") {
        value = row.extracted_email;
      }
      additional[field] = value == null ? "" : String(value);
    }
    return {
      key: String(row.key_value),
      additional,
      sourceSubmissionId: row.submission_id,
      sourceFormInstanceId: row.form_instance_id,
      lastSubmittedAt: row.submitted_at,
      firstSubmittedAt: row.first_submitted_at,
      submissionCount: Number(row.submission_count),
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
