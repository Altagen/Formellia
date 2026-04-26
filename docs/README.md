# Formellia — Documentation

Internal documentation, written incrementally as features are explored. The
goal: be able to debug a deployed instance without having to re-read the
source on every visit.

## Contents

- [config-as-code.md](./config-as-code.md) — overview: `db` vs `file` modes,
  boot pipeline, files involved.
- [yaml-schema.md](./yaml-schema.md) — YAML field reference: root, forms,
  steps, field types, dashboard widgets.
- [email-setup.md](./email-setup.md) — providers, environment variables,
  domain verification, local testing.
- [examples/](./examples/) — ready-to-use YAML files (forms + dashboards).

## Conventions

- The code is the **source of truth**. If something differs between docs and
  code (`src/lib/yaml/configSchema.ts`, `src/types/config.ts`), the code
  wins — docs are refreshed on the next pass.
- No secrets in the docs or in the example YAML files. Secrets live only in
  `.env` / environment variables.
