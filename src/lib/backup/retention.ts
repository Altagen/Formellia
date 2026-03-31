import type { BackupListEntry, BackupProvider } from "./types";
import type { RetentionPolicy } from "@/lib/db/schema";
import { backupLogger as log } from "@/lib/logger";

/**
 * Applies the retention policy: deletes backup files from the provider
 * that exceed the configured limits.
 */
export async function applyRetentionPolicy(
  provider: BackupProvider,
  policy: RetentionPolicy,
): Promise<string[]> {
  if (policy.type === "keep_all") return [];

  const entries = await provider.list();
  const sorted = [...entries].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  let toDelete: BackupListEntry[] = [];

  if (policy.type === "keep_last_n") {
    toDelete = sorted.slice(policy.n);
  } else if (policy.type === "keep_last_days") {
    const cutoff = Date.now() - policy.days * 86_400_000;
    toDelete = sorted.filter(e => e.createdAt.getTime() < cutoff);
  }

  const deleted: string[] = [];
  for (const entry of toDelete) {
    try {
      await provider.delete(entry.key);
      deleted.push(entry.key);
    } catch (err) {
      console.error(`[retention] Failed to delete ${entry.key}:`, err);
    }
  }

  return deleted;
}
