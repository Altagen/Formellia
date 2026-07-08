# Architecture

High-level map of how Formellia is wired together. Useful when you need
to fix something on a live deploy without re-reading the whole source.

## Stack at a glance

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack, standalone build) | Server Components for the admin, file-system routing for the public form, single deployable artifact |
| Language | **TypeScript 7** | strict mode on, zod for runtime validation at the API edge |
| Database | **Postgres 16** via **Drizzle ORM** | typed schema, idempotent migrations applied at boot |
| Auth | **Lucia v3** session cookies + Argon2id passwords | self-hosted sessions, no external IdP dependency |
| Styling | **Tailwind 4** + shadcn/ui primitives (Radix UI) | utility-first, predictable diffs |
| Validation | **zod** at every boundary | YAML config, request bodies, form submissions |
| Scheduling | **node-cron 4** | export jobs, retention cleanup |
| Logging | **Pino** | structured JSON for production, pretty in dev |
| Email | HTTP API: Resend / SendGrid / Mailgun | no SMTP / no queue runtime |
| Encryption | **AES-256-GCM** (`ENCRYPTION_KEY`) | stored API keys, recovery tokens |
| Container | `node:26-alpine`, multi-arch (amd64 / arm64) | LTS-aligned via `.nvmrc`, dual-stack listener |

## Repository layout

```
.
├── src/
│   ├── app/                       # Next 16 App Router (routes)
│   │   ├── page.tsx               # public root: welcome OR form (if useCustomRoot)
│   │   ├── [formSlug]/            # per-form public pages
│   │   ├── admin/                 # admin UI (all routes server-guarded)
│   │   ├── api/                   # REST endpoints
│   │   └── proxy.ts               # Next 16 proxy / middleware (auth + admin host)
│   ├── components/
│   │   ├── form/                  # FormWizard, FieldRenderer, validators
│   │   ├── dashboard/             # DashboardView + widget renderers
│   │   ├── admin/                 # admin UI + config editors
│   │   └── page/                  # public landing page (hero, blocks, footer)
│   ├── lib/
│   │   ├── auth/                  # Lucia, session validation, role gates
│   │   ├── config/                # FormConfig loader, getFormConfig()
│   │   ├── db/                    # Drizzle schema, queries, instance loader
│   │   ├── yaml/                  # YAML parsing + zod schema + form/view exporters
│   │   ├── startup/               # bootstrap pipeline (instrumentation hook)
│   │   ├── backup/                # composeBackup, restoreFromYaml, restoreDataArchives
│   │   ├── email/                 # providers, broadcast composer + batched sender
│   │   ├── datapools/             # dedup pipeline, exclusions, preview + CSV
│   │   ├── audit/                 # localized action labels
│   │   ├── csv/                   # RFC 4180 escape helpers (shared)
│   │   ├── scheduler/             # node-cron jobs (retention, audit purge, reaper)
│   │   ├── security/              # rate limit, CSRF, encryption, password policy
│   │   ├── admin/                 # mergeAdminConfig, autoFormView, purgeFormReferences
│   │   └── utils/                 # flattenRepeater, priority thresholds, etc.
│   ├── types/                     # config.ts, formInstance.ts (TS types)
│   ├── i18n/                      # fr.ts, en.ts (UI labels)
│   ├── instrumentation.ts         # Next 16 hook: runs runStartupBootstrap once
│   └── __tests__/                 # vitest pure-function tests
├── docs/                          # this folder
├── public/                        # static assets
├── migrations/                    # Drizzle SQL (auto-applied at boot)
├── scripts/                       # run-e2e.sh, seed-test-db.ts
├── tests/api/main.ts              # e2e API integration suite
├── Dockerfile                     # multi-stage, standalone output, Node 26
└── docker-compose*.yml            # dev (db only) + prod (full stack)
```

## Boot pipeline

Triggered exactly once per process via `src/instrumentation.ts` →
`runStartupBootstrap` in `src/lib/startup/bootstrap.ts`. Order matters:

1. **Validate `ENCRYPTION_KEY`** — 64 hex chars. Bootstrap exits the
   process loudly if missing or malformed.
2. **Wait for Postgres** — bounded retry (30 × 2 s) so the app doesn't
   crashloop while Postgres warms up.
3. **Drizzle migrations** under `pg_advisory_lock(8675309)` —
   idempotent, ~5 ms when already up to date. Two replicas starting
   together don't race.
4. **Boot YAML** (`config.yaml` or `CONFIG_YAML_PATH`) — read, zod-validate,
   apply: priorityThresholds → password policy → forms (upsert by slug) →
   admin user → custom CA certs. Missing file → "UI-only mode".
5. **Scheduler** — `initScheduler()` registers any enabled `scheduled_jobs`
   rows (node-cron 4). Reloads every 5 min to pick up config changes.

If any non-critical step fails (e.g. one form is malformed), the error
is logged and the boot continues. Critical failures (`ENCRYPTION_KEY`,
DB unreachable past retries, invalid YAML schema) abort the process so
the orchestrator restarts.

## Request paths

### Public form

```
Browser  ──► proxy.ts ──► /[formSlug]/page.tsx (server)
                              │
                              ├─► getFormInstance(slug)   ── Postgres
                              └─► render LandingPage + FormWizard

Browser  ──► /api/forms/[slug]/submit    (POST)
                              │
                              ├─► zod-validate body
                              ├─► rate-limit (per IP + per email)
                              ├─► insert submissions
                              ├─► fire-and-forget: email + webhook
                              └─► return 200 + redirect
```

### Admin

```
Browser  ──► proxy.ts (Lucia session check + ADMIN_HOST gate)
            │
            └──► /admin/[slug]/page.tsx (server)
                    │
                    ├─► validateAdminSession
                    ├─► getFormConfig (cached, invalidated on PATCH)
                    ├─► DashboardView w/ widgets (or config editors)
                    └─► RSC stream

Browser  ──► /api/admin/* (POST / PATCH / DELETE)
                    │
                    ├─► requireAdminMutation (CSRF, role)
                    ├─► requireRole(...) per route
                    ├─► route handler
                    ├─► logAdminEvent → admin_audit
                    └─► cache invalidation if config touched
```

## Config model

Two stable layers separated by the bootstrap:

- **Forms** — one row per slug in `form_instances`. Per-form `meta`,
  `page`, `form` (steps + fields), `security`, `customStatuses`,
  `notifications`, `priorityThresholds`. Editable from the admin UI
  unless `_managedBy: "yaml"` (file mode).
- **Global admin config** — one singleton row in `app_config_doc`:
  `admin.views` (dashboards, alias `admin.pages` accepted for fwd-compat),
  `admin.tableColumns`, `admin.branding`, `admin.features`,
  `admin.folders`, `admin.dataPools`, `admin.exclusionReasons`,
  `admin.auditRetention`, `useCustomRoot`. Edited from the admin UI;
  can be reset via `restoreFromYaml` (`append` upserts by `id`,
  `replace` wipes-and-sets).

`src/lib/yaml/configSchema.ts` is the canonical schema for what the
boot YAML accepts. `src/types/config.ts` is the canonical typed shape
the rest of the code consumes. See [yaml-schema.md](./yaml-schema.md)
and [config-as-code.md](./config-as-code.md) for the operator's view.

### Feature-scoped tables

| Table | Purpose | See |
|---|---|---|
| `data_pools` + `data_pool_sources` + `data_pool_submission_exclusions` | Read-time deduplicated audiences with per-pool opt-outs | [datapools.md](./datapools.md) |
| `email_providers` | AES-256-GCM-encrypted provider presets (Resend / SendGrid / Mailgun) | [email-setup.md](./email-setup.md) |
| `email_broadcasts` | Composed bulk sends with status + counts + last error | [broadcasts.md](./broadcasts.md) |
| `admin_events` | Frozen audit trail with time-based retention | [audit-log.md](./audit-log.md) |
| `folders` | Nested folders for sidebar and forms/views grids | — |

## Caching strategy

Server-side caches are minimal and per-process:

- `getFormConfig()` caches the global admin config; invalidated on
  every admin PATCH and on `restoreFromYaml`.
- `getUseCustomRoot()`, `isPasswordPolicyEnforced()`, similar
  per-knob caches — each exports `_resetXxxCache()` and the PATCH
  endpoint calls the appropriate one. Multi-replica deployments rely
  on this being a `force-dynamic` Next page so misses are cheap; no
  Redis dependency.
- `formAnalytics` (step view tracking) is a write-only table; the
  `CompletionFunnel` reads it on every page render (no cache).

## Scheduler

`src/lib/scheduler/scheduler.ts` runs node-cron and combines two kinds
of tasks:

- **`scheduled_jobs` rows** (operator-configured) with actions
  `retention_cleanup`, `export_json`, `export_csv`, `export_backup`,
  `dataset_poll`, `audit_purge`. The scheduler reloads every 5 minutes
  so config changes don't require a restart.
- **Built-in ticks**:
  - Every minute — process the webhook delivery retry queue.
  - Every 5 minutes — reap broadcasts stuck in `sending > 10 min` back
    to `failed` (kicks the composer's edit + resend path).
  - 03:00 daily — purge completed webhook deliveries older than 30 days.
  - 03:15 daily — audit purge, honours `admin.auditRetention.policy`
    (no-op when `keep_all` or unset).

The image runs as PID 1 — there's no separate worker container. If you
need multi-replica deployments, the scheduler should run on exactly one
of them (controlled by an env flag — track this in your deployment).

## Security model

Summary here, full doc in [security.md](./security.md):

- **Sessions**: Lucia v3 cookies, configurable lifetime (`SESSION_DURATION_DAYS`).
- **Passwords**: Argon2id; optional zod-driven policy when
  `enforcePasswordPolicy: true`.
- **Encryption at rest**: AES-256-GCM with `ENCRYPTION_KEY`. Used for
  email API keys, recovery tokens, S3 credentials.
- **CSRF**: `requireAdminMutation` checks a header token on every
  mutating admin API call.
- **Rate limiting**: per-route, per-IP (`getClientIp` resolves
  `X-Forwarded-For` only when `TRUSTED_PROXY` is set).
- **Audit log**: `admin_audit` table stores every admin mutation
  (user, action, resource, details).
- **Admin host gating**: optional `ADMIN_HOST` env — requests to
  `/admin*` / `/api/admin*` / `/api/auth*` from a different `Host`
  header return 404. Lets you serve admin and public on separate
  domains.

## Why this shape

- **One container, one Postgres** — no Redis, no queue runner, no
  separate frontend. Easy to deploy, easy to back up.
- **YAML as a first-class input** — the boot pipeline applies it
  idempotently so the same `config.yaml` produces the same state on
  every restart. Pairs well with git-as-source-of-truth deploys.
- **Standalone Next build** — the production image bundles only what's
  reachable from the entry points; Dockerfile copies the `migrations/`
  folder explicitly because Drizzle reads `meta/_journal.json` via
  `fs`, not via import.
- **No magic ports** — `HOSTNAME=::` in the Dockerfile binds the
  server dual-stack so containers on a podman/docker network with
  `enable_ipv6: true` are reachable on both protocols. The Docker
  Build Smoke job asserts the v6 listener on every PR.
