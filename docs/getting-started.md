# Getting started (local development)

A walk-through from a fresh clone to a running Formellia with a public
form, an admin account, and a dashboard — all on your laptop.

For a production VPS deploy see [deployment.md](./deployment.md). For
the architecture map see [architecture.md](./architecture.md).

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 22 LTS or 26 (per `.nvmrc`) | `nvm use` / `fnm use` picks it up |
| npm | 10+ | bundled with Node |
| Docker or Podman | Compose ≥ v2 | only the DB runs in a container locally |
| openssl | any recent | to generate the boot secrets |

The production runtime image is `node:26-alpine` (Dockerfile). The CI
typechecks on Node 26 too. Node 22 LTS still compiles and runs the
application, so either works for development.

## 1. Clone and install

```bash
git clone https://github.com/Altagen/Formellia.git
cd Formellia
npm install
```

## 2. Generate the boot secrets

Bootstrap will refuse to start without `ENCRYPTION_KEY` and `AUTH_SECRET`.
Generate them once:

```bash
cp .env.example .env

# 64 hex characters — used to encrypt API keys stored in DB
echo "ENCRYPTION_KEY=$(openssl rand -hex 32)" >> .env

# 32+ characters — used to sign Lucia sessions (overrides the placeholder
# already present in the .env you just copied)
sed -i "s|^AUTH_SECRET=.*|AUTH_SECRET=$(openssl rand -base64 32)|" .env

# (optional) seed an admin on first boot — if you skip this, you'll
# create the admin from the /admin/setup page on first visit
cat >> .env <<EOF
BOOTSTRAP_ADMIN_EMAIL=admin@local.test
BOOTSTRAP_ADMIN_PASSWORD=ChangeMe123!
EOF
```

The full list of accepted env vars (with defaults and meaning) lives in
[`.env.example`](../.env.example).

## 3. Start Postgres

The local `docker-compose.yml` ships **Postgres only** — the app runs
from your shell so changes recompile instantly.

```bash
docker compose up -d
```

Wait until the healthcheck reports healthy:

```bash
docker compose ps          # STATUS = healthy
```

The default connection string in `.env.example` matches this Postgres:
`postgresql://postgres:postgres@localhost:5432/formellia`. Drizzle
migrations run automatically when the app starts — no manual setup.

## 4. Run the app

```bash
npm run dev
```

The bootstrap pipeline runs (see [config-as-code.md](./config-as-code.md)):

1. Validates `ENCRYPTION_KEY`.
2. Waits for Postgres, applies migrations under an advisory lock.
3. Loads `config.yaml` if present — otherwise logs "UI-only mode" and
   skips that step.
4. Seeds the admin user from `BOOTSTRAP_ADMIN_*` if there is no admin yet.

Open <http://localhost:3000> — you should see the Formellia welcome page
(no form claims the root slug `/` yet).

Open <http://localhost:3000/admin/setup> (if no `BOOTSTRAP_ADMIN_*` was
set) or <http://localhost:3000/admin/login> with the bootstrap credentials.

## 5. Create your first form

Two paths — pick one.

### Path A — through the admin UI (recommended for exploration)

1. Log in at `/admin/login`.
2. Sidebar → **Configuration → Forms → New form**.
3. Pick a slug (e.g. `contact`), a name, and add a couple of fields in
   the **Builder** tab.
4. Save. The form is now live at <http://localhost:3000/contact>.

### Path B — through `config.yaml` (recommended for production)

Drop a YAML file at the project root:

```yaml
# config.yaml
version: 1

forms:
  - slug: "contact"
    name: "Contact us"
    features: { landingPage: true, form: true }
    meta:    { name: "Acme", title: "Contact", locale: "en" }
    form:
      steps:
        - id: "step-1"
          title: "Tell us"
          fields:
            - { id: "firstName", type: "text",  label: "First name", required: true }
            - { id: "email",     type: "email", label: "Email",      required: true }
            - { id: "message",   type: "textarea", label: "Message" }
```

Restart the app (`Ctrl+C`, `npm run dev`). The boot log prints
`[bootstrap] Form updated slug=contact`. The form is live at
<http://localhost:3000/contact>.

The full YAML reference lives in [yaml-schema.md](./yaml-schema.md). A
fully-featured example is in
[examples/event-signup.yaml](./examples/event-signup.yaml).

## 6. Submit a test response

Fill the form in the browser and click submit. In the admin, sidebar →
**Submissions** → click the new row to see the full payload in the
detail pane.

## 7. Build a dashboard

Dashboard pages aren't accepted by the boot YAML — they go through
**Admin → Configuration → Pages → New page** (UI), or through the
restore endpoint with `admin.pages` (YAML). Either way:

- Pick a `formInstanceId` (the form's id or slug — `/` for the root form).
- Add widgets: stats cards, charts (bar / line / area / pie), stats
  tables, the submissions table.
- The column / filter pickers are scoped to that form's fields.

A complete example is
[examples/event-dashboard.yaml](./examples/event-dashboard.yaml) — import
it via *Admin → Configuration → Backup → Restore*, mode = append,
admin checkbox only.

## Useful commands

```bash
npm run dev              # next dev on :3000
npm run build            # next build (Turbopack)
npm run start            # next start (after build)
npm test                 # vitest, 160+ pure-function tests
npm run typecheck        # tsc --noEmit
npm run lint             # if configured

# integration suite (boots a test Postgres + the app, hits the API)
npm run test:e2e
```

The e2e script orchestrates everything in `scripts/run-e2e.sh`. It uses
the `db-test` profile of `docker-compose.yml`, seeds the schema, runs
the app on port 3999, then runs `tests/api/main.ts`. The two
`BKSEC-04` / `BKSEC-05` known flakes are rate-limit budget — see
`tests/api/main.ts` for the matrix.

## Next steps

- Read [config-as-code.md](./config-as-code.md) to choose between
  **DB mode** (UI-editable, default) and **file mode** (YAML is the
  source of truth, UI read-only).
- Read [yaml-schema.md](./yaml-schema.md) for the full list of fields,
  widgets, validation rules and the formula DSL.
- Read [email-setup.md](./email-setup.md) when you want submitters to
  receive a confirmation email.
- Read [security.md](./security.md) for the auth / encryption /
  rate-limit / audit model.
- Read [deployment.md](./deployment.md) when you're ready to ship to a
  VPS.
