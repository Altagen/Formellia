<div align="center">

<img src="public/formellia-logo-transparent.png" alt="Formellia" width="160" />

# Formellia

**Forms and dashboards as code — self-hosted, audit-grade, YAML-driven.**

A Next.js / Postgres app that turns a single YAML file into a public form, an
admin back-office, and a dashboard for the responses. Built to ship to a VPS
in an afternoon and stay maintainable through real-world use.

[Docs](docs/) · [Getting started](docs/getting-started.md) · [Deployment](docs/deployment.md) · [YAML reference](docs/yaml-schema.md) · [Releases](https://github.com/Altagen/Formellia/releases)

</div>

---

## What it is

- A **public form** rendered from YAML (multi-step, conditional fields,
  repeaters, computed fields, validation, branding, GDPR notice).
- An **admin UI** to read submissions, manage users / roles, configure email
  notifications, back up data, and design dashboards.
- A **dashboard engine** with charts, stats cards, tables and filter pills,
  also declarable from YAML.
- A **boot-time config pipeline** that applies the YAML on every start —
  idempotent, validated, with first-class secret scrubbing.

If you prefer a hosted form builder, this isn't it. If you want one Postgres,
one container, a YAML file in git, and full control of the data — this is.

## Key features

| Area | Highlights |
|---|---|
| **Forms** | 12 field types · multi-step wizard · `visibleWhen` (AND/OR) · repeater rows · `computed` fields (DSL: `date_diff`, `date_add`, `sum`, `field`, `literal`) · `section_header` navigation · `completionBar` · GDPR consent block |
| **Views** (dashboards) | Stats cards · charts (bar / line / area / pie) · stats tables grouped by any field · submissions table with search · interactive filters · per-view form scoping · external dataset support · DataPool as a source |
| **DataPools** | Read-time deduplicated audiences derived from one or more forms · per-pool exclusion lists (with reasons) · CSV export · powers broadcasts + rosters ([datapools.md](docs/datapools.md)) |
| **Broadcasts** | Curated bulk email to a DataPool union · rich-text composer with juice→sanitize preview · batched fan-out per provider (Resend 50 / SendGrid 999 / Mailgun 1000) · stuck-send reaper ([broadcasts.md](docs/broadcasts.md)) |
| **Audit log** | Timeline view with per-day grouping · retention policy + nightly purge · CSV/JSON/YAML export · labelled action taxonomy ([audit-log.md](docs/audit-log.md)) |
| **Admin UI** | Collapsible sidebar with pin/folders · master/detail Configuration + form editor · Forms and Views card routes with sort/search/folders · Administration split (users / security / audit retention) |
| **Configuration** | Boot from `config.yaml` (file mode) or seed-then-edit (DB mode) · upsert by slug · zod-validated · `restoreFromYaml` for partial reimports (append by `id`) · forward-compat `admin.views` reads as `admin.pages` |
| **Security** | Lucia v3 sessions · CSRF for mutations · AES-256-GCM for encrypted secrets (API keys, recovery tokens) · Argon2id passwords · per-route rate limiting · structured audit log with retention policy · honeypot + bot filtering |
| **Notifications** | Provider CRUD (Resend / SendGrid / Mailgun) with encrypted API keys and expiry warning · per-form `providerId` with a default-provider fallback · template variables `{{firstName}}` etc. |
| **Ops** | Single Docker image · Drizzle migrations applied at boot under advisory lock · dual-stack IPv6 listener · health endpoint with DB / encryption / scheduler / storage checks · scheduled jobs (export, retention cleanup, audit purge, stuck-broadcast reaper) · backup providers (local / S3) |

## Quick start (local)

```bash
git clone https://github.com/Altagen/Formellia.git
cd Formellia

cp .env.example .env                                       # then edit it
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env      # required at boot
docker compose up -d                                       # Postgres only
npm install
npm run dev                                                # Next on :3000
```

Required env: `DATABASE_URL`, `AUTH_SECRET` (≥ 32 chars), `ENCRYPTION_KEY`
(exactly 64 hex chars). See [`.env.example`](./.env.example) for the full
list. The local compose ships **Postgres only** — the app runs from your
shell. The production image is built from [`Dockerfile`](./Dockerfile).

A complete walk-through (first form, first dashboard, first submission)
lives in **[docs/getting-started.md](docs/getting-started.md)**.

## Production

For a real deploy (VPS, Caddy, IPv6, GHCR auth, sysctl tuning, smoke tests):
**[docs/deployment.md](docs/deployment.md)** — battle-tested checklist.

Image: `ghcr.io/altagen/formellia:<version>` (multi-arch). Compose example:
[`docker-compose.prod.yml`](./docker-compose.prod.yml).

## Documentation

Topical index → **[docs/](docs/)**.

| If you want to… | Read |
|---|---|
| Spin it up locally for the first time | [docs/getting-started.md](docs/getting-started.md) |
| Understand the stack and the boot pipeline | [docs/architecture.md](docs/architecture.md) |
| Write `config.yaml` (forms, views, all fields) | [docs/yaml-schema.md](docs/yaml-schema.md) |
| Pick between DB-mode and file-mode | [docs/config-as-code.md](docs/config-as-code.md) |
| Configure outgoing email and providers | [docs/email-setup.md](docs/email-setup.md) |
| Send a curated bulk email | [docs/broadcasts.md](docs/broadcasts.md) |
| Build a deduplicated audience or an export list | [docs/datapools.md](docs/datapools.md) |
| Read the audit trail or configure retention | [docs/audit-log.md](docs/audit-log.md) |
| Navigate the admin UI (sidebar, folders, cards) | [docs/admin-ui.md](docs/admin-ui.md) |
| Deploy to a VPS in one afternoon | [docs/deployment.md](docs/deployment.md) |
| Understand auth, secrets, rate limiting | [docs/security.md](docs/security.md) |
| Contribute or run the dev environment | [CONTRIBUTING.md](CONTRIBUTING.md) |
| Copy a working example | [docs/examples/](docs/examples/) |

## Stack

Next.js 16 (App Router, Turbopack, React 19, standalone output) · TypeScript 6 ·
Drizzle ORM on Postgres 16 · Lucia v3 sessions · zod · Tailwind 4 · Pino
logging · node-cron 4 · Vitest. Runs on Node 26-alpine in production
(LTS-aligned via `.nvmrc`).

## Project status

Maintained, semver-versioned, automated release pipeline (multi-arch GHCR
image, SBOM, Trivy scan, GitHub Release). GitFlow with branch protection on
`main`; all PRs go through `develop` and gated CI (typecheck, unit tests,
e2e API suite, Docker dual-stack assertion).

See [Releases](https://github.com/Altagen/Formellia/releases) for the
changelog.

## License

[Apache License 2.0](./LICENSE). The full text lives at the root.
