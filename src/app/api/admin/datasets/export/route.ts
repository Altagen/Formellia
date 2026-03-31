import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { externalDatasets } from "@/lib/db/schema";
import { serializeConfig } from "@/lib/serialization/serializeConfig";

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const datasets = await db.select({
    name:                externalDatasets.name,
    description:         externalDatasets.description,
    sourceType:          externalDatasets.sourceType,
    apiUrl:              externalDatasets.apiUrl,
    // apiHeaders intentionally excluded — may contain auth tokens
    // Use env var DATASET_API_HEADERS_<NAME_UPPER> to inject at deploy time
    pollIntervalMinutes: externalDatasets.pollIntervalMinutes,
    importMode:          externalDatasets.importMode,
    dedupKey:            externalDatasets.dedupKey,
    fieldMap:            externalDatasets.fieldMap,
    columnDefs:          externalDatasets.columnDefs,
    // Runtime state excluded: recordCount, lastImportedAt
  }).from(externalDatasets);

  return serializeConfig({ datasets }, req, "datasets.yaml");
}
