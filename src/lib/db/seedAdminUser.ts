/**
 * Bootstrap admin user from environment variables.
 * Runs at startup (alongside seedFormInstances) when no users exist.
 *
 * Set in .env.local:
 *   BOOTSTRAP_ADMIN_EMAIL=admin@example.com
 *   BOOTSTRAP_ADMIN_PASSWORD=MyStr0ng!Pass
 *
 * No-op if either variable is absent or if a user already exists.
 */
export async function ensureAdminUserSeeded(): Promise<void> {
  const email = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password) return;

  const { db } = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");

  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0) return;

  const bcrypt = await import("bcryptjs");
  const { nanoid } = await import("nanoid");

  const hashedPassword = await bcrypt.hash(password, 13);
  const id = nanoid();

  const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50) || "admin";
  await db.insert(users).values({ id, username, email, hashedPassword }).onConflictDoNothing();

  void import("@/lib/logger").then(({ startupLogger }) => startupLogger.info({ email }, "Admin account seeded"));
}
