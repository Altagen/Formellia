import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { importDatasetFromApi } from "@/lib/utils/datasetImport";

export interface DatasetPollConfig {
  datasetId: string;
}

export async function datasetPoll(config: DatasetPollConfig): Promise<{ inserted: number; skipped: number; total: number }> {
  if (!config.datasetId) throw new Error("datasetId manquant dans la configuration");

  const [dataset] = await db.select().from(externalDatasets)
    .where(eq(externalDatasets.id, config.datasetId)).limit(1);

  if (!dataset) throw new Error(`Dataset ${config.datasetId} introuvable`);
  if (dataset.sourceType !== "api") throw new Error("Only API-type datasets are supported");
  if (!dataset.apiUrl) throw new Error("Dataset has no API URL configured");

  return importDatasetFromApi(dataset);
}
