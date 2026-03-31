import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { startupLogger as log } from "@/lib/logger";

/**
 * Creates or updates the admin user from environment variables.
 *
 * Email resolution:  ADMIN_EMAIL env var > yaml.admin.email > nothing (wizard handles it)
 * Password source:   ADMIN_PASSWORD env var ONLY — never from config.yaml
 *
 * ADMIN_UPDATE_PASSWORD_ON_RESTART:
 *   false (default) → only creates if the user doesn't exist yet
 *   true            → updates the password on every restart (GitOps key rotation)
 */
export async function bootstrapAdminUser(yamlEmail?: string): Promise<void> {
  const email    = process.env.ADMIN_EMAIL ?? yamlEmail;
  const password = process.env.ADMIN_PASSWORD;

  if (!email) {
    // No admin configured — first-run wizard will handle it interactively
    return;
  }

  const { db }    = await import("@/lib/db");
  const { users } = await import("@/lib/db/schema");
  const { eq }    = await import("drizzle-orm");

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);

  const updateOnRestart = process.env.ADMIN_UPDATE_PASSWORD_ON_RESTART === "true";

  if (existing.length === 0) {
    // User doesn't exist yet — create it
    if (!password) {
      log.warn({ email }, "ADMIN_EMAIL set but ADMIN_PASSWORD missing. Use /admin/setup or set ADMIN_PASSWORD.");
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 13);
    const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 50) || "admin";
    await db.insert(users).values({ id: nanoid(), username, email, hashedPassword, role: "admin" });
    log.info({ email }, "Admin account created");

  } else if (password && updateOnRestart) {
    // User exists + explicit rotation enabled → update password
    const hashedPassword = await bcrypt.hash(password, 13);
    await db.update(users).set({ hashedPassword }).where(eq(users.email, email));
    log.info({ email }, "Admin password updated (ADMIN_UPDATE_PASSWORD_ON_RESTART=true)");

  } else {
    log.info({ email, rotationSkipped: !!(password && !updateOnRestart) }, "Compte admin existant");
  }
}
