import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { scheduledJobs, jobRuns } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import cron from "node-cron";

const patchSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  action: z.enum(["retention_cleanup", "export_json", "export_csv", "export_backup", "dataset_poll"]).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  schedule: z.string().refine(s => cron.validate(s), { message: "Expression cron invalide" }).optional(),
  enabled: z.boolean().optional(),
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const [job] = await db.select().from(scheduledJobs).where(eq(scheduledJobs.id, id)).limit(1);
  if (!job) return NextResponse.json({ error: "Job introuvable" }, { status: 404 });

  const runs = await db.select().from(jobRuns).where(eq(jobRuns.jobId, id)).orderBy(desc(jobRuns.startedAt)).limit(10);
  return NextResponse.json({ ...job, recentRuns: runs });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid data" }, { status: 400 });

  const [job] = await db.update(scheduledJobs).set(parsed.data).where(eq(scheduledJobs.id, id)).returning();
  if (!job) return NextResponse.json({ error: "Job introuvable" }, { status: 404 });

  import("@/lib/scheduler/scheduler").then(({ reloadJobs }) => reloadJobs()).catch(() => {});

  return NextResponse.json(job);
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: "ID invalide" }, { status: 400 });

  await db.delete(scheduledJobs).where(eq(scheduledJobs.id, id));
  import("@/lib/scheduler/scheduler").then(({ reloadJobs }) => reloadJobs()).catch(() => {});

  return NextResponse.json({ deleted: true });
}
