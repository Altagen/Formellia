# DataPools

A **DataPool** is a deduplicated audience built on top of one or more
form submissions. You point it at the form(s) you care about, pick a key
field (typically `email`), and Formellia computes the unique recipient
list on the fly — no copy, no separate storage of personal data.

> DataPools were introduced in **0.3.0**. They power the in-admin
> recipient picker for the upcoming email composer (PR2), and can be
> exported to CSV for one-off use today.

## What problem they solve

Once you have a few forms running, the same person is likely to appear
in several of them — they registered, then sent a follow-up question,
then signed up for a talk. To message that audience you need *one*
deduplicated list, not the cartesian product of all submissions.

A DataPool answers that need without:

- duplicating the email address into a separate "subscribers" table
  (would create a parallel record to clean up under GDPR Art. 17),
- pretending to be a CRM,
- requiring you to write SQL.

The pool is a **definition** ("the union of forms A and B, deduplicated
on `email`"), recomputed at read time from the live submissions.

## How dedup works

For each pool, Formellia runs roughly this query in Postgres:

```sql
SELECT DISTINCT ON (LOWER(form_data->>'email'))
  s.id, s.form_data->>'email' AS key, s.form_data, s.submitted_at, ...
FROM submissions s
LEFT JOIN data_pool_submission_exclusions e
  ON e.submission_id = s.id AND e.data_pool_id = $poolId
WHERE s.form_instance_id IN ($sourceForms)
  AND s.excluded_from_data_pools = false
  AND e.id IS NULL
  AND form_data->>'email' IS NOT NULL
  AND form_data->>'email' <> ''
ORDER BY LOWER(form_data->>'email'), s.submitted_at DESC;
```

Notable points:

- **Case-insensitive**: `Alice@Example.com` and `alice@example.com`
  collapse to one entry. The latest submission's original casing is what
  the UI shows.
- **Latest-wins**: the row kept per key is the most recent contributing
  submission. Additional fields (`firstName`, etc.) come from that row.
- **Extracted columns are transparent**: some form ids (`email`,
  `dueDate`, `receivedAt`, `status`, `priority`, `submittedAt`) are
  hoisted out of `form_data` into their own column at submission time.
  The compute layer coalesces the JSON path and the column, so picking
  `email` as `keyField` always works — even on submissions where the
  JSON path is empty (see `src/lib/datapools/compute.ts`).
- **Meta-columns**: alongside the key and additional fields, every
  preview row carries `firstSubmittedAt`, `lastSubmittedAt`,
  `submissionCount` (across all sources, before dedup), and the source
  form of the latest contributing submission. The preview UI lets you
  toggle which columns to show via a per-pool localStorage setting.

## Creating a pool

1. Open **Admin → DataPools → Nouveau pool**.
2. Pick a name, a slug (URL-safe, must be unique), and optionally a
   description.
3. Pick the **key field** — the form field id Formellia should
   deduplicate on. Use `email` unless you have a specific reason.
4. Optionally pick **additional fields** to carry alongside the key
   (e.g. `firstName`, `lastName`). They are shown in the preview and
   the CSV export. Up to 20 fields.
5. Pick at least one **source form**. You can pick several — the union
   is deduplicated on the key.
6. Save.

The detail page exposes three tabs:

- **Settings**: edit the pool definition. Slug changes affect the URL
  of the detail page only — internal references use UUIDs.
- **Preview**: paginated, searchable view of the deduplicated entries,
  with a column picker and CSV export.
- **Exclusions**: see and revoke per-submission exclusions (Art. 21
  opt-outs that target *this pool only*, see below).

## Excluding submissions

There are two ways to keep a submission out of pools.

### Global soft-exclude (Art. 21 + Art. 17 prep)

Each submission has a boolean `excludedFromDataPools` column. Toggling it
removes the row from **every** pool at once. Use it when:

- a person asks to be excluded from all outbound communications, or
- you're preparing for an Art. 17 erasure request and want to confirm
  the impact before deleting (toggling is reversible; deletion is not).

This flag is a per-row column on `submissions`, so it survives form
restoration and dataset operations.

### Per-pool exclusion

If a person opts out of *one* audience only ("I still want the renewal
reminder, but stop sending me marketing"), the easiest path is the
**Preview** tab: find the row, click the 🚫 button at the end of the
line. A dialog asks for an optional reason (free text, or one of the
predefined reasons set in **Admin → Configuration → Pages → Exclusion
reasons**) and writes a row in
`data_pool_submission_exclusions(pool_id, submission_id)` — an FK
pair, no PII duplicated.

A power-user form is also available in the **Exclusions** tab if you
already have the submission UUID (e.g. from an automation, an audit
log entry, or a CSV import).

#### Predefined exclusion reasons

`admin.exclusionReasons: string[]` (YAML + UI) defines the dropdown
shown in the exclusion dialog. Each deployment has its own
vocabulary — set the list once, it stays consistent across all pools
and gets exported in `backup.yaml` under `admin.exclusionReasons`.

```yaml
admin:
  exclusionReasons:
    - GDPR Art. 21 request
    - Bounced email
    - Spam complaint
    - Manual op
```

Empty list = free-text only. Operators can always type a custom reason
on top of these via the "Other reason" option.

When the underlying submission is deleted (Art. 17 erasure), the
exclusion row is removed automatically via `ON DELETE CASCADE`. If the
same person re-submits the form later, that is treated as a **new act of
consent**: the new submission lands in the pool with no historical
suppression. This matches the ICO / EDPB guidance on re-consent after
erasure (the right to object can also be re-exercised).

> **Why no email-hash suppression list?** Industry practice (Mailchimp,
> SendGrid, M3AAWG) recommends a hashed suppression list for
> *marketing* mail (Art. 21 perpetual opt-out). Formellia 0.3.0 ships
> *operational* communications only — the FK design is sufficient and
> avoids parallel records. A suppression list will be added when the
> newsletter feature ships (see `project_newsletter_future_groundwork`
> in the maintainers' memory).

## Use a pool as a dashboard page source

In addition to forms and external datasets, a dashboard page can be
bound to a DataPool. The page's widgets then operate on the
deduplicated entries instead of raw submissions — useful for "audience
view" pages that span several forms.

Set `dataPoolId` on the view (UI: **Admin → Configuration → Vues →
Source → By DataPool**, YAML: `admin.views[].dataPoolId`):

```yaml
admin:
  views:
    - id: subscribers-overview
      slug: subscribers
      title: Subscribers
      dataPoolId: <uuid>
      widgets:
        - { type: submissions_table, id: tbl, title: All subscribers }
        - { type: traffic_chart, id: tc, title: New entries / day }
```

| Widget | Pool source | Notes |
|---|---|---|
| `submissions_table` | ✅ | Main view of the deduplicated entries |
| `stats_card`, `stats_table`, `chart` | ✅ | Aggregates over the pool fields |
| `recent` | ✅ | Last entries by `lastSubmittedAt` |
| `info_card` | ✅ | Static content |
| `filter_pills` | ✅ | Over `additionalFields` |
| `traffic_chart` | ✅ | Submission volume in the pool over time |
| `email_quality` | ✅ | When `keyField === "email"` |
| `funnel_chart` | ❌ | Needs form steps |
| `urgency_distribution` | ❌ | Needs `urgency` column on submissions |
| `deadline_distribution` | ❌ | Needs `dueDate` column |

The Page Builder hides incompatible widget buttons automatically when
a page is bound to a pool. If the operator switches the source later,
unsupported widgets that were already added stay in place but render
empty — the operator can remove them via the page editor.

If the bound pool is deleted, the page surfaces an amber "DataPool
deleted" banner so the operator knows to rebind. Other pages and the
rest of the admin keep working normally.

## CSV export

The detail page has a CSV export button. RFC 4180 escaping; one column
per `keyField + additionalFields`. Order: key first, then the additional
fields in the order you picked. The CSV is computed on the fly — no
intermediate file is stored.

## API

All endpoints live under `/api/admin/datapools/`. Admin auth required.

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/admin/datapools` | List pools |
| `POST` | `/api/admin/datapools` | Create a pool |
| `GET`  | `/api/admin/datapools/:id` | Get a pool (with sources + exclusions) |
| `PATCH`| `/api/admin/datapools/:id` | Update a pool |
| `DELETE`| `/api/admin/datapools/:id` | Delete a pool (cascade on sources + exclusions) |
| `GET`  | `/api/admin/datapools/:id/preview?limit&offset&search` | Paginated deduplicated entries |
| `GET`  | `/api/admin/datapools/:id/export.csv` | CSV export |
| `POST` | `/api/admin/datapools/:id/exclusions` | Add a per-pool exclusion (`{ submissionId, reason? }`) |
| `DELETE`| `/api/admin/datapools/:id/exclusions/:submissionId` | Remove a per-pool exclusion |

Validation schemas live in `src/lib/datapools/validation.ts`.

## Backup & restore

DataPools are part of the config YAML produced by
`GET /api/admin/config/backup` and the ZIP backup
(`src/lib/backup/composer.ts`). Pool *sources* are emitted as
**form slugs**, not UUIDs, so a backup taken on staging can be restored
on production.

```yaml
dataPools:
  - slug: subscribers
    name: "Subscribers"
    description: "Anyone who ever signed up or asked a question."
    keyField: email
    additionalFields:
      - firstName
      - lastName
    sources:
      - formSlug: inscription
      - formSlug: contact
```

`POST /api/admin/config/backup` accepts the same shape under the
`dataPools` section (`?sections=dataPools` to target it). Mode semantics
mirror the other sections:

- **append**: skip pools whose slug already exists (reported as an
  error in the response).
- **replace**: upsert by slug — the source list is synced to match
  exactly, so re-importing a pool with a different `sources` array
  removes the ones that aren't in the payload.

> The **exclusions** (per-pool and global) are *not* carried in YAML.
> They reference submission UUIDs that aren't restored from the config
> archive, so transporting them across deployments would be meaningless.
> If you need to copy exclusions between environments, restore the
> submissions first and re-apply via the API or the UI.

A missing `formSlug` in `sources` makes the whole pool fail with an
error in the response — Formellia never creates a pool with fewer
sources than declared.

## GDPR notes

- **No parallel store of personal data**: a DataPool is a view, not a
  table of emails. Erasure of a submission removes the person from
  every pool that referenced them, in the same transaction.
- **Pool definitions are config**: the pool itself (its name, slug,
  sources, key field, additional fields) is operator metadata, not
  personal data. It is exported in the backup like any other config.
- **Audit log**: pool create / update / delete and exclusion changes
  go through `logAdminEvent`. Inspect via Admin → Audit.
- **Right to object** maps to either the per-pool exclusion (one
  audience) or the global flag (all audiences). Both are reversible;
  both are wiped on Art. 17 erasure.

## i18n

The DataPool admin UI (list, create modal, detail tabs, exclusion
dialog) is fully translated through `src/i18n/{fr,en}.ts` under the
`admin.datapool` namespace. Per-deployment YAML can override the
locale (e.g. set to `fr` for a French audience) without touching the
repo.

## File map

| Path | Role |
|---|---|
| `src/lib/db/schema.ts` | `dataPools`, `dataPoolSources`, `dataPoolSubmissionExclusions` tables, `submissions.excludedFromDataPools` column |
| `src/lib/datapools/types.ts` | Public `DataPoolEntry` / `DataPoolWithMeta` types |
| `src/lib/datapools/validation.ts` | zod schemas (create, update, exclusion, YAML import) |
| `src/lib/datapools/crud.ts` | CRUD over the three tables |
| `src/lib/datapools/compute.ts` | DISTINCT ON aggregation + window functions for meta-columns |
| `src/lib/datapools/dedup.ts` | Pure cross-pool dedup helper (used by the email composer) |
| `src/app/api/admin/datapools/**` | REST endpoints |
| `src/app/admin/(dashboard)/datapools/**` | Admin UI (list + detail + tabs) |
| `src/lib/backup/restoreFromYaml.ts` | `dataPools` section handler |
| `src/lib/backup/composer.ts` | ZIP backup export of `dataPools` |
