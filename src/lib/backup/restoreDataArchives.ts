/**
 * Restores the JSONL data streams packaged next to `config.yaml` in a backup ZIP:
 *   submissions/{slug}.jsonl  → submissions (idempotent, keyed on id)
 *   dataset-records/{name}.jsonl → external_records (idempotent, keyed on id)
 *   users.jsonl → archive-only. Never restored: `composeBackup` deliberately
 *     omits password hashes so re-inserting these rows would create
 *     login-broken accounts. The count is reported so operators can rebuild
 *     users manually.
 *
 * The config-level restore (form_instances, external_datasets) MUST have run
 * before this: submissions and records need their parent row to attach to.
 */
import type AdmZip from "adm-zip";
import { db } from "@/lib/db";
import { submissions, externalRecords, formInstances, externalDatasets } from "@/lib/db/schema";
import { sql } from "drizzle-orm";

export interface DataArchivesResult {
  submissions:     { restored: number; skipped: number; errors: number };
  datasetRecords:  { restored: number; skipped: number; errors: number };
  usersArchived:   number;
}

function parseJsonl(text: string): Record<string, unknown>[] {
  return text
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(line => {
      try { return JSON.parse(line) as Record<string, unknown>; }
      catch { return null; }
    })
    .filter((r): r is Record<string, unknown> => r !== null);
}

/**
 * Decodes composer.ts:125's slug sanitiser. That transform is lossy
 * (`a/b` and `a_b` collapse to the same file name), so this can only match
 * on the sanitised form — we look up form_instances whose slug produces the
 * same safe key and pick the first match.
 */
function safeSlugKey(slug: string): string {
  if (slug === "/") return "_root_";
  return slug.replace(/\//g, "_").replace(/^_/, "");
}

export async function restoreDataArchives(zip: AdmZip): Promise<DataArchivesResult> {
  const result: DataArchivesResult = {
    submissions:    { restored: 0, skipped: 0, errors: 0 },
    datasetRecords: { restored: 0, skipped: 0, errors: 0 },
    usersArchived:  0,
  };

  // ── users.jsonl ─ archive-only, count only.
  const usersEntry = zip.getEntry("users.jsonl");
  if (usersEntry) {
    result.usersArchived = parseJsonl(usersEntry.getData().toString("utf8")).length;
  }

  // ── submissions/{safeSlug}.jsonl ─ upsert on id, skip on conflict.
  const forms = await db.select({ id: formInstances.id, slug: formInstances.slug }).from(formInstances);
  const formsBySafeKey = new Map(forms.map(f => [safeSlugKey(f.slug), f]));

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith("submissions/") || entry.isDirectory) continue;
    const safeKey = entry.entryName.slice("submissions/".length).replace(/\.jsonl$/, "");
    const form = formsBySafeKey.get(safeKey);
    if (!form) { result.submissions.skipped += parseJsonl(entry.getData().toString("utf8")).length; continue; }

    const rows = parseJsonl(entry.getData().toString("utf8"));
    for (const row of rows) {
      try {
        // Force the correct form_instance_id even if the source archive was
        // exported from a different instance where the slug mapped elsewhere.
        const values = { ...row, formInstanceId: form.id };
        await db.insert(submissions).values(values as never).onConflictDoNothing({ target: submissions.id });
        result.submissions.restored += 1;
      } catch {
        result.submissions.errors += 1;
      }
    }
  }

  // ── dataset-records/{safeName}.jsonl ─ upsert on id, skip on conflict.
  const datasets = await db.select({ id: externalDatasets.id, name: externalDatasets.name }).from(externalDatasets);
  const datasetsBySafeKey = new Map(
    datasets.map(d => [d.name.replace(/[^a-zA-Z0-9_-]/g, "_"), d]),
  );

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.startsWith("dataset-records/") || entry.isDirectory) continue;
    const safeKey = entry.entryName.slice("dataset-records/".length).replace(/\.jsonl$/, "");
    const dataset = datasetsBySafeKey.get(safeKey);
    if (!dataset) { result.datasetRecords.skipped += parseJsonl(entry.getData().toString("utf8")).length; continue; }

    const rows = parseJsonl(entry.getData().toString("utf8"));
    for (const row of rows) {
      try {
        const values = { ...row, datasetId: dataset.id };
        await db.insert(externalRecords).values(values as never).onConflictDoNothing({ target: externalRecords.id });
        result.datasetRecords.restored += 1;
      } catch {
        result.datasetRecords.errors += 1;
      }
    }
  }

  // Nudge the aggregate count on external_datasets so admin lists don't lie.
  if (result.datasetRecords.restored > 0) {
    await db.execute(sql`
      UPDATE external_datasets d
      SET record_count = (SELECT COUNT(*) FROM external_records r WHERE r.dataset_id = d.id)
    `);
  }

  return result;
}
