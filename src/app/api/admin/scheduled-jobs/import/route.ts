import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { parseBody } from "@/lib/serialization/parseBody";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { z } from "zod";
import cron from "node-cron";

const jobSchema = z.object({
  name:     z.string().min(1).max(100),
  action:   z.enum(["retention_cleanup", "export_json", "export_csv"]),
  config:   z.record(z.string(), z.unknown()).default({}),
  schedule: z.string().refine(s => cron.validate(s), { message: "Expression cron invalide" }),
  enabled:  z.boolean().default(false),
});

const bodySchema = z.object({
  scheduledJobs: z.array(jobSchema).min(1, "scheduledJobs must contain at least one item"),
  mode: z.enum(["append", "replace"]).default("replace"),
});

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  let rawParsed: unknown;
  try {
    rawParsed = await parseBody(req);
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Parsing failed" }, { status: 422 });
  }

  const parsed = bodySchema.safeParse(rawParsed);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid data" }, { status: 422 });
  }

  const { scheduledJobs: incoming, mode } = parsed.data;
  const existing = await db.select({ id: scheduledJobs.id, name: scheduledJobs.name }).from(scheduledJobs);
  const nameMap = new Map(existing.map(j => [j.name, j.id]));

  const created: string[] = [];
  const updated: string[] = [];
  const errors: Array<{ name: string; message: string }> = [];

  for (const job of incoming) {
    const existingId = nameMap.get(job.name);
    try {
      if (existingId && mode === "append") {
        errors.push({ name: job.name, message: `Job "${job.name}" already exists (append mode)` });
        continue;
      }
      if (existingId) {
        await db.update(scheduledJobs)
          .set({ action: job.action, config: job.config, schedule: job.schedule, enabled: job.enabled })
          .where(eq(scheduledJobs.id, existingId));
        updated.push(job.name);
      } else {
        await db.insert(scheduledJobs).values(job);
        created.push(job.name);
      }
    } catch (e: unknown) {
      errors.push({ name: job.name, message: e instanceof Error ? e.message : "Erreur inconnue" });
    }
  }

  // Reload scheduler to pick up changes
  if (created.length > 0 || updated.length > 0) {
    import("@/lib/scheduler/scheduler").then(({ reloadJobs }) => reloadJobs()).catch(() => {});
  }

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId: actor?.id ?? null, userEmail: actor?.email ?? null,
    action: "jobs.import", resourceType: "scheduled_jobs", resourceId: "batch",
    details: { created: created.length, updated: updated.length, errors: errors.length, mode },
  });

  return NextResponse.json({ created, updated, errors });
}
