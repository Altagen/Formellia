import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ─────────────────────────────────────────────────
const migrateMock = vi.fn().mockResolvedValue(undefined);

vi.mock("drizzle-orm/node-postgres/migrator", () => ({
  migrate: migrateMock,
}));

const insertMock   = vi.fn().mockReturnThis();
const valuesMock   = vi.fn().mockReturnThis();
const onConflictMock = vi.fn().mockReturnThis();
const catchMock    = vi.fn().mockResolvedValue(undefined);

const dbMock = {
  insert: insertMock,
  execute: vi.fn().mockResolvedValue(undefined),
};

// Chain: db.insert().values().onConflictDoUpdate().catch()
insertMock.mockReturnValue({ values: valuesMock });
valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictMock });
onConflictMock.mockReturnValue({ catch: catchMock });

vi.mock("@/lib/db", () => ({ db: dbMock }));
vi.mock("@/lib/db/schema", () => ({
  schemaMeta: { key: "key" },
  // stub other exports used by bootstrap
  appSettings: {},
  appConfig:   {},
  formInstances: {},
  users: {},
}));

// Stub everything after the migrate call so bootstrap exits cleanly
vi.mock("@/lib/yaml/configLoader", () => ({ loadYamlConfig: vi.fn().mockReturnValue(null) }));
vi.mock("@/lib/startup/adminBootstrap",   () => ({ bootstrapAdminUser: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/startup/upsertFormInstance", () => ({ upsertFormInstanceFromYaml: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/security/customCa",        () => ({ applyCustomCaCerts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/logger", () => ({
  startupLogger: { info: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

describe("runStartupBootstrap — DB migration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Re-apply chain mocks after clearAllMocks
    insertMock.mockReturnValue({ values: valuesMock });
    valuesMock.mockReturnValue({ onConflictDoUpdate: onConflictMock });
    onConflictMock.mockReturnValue({ catch: catchMock });
    migrateMock.mockResolvedValue(undefined);
    // Provide a valid ENCRYPTION_KEY so the startup guard passes
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  it("calls migrate() with the 'migrations' folder as an absolute path", async () => {
    const { runStartupBootstrap } = await import("@/lib/startup/bootstrap");
    await runStartupBootstrap();

    expect(migrateMock).toHaveBeenCalledOnce();
    const [, opts] = migrateMock.mock.calls[0] as [unknown, { migrationsFolder: string }];
    expect(opts.migrationsFolder).toMatch(/migrations$/);
    // Must be absolute
    expect(opts.migrationsFolder.startsWith("/")).toBe(true);
  });

  it("upserts schema_meta after migrate() succeeds", async () => {
    const { runStartupBootstrap } = await import("@/lib/startup/bootstrap");
    await runStartupBootstrap();

    expect(insertMock).toHaveBeenCalled();
    expect(valuesMock).toHaveBeenCalledWith(
      expect.objectContaining({ key: "last_boot_ms" }),
    );
  });

  it("propagates migrate() errors (does not swallow them)", async () => {
    migrateMock.mockRejectedValueOnce(new Error("migration failed"));
    const { runStartupBootstrap } = await import("@/lib/startup/bootstrap");
    await expect(runStartupBootstrap()).rejects.toThrow("migration failed");
  });
});
