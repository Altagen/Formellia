/**
 * Minimal test runner — no external dependencies.
 */

export interface TestResult {
  id: string;
  name: string;
  passed: boolean;
  detail: string;
  durationMs: number;
}

const registry: Array<{ id: string; name: string; fn: () => Promise<void> | void }> = [];
const results: TestResult[] = [];

export function test(id: string, name: string, fn: () => Promise<void> | void) {
  registry.push({ id, name, fn });
}

export function eq(label: string, actual: unknown, expected: unknown) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function ok(label: string, value: unknown) {
  if (!value) {
    throw new Error(`${label}: expected truthy, got ${JSON.stringify(value)}`);
  }
}

export function notEq(label: string, actual: unknown, notExpected: unknown) {
  if (actual === notExpected) {
    throw new Error(`${label}: expected not ${JSON.stringify(notExpected)}`);
  }
}

export async function runAll(filter = ""): Promise<boolean> {
  const prefix = filter.toUpperCase();
  const suite = registry.filter(t => !prefix || t.id.toUpperCase().startsWith(prefix));

  console.log(`\n  Running ${suite.length} test(s)…\n`);

  let passed = 0;
  let failed = 0;

  for (const { id, name, fn } of suite) {
    const start = Date.now();
    try {
      await fn();
      results.push({ id, name, passed: true, detail: "", durationMs: Date.now() - start });
      passed++;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      results.push({ id, name, passed: false, detail, durationMs: Date.now() - start });
      failed++;
    }
  }

  const COL_ID = 8;
  const COL_NAME = 58;
  console.log(`  ${"ID".padEnd(COL_ID)} ${"Test".padEnd(COL_NAME)} Status   ms`);
  console.log(`  ${"─".repeat(COL_ID + COL_NAME + 14)}`);

  for (const r of results) {
    const mark = r.passed ? "PASS" : "FAIL";
    console.log(`  ${r.id.padEnd(COL_ID)} ${r.name.padEnd(COL_NAME)} ${mark}   ${r.durationMs}`);
    if (!r.passed && r.detail) {
      console.log(`  ${"".padEnd(COL_ID)}   └─ ${r.detail}`);
    }
  }

  console.log(`\n  ${"─".repeat(COL_ID + COL_NAME + 14)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed  (${passed + failed} total)\n`);

  return failed === 0;
}
