import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scheduledJobs } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import cron from "node-cron";

const createSchema = z.object({
  name: z.string().min(1).max(100),
  action: z.enum(["retention_cleanup", "export_json", "export_csv", "export_backup", "dataset_poll"]),
  config: z.record(z.string(), z.unknown()).default({}),
  schedule: z.string().refine(s => cron.validate(s), { message: "Expression cron invalide" }),
  enabled: z.boolean().default(false),
});

export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const jobs = await db.select().from(scheduledJobs).orderBy(desc(scheduledJobs.createdAt));
  return NextResponse.json(jobs);
}

export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten().formErrors[0] ?? "Invalid data" }, { status: 400 });
  }

  const [job] = await db.insert(scheduledJobs).values(parsed.data).returning();

  // Reload scheduler to pick up the new job
  if (parsed.data.enabled) {
    import("@/lib/scheduler/scheduler").then(({ reloadJobs }) => reloadJobs()).catch(() => {});
  }

  return NextResponse.json(job, { status: 201 });
}
