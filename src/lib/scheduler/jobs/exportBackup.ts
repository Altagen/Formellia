import { db } from "@/lib/db";
import { backupProviders } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { buildProvider } from "@/lib/backup/providers/index";
import { composeBackup, makeBackupFilename } from "@/lib/backup/composer";
import { applyRetentionPolicy } from "@/lib/backup/retention";

export interface ExportBackupConfig {
  /** UUID of the backup_providers row to use */
  providerId: string;
  /** Optional list of form slugs to include submissions for */
  formSlugs?: string[];
  /** Optional list of dataset names to include records for */
  datasetNames?: string[];
}

export interface ExportBackupResult {
  filename: string;
  sizeBytes: number;
  deleted: string[];
}

export async function exportBackup(config: ExportBackupConfig): Promise<ExportBackupResult> {
  const { providerId, formSlugs, datasetNames } = config;

  const [providerRow] = await db.select().from(backupProviders).where(eq(backupProviders.id, providerId)).limit(1);
  if (!providerRow) throw new Error(`Fournisseur de backup introuvable : ${providerId}`);
  if (!providerRow.enabled) throw new Error(`The backup provider "${providerRow.name}" is disabled`);

  const provider = await buildProvider(providerRow.type as "local" | "s3", providerRow.encryptedConfig);

  const zipBuffer = await composeBackup({ formSlugs, datasetNames });
  const filename  = makeBackupFilename();

  await provider.upload(filename, zipBuffer);

  const deleted = await applyRetentionPolicy(provider, providerRow.retentionPolicy);

  return { filename, sizeBytes: zipBuffer.length, deleted };
}
