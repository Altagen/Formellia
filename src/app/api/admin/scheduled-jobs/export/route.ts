import { NextRequest } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/db/schema";
import { serializeConfig } from "@/lib/serialization/serializeConfig";

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const jobs = await db.select({
    name:     scheduledJobs.name,
    action:   scheduledJobs.action,
    config:   scheduledJobs.config,
    schedule: scheduledJobs.schedule,
    enabled:  scheduledJobs.enabled,
    // Runtime state excluded: lastRunAt, nextRunAt, lastStatus, lastError
  }).from(scheduledJobs);

  return serializeConfig({ scheduledJobs: jobs }, req, "scheduled-jobs.yaml");
}
