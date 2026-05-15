/**
 * Case-insensitive deduplication across N pre-computed lists of key values.
 * The first occurrence wins (preserves casing of whichever pool yielded it
 * first). Used by the email composer to merge several DataPools into one
 * recipient list without sending the same person twice.
 */
export function dedupKeysAcrossLists(lists: ReadonlyArray<ReadonlyArray<string>>): string[] {
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
