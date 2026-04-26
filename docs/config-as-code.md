# Config-as-code

Formellia is configured declaratively through a YAML file applied at
startup. Depending on the `CONFIG_SOURCE` environment variable, the YAML
acts either as a *seed* (DB editable afterwards via the UI) or as the
*immutable source of truth*.

## The two modes

| Mode | `CONFIG_SOURCE` | Behavior |
|---|---|---|
| **DB (default)** | `db` or unset | The YAML is applied on every boot (upsert by slug). The admin UI remains editable and keeps history of changes. No YAML → "UI-only" mode, the admin configures everything from the interface. |
| **File** | `file` | The YAML is read but the DB is never modified through the UI. Config tabs are read-only and marked `_managedBy: "yaml"`. |

> Switching between modes requires **restarting the container**. The value
> is read once at process startup.

## Boot pipeline

Implemented in `src/lib/startup/bootstrap.ts`, triggered by
`src/instrumentation.ts`:

1. **Guard**: `ENCRYPTION_KEY` must be present (64 hex characters), otherwise
   the process exits immediately.
2. **Drizzle migrations** under a `pg_advisory_lock` (idempotent, ~5 ms when
   already up to date).
3. **YAML read**:
   - Path: `CONFIG_YAML_PATH` or `./config.yaml`.
   - Accepted extensions: `.yaml` / `.yml`.
   - Missing → log "UI-only mode" and skip.
   - Present but invalid → fatal, the process crashes.
4. **Application**: priorityThresholds → password policy → forms (upsert by
   slug) → admin user → custom CA certs.

## YAML safety

The zod schema (`src/lib/yaml/configSchema.ts`) rejects:

- Any key matching
  `api.?key | apikey | password | passphrase | passwd | secret | token |
  credential | private.?key | auth.?key | oauth | bearer | hmac |
  encryption.?key | signing.?key`.
- Any value that looks like 32+ hex characters or 40+ base64 characters.
- Two `forms[].slug` that are identical.

All secrets go through environment variables (see
[email-setup.md](./email-setup.md)).

## Reference files in the codebase

| File | Role |
|---|---|
| `config.yaml.example` | Annotated template covering every block |
| `form.config.ts` | Default seed (used when no YAML is present, or as a fallback for the legacy `FormFileConfig`) |
| `src/lib/yaml/configSchema.ts` | zod schema — strict validation |
| `src/lib/yaml/configLoader.ts` | Read, cache, path resolution |
| `src/lib/startup/bootstrap.ts` | Boot orchestration |
| `src/lib/startup/upsertFormInstance.ts` | YAML → `form_instances` row |
| `src/lib/backup/restoreFromYaml.ts` | UI restore (accepts more sections) |
| `src/types/config.ts` | TS types — reference for `meta` / `page` / `form` / `admin` |

## Boot YAML vs UI restore

The boot YAML is more restrictive than the import via the UI:

| Section | Boot YAML | UI restore (`/api/admin/config/backup`) |
|---|---|---|
| `forms[]` | ✅ | ✅ |
| `priorityThresholds` | ✅ | ✅ (under `app.priorityThresholds`) |
| `app.enforcePasswordPolicy` | ✅ | ✅ |
| `admin.email` | ✅ | ✅ |
| `admin.pages` | ❌ | ✅ |
| `admin.tableColumns` | ❌ | ✅ |
| `admin.branding` | ❌ | ✅ |
| `scheduledJobs` | ❌ | ✅ |
| `datasets` | ❌ | ✅ |

**In practice**: a fully "as-code" deployment uses both:

1. `config.yaml` at startup for forms and global settings.
2. A complete export file (generated through the UI or written by hand)
   imported afterwards via *Admin → Config → Restore* for dashboard pages.
