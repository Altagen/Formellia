/**
 * `stripLegacyEmailFieldsOnBoot` — post-UI-11 one-shot cleanup.
 *
 * Every guarantee we advertise elsewhere in this repo depends on the boot
 * migration being total AND idempotent: total, because a leftover
 * `apiKeyEncrypted` on any form would keep an obsolete secret alive after
 * we told operators UI-11 wiped them; idempotent, because Compose deploys
 * restart the app freely and we cannot afford the migration to flip config
 * back and forth on every restart.
 *
 * The DB layer is mocked with a captured update stream so the assertions
 * inspect exactly what would land on disk, without needing a live Postgres.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

interface Row {
  id:     string;
  slug:   string;
  config: Record<string, unknown>;
}

const rows: Row[] = [];
const updateCalls: { id: string; config: Record<string, unknown> }[] = [];

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => rows.map(r => ({ id: r.id, slug: r.slug, config: r.config })),
    }),
    update: () => ({
      set: (fields: { config: Record<string, unknown> }) => ({
        where: () => {
          // The eq(...) call inside legacyMigration keys off row id — we just
          // capture the freshly-set config so tests can inspect it.
          const target = updateCalls[updateCalls.length - 1];
          if (target) target.config = fields.config;
          return Promise.resolve();
        },
      }),
    }),
  },
}));

vi.mock("@/lib/db/schema", () => ({ formInstances: { id: "id", slug: "slug", config: "config" } }));

vi.mock("drizzle-orm", () => ({ eq: (col: string, val: string) => ({ col, val }) }));

// Capture id → config pairs. The mocked update chain above uses the tail of
// this array to figure out which row was targeted — a tiny amount of shared
// state because `db.update(...).set(...).where(...)` doesn't expose the
// where-clause arguments in our mock.
const originalUpdate = (globalThis as { __capturedUpdate?: unknown }).__capturedUpdate;

vi.mock("@/lib/logger", () => ({
  startupLogger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

import { stripLegacyEmailFieldsOnBoot } from "@/lib/email/legacyMigration";

describe("stripLegacyEmailFieldsOnBoot", () => {
  beforeEach(() => {
    rows.length = 0;
    updateCalls.length = 0;
    (globalThis as { __capturedUpdate?: unknown }).__capturedUpdate = originalUpdate;
  });

  it("removes provider/apiKey fields from notifications.email and disables the toggle", async () => {
    const row: Row = {
      id: "r1",
      slug: "contact",
      config: {
        meta: { name: "Contact" },
        notifications: {
          enabled: true,
          email: {
            enabled:         true,
            provider:        "resend",
            apiKeyEncrypted: "enc-secret",
            fromAddress:     "no-reply@example.com",
            subject:         "New contact",
            bodyText:        "body",
          },
        },
      },
    };
    rows.push(row);
    updateCalls.push({ id: row.id, config: {} });

    await stripLegacyEmailFieldsOnBoot();

    const cfg = updateCalls[0].config as { notifications: { email: Record<string, unknown> }; meta: Record<string, unknown> };
    expect(cfg.notifications.email.provider).toBeUndefined();
    expect(cfg.notifications.email.apiKeyEncrypted).toBeUndefined();
    expect(cfg.notifications.email.fromAddress).toBeUndefined();
    // Template kept
    expect(cfg.notifications.email.subject).toBe("New contact");
    expect(cfg.notifications.email.bodyText).toBe("body");
    // Send is disabled so no attempted send with a half-configured preset
    expect(cfg.notifications.email.enabled).toBe(false);
    // Flag persists so the UI can render the "reassign a preset" banner
    expect(cfg.meta._notificationLegacyStripped).toBe(true);
  });

  it("drops the submitterConfirmation subtree entirely", async () => {
    const row: Row = {
      id: "r2",
      slug: "form-b",
      config: {
        meta: {},
        notifications: {
          email: { enabled: true, subject: "s", bodyText: "b" },
          submitterConfirmation: { enabled: true, subject: "thx", bodyText: "thx-body" },
        },
      },
    };
    rows.push(row);
    updateCalls.push({ id: row.id, config: {} });

    await stripLegacyEmailFieldsOnBoot();

    const cfg = updateCalls[0].config as { notifications: Record<string, unknown> };
    expect("submitterConfirmation" in cfg.notifications).toBe(false);
  });

  it("is idempotent — a form with no legacy fields is left alone", async () => {
    const row: Row = {
      id: "r3",
      slug: "clean",
      config: {
        meta: {},
        notifications: {
          email: { enabled: true, providerId: "p1", subject: "s", bodyText: "b" },
        },
      },
    };
    rows.push(row);
    updateCalls.push({ id: row.id, config: { untouched: true } });

    await stripLegacyEmailFieldsOnBoot();

    // No update was recorded for this row (still the sentinel).
    expect(updateCalls[0].config).toEqual({ untouched: true });
  });
});
