/**
 * Unit tests for the audit-purge job.
 *
 * The job is destructive by nature and runs unattended on a nightly cron —
 * these tests lock in the "floor at 1 day" guard so that a misconfigured
 * `olderThanDays: 0` (or NaN) can never wipe the entire audit table.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const whereMock = vi.fn();
const deleteMock = vi.fn(() => ({ where: whereMock }));

vi.mock("@/lib/db", () => ({
  db: { delete: () => deleteMock() },
}));

// The Drizzle `lt(col, val)` helper is opaque to us — capture the value.
let capturedCutoff: Date | undefined;
vi.mock("drizzle-orm", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    lt: (_col: unknown, val: Date) => { capturedCutoff = val; return { _lt: val }; },
  };
});

import { auditPurge } from "@/lib/scheduler/jobs/auditPurge";

beforeEach(() => {
  whereMock.mockReset();
  whereMock.mockResolvedValue({ rowCount: 42 });
  deleteMock.mockClear();
  capturedCutoff = undefined;
});

describe("auditPurge", () => {
  it("defaults to a 365-day cutoff when unconfigured", async () => {
    const before = Date.now();
    const res = await auditPurge({});
    expect(res.deleted).toBe(42);

    expect(capturedCutoff).toBeDefined();
    const ageDays = (before - capturedCutoff!.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(364.9);
    expect(ageDays).toBeLessThanOrEqual(365.1);
  });

  it("uses olderThanDays when provided", async () => {
    const before = Date.now();
    await auditPurge({ olderThanDays: 30 });
    const ageDays = (before - capturedCutoff!.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(29.9);
    expect(ageDays).toBeLessThanOrEqual(30.1);
  });

  it("floors olderThanDays at 1 day (guards against zero-wipe)", async () => {
    const before = Date.now();
    await auditPurge({ olderThanDays: 0 });
    const ageDays = (before - capturedCutoff!.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(0.99);
    expect(ageDays).toBeLessThanOrEqual(1.01);
  });

  it("floors negative values at 1 day", async () => {
    const before = Date.now();
    await auditPurge({ olderThanDays: -10 });
    const ageDays = (before - capturedCutoff!.getTime()) / 86_400_000;
    expect(ageDays).toBeGreaterThanOrEqual(0.99);
    expect(ageDays).toBeLessThanOrEqual(1.01);
  });

  it("returns 0 when Drizzle reports no rowCount", async () => {
    whereMock.mockResolvedValueOnce({});
    const res = await auditPurge({ olderThanDays: 30 });
    expect(res.deleted).toBe(0);
  });
});
