/**
 * DB-backed login rate limiter — survives server restarts.
 * Limits per IP hash. Config (maxAttempts, windowMinutes) is read from app_config.
 *
 * Uses a single-row upsert per attempt for atomicity without transactions.
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";
import { getLoginRateLimitConfig } from "./loginRateLimitConfig";

export async function checkLoginRateLimit(
  ipHash: string
): Promise<{ blocked: boolean; remaining: number; resetAt: number }> {
  const { maxAttempts, windowMinutes } = await getLoginRateLimitConfig();
  const WINDOW_MS = windowMinutes * 60 * 1000;
  const now = new Date();
  const windowStart = new Date(now.getTime() - WINDOW_MS);

  // Atomic upsert:
  // - New row → count = 1, window_start = now
  // - Existing row within window → increment count
  // - Existing row outside window → reset to 1 (new window)
  await db.execute(sql`
    INSERT INTO login_attempts (ip_hash, attempt_count, window_start)
    VALUES (${ipHash}, 1, ${now})
    ON CONFLICT (ip_hash) DO UPDATE SET
      attempt_count = CASE
        WHEN login_attempts.window_start < ${windowStart}
        THEN 1
        ELSE login_attempts.attempt_count + 1
      END,
      window_start = CASE
        WHEN login_attempts.window_start < ${windowStart}
        THEN ${now}
        ELSE login_attempts.window_start
      END
  `);

  const rows = await db.select().from(loginAttempts)
    .where(sql`ip_hash = ${ipHash}`)
    .limit(1);

  const row = rows[0];
  if (!row) return { blocked: false, remaining: maxAttempts - 1, resetAt: now.getTime() + WINDOW_MS };

  const resetAt = new Date(row.windowStart).getTime() + WINDOW_MS;
  const count = row.attemptCount;

  if (count > maxAttempts) {
    return { blocked: true, remaining: 0, resetAt };
  }

  return { blocked: false, remaining: maxAttempts - count, resetAt };
}

export async function resetLoginRateLimit(ipHash: string): Promise<void> {
  await db.execute(sql`DELETE FROM login_attempts WHERE ip_hash = ${ipHash}`);
}
