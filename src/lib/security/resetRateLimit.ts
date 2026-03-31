/**
 * DB-backed rate limiter for password-reset flows.
 * Reuses the `login_attempts` table with namespaced keys so no migration is needed.
 *
 *  - Token generation  → key "rt:<userId>",  max 3 per hour
 *  - Token verification → key "rp:<ip>",     max 10 per 15 min
 */

import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { loginAttempts } from "@/lib/db/schema";

async function checkRateLimit(
  key: string,
  windowMs: number,
  maxAttempts: number
): Promise<{ blocked: boolean; resetAt: number }> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  await db.execute(sql`
    INSERT INTO login_attempts (ip_hash, attempt_count, window_start)
    VALUES (${key}, 1, ${now})
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
    .where(sql`ip_hash = ${key}`)
    .limit(1);

  const row = rows[0];
  if (!row) return { blocked: false, resetAt: now.getTime() + windowMs };

  const resetAt = new Date(row.windowStart).getTime() + windowMs;
  return { blocked: row.attemptCount > maxAttempts, resetAt };
}

/** Rate-limit token generation per target userId — max 3 per hour. */
export async function checkResetTokenGeneration(
  userId: string
): Promise<{ blocked: boolean; resetAt: number }> {
  // key is "rt:" + userId (at most 2+21=23 chars, fits varchar(64))
  return checkRateLimit(`rt:${userId}`, 60 * 60 * 1000, 3);
}

/** Rate-limit token verification per IP — max 10 per 15 min. */
export async function checkResetPasswordVerification(
  ip: string
): Promise<{ blocked: boolean; resetAt: number }> {
  // key is "rp:" + ip (at most 2+45=47 chars, fits varchar(64))
  return checkRateLimit(`rp:${ip}`, 15 * 60 * 1000, 10);
}
