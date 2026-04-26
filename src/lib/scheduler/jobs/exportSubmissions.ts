import { db } from "@/lib/db";
import { submissions, formInstances } from "@/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import { writeFile, mkdir } from "fs/promises";
import { join, resolve, sep } from "path";
import type { JobConfig, JobResult } from "../runner";

// Directories that must never be written to, regardless of admin config
const BLOCKED_PREFIXES = ["/etc", "/usr", "/sys", "/proc", "/dev", "/root", "/boot", "/bin", "/sbin", "/lib"];

function escapeCell(v: unknown): string {
  const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
  // Prefix formula-injection characters so spreadsheet apps don't evaluate them as formulas
  const safe = /^[=+\-@\t\r]/.test(s) ? "\t" + s : s;
  return `"${safe.replace(/"/g, '""')}"`;
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const lines = [
    headers.map(h => escapeCell(h)).join(","),
    ...rows.map(row =>
      headers.map(h => escapeCell(row[h])).join(",")
    ),
  ];
  return lines.join("\n");
}

export async function exportSubmissions(format: "json" | "csv", config: JobConfig): Promise<JobResult> {
  const rawDir = config.exportDir ?? join(process.cwd(), "exports");
  const exportDir = resolve(rawDir);

  // Prevent writes to sensitive system directories
  if (BLOCKED_PREFIXES.some(p => exportDir === p || exportDir.startsWith(p + sep))) {
    throw new Error(`Forbidden export directory : ${exportDir}`);
  }

  await mkdir(exportDir, { recursive: true });

  let rows = await db.select().from(submissions).orderBy(desc(submissions.submittedAt));

  if (config.formSlug) {
    const [instance] = await db
      .select({ id: formInstances.id })
      .from(formInstances)
      .where(eq(formInstances.slug, config.formSlug))
      .limit(1);
    if (!instance) return { skipped: `Form slug '${config.formSlug}' not found` };
    rows = rows.filter(r => r.formInstanceId === instance.id);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const filename = `submissions-${timestamp}.${format}`;
  const filePath = join(exportDir, filename);

  if (format === "json") {
    await writeFile(filePath, JSON.stringify(rows, null, 2), "utf-8");
  } else {
    const flat = rows.map(r => ({
      id: r.id,
      email: r.email,
      status: r.status,
      priority: r.priority,
      submittedAt: r.submittedAt.toISOString(),
      dueDate: r.dueDate ?? "",
      notes: r.notes ?? "",
      ...Object.fromEntries(
        Object.entries((r.formData as Record<string, unknown>) ?? {}).map(([k, v]) => [
          `data_${k}`,
          typeof v === "object" ? JSON.stringify(v) : String(v ?? ""),
        ])
      ),
    }));
    await writeFile(filePath, toCSV(flat), "utf-8");
  }

  return { exported: rows.length, filePath };
}
