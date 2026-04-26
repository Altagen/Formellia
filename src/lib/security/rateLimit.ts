import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import type { SecurityConfig } from "@/types/config";

/**
 * Checks the IP-based rate limit using the existing submissions table.
 * No external dependencies — queries the DB directly.
 * Returns true if the request should be BLOCKED.
 */
export async function isRateLimited(
  ipHash: string,
  security: SecurityConfig
): Promise<boolean> {
  const rl = security.rateLimit;
  if (!rl?.enabled) return false;

  const maxPerHour = rl.maxPerHour ?? 10;
  const maxPerDay = rl.maxPerDay ?? 50;

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const [hourRow, dayRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        and(
          eq(submissions.ipHash, ipHash),
          gte(submissions.submittedAt, oneHourAgo)
        )
      ),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(submissions)
      .where(
        and(
          eq(submissions.ipHash, ipHash),
          gte(submissions.submittedAt, oneDayAgo)
        )
      ),
  ]);

  const hourCount = hourRow[0]?.count ?? 0;
  const dayCount = dayRow[0]?.count ?? 0;

  return hourCount >= maxPerHour || dayCount >= maxPerDay;
}
