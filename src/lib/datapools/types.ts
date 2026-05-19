import type { DataPool, DataPoolSource, DataPoolSubmissionExclusion } from "@/lib/db/schema";

/**
 * One row of a DataPool's computed view — a single deduplicated key value plus
 * the additional fields carried alongside it. Built at read time from the most
 * recent submission contributing that key.
 */
export interface DataPoolEntry {
  /** The literal value of the pool's `keyField` (preserves the source casing). */
  key: string;
  /** Other fields requested on the pool, taken from the most recent submission. */
  additional: Record<string, string>;
  /** The submission this entry was last sourced from (id of the most recent matching row). */
  sourceSubmissionId: string;
  /** The form instance the latest contributing submission came from. */
  sourceFormInstanceId: string;
  /** Submission timestamp of the latest contributing submission. */
  lastSubmittedAt: Date;
  /** Submission timestamp of the FIRST submission that contributed this key. */
  firstSubmittedAt: Date;
  /** Total number of submissions across all sources that match this key (before dedup). */
  submissionCount: number;
}

/** Pool + its sources + its exclusions, hydrated together. */
export interface DataPoolWithMeta extends DataPool {
  sources: DataPoolSource[];
  exclusions: DataPoolSubmissionExclusion[];
}

export interface DataPoolPreview {
  entries: DataPoolEntry[];
  total: number;
}
