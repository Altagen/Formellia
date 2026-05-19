import { db } from "@/lib/db";
import { dataPools, dataPoolSources, dataPoolSubmissionExclusions } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import type { DataPool, DataPoolSource, DataPoolSubmissionExclusion } from "@/lib/db/schema";
import type { DataPoolWithMeta } from "./types";
import type {
  CreateDataPoolInput,
  UpdateDataPoolInput,
  AddSubmissionExclusionInput,
} from "./validation";

/**
 * Storage layer for DataPool entities. The aggregation of submissions into
 * deduplicated entries lives in `./compute.ts`; this file only deals with the
 * three tables that describe a pool — what it is (`data_pools`), what feeds it
 * (`data_pool_sources`), and what's masked from it
 * (`data_pool_submission_exclusions`, by FK).
 */

export async function listDataPools(): Promise<DataPool[]> {
  return db.select().from(dataPools).orderBy(asc(dataPools.name));
}

export async function getDataPool(id: string): Promise<DataPoolWithMeta | null> {
  const [pool] = await db.select().from(dataPools).where(eq(dataPools.id, id)).limit(1);
  if (!pool) return null;
  const [sources, exclusions] = await Promise.all([
    db.select().from(dataPoolSources).where(eq(dataPoolSources.dataPoolId, id)),
    db
      .select()
      .from(dataPoolSubmissionExclusions)
      .where(eq(dataPoolSubmissionExclusions.dataPoolId, id)),
  ]);
  return { ...pool, sources, exclusions };
}

export async function getDataPoolBySlug(slug: string): Promise<DataPool | null> {
  const [pool] = await db.select().from(dataPools).where(eq(dataPools.slug, slug)).limit(1);
  return pool ?? null;
}

export async function createDataPool(input: CreateDataPoolInput): Promise<DataPoolWithMeta> {
  const [pool] = await db
    .insert(dataPools)
    .values({
      slug: input.slug,
      name: input.name,
      description: input.description ?? null,
      keyField: input.keyField,
      additionalFields: input.additionalFields,
    })
    .returning();
  const sources = input.sources.length
    ? await db
        .insert(dataPoolSources)
        .values(input.sources.map((s) => ({ dataPoolId: pool.id, formInstanceId: s.formInstanceId })))
        .returning()
    : [];
  return { ...pool, sources, exclusions: [] };
}

/**
 * Apply a partial patch. `sources` semantics: if present in the patch, the
 * source list is **replaced** to match exactly (idempotent — same set in =
 * no DB change). Omit `sources` to leave the existing list alone.
 */
export async function updateDataPool(
  id: string,
  patch: UpdateDataPoolInput,
): Promise<DataPoolWithMeta | null> {
  const existing = await getDataPool(id);
  if (!existing) return null;

  const fields: Partial<typeof dataPools.$inferInsert> = { updatedAt: new Date() };
  if (patch.name             !== undefined) fields.name             = patch.name;
  if (patch.slug             !== undefined) fields.slug             = patch.slug;
  if (patch.description      !== undefined) fields.description      = patch.description ?? null;
  if (patch.keyField         !== undefined) fields.keyField         = patch.keyField;
  if (patch.additionalFields !== undefined) fields.additionalFields = patch.additionalFields;

  if (Object.keys(fields).length > 1) {
    await db.update(dataPools).set(fields).where(eq(dataPools.id, id));
  }

  if (patch.sources !== undefined) {
    const wanted = new Set(patch.sources.map((s) => s.formInstanceId));
    const current = new Set(existing.sources.map((s) => s.formInstanceId));
    const toAdd = [...wanted].filter((fid) => !current.has(fid));
    const toRemove = [...current].filter((fid) => !wanted.has(fid));
    if (toAdd.length > 0) {
      await db
        .insert(dataPoolSources)
        .values(toAdd.map((fid) => ({ dataPoolId: id, formInstanceId: fid })));
    }
    for (const fid of toRemove) {
      await db
        .delete(dataPoolSources)
        .where(and(eq(dataPoolSources.dataPoolId, id), eq(dataPoolSources.formInstanceId, fid)));
    }
  }

  return getDataPool(id);
}

export async function deleteDataPool(id: string): Promise<boolean> {
  // ON DELETE CASCADE on sources + exclusions takes care of the children.
  const result = await db.delete(dataPools).where(eq(dataPools.id, id)).returning({ id: dataPools.id });
  return result.length > 0;
}

// ─── Exclusions (FK-based, per submission) ────────────────────────────────

export async function addSubmissionExclusion(
  poolId: string,
  input: AddSubmissionExclusionInput,
  excludedByUserId: string | null,
): Promise<DataPoolSubmissionExclusion> {
  // upsert so re-adding the same submission is idempotent (refreshes reason / actor)
  const [row] = await db
    .insert(dataPoolSubmissionExclusions)
    .values({
      dataPoolId: poolId,
      submissionId: input.submissionId,
      reason: input.reason ?? null,
      excludedByUserId,
    })
    .onConflictDoUpdate({
      target: [dataPoolSubmissionExclusions.dataPoolId, dataPoolSubmissionExclusions.submissionId],
      set: { reason: input.reason ?? null, excludedByUserId, excludedAt: new Date() },
    })
    .returning();
  return row;
}

export async function removeSubmissionExclusion(
  poolId: string,
  submissionId: string,
): Promise<boolean> {
  const result = await db
    .delete(dataPoolSubmissionExclusions)
    .where(
      and(
        eq(dataPoolSubmissionExclusions.dataPoolId, poolId),
        eq(dataPoolSubmissionExclusions.submissionId, submissionId),
      ),
    )
    .returning({ id: dataPoolSubmissionExclusions.id });
  return result.length > 0;
}

// Re-exports kept in this file so callers only import from one place.
export type { DataPool, DataPoolSource, DataPoolSubmissionExclusion };
