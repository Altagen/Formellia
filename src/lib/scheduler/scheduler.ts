import cron from "node-cron";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { schedulerLogger as log } from "@/lib/logger";

// Parse a cron expression and return the next run date
export function computeNextRun(schedule: string): Date {
  try {
    // node-cron doesn't expose next-run natively; approximate next run as now + 1 minute.
    // The value will be overwritten by the actual cron tick on each run.
    void schedule; // suppress unused-variable warning
    const nextRun = new Date(Date.now() + 60_000);
    return nextRun;
  } catch {
    return new Date(Date.now() + 86_400_000);
  }
}

let initialized = false;
const activeTasks = new Map<string, cron.ScheduledTask>();

export async function initScheduler(): Promise<void> {
  if (initialized) return;
  initialized = true;

  await reloadJobs();

  // Reload jobs every 5 minutes to pick up config changes
  cron.schedule("*/5 * * * *", async () => {
    await reloadJobs();
  });

  // Built-in webhook retry processor — runs every minute, independent of user-configured jobs
  cron.schedule("* * * * *", async () => {
    try {
      const { processWebhookQueue } = await import("@/lib/webhook/deliveries");
      const stats = await processWebhookQueue();
      if (stats.succeeded + stats.exhausted > 0) {
        log.info(stats, "Webhook queue processed");
      }
    } catch (err) {
      log.error({ err }, "Webhook queue processing failed");
    }
  });

  // Daily cleanup at 03:00 — purge completed webhook deliveries older than 30 days
  cron.schedule("0 3 * * *", async () => {
    try {
      const { purgeOldDeliveries } = await import("@/lib/webhook/deliveries");
      const deleted = await purgeOldDeliveries(30);
      if (deleted > 0) log.info({ deleted }, "Webhook deliveries purged");
    } catch (err) {
      log.error({ err }, "Webhook delivery cleanup failed");
    }
  });

  log.info("Initialized");
}

export async function reloadJobs(): Promise<void> {
  try {
    const jobs = await db.select().from(scheduledJobs).where(eq(scheduledJobs.enabled, true));

    const activeIds = new Set(jobs.map(j => j.id));

    // Stop removed/disabled jobs
    for (const [id, task] of activeTasks) {
      if (!activeIds.has(id)) {
        task.stop();
        activeTasks.delete(id);
      }
    }

    // Schedule new/updated jobs
    for (const job of jobs) {
      // Stop existing task for this job before re-scheduling
      activeTasks.get(job.id)?.stop();
      activeTasks.delete(job.id);

      if (!cron.validate(job.schedule)) {
        log.warn({ jobId: job.id, schedule: job.schedule }, "Invalid cron expression");
        continue;
      }

      const task = cron.schedule(job.schedule, async () => {
        try {
          const { runJob } = await import("./runner");
          await runJob(job.id);
          log.info({ jobName: job.name }, "Job completed");
        } catch (err) {
          log.error({ err, jobName: job.name }, "Job failed");
        }
      });

      activeTasks.set(job.id, task);
    }
  } catch (err) {
    log.error({ err }, "Failed to reload jobs");
  }
}
