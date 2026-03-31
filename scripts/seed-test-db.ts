#!/usr/bin/env tsx
/**
 * Seed script for the E2E test database.
 *
 * Requires DATABASE_URL to point to the test DB (port 5433).
 * Loads .env.test automatically when run via `npm run test:e2e`.
 *
 * What it does:
 *   1. Run all pending Drizzle migrations
 *   2. Truncate all user/form/submission data (idempotent re-runs)
 *   3. Insert a known admin user  → credentials: admin / Admin1234!
 *   4. Insert a test form instance with a minimal config
 */

import "dotenv/config";
import { resolve } from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL is not set. Load .env.test before running this script.");
  process.exit(1);
}

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db   = drizzle(pool);

  // ── 1. Migrate ────────────────────────────────────────────────────────────
  console.log("→ Running migrations…");
  await migrate(db, { migrationsFolder: resolve(process.cwd(), "migrations") });
  console.log("  ✓ Migrations applied");

  // ── 2. Truncate (order matters for FK constraints) ────────────────────────
  console.log("→ Truncating test data…");
  await db.execute(sql`
    TRUNCATE
      user_form_grants,
      sessions,
      submissions,
      form_instances,
      users,
      app_settings,
      form_config,
      schema_meta,
      api_keys
    RESTART IDENTITY CASCADE
  `);
  console.log("  ✓ Tables cleared");

  // ── 3. Seed admin user ─────────────────────────────────────────────────────
  const ADMIN_PASSWORD = "Admin1234!";
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  await db.execute(sql`
    INSERT INTO users (id, username, email, hashed_password, role)
    VALUES (
      ${nanoid()},
      ${"admin"},
      ${"admin@test.local"},
      ${hashedPassword},
      ${"admin"}
    )
  `);
  console.log("  ✓ Admin user seeded  (see .env.test for credentials)");

  // ── 4. Seed test form instance ─────────────────────────────────────────────
  const minimalFormConfig = {
    version: 1,
    title: "Test Form",
    steps: [
      {
        id: "step1",
        title: "Informations",
        fields: [
          { id: "firstName", type: "text", label: "First name", required: true },
          { id: "email",     type: "email", label: "Email", required: true },
        ],
      },
    ],
  };

  await db.execute(sql`
    INSERT INTO form_instances (slug, name, config)
    VALUES (
      ${"/"},
      ${"Test Form"},
      ${JSON.stringify(minimalFormConfig)}
    )
  `);
  console.log("  ✓ Test form instance seeded  (slug: /)");

  // ── 5. Seed app_settings single row ───────────────────────────────────────
  await db.execute(sql`
    INSERT INTO app_settings (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("  ✓ app_settings row ensured");

  await pool.end();
  console.log("\nSeed complete — test DB ready.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
