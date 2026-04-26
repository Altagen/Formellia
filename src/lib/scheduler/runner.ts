import { db } from "@/lib/db";
import { scheduledJobs, jobRuns } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type JobAction = "retention_cleanup" | "export_json" | "export_csv" | "export_backup" | "dataset_poll";

export interface JobConfig {
  // retention_cleanup
  olderThanDays?: number;
  formSlug?: string;
  // export_json / export_csv
  includeFormData?: boolean;
  exportDir?: string;
  // export_backup
  providerId?: string;
  formSlugs?: string[];
  datasetNames?: string[];
  // dataset_poll
  datasetId?: string;
}

export interface JobResult {
  deleted?: number | string[];
  exported?: number;
  filePath?: string;
  skipped?: string | number;
  inserted?: number;
  total?: number;
  filename?: string;
  sizeBytes?: number;
}

export async function runJob(jobId: string): Promise<void> {
  const [job] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, jobId)).limit(1);
  if (!job) throw new Error(`Job ${jobId} not found`);

  const runId = crypto.randomUUID();
  const startedAt = new Date();

  // Mark job as running so the UI can show a live indicator
  await db.update(scheduledJobs).set({ lastStatus: "running" }).where(eq(scheduledJobs.id, jobId));

  // Insert running record
  await db.insert(jobRuns).values({
    id: runId,
    jobId,
    startedAt,
    status: "running",
  });

  let result: JobResult = {};
  let error: string | null = null;

  try {
    const config = (job.config ?? {}) as JobConfig;
    if (job.action === "retention_cleanup") {
      const { retentionCleanup } = await import("./jobs/retentionCleanup");
      result = await retentionCleanup(config);
    } else if (job.action === "export_json" || job.action === "export_csv") {
      const { exportSubmissions } = await import("./jobs/exportSubmissions");
      result = await exportSubmissions(job.action === "export_csv" ? "csv" : "json", config);
    } else if (job.action === "export_backup") {
      const { exportBackup } = await import("./jobs/exportBackup");
      result = await exportBackup(config as import("./jobs/exportBackup").ExportBackupConfig);
    } else if (job.action === "dataset_poll") {
      const { datasetPoll } = await import("./jobs/datasetPoll");
      result = await datasetPoll(config as import("./jobs/datasetPoll").DatasetPollConfig);
    } else {
      throw new Error(`Unknown action: ${job.action}`);
    }
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const completedAt = new Date();
  const status = error ? "error" : "ok";

  // Update job run
  await db.update(jobRuns).set({ completedAt, status, result, error }).where(eq(jobRuns.id, runId));

  // Update job last run info + compute nextRunAt
  const { computeNextRun } = await import("./scheduler");
  const nextRunAt = computeNextRun(job.schedule);
  await db.update(scheduledJobs).set({
    lastRunAt: startedAt,
    nextRunAt,
    lastStatus: status,
    lastError: error,
  }).where(eq(scheduledJobs.id, jobId));

  if (error) throw new Error(error);
}
