import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sql, eq, count } from "drizzle-orm";
import { scheduledJobs, backupProviders } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

type CheckStatus = "ok" | "error";

interface Check {
  status: CheckStatus;
  latencyMs?: number;
  message?: string;
  enabledJobs?: number;
  enabledProviders?: number;
  migrated?: boolean;
}

export async function GET() {
  const checks: Record<string, Check> = {};
  let overallStatus: "ok" | "degraded" | "error" = "ok";

  // --- DB check ---
  const dbStart = Date.now();
  try {
    await db.execute(sql`SELECT 1`);
    // Fetch last applied migration for internal status tracking (best-effort)
    // Only "migrated" boolean is exposed publicly — hash/timestamp stay server-side
    let migratedOk = false;
    try {
      const migRows = await db.execute<{ hash: string }>(
        sql`SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at DESC LIMIT 1`
      );
      migratedOk = !!migRows.rows?.[0]?.hash;
    } catch { /* table may not exist on very first boot */ }

    checks.db = {
      status: "ok",
      latencyMs: Date.now() - dbStart,
      ...(migratedOk ? { migrated: true } : {}),
    };
  } catch {
    checks.db = {
      status: "error",
      latencyMs: Date.now() - dbStart,
      // Raw DB error intentionally omitted — may expose host/port/database name
      message: "Database unreachable",
    };
    overallStatus = "error";
  }

  // --- Encryption check ---
  const key = process.env.ENCRYPTION_KEY ?? "";
  const keyValid = /^[0-9a-fA-F]{64}$/.test(key);
  // Only expose status, not the specific reason (avoids revealing internal config state)
  checks.encryption = { status: keyValid ? "ok" : "error" };
  if (!keyValid && overallStatus !== "error") overallStatus = "degraded";

  // --- Scheduler check (only if DB is up) ---
  if (checks.db.status === "ok") {
    try {
      const rows = await db
        .select({ count: count() })
        .from(scheduledJobs)
        .where(eq(scheduledJobs.enabled, true));
      checks.scheduler = { status: "ok", enabledJobs: rows[0]?.count ?? 0 };
    } catch {
      checks.scheduler = { status: "error", message: "Could not query scheduler jobs" };
      if (overallStatus !== "error") overallStatus = "degraded";
    }

    // --- Storage check ---
    try {
      const rows = await db
        .select({ count: count() })
        .from(backupProviders)
        .where(eq(backupProviders.enabled, true));
      checks.storage = { status: "ok", enabledProviders: rows[0]?.count ?? 0 };
    } catch {
      checks.storage = { status: "error", message: "Could not query backup providers" };
      if (overallStatus !== "error") overallStatus = "degraded";
    }
  } else {
    checks.scheduler = { status: "error", message: "DB unavailable" };
    checks.storage   = { status: "error", message: "DB unavailable" };
  }

  return NextResponse.json(
    { status: overallStatus, checks, ts: new Date().toISOString() },
    { status: overallStatus === "error" ? 503 : 200 }
  );
}
