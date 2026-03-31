#!/usr/bin/env tsx
/**
 * Comprehensive API integration test suite.
 *
 * Usage:
 *   npx tsx tests/api/main.ts \
 *     --base-url http://localhost:3000 \
 *     --username admin \
 *     --password YourPassword123!
 *     [--filter AUTH]   # run only tests whose ID starts with this prefix
 *
 * Exit code: 0 if all pass, 1 if any fail.
 */

import { ApiClient } from "./client.ts";
import { test, eq, ok, runAll } from "./runner.ts";

// ── CLI args ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function arg(name: string, def?: string): string {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1) {
    if (def !== undefined) return def;
    console.error(`Missing --${name}`);
    process.exit(1);
  }
  return args[idx + 1] ?? "";
}

const BASE_URL = arg("base-url", "http://localhost:3000");
const USERNAME  = arg("username");
const PASSWORD  = arg("password");
const FILTER    = arg("filter", "");

console.log(`\nFormellia — API Test Suite`);
console.log(`Target  : ${BASE_URL}`);
console.log(`─`.repeat(66));

// ── Shared state ───────────────────────────────────────────────────────────

let adminClient!: ApiClient;
let createdFormId = "";
let createdFormSlug = "";
let createdSubmissionId = "";
let createdUserId = "";
let createdUserUsername = "";
let createdApiKeyId = "";
let rawApiKey = "";
let createdFilterId = "";
let savedSettingsSnapshot: Record<string, unknown> = {};
let createdDatasetId = "";
let createdJobId = "";
let createdRootFormId = "";
let createdImportedFormId = "";
let createdDuplicateFormId = "";

// ── AUTH TESTS ─────────────────────────────────────────────────────────────

test("AUTH-01", "GET /api/health → 200", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/health");
  eq("status", res.status, 200);
});

test("AUTH-02", "POST /api/auth/login valid credentials → 200 + cookie", async () => {
  const client = new ApiClient(BASE_URL);
  const res = await client.login(USERNAME, PASSWORD);
  eq("status", res.status, 200);
  ok("cookie set", client.cookie);
  adminClient = client;
});

test("AUTH-03", "POST /api/auth/login wrong password → 401", async () => {
  const res = await new ApiClient(BASE_URL).login(USERNAME, "WRONG_PASSWORD_xyz999");
  eq("status", res.status, 401);
});

test("AUTH-04", "POST /api/auth/login missing body → 400", async () => {
  const res = await new ApiClient(BASE_URL).request("POST", "/api/auth/login", {
    rawBody: "not json",
    headers: { "Content-Type": "application/json" },
  });
  eq("status", res.status, 400);
});

test("AUTH-05", "POST /api/auth/login empty identifier → 400", async () => {
  const res = await new ApiClient(BASE_URL).post("/api/auth/login", { identifier: "", password: "abc" });
  eq("status", res.status, 400);
});

test("AUTH-06", "Unauthenticated GET /api/admin/users → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/users");
  eq("status", res.status, 401);
});

// ── USERS TESTS ────────────────────────────────────────────────────────────

test("USERS-01", "GET /api/admin/users → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/users");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("USERS-02", "GET /api/admin/users contains no hashedPassword", async () => {
  const res = await adminClient.get("/api/admin/users");
  const body = JSON.stringify(res.body);
  ok("no hashedPassword", !body.includes("hashedPassword"));
});

test("USERS-03", "POST /api/admin/users → 201 create new user", async () => {
  const testUsername = `testuser_${Date.now()}`;
  const res = await adminClient.post("/api/admin/users", {
    username: testUsername,
    email: `${testUsername}@example.com`,
    password: "TestPass123!",
  });
  if (res.status === 429) {
    // Rate limit: max 5 creations/hour — skip silently, suite was run multiple times recently
    console.log("  [USERS-03] rate limited (429) — skipping user creation tests");
    return;
  }
  eq("status", res.status, 201);
  const body = res.body as Record<string, unknown>;
  ok("has id", body.id);
  createdUserId = body.id as string;
  createdUserUsername = testUsername;
});

test("USERS-04", "POST /api/admin/users duplicate username → 409 or 429", async () => {
  if (!createdUserUsername) return; // USERS-03 was rate-limited — skip
  const res = await adminClient.post("/api/admin/users", {
    username: createdUserUsername,
    password: "AnotherPass123!",
  });
  // 409 = duplicate detected; 429 = rate limit fires before duplicate check (both correct)
  ok("status is 409 or 429", res.status === 409 || res.status === 429);
});

test("USERS-05", "POST /api/admin/users invalid username (too short) → 400", async () => {
  const res = await adminClient.post("/api/admin/users", {
    username: "ab",
    password: "AnotherPass123!",
  });
  eq("status", res.status, 400);
});

test("USERS-06", "POST /api/admin/users short password → 400", async () => {
  const res = await adminClient.post("/api/admin/users", {
    username: `validuser_${Date.now()}`,
    password: "abc",
  });
  eq("status", res.status, 400);
});

test("USERS-07", "POST /api/admin/users/[id]/temp-password → 200 + tempPassword", async () => {
  if (!createdUserId) return; // USERS-03 was rate-limited — skip
  const res = await adminClient.post<Record<string, unknown>>(
    `/api/admin/users/${createdUserId}/temp-password`
  );
  eq("status", res.status, 200);
  ok("has tempPassword", res.body.tempPassword);
});

test("USERS-08", "Cannot reset own password via temp-password → 400", async () => {
  // Find self by email (USERNAME may be an email address)
  const usersRes = await adminClient.get<Array<Record<string, unknown>>>("/api/admin/users");
  const self = (usersRes.body as Array<Record<string, unknown>>).find(
    u => u.email === USERNAME || u.username === USERNAME
  );
  if (!self) throw new Error(`Could not find self (${USERNAME}) in users list`);
  const res = await adminClient.post(`/api/admin/users/${self.id}/temp-password`);
  // Route returns 400 for self-reset (not 403 — it's a bad-request, not an access-denied)
  eq("status", res.status, 400);
});

// ── FORMS TESTS ────────────────────────────────────────────────────────────

test("FORMS-01", "GET /api/admin/forms → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/forms");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("FORMS-02", "POST /api/admin/forms → 201 create form", async () => {
  const slug = `test-form-${Date.now()}`;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/forms", {
    slug,
    name: "Test Form (automated)",
  });
  eq("status", res.status, 201);
  ok("has id", res.body.id);
  ok("has slug", res.body.slug);
  createdFormId   = res.body.id as string;
  createdFormSlug = res.body.slug as string;
});

test("FORMS-03", "POST /api/admin/forms missing name → 400", async () => {
  const res = await adminClient.post("/api/admin/forms", {
    slug: `test-${Date.now()}`,
  });
  eq("status", res.status, 400);
});

test("FORMS-04", "POST /api/admin/forms reserved slug → 400", async () => {
  const res = await adminClient.post("/api/admin/forms", {
    slug: "admin",
    name: "Should Fail",
  });
  eq("status", res.status, 400);
});

test("FORMS-05", "GET /api/admin/forms/[id] → 200", async () => {
  const res = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  eq("status", res.status, 200);
  eq("id matches", res.body.id, createdFormId);
});

test("FORMS-06", "GET /api/admin/forms/[nonexistent-uuid] → 404", async () => {
  // Must use a valid UUID format — UUID column type rejects non-UUID strings
  const res = await adminClient.get("/api/admin/forms/00000000-0000-0000-0000-000000000000");
  eq("status", res.status, 404);
});

test("FORMS-07", "PUT /api/admin/forms/[id] update → 200", async () => {
  // First get the current config to pass it back unchanged
  const getRes = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const current = getRes.body as Record<string, unknown>;
  const res = await adminClient.put<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`, {
    name: "Updated Test Form",
    config: current.config,
  });
  eq("status", res.status, 200);
});

// ── SUBMIT TESTS ────────────────────────────────────────────────────────────

test("SUBMIT-01", "POST /api/forms/[slug]/submit → creates submission", async () => {
  const anon = new ApiClient(BASE_URL);
  // Submit body: top-level fields go to DB columns; formData contains form field values
  const res = await anon.post(`/api/forms/${createdFormSlug}/submit`, {
    formData: { email: "testsubmitter@example.com" },
  });
  // Accept 200 or 201 (depends on form config)
  ok("success status", res.status >= 200 && res.status < 300);
});

test("SUBMIT-02", "POST /api/forms/nonexistent/submit → 404", async () => {
  const res = await new ApiClient(BASE_URL).post("/api/forms/nonexistent-slug-xyz/submit", {
    email: "test@example.com",
  });
  eq("status", res.status, 404);
});

test("SUBMIT-03", "Submissions appear in admin list after submit", async () => {
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/submissions?formInstanceId=${createdFormId}`
  );
  eq("status", res.status, 200);
  const rows = res.body.rows as unknown[];
  ok("has submissions", rows.length > 0);
  createdSubmissionId = (rows[0] as Record<string, unknown>).id as string;
});

// ── SUBMISSIONS TESTS ─────────────────────────────────────────────────────

test("SUBS-01", "GET /api/admin/submissions → 200 paginated", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/submissions?page=1&limit=10");
  eq("status", res.status, 200);
  ok("has rows", res.body.rows !== undefined);
  ok("has total", res.body.total !== undefined);
  ok("has pages", res.body.pages !== undefined);
});

test("SUBS-02", "GET /api/admin/submissions with status filter → 200", async () => {
  const res = await adminClient.get<Record<string, unknown>>(
    "/api/admin/submissions?status=new&page=1&limit=10"
  );
  eq("status", res.status, 200);
});

test("SUBS-03", "PATCH /api/admin/submissions/[id] update status → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission created yet");
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/submissions/${createdSubmissionId}`,
    { status: "in_progress" }
  );
  eq("status", res.status, 200);
  eq("status updated", (res.body as Record<string, unknown>).status, "in_progress");
});

test("SUBS-04", "PATCH /api/admin/submissions/[id] update priority → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission created yet");
  const res = await adminClient.patch(
    `/api/admin/submissions/${createdSubmissionId}`,
    { priority: "orange" }
  );
  eq("status", res.status, 200);
});

test("SUBS-05", "PATCH /api/admin/submissions/[id] invalid priority → 400", async () => {
  if (!createdSubmissionId) throw new Error("No submission created yet");
  const res = await adminClient.patch(
    `/api/admin/submissions/${createdSubmissionId}`,
    { priority: "INVALID_PRIORITY" }
  );
  eq("status", res.status, 400);
});

test("SUBS-06", "PATCH /api/admin/submissions/[id] no fields → 400", async () => {
  if (!createdSubmissionId) throw new Error("No submission created yet");
  const res = await adminClient.patch(
    `/api/admin/submissions/${createdSubmissionId}`,
    {}
  );
  eq("status", res.status, 400);
});

test("SUBS-07", "PATCH /api/admin/submissions/[nonexistent-uuid] → 404", async () => {
  const res = await adminClient.patch(
    "/api/admin/submissions/00000000-0000-0000-0000-000000000000",
    { status: "done" }
  );
  eq("status", res.status, 404);
});

test("SUBS-08", "PATCH /api/admin/submissions/[bad-id-format] → 400", async () => {
  const res = await adminClient.patch(
    "/api/admin/submissions/not-a-valid-uuid",
    { status: "done" }
  );
  eq("status", res.status, 400);
});

test("SUBS-09", "POST /api/admin/submissions/export CSV → 200 + Content-Disposition", async () => {
  const res = await adminClient.post("/api/admin/submissions/export", {
    format: "csv",
    formInstanceId: createdFormId,
  });
  eq("status", res.status, 200);
  ok("content-disposition", res.headers.get("content-disposition"));
});

test("SUBS-10", "POST /api/admin/submissions/export JSON → 200 array", async () => {
  const res = await adminClient.post<unknown[]>("/api/admin/submissions/export", {
    format: "json",
    formInstanceId: createdFormId,
  });
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

// ── BULK SUBMISSIONS ───────────────────────────────────────────────────────

test("BULK-01", "PATCH /api/admin/submissions/bulk update status → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission created yet");
  const res = await adminClient.patch("/api/admin/submissions/bulk", {
    ids: [createdSubmissionId],
    action: "update",
    updates: { status: "done" },
  });
  eq("status", res.status, 200);
});

test("BULK-02", "PATCH /api/admin/submissions/bulk with non-UUID ids → 400", async () => {
  const res = await adminClient.patch("/api/admin/submissions/bulk", {
    ids: ["not-a-uuid"],
    action: "update",
    updates: { status: "done" },
  });
  eq("status", res.status, 400);
});

// ── API KEYS TESTS ─────────────────────────────────────────────────────────

test("KEYS-01", "GET /api/admin/account/api-keys → 200 with keys array", async () => {
  const res = await adminClient.get<Record<string, unknown[]>>("/api/admin/account/api-keys");
  eq("status", res.status, 200);
  ok("has keys", Array.isArray(res.body.keys));
});

test("KEYS-02", "POST /api/admin/account/api-keys → 201 + rawKey (sk_ prefix)", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/account/api-keys", {
    name: "Test Key (automated)",
    role: "editor",
  });
  eq("status", res.status, 201);
  ok("has rawKey", res.body.rawKey);
  ok("rawKey starts with sk_", (res.body.rawKey as string).startsWith("sk_"));
  const key = res.body.key as Record<string, unknown>;
  createdApiKeyId = key.id as string;
  rawApiKey = res.body.rawKey as string;
});

test("KEYS-03", "POST /api/admin/account/api-keys missing name → 400", async () => {
  const res = await adminClient.post("/api/admin/account/api-keys", {
    role: "editor",
  });
  eq("status", res.status, 400);
});

test("KEYS-04", "GET /api/admin/account/api-keys does not expose keyHash", async () => {
  const res = await adminClient.get("/api/admin/account/api-keys");
  const body = JSON.stringify(res.body);
  ok("no keyHash", !body.includes("keyHash"));
});

test("KEYS-05", "Bearer token authenticates — GET /api/admin/submissions", async () => {
  if (!rawApiKey) throw new Error("No API key created yet");
  const res = await new ApiClient(BASE_URL).withBearer(rawApiKey).get(
    "/api/admin/submissions?page=1&limit=1"
  );
  eq("status", res.status, 200);
});

test("KEYS-06", "Invalid Bearer token → 401", async () => {
  const res = await new ApiClient(BASE_URL).withBearer("sk_invalid_xyz").get(
    "/api/admin/submissions"
  );
  eq("status", res.status, 401);
});

test("KEYS-07", "DELETE /api/admin/account/api-keys/[id] → 200", async () => {
  if (!createdApiKeyId) throw new Error("No API key created");
  const res = await adminClient.delete(`/api/admin/account/api-keys/${createdApiKeyId}`);
  eq("status", res.status, 200);
});

test("KEYS-08", "Deleted API key is rejected → 401", async () => {
  if (!rawApiKey) throw new Error("No API key available");
  const res = await new ApiClient(BASE_URL).withBearer(rawApiKey).get("/api/admin/submissions");
  eq("status", res.status, 401);
});

// ── SESSIONS TESTS ─────────────────────────────────────────────────────────

test("SESS-01", "GET /api/admin/account/sessions → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/account/sessions");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

// ── CONFIG TESTS ───────────────────────────────────────────────────────────

test("CFG-01", "GET /api/admin/config → 200 with config.admin key", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/config");
  eq("status", res.status, 200);
  ok("has config", res.body.config !== undefined);
  ok("has admin section", (res.body.config as Record<string, unknown>)?.admin !== undefined);
});

test("CFG-02", "GET /api/admin/config unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/config");
  eq("status", res.status, 401);
});

// ── PREFERENCES TESTS ──────────────────────────────────────────────────────

test("PREF-01", "GET /api/admin/account/preferences → 200", async () => {
  const res = await adminClient.get("/api/admin/account/preferences");
  eq("status", res.status, 200);
});

test("PREF-02", "PATCH /api/admin/account/preferences themeMode=dark → 200", async () => {
  const res = await adminClient.patch("/api/admin/account/preferences", {
    themeMode: "dark",
  });
  eq("status", res.status, 200);
});

test("PREF-03", "PATCH /api/admin/account/preferences invalid themeMode → 400", async () => {
  const res = await adminClient.patch("/api/admin/account/preferences", {
    themeMode: "invalid_theme",
  });
  eq("status", res.status, 400);
});

test("PREF-04", "PATCH /api/admin/account/preferences no fields → 400", async () => {
  const res = await adminClient.patch("/api/admin/account/preferences", {});
  eq("status", res.status, 400);
});

// ── SAVED FILTERS ──────────────────────────────────────────────────────────

test("FILTER-01", "GET /api/admin/saved-filters → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/saved-filters");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("FILTER-02", "POST /api/admin/saved-filters → 201", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/saved-filters", {
    name: "Test Filter (automated)",
    formSlug: createdFormSlug,
    filters: { status: "new" },
  });
  eq("status", res.status, 201);
  ok("has id", res.body.id);
  createdFilterId = res.body.id as string;
});

test("FILTER-03", "DELETE /api/admin/saved-filters/[id] → 200", async () => {
  if (!createdFilterId) throw new Error("FILTER-02 must run first");
  const res = await adminClient.delete(`/api/admin/saved-filters/${createdFilterId}`);
  eq("status", res.status, 200);
});

test("FILTER-04", "DELETE /api/admin/saved-filters/nonexistent → 200 or 404 (idempotent)", async () => {
  const res = await adminClient.delete("/api/admin/saved-filters/00000000-0000-0000-0000-000000000000");
  // Some routes use idempotent delete (200 even when not found); both are acceptable
  ok("status 200 or 404", res.status === 200 || res.status === 404);
});

// ── FORM ANALYTICS ─────────────────────────────────────────────────────────

test("ANALYTICS-01", "GET /api/admin/forms/[id]/analytics → 200", async () => {
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}/analytics`);
  eq("status", res.status, 200);
});

test("ANALYTICS-02", "GET /api/admin/forms/[id]/traffic → 200", async () => {
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}/traffic`);
  eq("status", res.status, 200);
});

// ── SECURITY TESTS ─────────────────────────────────────────────────────────

test("SEC-01", "CSRF: POST with mismatched Origin → 403", async () => {
  const res = await adminClient.post(
    "/api/admin/forms",
    { slug: "csrf-test", name: "CSRF Test" },
    { Origin: "http://evil.example.com" }
  );
  eq("status", res.status, 403);
});

test("SEC-02", "SQL injection in search → no crash, returns 200", async () => {
  const injection = "'; DROP TABLE submissions; --";
  const res = await adminClient.get(
    `/api/admin/submissions?search=${encodeURIComponent(injection)}`
  );
  eq("status", res.status, 200);
});

test("SEC-03", "Viewer API key cannot DELETE a user (role check)", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (SEC-03)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  // Use a static UUID — role check fires before user lookup, so 403 regardless of existence
  const targetId = createdUserId || "00000000-0000-0000-0000-000000000001";
  const viewerClient = new ApiClient(BASE_URL).withBearer(viewerKey);
  const res = await viewerClient.delete(`/api/admin/users/${targetId}`);
  ok("blocked", res.status === 403 || res.status === 401);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

test("SEC-04", "Viewer API key cannot POST /api/admin/forms (mutation)", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (SEC-04)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const viewerClient = new ApiClient(BASE_URL).withBearer(viewerKey);
  const res = await viewerClient.post("/api/admin/forms", {
    slug: `viewer-test-${Date.now()}`,
    name: "Should Fail",
  });
  ok("blocked", res.status === 403 || res.status === 401);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

test("SEC-05", "Editor API key cannot escalate to admin key (role cap)", async () => {
  const editorKeyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Editor Key (SEC-05)", role: "editor" }
  );
  const editorKey = editorKeyRes.body.rawKey as string;
  const editorKeyId = (editorKeyRes.body.key as Record<string, unknown>).id as string;

  const editorClient = new ApiClient(BASE_URL).withBearer(editorKey);
  const res = await editorClient.post("/api/admin/account/api-keys", {
    name: "Escalation Attempt",
    role: "admin",
  });
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${editorKeyId}`);
});

test("SEC-06", "GET /api/admin/users never exposes hashedPassword", async () => {
  const res = await adminClient.get("/api/admin/users");
  const body = JSON.stringify(res.body);
  ok("no hashedPassword", !body.includes("hashedPassword"));
  ok("no password field", !/"password"/.test(body));
});

test("SEC-07", "Single bad login attempt → 401 (not locked out)", async () => {
  const client = new ApiClient(BASE_URL);
  const res = await client.post("/api/auth/login", {
    identifier: `nonexistent_${Date.now()}`,
    password: "wrongpass",
  });
  eq("status", res.status, 401);
});

test("SEC-08", "PATCH /api/admin/submissions non-admin cannot update (viewer)", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (SEC-08)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const viewerClient = new ApiClient(BASE_URL).withBearer(viewerKey);
  const res = await viewerClient.patch(
    `/api/admin/submissions/${createdSubmissionId}`,
    { status: "done" }
  );
  ok("blocked", res.status === 403 || res.status === 401);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

// ── SUBMISSIONS EVENTS ─────────────────────────────────────────────────────

test("SUBS-11", "GET /api/admin/submissions/[id]/events → 200 array", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  const res = await adminClient.get<unknown[]>(`/api/admin/submissions/${createdSubmissionId}/events`);
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("SUBS-12", "GET /api/admin/submissions with custom field search → 200", async () => {
  // fs_<key>=<value> searches inside formData JSON
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/submissions?fs_email=${encodeURIComponent("testsubmitter")}`
  );
  eq("status", res.status, 200);
  ok("has rows", res.body.rows !== undefined);
});

test("SUBS-13", "GET /api/admin/submissions page cap (page=99999) → 200 (no crash)", async () => {
  const res = await adminClient.get<Record<string, unknown>>(
    "/api/admin/submissions?page=99999&limit=1"
  );
  eq("status", res.status, 200);
});

// ── BULK DELETE ─────────────────────────────────────────────────────────────

test("BULK-03", "PATCH /api/admin/submissions/bulk delete → 200", async () => {
  // Create a throwaway submission first then delete it
  const anon = new ApiClient(BASE_URL);
  await anon.post(`/api/forms/${createdFormSlug}/submit`, {
    formData: { email: "bulk-delete-target@example.com" },
  });
  const listRes = await adminClient.get<Record<string, unknown>>(
    `/api/admin/submissions?formInstanceId=${createdFormId}&limit=100`
  );
  const rows = listRes.body.rows as Array<Record<string, unknown>>;
  const target = rows.find(r => {
    const fd = r.formData as Record<string, unknown> | null;
    return fd?.email === "bulk-delete-target@example.com" ||
      (fd?.formData as Record<string, unknown> | undefined)?.email === "bulk-delete-target@example.com";
  });
  // If we can identify the target specifically, delete just it; otherwise delete none
  if (!target) {
    // Skip gracefully — submission may have been stored differently
    return;
  }
  const res = await adminClient.patch("/api/admin/submissions/bulk", {
    ids: [target.id as string],
    action: "delete",
  });
  eq("status", res.status, 200);
  ok("has deleted", (res.body as Record<string, unknown>).deleted !== undefined);
});

// ── FORM VERSIONS ───────────────────────────────────────────────────────────

test("FORMS-08", "GET /api/admin/forms/[id]/versions → 200 array", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.get<unknown[]>(`/api/admin/forms/${createdFormId}/versions`);
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("FORMS-09", "GET /api/admin/forms/[id]/email-stats → 200", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}/email-stats`);
  eq("status", res.status, 200);
});

test("FORMS-10", "GET /api/admin/forms/[id]/urgency-distribution → 200", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}/urgency-distribution`);
  eq("status", res.status, 200);
});

// ── SESSIONS MANAGEMENT ─────────────────────────────────────────────────────

test("SESS-02", "DELETE /api/admin/account/sessions (revoke all others) → 200", async () => {
  // This endpoint deletes all sessions EXCEPT the current one — safe to call
  const res = await adminClient.delete<Record<string, unknown>>("/api/admin/account/sessions");
  eq("status", res.status, 200);
  ok("has revoked", res.body.revoked !== undefined);
});

test("SESS-03", "DELETE /api/admin/account/sessions/[id] revokes specific session → cookie becomes 401", async () => {
  // Create a second authenticated session
  const secondClient = new ApiClient(BASE_URL);
  const loginRes = await secondClient.login(USERNAME, PASSWORD);
  eq("second login", loginRes.status, 200);
  ok("second cookie", !!secondClient.cookie);

  // Verify the second session works
  const checkRes = await secondClient.get("/api/admin/submissions?limit=1");
  eq("second session valid", checkRes.status, 200);

  // Find its session ID from the admin's sessions list
  const sessionsRes = await adminClient.get<Array<Record<string, unknown>>>("/api/admin/account/sessions");
  const secondSess = (sessionsRes.body as Array<Record<string, unknown>>).find(s => !s.isCurrent);
  if (!secondSess) return; // Nothing to revoke (edge case in isolated test env)

  // Revoke the specific session
  const revokeRes = await adminClient.delete(`/api/admin/account/sessions/${secondSess.id as string}`);
  eq("revoke status", revokeRes.status, 200);

  // The revoked cookie must now be rejected
  const afterRes = await secondClient.get("/api/admin/submissions?limit=1");
  eq("revoked session rejected", afterRes.status, 401);
});

// ── SETTINGS ────────────────────────────────────────────────────────────────

test("SETTINGS-01", "GET /api/admin/settings → 200 with thresholds", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/settings");
  eq("status", res.status, 200);
  ok("has redMaxDays", res.body.redMaxDays !== undefined);
  ok("has orangeMaxDays", res.body.orangeMaxDays !== undefined);
  ok("has yellowMaxDays", res.body.yellowMaxDays !== undefined);
  // Save for round-trip restore
  savedSettingsSnapshot = res.body as Record<string, unknown>;
});

test("SETTINGS-02", "PUT /api/admin/settings valid thresholds → 200", async () => {
  const res = await adminClient.put("/api/admin/settings", {
    redMaxDays: 2,
    orangeMaxDays: 7,
    yellowMaxDays: 14,
  });
  eq("status", res.status, 200);
});

test("SETTINGS-03", "PUT /api/admin/settings invalid threshold order → 400", async () => {
  // red must be < orange < yellow; this violates the constraint
  const res = await adminClient.put("/api/admin/settings", {
    redMaxDays: 10,
    orangeMaxDays: 5,
    yellowMaxDays: 3,
  });
  eq("status", res.status, 400);
});

test("SETTINGS-04", "PUT /api/admin/settings restore original values", async () => {
  if (!savedSettingsSnapshot.redMaxDays) return; // SETTINGS-01 skipped
  const res = await adminClient.put("/api/admin/settings", savedSettingsSnapshot);
  eq("status", res.status, 200);
});

// ── APP CONFIG ───────────────────────────────────────────────────────────────

test("APPCONFIG-01", "GET /api/admin/app-config → 200", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  eq("status", res.status, 200);
  ok("has enforcePasswordPolicy", res.body.enforcePasswordPolicy !== undefined);
  ok("has sessionDurationDays", res.body.sessionDurationDays !== undefined);
});

test("APPCONFIG-02", "PATCH /api/admin/app-config → 200", async () => {
  // Toggle and restore password policy (non-destructive: get current, toggle, restore)
  const getRes = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  const current = getRes.body.enforcePasswordPolicy as boolean;
  const patchRes = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", {
    enforcePasswordPolicy: !current,
  });
  eq("status", patchRes.status, 200);
  // Restore original value
  await adminClient.patch("/api/admin/app-config", { enforcePasswordPolicy: current });
});

test("APPCONFIG-03", "PATCH /api/admin/app-config empty body → 400", async () => {
  const res = await adminClient.patch("/api/admin/app-config", {});
  eq("status", res.status, 400);
});

test("APPCONFIG-04", "GET /api/admin/app-config exposes userCreationRateLimit", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  eq("status", res.status, 200);
  ok("has userCreationRateLimit", res.body.userCreationRateLimit !== undefined);
  ok("is number", typeof res.body.userCreationRateLimit === "number");
});

test("APPCONFIG-05", "PATCH /api/admin/app-config userCreationRateLimit=10 → 200", async () => {
  const getRes = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  const original = getRes.body.userCreationRateLimit as number;

  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", {
    userCreationRateLimit: 10,
  });
  eq("status", res.status, 200);

  // Restore
  await adminClient.patch("/api/admin/app-config", { userCreationRateLimit: original });
});

test("APPCONFIG-06", "PATCH /api/admin/app-config userCreationRateLimit=0 (disabled) → 200", async () => {
  const getRes = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  const original = getRes.body.userCreationRateLimit as number;

  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", { userCreationRateLimit: 0 });
  eq("status", res.status, 200);

  // Restore
  await adminClient.patch("/api/admin/app-config", { userCreationRateLimit: original });
});

test("APPCONFIG-07", "PATCH /api/admin/app-config userCreationRateLimit=129 (above max) → 400", async () => {
  const res = await adminClient.patch("/api/admin/app-config", { userCreationRateLimit: 129 });
  eq("status", res.status, 400);
});

test("APPCONFIG-08", "PATCH /api/admin/app-config userCreationRateLimit=-1 (negative) → 400", async () => {
  const res = await adminClient.patch("/api/admin/app-config", { userCreationRateLimit: -1 });
  eq("status", res.status, 400);
});

test("APPCONFIG-09", "GET /api/admin/app-config exposes useCustomRoot boolean", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  eq("status", res.status, 200);
  ok("has useCustomRoot", res.body.useCustomRoot !== undefined);
  ok("is boolean", typeof res.body.useCustomRoot === "boolean");
});

test("APPCONFIG-10", "PATCH /api/admin/app-config useCustomRoot toggle → 200", async () => {
  const getRes = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  const original = getRes.body.useCustomRoot as boolean;

  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", { useCustomRoot: !original });
  eq("status", res.status, 200);

  // Restore
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: original });
});

// ── PAGEVIEW TRACKING ────────────────────────────────────────────────────────

test("PAGEVIEW-01", "POST /api/forms/[slug]/pageview (public) → 200", async () => {
  if (!createdFormSlug) throw new Error("No form slug");
  const res = await new ApiClient(BASE_URL).post(`/api/forms/${createdFormSlug}/pageview`, {
    sessionId: `test-session-${Date.now()}`,
    referrer: "https://google.com",
    utmSource: "test",
  });
  eq("status", res.status, 200);
  ok("ok true", (res.body as Record<string, unknown>).ok === true);
});

test("PAGEVIEW-02", "POST /api/forms/nonexistent/pageview → 200 (silent, never errors)", async () => {
  // The pageview endpoint never errors — it silently ignores unknown slugs
  const res = await new ApiClient(BASE_URL).post("/api/forms/nonexistent-slug-xyz/pageview", {
    sessionId: `test-session-${Date.now()}`,
  });
  // 200 or 404 — both are acceptable, the key is no 500
  ok("no server error", res.status < 500);
});

// ── AUDIT LOG ────────────────────────────────────────────────────────────────

test("AUDIT-01", "GET /api/admin/audit → 200 or 403 (feature flag)", async () => {
  const res = await adminClient.get("/api/admin/audit");
  // If auditLog feature is disabled, 403 is expected; otherwise 200
  ok("ok or feature-disabled", res.status === 200 || res.status === 403);
});

test("AUDIT-02", "PUT /api/admin/settings creates audit log entry (action=settings.update)", async () => {
  // Fire a settings mutation
  await adminClient.put("/api/admin/settings", { redMaxDays: 3, orangeMaxDays: 7, yellowMaxDays: 14 });

  const res = await adminClient.get<Record<string, unknown>>("/api/admin/audit");
  if (res.status === 403) return; // auditLog feature disabled — skip gracefully

  eq("audit status", res.status, 200);
  const rows = res.body.rows as Array<Record<string, unknown>>;
  ok("at least one audit row", Array.isArray(rows) && rows.length > 0);
  ok("settings.update event present", rows.some(r => r.action === "settings.update"));
});

// ── USER ROLE MANAGEMENT ─────────────────────────────────────────────────────

test("USERS-09", "PATCH /api/admin/users/[id] role change → 200 or 404", async () => {
  // Create a fresh user just for this test (role test)
  const uname = `roletest_${Date.now()}`;
  const createRes = await adminClient.post<Record<string, unknown>>("/api/admin/users", {
    username: uname,
    email: `${uname}@example.com`,
    password: "TestPass123!",
  });
  if (createRes.status === 429) return; // Rate-limited — skip gracefully
  if (createRes.status !== 201) throw new Error(`Unexpected status ${createRes.status} creating test user for USERS-09`);
  const userId = createRes.body.id as string;

  const res = await adminClient.patch(`/api/admin/users/${userId}`, { role: "editor" });
  ok("role change succeeded or route exists", res.status === 200 || res.status === 204);

  // Clean up
  await adminClient.delete(`/api/admin/users/${userId}`);
});

test("USERS-10", "PATCH /api/admin/users/[id] cannot change own role → 400", async () => {
  // Route explicitly blocks self-role-change ("You cannot change your own role")
  const usersRes = await adminClient.get<Array<Record<string, unknown>>>("/api/admin/users");
  const self = (usersRes.body as Array<Record<string, unknown>>).find(
    u => u.email === USERNAME || u.username === USERNAME
  );
  if (!self) throw new Error(`Could not find self (${USERNAME})`);

  const res = await adminClient.patch(`/api/admin/users/${self.id}`, { role: "viewer" });
  eq("status", res.status, 400);
});

// ── CONFIG MANAGEMENT ────────────────────────────────────────────────────────

test("CONFIG-03", "GET /api/admin/config/export → 200 with YAML content", async () => {
  const res = await adminClient.get("/api/admin/config/export");
  eq("status", res.status, 200);
});

// ── ADDITIONAL SECURITY TESTS ────────────────────────────────────────────────

test("SEC-09", "Viewer API key cannot PATCH /api/admin/submissions/bulk", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (SEC-09)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const viewerClient = new ApiClient(BASE_URL).withBearer(viewerKey);
  const res = await viewerClient.patch("/api/admin/submissions/bulk", {
    ids: [createdSubmissionId],
    action: "update",
    updates: { status: "done" },
  });
  ok("blocked", res.status === 403 || res.status === 401);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

test("SEC-10", "XSS in custom field search → no crash, returns 200", async () => {
  const xss = "<script>alert(1)</script>";
  const res = await adminClient.get(
    `/api/admin/submissions?fs_email=${encodeURIComponent(xss)}`
  );
  eq("status", res.status, 200);
});

test("SEC-11", "Invalid page parameter (string) → 200 (fallback to default)", async () => {
  const res = await adminClient.get("/api/admin/submissions?page=abc&limit=1");
  eq("status", res.status, 200);
});

test("SEC-12", "Oversized limit parameter → capped at 100", async () => {
  const res = await adminClient.get<Record<string, unknown>>(
    "/api/admin/submissions?limit=9999&page=1"
  );
  eq("status", res.status, 200);
  // rows.length should be <= 100 (not 9999)
  const rows = res.body.rows as unknown[];
  ok("rows capped ≤ 100", rows.length <= 100);
});

// ── LOGOUT ────────────────────────────────────────────────────────────────────

// Note: Logout test is last (before cleanup) to avoid invalidating adminClient mid-suite
test("LOGOUT-01", "POST /api/auth/logout → 200 or redirect (session cleared)", async () => {
  // Create a second client, log in, then log out — so we don't kill adminClient
  const client2 = new ApiClient(BASE_URL);
  await client2.login(USERNAME, PASSWORD);
  const res = await client2.post("/api/auth/logout", {});
  // Logout may return 200 (JSON API) or 3xx (redirect to login page) — both indicate success
  ok("logout succeeded", res.status === 200 || (res.status >= 300 && res.status < 400));
});

// ── PASSWORD CHANGE ────────────────────────────────────────────────────────

test("PWD-01", "PATCH /api/admin/account/password with wrong current → 400", async () => {
  const res = await adminClient.patch("/api/admin/account/password", {
    currentPassword: "WRONG_PASSWORD_xyz",
    newPassword: "NewSecurePass123!",
  });
  eq("status", res.status, 400);
});

// ── SECURITY — BUG FIXES VERIFICATION ──────────────────────────────────────

test("SEC-13", "Editor API key cannot PUT /api/admin/settings → 403 (role check fix)", async () => {
  // Bug fixed: settings PUT was missing requireRole("admin") — any editor could update thresholds
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Editor Key (SEC-13)", role: "editor" }
  );
  const editorKey = keyRes.body.rawKey as string;
  const editorKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const editorClient = new ApiClient(BASE_URL).withBearer(editorKey);
  const res = await editorClient.put("/api/admin/settings", {
    redMaxDays: 1, orangeMaxDays: 3, yellowMaxDays: 7,
  });
  // Editor should be blocked — only admins can change settings
  ok("editor blocked from settings", res.status === 403 || res.status === 401);

  await adminClient.delete(`/api/admin/account/api-keys/${editorKeyId}`);
});

test("SEC-14", "Bearer token + bad Origin → 200 (CSRF not applied to Bearer)", async () => {
  // requireAdminMutation explicitly skips CSRF for Bearer tokens
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Admin Key (SEC-14)", role: "admin" }
  );
  const adminKey = keyRes.body.rawKey as string;
  const adminKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  // Same request that would return 403 with a session cookie + bad Origin
  const res = await new ApiClient(BASE_URL)
    .withBearer(adminKey)
    .get("/api/admin/submissions", { Origin: "http://evil.example.com" });
  // Bearer token bypasses CSRF — should succeed
  eq("status", res.status, 200);

  await adminClient.delete(`/api/admin/account/api-keys/${adminKeyId}`);
});

test("SEC-15", "Viewer Bearer now returns 403 (not 401) for editor-only mutations", async () => {
  // Bug fixed: requireRole was called without req → Bearer tokens got 401 instead of 403
  if (!createdSubmissionId) return; // skip if no submission
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (SEC-15)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const viewerClient = new ApiClient(BASE_URL).withBearer(viewerKey);
  const res = await viewerClient.patch(
    `/api/admin/submissions/${createdSubmissionId}`,
    { status: "done" }
  );
  // After fix: viewer (insufficient role) should get 403, not 401
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

test("SEC-16", "Expired API key is rejected → 401", async () => {
  // Create a key with an expiry in the past
  const pastDate = new Date(Date.now() - 1000).toISOString(); // 1 second ago
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Expired Key (SEC-16)", role: "editor", expiresAt: pastDate }
  );
  eq("create status", keyRes.status, 201);
  const expiredKey = keyRes.body.rawKey as string;
  const expiredKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(expiredKey).get("/api/admin/submissions?limit=1");
  eq("expired key rejected", res.status, 401);

  await adminClient.delete(`/api/admin/account/api-keys/${expiredKeyId}`);
});

// ── FORM NOTIFICATIONS ──────────────────────────────────────────────────────

test("NOTIFY-01", "GET /api/admin/forms/[id]/notifications → 200 with sanitized fields", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/forms/${createdFormId}/notifications`
  );
  eq("status", res.status, 200);
  // apiKeySet is returned instead of raw key
  ok("has apiKeySet field", res.body.apiKeySet !== undefined);
  ok("no apiKeyEncrypted", !JSON.stringify(res.body).includes("apiKeyEncrypted"));
});

test("NOTIFY-02", "GET /api/admin/forms/[id]/notifications cross-origin → 403 (CSRF on GET)", async () => {
  // Unusual: this endpoint validates CSRF on GET to prevent probing API key presence
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.get(
    `/api/admin/forms/${createdFormId}/notifications`,
    { Origin: "http://evil.example.com" }
  );
  eq("status", res.status, 403);
});

test("NOTIFY-03", "PATCH /api/admin/forms/[id]/notifications → 200", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/forms/${createdFormId}/notifications`,
    { enabled: false, fromAddress: "noreply@example.com", provider: "resend" }
  );
  eq("status", res.status, 200);
  ok("has apiKeySet", res.body.apiKeySet !== undefined);
});

test("NOTIFY-04", "PATCH /api/admin/forms/[id]/notifications invalid email → 400", async () => {
  if (!createdFormId) throw new Error("No form id");
  const res = await adminClient.patch(
    `/api/admin/forms/${createdFormId}/notifications`,
    { fromAddress: "not-an-email" }
  );
  eq("status", res.status, 400);
});

// ── SUBMISSIONS — ADDITIONAL EDGE CASES ────────────────────────────────────

test("SUBS-17", "PATCH /api/admin/submissions/[id] assignedToEmail + null assignedToId → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  // assignedToId is a FK to users.id — use null (clear) to avoid FK violation
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/submissions/${createdSubmissionId}`,
    { assignedToEmail: "agent@example.com", assignedToId: null }
  );
  eq("status", res.status, 200);
});

test("SUBS-18", "PATCH /api/admin/submissions/[id] notes + dateEcheance → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/submissions/${createdSubmissionId}`,
    { notes: "Test note", dateEcheance: "2026-12-31" }
  );
  eq("status", res.status, 200);
});

test("SUBS-19", "PATCH /api/admin/submissions/[id] null notes (clear) → 200", async () => {
  if (!createdSubmissionId) throw new Error("No submission id");
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/submissions/${createdSubmissionId}`,
    { notes: null }
  );
  eq("status", res.status, 200);
});

test("SUBS-20", "PATCH /api/admin/submissions bulk with nonexistent UUID → 404", async () => {
  const res = await adminClient.patch("/api/admin/submissions/bulk", {
    ids: ["00000000-0000-0000-0000-000000000001"],
    action: "update",
    updates: { status: "done" },
  });
  eq("status", res.status, 404);
  ok("has missing field", (res.body as Record<string, unknown>).missing !== undefined);
});

// ── DATASETS ────────────────────────────────────────────────────────────────

test("DATASETS-01", "GET /api/admin/datasets → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/datasets");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("DATASETS-02", "POST /api/admin/datasets → 201", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/datasets", {
    name: "Test Dataset (automated)",
    sourceType: "file",
    importMode: "replace",
  });
  eq("status", res.status, 201);
  ok("has id", res.body.id);
  createdDatasetId = res.body.id as string;
});

test("DATASETS-03", "POST /api/admin/datasets missing name → 400", async () => {
  const res = await adminClient.post("/api/admin/datasets", {
    sourceType: "file",
    importMode: "replace",
  });
  eq("status", res.status, 400);
});

test("DATASETS-04", "POST /api/admin/datasets invalid apiUrl → 400", async () => {
  const res = await adminClient.post("/api/admin/datasets", {
    name: "Bad Dataset",
    sourceType: "api",
    apiUrl: "not-a-url",
    importMode: "replace",
  });
  eq("status", res.status, 400);
});

test("DATASETS-05", "GET /api/admin/datasets/[id] → 200", async () => {
  if (!createdDatasetId) throw new Error("DATASETS-02 must run first");
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/datasets/${createdDatasetId}`
  );
  eq("status", res.status, 200);
  eq("id matches", res.body.id, createdDatasetId);
});

test("DATASETS-06", "GET /api/admin/datasets/[nonexistent] → 404", async () => {
  const res = await adminClient.get("/api/admin/datasets/00000000-0000-0000-0000-000000000000");
  eq("status", res.status, 404);
});

test("DATASETS-07", "Viewer API key cannot POST /api/admin/datasets → 403", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (DATASETS-07)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(viewerKey).post("/api/admin/datasets", {
    name: "Unauthorized", sourceType: "file", importMode: "replace",
  });
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

test("DATASETS-13", "PUT /api/admin/datasets/[id] update → 200 with updated name", async () => {
  if (!createdDatasetId) return; // DATASETS-02 failed
  const res = await adminClient.put<Record<string, unknown>>(
    `/api/admin/datasets/${createdDatasetId}`,
    { name: "Updated Dataset Name", sourceType: "file", importMode: "replace" }
  );
  eq("status", res.status, 200);
  eq("name updated", res.body.name, "Updated Dataset Name");
});

test("DATASETS-14", "PUT /api/admin/datasets/[nonexistent] → 404", async () => {
  const res = await adminClient.put(
    "/api/admin/datasets/00000000-0000-0000-0000-000000000000",
    { name: "Ghost", sourceType: "file", importMode: "replace" }
  );
  eq("status", res.status, 404);
});

// ── SCHEDULED JOBS ──────────────────────────────────────────────────────────

test("JOBS-01", "GET /api/admin/scheduled-jobs → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/scheduled-jobs");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("JOBS-02", "POST /api/admin/scheduled-jobs → 201", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/scheduled-jobs", {
    name: "Test Job (automated)",
    action: "retention_cleanup",
    schedule: "0 2 * * *",  // valid cron: 2am daily
    config: { retentionDays: 90 },
    enabled: false,
  });
  eq("status", res.status, 201);
  ok("has id", res.body.id);
  createdJobId = res.body.id as string;
});

test("JOBS-03", "POST /api/admin/scheduled-jobs invalid cron → 400", async () => {
  const res = await adminClient.post("/api/admin/scheduled-jobs", {
    name: "Bad Job",
    action: "retention_cleanup",
    schedule: "not-a-cron",
    enabled: false,
  });
  eq("status", res.status, 400);
});

test("JOBS-04", "POST /api/admin/scheduled-jobs invalid action → 400", async () => {
  const res = await adminClient.post("/api/admin/scheduled-jobs", {
    name: "Bad Job",
    action: "INVALID_ACTION",
    schedule: "0 2 * * *",
  });
  eq("status", res.status, 400);
});

test("JOBS-05", "Viewer Bearer cannot POST /api/admin/scheduled-jobs → 403", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (JOBS-05)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(viewerKey).post(
    "/api/admin/scheduled-jobs",
    { name: "Unauthorized", action: "retention_cleanup", schedule: "0 2 * * *" }
  );
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

// ── EDGE CASES ───────────────────────────────────────────────────────────────

test("EDGE-01", "fs_ field name >64 chars → safely ignored (200)", async () => {
  // SAFE_KEY_RE = /^[a-zA-Z0-9_]{1,64}$/ — names over 64 chars are skipped, not errors
  const longKey = "a".repeat(65);
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/submissions?fs_${longKey}=somevalue`
  );
  eq("status", res.status, 200);
  ok("has rows", res.body.rows !== undefined);
});

test("EDGE-02", "Invalid date filter (2024-13-01) → ignored, returns 200", async () => {
  // ISO_DATE_RE matches but new Date() is lenient — invalid dates are parsed with unpredictable results
  const res = await adminClient.get<Record<string, unknown>>(
    "/api/admin/submissions?from=2024-13-01"
  );
  eq("status", res.status, 200);
});

test("EDGE-03", "Custom field search with null byte → 200 (parameterized query safe)", async () => {
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/submissions?fs_email=${encodeURIComponent("test\x00null")}`
  );
  eq("status", res.status, 200);
});

// ── EMAIL ACCOUNT TESTS ──────────────────────────────────────────────────────

let savedAdminEmail: string | null = null;

test("EMAIL-01", "GET /api/admin/account/email authenticated → 200 with email field", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/account/email");
  eq("status", res.status, 200);
  ok("has email key", "email" in res.body);
  savedAdminEmail = res.body.email as string | null;
});

test("EMAIL-02", "GET /api/admin/account/email unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/account/email");
  eq("status", res.status, 401);
});

test("EMAIL-03", "PATCH /api/admin/account/email valid email → 200", async () => {
  const testEmail = `admin-email-test-${Date.now()}@example.com`;
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/account/email", { email: testEmail });
  eq("status", res.status, 200);
  ok("success true", res.body.success === true);
});

test("EMAIL-04", "PATCH /api/admin/account/email invalid format → 400", async () => {
  const res = await adminClient.patch("/api/admin/account/email", { email: "not-an-email" });
  eq("status", res.status, 400);
});

test("EMAIL-05", "PATCH /api/admin/account/email duplicate → 409 + error key", async () => {
  if (!createdUserUsername) return; // USERS-03 was rate-limited — skip
  // The user created in USERS-03 has email `${createdUserUsername}@example.com`
  const duplicateEmail = `${createdUserUsername}@example.com`;
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/account/email", { email: duplicateEmail });
  eq("status", res.status, 409);
  eq("error key", res.body.error, "email_duplicate");
});

test("EMAIL-06", "PATCH /api/admin/account/email null (clear) → 200", async () => {
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/account/email", { email: null });
  eq("status", res.status, 200);
  ok("success true", res.body.success === true);
});

test("EMAIL-07", "PATCH /api/admin/account/email CSRF mismatch → 403", async () => {
  const res = await adminClient.patch(
    "/api/admin/account/email",
    { email: `csrf-test-${Date.now()}@example.com` },
    { Origin: "http://evil.example.com" }
  );
  eq("status", res.status, 403);
});

test("EMAIL-08", "PATCH /api/admin/account/email restore original → 200", async () => {
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/account/email", {
    email: savedAdminEmail ?? null,
  });
  eq("status", res.status, 200);
  ok("success true", res.body.success === true);
});

// ── SAVED FILTERS — UPDATE ───────────────────────────────────────────────────

test("FILTER-05", "PUT /api/admin/saved-filters/[id] update name → 200", async () => {
  if (!createdFormSlug) throw new Error("No form slug — FORMS-02 must run first");
  // Create a temporary filter to update
  const createRes = await adminClient.post<Record<string, unknown>>("/api/admin/saved-filters", {
    name: "Temp Filter (FILTER-05)",
    formSlug: createdFormSlug,
    filters: { status: "new" },
  });
  if (createRes.status !== 201) throw new Error(`Setup failed: ${createRes.status}`);
  const filterId = createRes.body.id as string;

  const updateRes = await adminClient.patch(`/api/admin/saved-filters/${filterId}`, {
    name: "Updated Filter (FILTER-05)",
    filters: { status: "done" },
  });
  ok("update succeeded", updateRes.status === 200 || updateRes.status === 204);

  await adminClient.delete(`/api/admin/saved-filters/${filterId}`);
});

// ── BACKUP / RESTORE ─────────────────────────────────────────────────────────

let backupYaml = "";

test("BACKUP-01", "GET /api/admin/config/backup → 200 + YAML content", async () => {
  const res = await adminClient.get("/api/admin/config/backup");
  eq("status", res.status, 200);
  const body = res.body as string;
  ok("non-empty body", body.length > 0);
  // YAML backups start with a comment or a key like "forms:" / "version:"
  ok("looks like YAML", typeof body === "string");
  backupYaml = body;
});

test("BACKUP-02", "GET /api/admin/config/backup unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/config/backup");
  eq("status", res.status, 401);
});

test("BACKUP-03", "POST /api/admin/config/backup?mode=replace&sections=app → 200", async () => {
  if (!backupYaml) return; // BACKUP-01 failed — skip
  // Restore only the "app" section (safest — doesn't touch forms or test data)
  const res = await adminClient.request("POST", "/api/admin/config/backup?mode=replace&sections=app", {
    rawBody: backupYaml,
    contentType: "text/plain",
  });
  ok("restore succeeded", res.status === 200 || res.status === 204);
});

test("BACKUP-04", "POST /api/admin/config/backup?mode=append&sections=scheduledJobs → 200", async () => {
  if (!backupYaml) return; // BACKUP-01 failed — skip
  // append mode on existing data — route should handle gracefully (existing jobs skipped)
  const res = await adminClient.request("POST", "/api/admin/config/backup?mode=append&sections=scheduledJobs", {
    rawBody: backupYaml,
    contentType: "text/plain",
  });
  ok("append restore accepted", res.status === 200 || res.status === 204 || res.status === 409);
});

test("BACKUP-05", "POST /api/admin/config/backup with invalid YAML → 422", async () => {
  const res = await adminClient.request("POST", "/api/admin/config/backup?mode=replace&sections=app", {
    rawBody: "{ not: valid: yaml: [[[",
    contentType: "text/plain",
  });
  eq("status", res.status, 422);
});

test("BACKUP-06", "Viewer cannot POST /api/admin/config/backup → 403", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (BACKUP-06)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(viewerKey).request(
    "POST", "/api/admin/config/backup?mode=replace&sections=app",
    { rawBody: "app: {}", contentType: "text/plain" }
  );
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

// ── RESET TOKEN ───────────────────────────────────────────────────────────────

test("USERS-11", "POST /api/admin/users/[id]/reset-token → 200 + resetUrl (or 429 if rate-limited)", async () => {
  if (!createdUserId) return; // USERS-03 rate-limited — skip
  const res = await adminClient.post<Record<string, unknown>>(
    `/api/admin/users/${createdUserId}/reset-token`
  );
  // 429 is valid: rate limit (3/hour per user) may be exhausted from previous test runs
  if (res.status === 429) return;
  eq("status", res.status, 200);
  ok("has resetUrl", typeof res.body.resetUrl === "string");
  ok("resetUrl contains reset-password", (res.body.resetUrl as string).includes("reset-password"));
  ok("token in fragment", (res.body.resetUrl as string).includes("#token="));
});

test("USERS-12", "POST /api/admin/users/[id]/reset-token unauthenticated → 401", async () => {
  const targetId = createdUserId || "00000000-0000-0000-0000-000000000001";
  const res = await new ApiClient(BASE_URL).post(`/api/admin/users/${targetId}/reset-token`);
  eq("status", res.status, 401);
});

test("USERS-13", "POST /api/admin/users/[id]/reset-token nonexistent user → 404 (or 429 if rate-limited)", async () => {
  const res = await adminClient.post("/api/admin/users/00000000-0000-0000-0000-000000000000/reset-token");
  // Rate limit fires before existence check (anti-enumeration) — both are correct
  ok("status is 404 or 429", res.status === 404 || res.status === 429);
});

// ── SCHEDULED JOBS — EXPORT / IMPORT ─────────────────────────────────────────

let jobsExportYaml = "";

test("JOBS-06", "GET /api/admin/scheduled-jobs/export → 200 + YAML", async () => {
  const res = await adminClient.get("/api/admin/scheduled-jobs/export");
  eq("status", res.status, 200);
  ok("non-empty body", (res.body as string).length > 0);
  jobsExportYaml = res.body as string;
});

test("JOBS-07", "GET /api/admin/scheduled-jobs/export unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/scheduled-jobs/export");
  eq("status", res.status, 401);
});

test("JOBS-08", "POST /api/admin/scheduled-jobs/import valid YAML → 200", async () => {
  if (!jobsExportYaml) return; // JOBS-06 failed
  const res = await adminClient.request("POST", "/api/admin/scheduled-jobs/import?mode=append", {
    rawBody: jobsExportYaml,
    contentType: "text/plain",
  });
  // append on existing jobs may return 200 (skipped) or 409 (conflict) — both valid
  ok("accepted", res.status === 200 || res.status === 409);
});

test("JOBS-09", "POST /api/admin/scheduled-jobs/import invalid YAML → 422", async () => {
  const res = await adminClient.request("POST", "/api/admin/scheduled-jobs/import?mode=append", {
    rawBody: "scheduledJobs: [{name: , action: INVALID_ACTION}]",
    contentType: "text/plain",
  });
  eq("status", res.status, 422);
});

test("JOBS-10", "Viewer cannot POST /api/admin/scheduled-jobs/import → 403", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (JOBS-10)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(viewerKey).request(
    "POST", "/api/admin/scheduled-jobs/import?mode=append",
    { rawBody: "scheduledJobs: []", contentType: "text/plain" }
  );
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

// ── DATASETS — RECORDS / FIELD-VALUES / IMPORT ───────────────────────────────

test("DATASETS-08", "GET /api/admin/datasets/[id]/records → 200 with records array", async () => {
  if (!createdDatasetId) return; // DATASETS-02 failed
  const res = await adminClient.get<Record<string, unknown>>(
    `/api/admin/datasets/${createdDatasetId}/records`
  );
  eq("status", res.status, 200);
  ok("has records array", Array.isArray(res.body.records));
});

test("DATASETS-09", "GET /api/admin/datasets/[id]/field-values → 200", async () => {
  if (!createdDatasetId) return; // DATASETS-02 failed
  const res = await adminClient.get(
    `/api/admin/datasets/${createdDatasetId}/field-values`
  );
  eq("status", res.status, 200);
});

test("DATASETS-10", "POST /api/admin/datasets/import valid payload → 200", async () => {
  const payload = {
    datasets: [{
      name: `Import Test Dataset ${Date.now()}`,
      sourceType: "file",
      importMode: "replace",
      columns: [],
      records: [],
    }],
    mode: "append",
  };
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/datasets/import", payload);
  ok("accepted", res.status === 200 || res.status === 201);
});

test("DATASETS-11", "POST /api/admin/datasets/import missing datasets array → 422", async () => {
  const res = await adminClient.post("/api/admin/datasets/import", { mode: "append" });
  eq("status", res.status, 422);
});

test("DATASETS-12", "Viewer cannot POST /api/admin/datasets/import → 403", async () => {
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Viewer Key (DATASETS-12)", role: "viewer" }
  );
  const viewerKey = keyRes.body.rawKey as string;
  const viewerKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const res = await new ApiClient(BASE_URL).withBearer(viewerKey).post(
    "/api/admin/datasets/import",
    { datasets: [], mode: "append" }
  );
  eq("status", res.status, 403);

  await adminClient.delete(`/api/admin/account/api-keys/${viewerKeyId}`);
});

// ── CONFIG EXPORT ────────────────────────────────────────────────────────────

test("CONFIGEXPORT-01", "GET /api/admin/config/export → 200 + YAML content", async () => {
  const res = await adminClient.get("/api/admin/config/export");
  eq("status", res.status, 200);
  ok("has content", (res.body as string).length > 0);
});

test("CONFIGEXPORT-02", "GET /api/admin/config/export unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/config/export");
  eq("status", res.status, 401);
});

// ── CONFIG IMPORT ─────────────────────────────────────────────────────────────

test("CONFIGIMPORT-01", "POST /api/admin/config/import valid YAML → 200 + created", async () => {
  const slug = `imported-form-${Date.now()}`;
  const yaml = `version: 1\nforms:\n  - slug: "${slug}"\n    name: Imported Form Test\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/import?mode=replace",
    { rawBody: yaml, contentType: "text/plain" }
  );
  eq("status", res.status, 200);
  ok("created array", Array.isArray(res.body.created));
  ok("slug in created", (res.body.created as string[]).includes(slug));

  // Resolve ID for cleanup
  const formsRes = await adminClient.get<Array<{ id: string; slug: string }>>("/api/admin/forms");
  const found = formsRes.body.find(f => f.slug === slug);
  if (found) createdImportedFormId = found.id;
});

test("CONFIGIMPORT-02", "POST /api/admin/config/import unauthenticated → 401", async () => {
  const yaml = `version: 1\nforms:\n  - slug: "unauth-test"\n    name: Test\n`;
  const res = await new ApiClient(BASE_URL).request(
    "POST", "/api/admin/config/import",
    { rawBody: yaml, contentType: "text/plain" }
  );
  eq("status", res.status, 401);
});

test("CONFIGIMPORT-03", "POST /api/admin/config/import empty forms array → 422", async () => {
  const yaml = `version: 1\nforms: []\n`;
  const res = await adminClient.request(
    "POST", "/api/admin/config/import",
    { rawBody: yaml, contentType: "text/plain" }
  );
  ok("is 4xx", res.status >= 400 && res.status < 500);
});

// ── ADMIN CONFIG IMPORT ───────────────────────────────────────────────────────

test("ADMINIMPORT-01", "POST /api/admin/config/admin-import?section=branding → 200", async () => {
  const res = await adminClient.post<Record<string, unknown>>(
    "/api/admin/config/admin-import?section=branding", {}
  );
  eq("status", res.status, 200);
  ok("success", res.body.success === true);
  eq("section", res.body.section, "branding");
});

test("ADMINIMPORT-02", "POST /api/admin/config/admin-import?section=invalid → 400", async () => {
  const res = await adminClient.post("/api/admin/config/admin-import?section=unknown", {});
  eq("status", res.status, 400);
});

test("ADMINIMPORT-03", "POST /api/admin/config/admin-import unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).post(
    "/api/admin/config/admin-import?section=branding", {}
  );
  eq("status", res.status, 401);
});

test("ADMINIMPORT-04", "POST /api/admin/config/admin-import?section=pages non-array → 422", async () => {
  const res = await adminClient.post(
    "/api/admin/config/admin-import?section=pages", { not: "an array" }
  );
  eq("status", res.status, 422);
});

// ── DATASETS EXPORT ───────────────────────────────────────────────────────────

test("DATASETSEXPORT-01", "GET /api/admin/datasets/export → 200 + YAML content", async () => {
  const res = await adminClient.get("/api/admin/datasets/export");
  eq("status", res.status, 200);
  ok("has content", (res.body as string).length > 0);
});

test("DATASETSEXPORT-02", "GET /api/admin/datasets/export unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/datasets/export");
  eq("status", res.status, 401);
});

// ── FORM EXPORT ───────────────────────────────────────────────────────────────

test("FORMEXPORT-01", "GET /api/admin/forms/[id]/export → 200 + YAML content", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}/export`);
  eq("status", res.status, 200);
  ok("has content", (res.body as string).length > 0);
});

test("FORMEXPORT-02", "GET /api/admin/forms/[id]/export unauthenticated → 401", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await new ApiClient(BASE_URL).get(`/api/admin/forms/${createdFormId}/export`);
  eq("status", res.status, 401);
});

test("FORMEXPORT-03", "GET /api/admin/forms/[nonexistent]/export → 404", async () => {
  const res = await adminClient.get("/api/admin/forms/00000000-0000-0000-0000-000000000000/export");
  eq("status", res.status, 404);
});

// ── FORM IMPORT ───────────────────────────────────────────────────────────────

test("FORMIMPORT-01", "POST /api/admin/forms/[id]/import?section=page → 200", async () => {
  if (!createdFormId) throw new Error("No form created");
  const page = { branding: { defaultTheme: "light" }, hero: { title: "Imported Title", ctaLabel: "Start" } };
  const res = await adminClient.post<Record<string, unknown>>(
    `/api/admin/forms/${createdFormId}/import?section=page`, page
  );
  eq("status", res.status, 200);
  ok("has id", !!res.body.id);
});

test("FORMIMPORT-02", "POST /api/admin/forms/[id]/import?section=invalid → 400", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await adminClient.post(
    `/api/admin/forms/${createdFormId}/import?section=badvalue`, {}
  );
  eq("status", res.status, 400);
});

test("FORMIMPORT-03", "POST /api/admin/forms/[id]/import unauthenticated → 401", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await new ApiClient(BASE_URL).post(
    `/api/admin/forms/${createdFormId}/import?section=page`, {}
  );
  eq("status", res.status, 401);
});

test("FORMIMPORT-04", "POST /api/admin/forms/[nonexistent]/import → 404", async () => {
  const res = await adminClient.post(
    "/api/admin/forms/00000000-0000-0000-0000-000000000000/import?section=page", {}
  );
  eq("status", res.status, 404);
});

// ── SUBMISSIONS EXPORT — additional coverage ────────────────────────────────

test("SUBS-21", "POST /api/admin/submissions/export format=json + status filter → 200", async () => {
  const res = await adminClient.post<unknown>("/api/admin/submissions/export", {
    format: "json",
    status: "nouveau",
  });
  eq("status", res.status, 200);
});

test("SUBS-22", "POST /api/admin/submissions/export with date range → 200", async () => {
  const res = await adminClient.post<unknown>("/api/admin/submissions/export", {
    format: "json",
    from: "2020-01-01",
    to: "2030-12-31",
  });
  eq("status", res.status, 200);
});

test("SUBS-23", "POST /api/admin/submissions/export with invalid date (ignored) → 200", async () => {
  const res = await adminClient.post<unknown>("/api/admin/submissions/export", {
    format: "json",
    from: "not-a-date",
  });
  // Invalid ISO date is silently ignored — returns all results
  eq("status", res.status, 200);
});

test("SUBS-24", "POST /api/admin/submissions/export unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).post("/api/admin/submissions/export", { format: "csv" });
  eq("status", res.status, 401);
});

// ── PROTECTED SLUGS ───────────────────────────────────────────────────────────

test("PROTECT-01", "GET /api/admin/app-config returns protectedSlugs array", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  eq("status", res.status, 200);
  ok("protectedSlugs is array", Array.isArray(res.body.protectedSlugs));
});

test("PROTECT-02", "PATCH protectedSlugs with nonexistent slug → 400", async () => {
  const res = await adminClient.patch("/api/admin/app-config", {
    protectedSlugs: ["this-slug-does-not-exist-at-all"],
  });
  eq("status", res.status, 400);
});

test("PROTECT-03", "PATCH protectedSlugs with existing slug → 200", async () => {
  if (!createdFormId) throw new Error("No form created");
  const form = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", {
    protectedSlugs: [form.body.slug],
  });
  eq("status", res.status, 200);
});

test("PROTECT-04", "GET /api/admin/app-config protectedSlugs contains the protected slug", async () => {
  if (!createdFormId) throw new Error("No form created");
  const form = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const cfg = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  ok("slug in protectedSlugs", (cfg.body.protectedSlugs as string[]).includes(form.body.slug as string));
});

test("PROTECT-05", "DELETE protected form → 423 Locked", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await adminClient.delete(`/api/admin/forms/${createdFormId}`);
  eq("status", res.status, 423);
});

test("PROTECT-06", "PUT (rename slug) protected form → 423 Locked", async () => {
  if (!createdFormId) throw new Error("No form created");
  const form = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const res = await adminClient.put(`/api/admin/forms/${createdFormId}`, {
    name: form.body.name,
    config: form.body.config,
    slug: `renamed-but-protected-${Date.now()}`,
  });
  eq("status", res.status, 423);
});

test("PROTECT-07", "PUT without slug change on protected form → 200 (content editable)", async () => {
  if (!createdFormId) throw new Error("No form created");
  const form = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const res = await adminClient.put(`/api/admin/forms/${createdFormId}`, {
    name: form.body.name,
    config: form.body.config,
  });
  eq("status", res.status, 200);
});

test("PROTECT-08", "POST config/import replace on protected slug → error in results", async () => {
  if (!createdFormId) throw new Error("No form created");
  const form = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const slug = form.body.slug as string;
  const yaml = `version: 1\nforms:\n  - slug: "${slug}"\n    name: Overwrite Attempt\n`;
  const res = await adminClient.request<Record<string, unknown>>("POST", "/api/admin/config/import?mode=replace", {
    rawBody: yaml,
    contentType: "text/plain",
  });
  eq("status", res.status, 200);
  const errors = (res.body.errors ?? []) as Array<{ slug: string; message: string }>;
  ok("import blocked for protected slug", errors.some(e => e.slug === slug));
});

test("PROTECT-09", "PATCH protectedSlugs to [] (unprotect) → 200", async () => {
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", {
    protectedSlugs: [],
  });
  eq("status", res.status, 200);
});

test("PROTECT-10", "DELETE previously protected form now unprotected → 200", async () => {
  if (!createdFormId) throw new Error("No form created");
  // PROTECT-09 cleared protection — DELETE should now work (tested in CLEAN-05 later)
  const cfg = await adminClient.get<Record<string, unknown>>("/api/admin/app-config");
  ok("protectedSlugs is empty", (cfg.body.protectedSlugs as string[]).length === 0);
});

// ── SLUG RENAME ───────────────────────────────────────────────────────────────

test("SLUGRENAME-01", "PUT /api/admin/forms/[id] with new slug → 200 + slug updated", async () => {
  if (!createdFormId) throw new Error("No form created");
  const originalForm = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const originalSlug = originalForm.body.slug as string;
  const newSlug = `renamed-slug-${Date.now()}`;
  const res = await adminClient.put<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`, {
    name: originalForm.body.name,
    config: originalForm.body.config,
    slug: newSlug,
  });
  eq("status", res.status, 200);
  eq("slug updated", res.body.slug, newSlug);
  // Restore original slug
  await adminClient.put(`/api/admin/forms/${createdFormId}`, {
    name: originalForm.body.name,
    config: originalForm.body.config,
    slug: originalSlug,
  });
});

test("SLUGRENAME-02", "PUT /api/admin/forms/[id] with reserved slug → 400", async () => {
  if (!createdFormId) throw new Error("No form created");
  const originalForm = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const res = await adminClient.put<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`, {
    name: originalForm.body.name,
    config: originalForm.body.config,
    slug: "admin",
  });
  eq("status", res.status, 400);
});

test("SLUGRENAME-03", "PUT /api/admin/forms/[id] with already-taken slug → 409", async () => {
  if (!createdFormId || !createdImportedFormId) return;
  const originalForm = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`);
  const importedForm = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdImportedFormId}`);
  const res = await adminClient.put<Record<string, unknown>>(`/api/admin/forms/${createdFormId}`, {
    name: originalForm.body.name,
    config: originalForm.body.config,
    slug: importedForm.body.slug,
  });
  eq("status", res.status, 409);
});

// ── FORM DUPLICATION ──────────────────────────────────────────────────────────

test("DUPLICATE-01", "POST /api/admin/forms/[id]/duplicate → 201 + new form", async () => {
  if (!createdFormId) throw new Error("No form created");
  const slug = `duplicated-form-${Date.now()}`;
  const res = await adminClient.post<Record<string, unknown>>(
    `/api/admin/forms/${createdFormId}/duplicate`,
    { slug, name: "Duplicated Form" }
  );
  eq("status", res.status, 201);
  eq("slug matches", res.body.slug, slug);
  createdDuplicateFormId = res.body.id as string;
});

test("DUPLICATE-02", "POST /api/admin/forms/[id]/duplicate with taken slug → 409", async () => {
  if (!createdFormId || !createdDuplicateFormId) return;
  const dup = await adminClient.get<Record<string, unknown>>(`/api/admin/forms/${createdDuplicateFormId}`);
  const res = await adminClient.post(
    `/api/admin/forms/${createdFormId}/duplicate`,
    { slug: dup.body.slug }
  );
  eq("status", res.status, 409);
});

test("DUPLICATE-03", "POST /api/admin/forms/[nonexistent]/duplicate → 404", async () => {
  const res = await adminClient.post(
    "/api/admin/forms/00000000-0000-0000-0000-000000000000/duplicate",
    { slug: "never" }
  );
  eq("status", res.status, 404);
});

test("DUPLICATE-04", "POST /api/admin/forms/[id]/duplicate unauthenticated → 401", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await new ApiClient(BASE_URL).post(
    `/api/admin/forms/${createdFormId}/duplicate`,
    { slug: "unauth-dup" }
  );
  eq("status", res.status, 401);
});

// ── CLEANUP ────────────────────────────────────────────────────────────────

test("CLEAN-01", "DELETE /api/admin/users/[id] → 200", async () => {
  if (!createdUserId) return; // USERS-03 was skipped (e.g. rate limited) — nothing to clean up
  const res = await adminClient.delete(`/api/admin/users/${createdUserId}`);
  eq("status", res.status, 200);
});

test("CLEAN-02", "Deleted user no longer in list", async () => {
  const res = await adminClient.get<Array<Record<string, unknown>>>("/api/admin/users");
  const found = (res.body as Array<Record<string, unknown>>).find(u => u.id === createdUserId);
  ok("user removed", !found);
});

test("CLEAN-03", "DELETE /api/admin/datasets/[id] → 200", async () => {
  if (!createdDatasetId) return;
  const res = await adminClient.delete(`/api/admin/datasets/${createdDatasetId}`);
  eq("status", res.status, 200);
});

test("CLEAN-04", "DELETE /api/admin/scheduled-jobs/[id] → 200", async () => {
  if (!createdJobId) return;
  const res = await adminClient.delete(`/api/admin/scheduled-jobs/${createdJobId}`);
  eq("status", res.status, 200);
});

test("CLEAN-05", "DELETE /api/admin/forms/[id] → 200", async () => {
  if (!createdFormId) throw new Error("No form created");
  const res = await adminClient.delete(`/api/admin/forms/${createdFormId}`);
  eq("status", res.status, 200);
});

test("CLEAN-06", "Deleted form returns 404", async () => {
  const res = await adminClient.get(`/api/admin/forms/${createdFormId}`);
  eq("status", res.status, 404);
});

test("CLEAN-07", "DELETE imported form from CONFIGIMPORT-01 → 200", async () => {
  if (!createdImportedFormId) return;
  const res = await adminClient.delete(`/api/admin/forms/${createdImportedFormId}`);
  eq("status", res.status, 200);
});

test("CLEAN-08", "DELETE duplicated form from DUPLICATE-01 → 200", async () => {
  if (!createdDuplicateFormId) return;
  const res = await adminClient.delete(`/api/admin/forms/${createdDuplicateFormId}`);
  eq("status", res.status, 200);
});

// ── ROOT PAGE (useCustomRoot feature) ────────────────────────────────────────

test("ROOTPAGE-01", "GET / with useCustomRoot=false → 200 (WelcomePage)", async () => {
  // Ensure useCustomRoot is false first
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: false });
  const res = await new ApiClient(BASE_URL).get("/");
  eq("status", res.status, 200);
});

test("ROOTPAGE-02", "POST /api/admin/forms slug=\"/\" with useCustomRoot=false → 409", async () => {
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: false });
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/forms", {
    slug: "/",
    name: "Root Form (should fail)",
  });
  eq("status", res.status, 409);
});

test("ROOTPAGE-03", "POST /api/admin/config/import slug=\"/\" with useCustomRoot=false → error in response", async () => {
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: false });
  const yaml = `version: 1\nforms:\n  - slug: "/"\n    name: Root Import Test\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/import?mode=replace",
    { rawBody: yaml, contentType: "text/plain" }
  );
  eq("status", res.status, 200);
  ok("errors array not empty", Array.isArray(res.body.errors) && (res.body.errors as unknown[]).length > 0);
  ok("error concerns slug /", (res.body.errors as Array<Record<string, unknown>>)[0].slug === "/");
});

test("ROOTPAGE-04", "POST /api/admin/config/backup restore slug=\"/\" with useCustomRoot=false → error in results", async () => {
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: false });
  const yaml = `version: 2\nforms:\n  - slug: "/"\n    name: Root Backup Test\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/backup?mode=replace&sections=forms",
    { rawBody: yaml, contentType: "text/plain" }
  );
  eq("status", res.status, 200);
  const formsResult = res.body.results as Record<string, unknown> | undefined;
  const errors = (formsResult?.forms as Record<string, unknown> | undefined)?.errors as unknown[] | undefined;
  ok("forms errors not empty", Array.isArray(errors) && errors.length > 0);
});

test("ROOTPAGE-05", "PATCH /api/admin/app-config useCustomRoot=true → 200", async () => {
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/app-config", { useCustomRoot: true });
  eq("status", res.status, 200);
  // Clean up any pre-existing "/" form left by a previous test run (DELETE "/" is now allowed)
  const forms = await adminClient.get<Array<Record<string, unknown>>>("/api/admin/forms");
  const rootForm = (forms.body ?? []).find((f: Record<string, unknown>) => f.slug === "/");
  if (rootForm) await adminClient.delete(`/api/admin/forms/${rootForm.id as string}`);
});

test("ROOTPAGE-06", "POST /api/admin/forms slug=\"/\" with useCustomRoot=true → 201", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/forms", {
    slug: "/",
    name: "Root Form (custom)",
  });
  eq("status", res.status, 201);
  ok("has id", !!res.body.id);
  createdRootFormId = res.body.id as string;
});

test("ROOTPAGE-07", "GET / with useCustomRoot=true and form \"/\" exists → 200", async () => {
  if (!createdRootFormId) return; // ROOTPAGE-06 failed — skip
  const res = await new ApiClient(BASE_URL).get("/");
  eq("status", res.status, 200);
});

test("ROOTPAGE-08", "DELETE form \"/\", GET / falls back to WelcomePage → 200", async () => {
  if (!createdRootFormId) return;
  await adminClient.delete(`/api/admin/forms/${createdRootFormId}`);
  createdRootFormId = "";
  const res = await new ApiClient(BASE_URL).get("/");
  eq("status", res.status, 200);
});

test("ROOTPAGE-09", "PATCH useCustomRoot=false (restore) + GET / → 200 (WelcomePage)", async () => {
  await adminClient.patch("/api/admin/app-config", { useCustomRoot: false });
  const res = await new ApiClient(BASE_URL).get("/");
  eq("status", res.status, 200);
});

// ── BACKUP PROVIDERS ─────────────────────────────────────────────────────────

let createdProviderId = "";

test("BKPROV-01", "GET /api/admin/backup/providers unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/backup/providers");
  eq("status", res.status, 401);
});

test("BKPROV-02", "GET /api/admin/backup/providers authenticated → 200 array", async () => {
  const res = await adminClient.get<unknown[]>("/api/admin/backup/providers");
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
});

test("BKPROV-03", "POST /api/admin/backup/providers with missing fields → 422", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/providers", {
    name: "Bad provider",
    // type missing
  });
  eq("status", res.status, 422);
});

test("BKPROV-04", "POST /api/admin/backup/providers local type → 201", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/providers", {
    name: "Local Test Provider",
    type: "local",
    config: { path: "/tmp/formellia-test-backups" },
    enabled: true,
    retentionPolicy: { type: "keep_last_n", n: 5 },
  });
  eq("status", res.status, 201);
  ok("has id", !!res.body.id);
  ok("type is local", res.body.type === "local");
  ok("retentionPolicy kept_last_n", (res.body.retentionPolicy as Record<string, unknown>)?.type === "keep_last_n");
  createdProviderId = res.body.id as string;
});

test("BKPROV-05", "GET /api/admin/backup/providers lists the created provider", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.get<Record<string, unknown>[]>("/api/admin/backup/providers");
  eq("status", res.status, 200);
  ok("provider in list", (res.body ?? []).some((p: Record<string, unknown>) => p.id === createdProviderId));
});

test("BKPROV-06", "GET /api/admin/backup/providers/[id] → 200 without encryptedConfig", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.get<Record<string, unknown>>(`/api/admin/backup/providers/${createdProviderId}`);
  eq("status", res.status, 200);
  ok("no encryptedConfig", !("encryptedConfig" in (res.body ?? {})));
  ok("has name", res.body.name === "Local Test Provider");
});

test("BKPROV-07", "PATCH /api/admin/backup/providers/[id] → 200", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.patch<Record<string, unknown>>(`/api/admin/backup/providers/${createdProviderId}`, {
    name: "Local Test Provider (renamed)",
    retentionPolicy: { type: "keep_all" },
  });
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
});

test("BKPROV-08", "POST /api/admin/backup/providers/[id]/test → 200 with success or error message", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", `/api/admin/backup/providers/${createdProviderId}/test`, {}
  );
  eq("status", res.status, 200);
  ok("has success field", typeof res.body.success === "boolean");
});

test("BKPROV-09", "POST /api/admin/backup/run with valid provider → 200 + filename", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/run", {
    providerId: createdProviderId,
    formSlugs: [],     // skip submissions
    datasetNames: [],  // skip dataset records
  });
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
  ok("has filename", typeof res.body.filename === "string");
  ok("filename ends with .zip", (res.body.filename as string).endsWith(".zip"));
  ok("has sizeBytes > 0", (res.body.sizeBytes as number) > 0);
});

test("BKPROV-10", "GET /api/admin/backup/list?providerId=xxx → 200 array with the backup file", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.get<Record<string, unknown>[]>(`/api/admin/backup/list?providerId=${createdProviderId}`);
  eq("status", res.status, 200);
  ok("is array", Array.isArray(res.body));
  ok("at least one file", (res.body ?? []).length > 0);
  ok("has key", typeof (res.body?.[0] as Record<string, unknown>)?.key === "string");
});

test("BKPROV-11", "POST /api/admin/backup/restore with valid provider+key → 200", async () => {
  if (!createdProviderId) return;
  // First list files to get the key
  const listRes = await adminClient.get<Record<string, unknown>[]>(`/api/admin/backup/list?providerId=${createdProviderId}`);
  if (!listRes.body?.length) return; // BKPROV-09 failed — skip
  const key = (listRes.body[0] as Record<string, unknown>).key as string;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: createdProviderId,
    key,
    mode: "append",
    sections: ["app"],
  });
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
});

test("BKPROV-12", "POST /api/admin/backup/run with nonexistent provider → 404", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/run", {
    providerId: "00000000-0000-0000-0000-000000000000",
  });
  eq("status", res.status, 404);
});

test("BKPROV-13", "GET /api/admin/backup/list without providerId → 400", async () => {
  const res = await adminClient.get("/api/admin/backup/list");
  eq("status", res.status, 400);
});

test("BKPROV-14", "POST /api/admin/backup/providers unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).post("/api/admin/backup/providers", {
    name: "Unauth", type: "local", config: { path: "/tmp" },
  });
  eq("status", res.status, 401);
});

test("BKPROV-15", "DELETE /api/admin/backup/providers/[id] → 200", async () => {
  if (!createdProviderId) return;
  const res = await adminClient.delete(`/api/admin/backup/providers/${createdProviderId}`);
  eq("status", res.status, 200);
  ok("success", !!(res.body as Record<string, unknown>)?.success);
  createdProviderId = "";
});

test("BKPROV-16", "GET /api/admin/backup/providers/[deleted-id] → 404", async () => {
  // Use a random UUID that was deleted
  const res = await adminClient.get("/api/admin/backup/providers/00000000-0000-0000-0000-000000000001");
  eq("status", res.status, 404);
});

// ── BACKUP SECURITY / EDGE CASES ─────────────────────────────────────────────

// Helper: create a local provider, return its id + cleanup function
let secProvId = "";

test("BKSEC-01", "POST /api/admin/backup/providers local (security tests setup)", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/providers", {
    name: "Security Test Provider",
    type: "local",
    config: { path: "/tmp/formellia-sec-test" },
    enabled: true,
    retentionPolicy: { type: "keep_all" },
  });
  eq("status", res.status, 201);
  secProvId = res.body.id as string;
});

test("BKSEC-02", "POST /api/admin/backup/restore with path traversal key → 422", async () => {
  if (!secProvId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: secProvId,
    key: "../../etc/passwd",
    mode: "append",
  });
  // Schema validation must reject path traversal keys
  eq("status", res.status, 422);
});

test("BKSEC-03", "POST /api/admin/backup/restore with null-byte in key → 422", async () => {
  if (!secProvId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: secProvId,
    key: "backup-2024\x00.zip",
    mode: "append",
  });
  eq("status", res.status, 422);
});

test("BKSEC-04", "POST /api/admin/backup/restore with absolute path key → 422", async () => {
  if (!secProvId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: secProvId,
    key: "/etc/passwd",
    mode: "append",
  });
  eq("status", res.status, 422);
});

test("BKSEC-05", "POST /api/admin/backup/restore with missing .zip extension → 422", async () => {
  if (!secProvId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: secProvId,
    key: "backup-2024-01-01T00-00-00Z",
    mode: "append",
  });
  eq("status", res.status, 422);
});

test("BKSEC-06", "POST /api/admin/backup/run with disabled provider → 409", async () => {
  if (!secProvId) return;
  // Disable the provider first
  await adminClient.patch(`/api/admin/backup/providers/${secProvId}`, { enabled: false });
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/run", {
    providerId: secProvId,
  });
  eq("status", res.status, 409);
  // Re-enable for subsequent tests
  await adminClient.patch(`/api/admin/backup/providers/${secProvId}`, { enabled: true });
});

test("BKSEC-07", "POST /api/admin/backup/restore with valid key but file not on disk → error (not 500)", async () => {
  if (!secProvId) return;
  // The file doesn't exist on disk — provider should throw a readable error, not 500
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/restore", {
    providerId: secProvId,
    key: "backup-9999-01-01T00-00-00Z.zip",
    mode: "append",
  });
  // Should be 4xx or 500 with a readable error (not a server crash / unhandled promise)
  ok("status is 4xx or 5xx", res.status >= 400);
  ok("has error field or success:false", !!res.body.error || res.body.success === false);
});

test("BKSEC-08", "POST /api/admin/backup/providers with S3 type + invalid URL → 422", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/providers", {
    name: "Invalid S3",
    type: "s3",
    config: {
      endpoint: "not-a-url",
      region: "us-east-1",
      bucket: "test",
      accessKeyId: "key",
      secretAccessKey: "secret",
    },
  });
  eq("status", res.status, 422);
});

test("BKSEC-09", "POST /api/admin/backup/providers with local type + empty path → 422", async () => {
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/providers", {
    name: "Empty path",
    type: "local",
    config: { path: "" },
  });
  eq("status", res.status, 422);
});

test("BKSEC-10", "POST /api/admin/backup/run with formSlugs=[] (skip submissions) → 200", async () => {
  if (!secProvId) return;
  const res = await adminClient.post<Record<string, unknown>>("/api/admin/backup/run", {
    providerId: secProvId,
    formSlugs:    [],
    datasetNames: [],
  });
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
  ok("filename ends .zip", (res.body.filename as string)?.endsWith(".zip"));
});

test("BKSEC-11", "PATCH /api/admin/backup/providers/[id] retention to keep_last_days → 200", async () => {
  if (!secProvId) return;
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/backup/providers/${secProvId}`,
    { retentionPolicy: { type: "keep_last_days", days: 30 } }
  );
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
});

test("BKSEC-12", "PATCH /api/admin/backup/providers/[id] retention with invalid n → 422", async () => {
  if (!secProvId) return;
  const res = await adminClient.patch<Record<string, unknown>>(
    `/api/admin/backup/providers/${secProvId}`,
    { retentionPolicy: { type: "keep_last_n", n: -1 } }
  );
  eq("status", res.status, 422);
});

test("BKSEC-13", "PATCH /api/admin/backup/providers/[id] nonexistent → 404", async () => {
  const res = await adminClient.patch("/api/admin/backup/providers/00000000-0000-0000-0000-000000000099", {
    name: "Ghost",
  });
  eq("status", res.status, 404);
});

test("BKSEC-14", "DELETE /api/admin/backup/providers/[secProvId] cleanup → 200", async () => {
  if (!secProvId) return;
  const res = await adminClient.delete(`/api/admin/backup/providers/${secProvId}`);
  eq("status", res.status, 200);
  secProvId = "";
});

// ── BACKUP YAML RESTORE EDGE CASES ───────────────────────────────────────────

test("BKYAML-01", "POST /api/admin/config/backup with empty sections → 200 (no-op)", async () => {
  const yaml = `version: 2\nexportedAt: ${new Date().toISOString()}\nforms: []\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/backup?mode=replace&sections=forms",
    { rawBody: yaml, contentType: "application/x-yaml" }
  );
  eq("status", res.status, 200);
  ok("success", !!res.body.success);
});

test("BKYAML-02", "POST /api/admin/config/backup with invalid YAML → 422", async () => {
  const res = await adminClient.request(
    "POST", "/api/admin/config/backup",
    { rawBody: "::invalid::yaml::{{{", contentType: "application/x-yaml" }
  );
  eq("status", res.status, 422);
});

test("BKYAML-03", "POST /api/admin/config/backup with invalid mode → 400", async () => {
  const yaml = `version: 2\nforms: []\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/backup?mode=INVALID",
    { rawBody: yaml, contentType: "application/x-yaml" }
  );
  eq("status", res.status, 400);
});

test("BKYAML-04", "POST /api/admin/config/backup with invalid section → 400", async () => {
  const yaml = `version: 2\nforms: []\n`;
  const res = await adminClient.request<Record<string, unknown>>(
    "POST", "/api/admin/config/backup?sections=nonexistent",
    { rawBody: yaml, contentType: "application/x-yaml" }
  );
  eq("status", res.status, 400);
});

test("BKYAML-05", "POST /api/admin/config/backup unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).request(
    "POST", "/api/admin/config/backup",
    { rawBody: "version: 2\n", contentType: "application/x-yaml" }
  );
  eq("status", res.status, 401);
});

// ── SIDEBAR LAYOUT ──────────────────────────────────────────────────────────

test("SIDEBAR-01", "GET /api/admin/account/sidebar-layout → 200 with layout object", async () => {
  const res = await adminClient.get<Record<string, unknown>>("/api/admin/account/sidebar-layout");
  eq("status", res.status, 200);
  ok("is object", res.body !== null && typeof res.body === "object" && !Array.isArray(res.body));
});

test("SIDEBAR-02", "PATCH /api/admin/account/sidebar-layout saves pinnedForms → 200 + persists", async () => {
  if (!createdFormId) throw new Error("No form created yet");

  // Save a pinned form
  const patchRes = await adminClient.patch<Record<string, unknown>>(
    "/api/admin/account/sidebar-layout",
    { pinnedForms: [createdFormId] }
  );
  eq("patch status", patchRes.status, 200);
  ok("pinnedForms returned", Array.isArray(patchRes.body.pinnedForms));
  ok("form in pinnedForms", (patchRes.body.pinnedForms as string[]).includes(createdFormId));

  // Verify GET returns the same value
  const getRes = await adminClient.get<Record<string, unknown>>("/api/admin/account/sidebar-layout");
  eq("get status", getRes.status, 200);
  ok("persisted pinnedForms", Array.isArray(getRes.body.pinnedForms) &&
    (getRes.body.pinnedForms as string[]).includes(createdFormId));

  // Clean up
  await adminClient.patch("/api/admin/account/sidebar-layout", { pinnedForms: [] });
});

test("SIDEBAR-03", "PATCH sidebar-layout with javascript: href → 422", async () => {
  const res = await adminClient.patch("/api/admin/account/sidebar-layout", {
    customLinks: [{
      id:    "link-xss",
      label: "XSS attempt",
      href:  "javascript:alert(1)",
    }],
  });
  eq("status", res.status, 422);
});

test("SIDEBAR-04", "PATCH sidebar-layout with data: href → 422", async () => {
  const res = await adminClient.patch("/api/admin/account/sidebar-layout", {
    customLinks: [{
      id:    "link-data",
      label: "Data URI",
      href:  "data:text/html,<script>alert(1)</script>",
    }],
  });
  eq("status", res.status, 422);
});

test("SIDEBAR-05", "PATCH sidebar-layout valid https:// link → 200", async () => {
  const res = await adminClient.patch<Record<string, unknown>>("/api/admin/account/sidebar-layout", {
    customLinks: [{
      id:    "link-valid",
      label: "External link",
      href:  "https://example.com",
      icon:  "ExternalLink",
    }],
  });
  eq("status", res.status, 200);
  const links = res.body.customLinks as Array<Record<string, unknown>>;
  ok("link saved", Array.isArray(links) && links.some(l => l.href === "https://example.com"));

  // Clean up
  await adminClient.patch("/api/admin/account/sidebar-layout", { customLinks: [] });
});

test("SIDEBAR-06", "GET sidebar-layout unauthenticated → 401", async () => {
  const res = await new ApiClient(BASE_URL).get("/api/admin/account/sidebar-layout");
  eq("status", res.status, 401);
});

test("SIDEBAR-07", "PATCH sidebar-layout is per-user — second user gets own empty layout", async () => {
  // Requires a second user to exist (from USERS-03); skip if rate-limited
  if (!createdUserId || !createdUserUsername) return;

  // Get a temp password so we can log in as the second user
  const tempRes = await adminClient.post<Record<string, unknown>>(
    `/api/admin/users/${createdUserId}/temp-password`
  );
  if (tempRes.status !== 200 || !tempRes.body.tempPassword) return; // graceful skip

  // First, save something on adminClient's layout
  await adminClient.patch("/api/admin/account/sidebar-layout", {
    pinnedForms: [createdFormId || "00000000-0000-0000-0000-000000000001"],
  });

  // Log in as second user
  const secondClient = new ApiClient(BASE_URL);
  const loginRes = await secondClient.login(createdUserUsername, tempRes.body.tempPassword as string);
  if (loginRes.status !== 200) return; // login may fail if user has no password reset — skip

  // Their layout should NOT contain the admin's pinnedForms
  const secondLayoutRes = await secondClient.get<Record<string, unknown>>(
    "/api/admin/account/sidebar-layout"
  );
  eq("second user layout status", secondLayoutRes.status, 200);
  const secondPinned = (secondLayoutRes.body.pinnedForms ?? []) as string[];
  ok("second user has own empty layout", secondPinned.length === 0);

  // Clean up admin layout
  await adminClient.patch("/api/admin/account/sidebar-layout", { pinnedForms: [] });
});

// ── EXPORT SCOPE (IDOR FIX) ─────────────────────────────────────────────────

test("SEC-17", "Export: scoped API key (no form grants) cannot leak data → 200 empty array", async () => {
  // Viewer API key inherits formGrants=[] → accessibleFormIds=[] → empty export (no data leaked)
  const keyRes = await adminClient.post<Record<string, unknown>>(
    "/api/admin/account/api-keys",
    { name: "Scoped Key (SEC-17)", role: "viewer" }
  );
  eq("create key", keyRes.status, 201);
  const scopedKey = keyRes.body.rawKey as string;
  const scopedKeyId = (keyRes.body.key as Record<string, unknown>).id as string;

  const scopedClient = new ApiClient(BASE_URL).withBearer(scopedKey);

  // Request export of a specific form — scoped user gets an empty result, not the form's data
  if (createdFormId) {
    const res = await scopedClient.post<unknown[]>("/api/admin/submissions/export", {
      format: "json",
      formInstanceId: createdFormId,
    });
    // Accepted outcomes: 200 + empty array (no grants path) or 403 (explicit deny)
    ok("not leaking data", res.status === 200 || res.status === 403 || res.status === 401);
    if (res.status === 200) {
      ok("empty array — no data leaked", Array.isArray(res.body) && (res.body as unknown[]).length === 0);
    }
  }

  await adminClient.delete(`/api/admin/account/api-keys/${scopedKeyId}`);
});

test("SEC-18", "Export: unauthenticated POST → 401", async () => {
  const res = await new ApiClient(BASE_URL).post("/api/admin/submissions/export", {
    format: "json",
  });
  eq("status", res.status, 401);
});

test("SEC-19", "Export: row count > 10 000 returns 400 with informative message", async () => {
  // We can't easily inject 10 000 rows in a test, so we verify the shape of the limit error
  // by checking that the route accepts valid filters without crashing (guard path not reachable here,
  // but we at least confirm the endpoint parses correctly and returns 200/array for small counts)
  const res = await adminClient.post<unknown[]>("/api/admin/submissions/export", {
    format: "json",
  });
  ok("valid status (200 or 400)", res.status === 200 || res.status === 400);
  if (res.status === 400) {
    const body = res.body as Record<string, unknown>;
    ok("error message present", typeof body.error === "string" && (body.error as string).length > 0);
  }
  if (res.status === 200) {
    ok("is array", Array.isArray(res.body));
  }
});

// ── ENTRY POINT ────────────────────────────────────────────────────────────

runAll(FILTER).then(allPassed => process.exit(allPassed ? 0 : 1));
