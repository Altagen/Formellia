# Formellia documentation

The handbook for running, configuring, deploying and contributing to a
Formellia instance. Source of truth: the code (`src/types/config.ts`,
`src/lib/yaml/configSchema.ts`, the bootstrap pipeline). Docs are refreshed
to follow the code, not the other way around.

## Start by audience

### I want to spin one up

Local development on your laptop:

- **[getting-started.md](./getting-started.md)** — clone → form rendered in
  a browser, with a real Postgres in 5 minutes.

Production on a VPS:

- **[deployment.md](./deployment.md)** — single-host Linux checklist:
  prerequisites, environment, compose, ufw, IPv6, QUIC tuning, GHCR auth,
  smoke tests, upgrade flow.

### I want to configure forms and dashboards

- **[config-as-code.md](./config-as-code.md)** — the two modes (DB seed vs
  file-managed), the boot pipeline, what the YAML can carry vs what the UI
  restore endpoint accepts.
- **[yaml-schema.md](./yaml-schema.md)** — full field reference: root, form
  features, notifications, meta, page, form steps & field types, validation,
  `visibleWhen`, formula DSL, repeater columns, security, dashboard pages
  and widgets, icon allowlist.
- **[examples/](./examples/)** — copy-paste-ready templates:
  [event-signup.yaml](./examples/event-signup.yaml) for the form,
  [event-dashboard.yaml](./examples/event-dashboard.yaml) for the matching
  dashboard.

### I want to send email

- **[email-setup.md](./email-setup.md)** — Resend / SendGrid / Mailgun,
  the API key resolution order, template variables, local testing,
  production domain verification, troubleshooting.

### I want to understand how the system works

- **[architecture.md](./architecture.md)** — component map, request flow,
  boot pipeline, package layout, why each piece is where it is.
- **[security.md](./security.md)** — authentication (Lucia v3), encryption
  (AES-256-GCM), CSRF, rate limiting, audit log, secret scrubbing.

### I want to contribute

- **[../CONTRIBUTING.md](../CONTRIBUTING.md)** — dev environment, branch
  model, tests, commit conventions, release flow.

## File map

| File | Topic | Audience |
|---|---|---|
| [getting-started.md](./getting-started.md) | First boot, dev loop | Everyone |
| [architecture.md](./architecture.md) | Stack, request flow, boot | Devs / ops |
| [config-as-code.md](./config-as-code.md) | DB-mode vs file-mode | Operators |
| [yaml-schema.md](./yaml-schema.md) | Field reference | Operators / devs |
| [email-setup.md](./email-setup.md) | Outgoing notifications | Operators |
| [deployment.md](./deployment.md) | VPS production checklist | Operators |
| [security.md](./security.md) | Auth, secrets, rate limit, audit | Devs / ops |
| [examples/](./examples/) | Copy-paste YAML | Operators |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Dev workflow | Contributors |

## Conventions

- **Code is the source of truth.** If a doc disagrees with the code, the
  code wins — the doc is refreshed on the next pass.
- **No secrets in docs or example YAML.** Secrets live only in `.env` /
  environment variables. The boot-time scanner rejects YAML keys that look
  like secrets (see [config-as-code.md](./config-as-code.md#yaml-safety)).
- **English in the repo.** Per-deployment YAML can be in any language
  (form labels, hero copy, etc.) — internal IDs and slugs stay English.
