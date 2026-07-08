# DataPools — deduplicated audiences

A **DataPool** is a read-time audience derived from one or more form
submissions. Each pool picks a key field (typically `email` or `phone`) and
returns exactly one row per distinct normalised key, choosing the newest
submission when several exist. The pool never touches the underlying rows —
it is a view, not a table.

Pools are the backbone of two operator flows:

- **Email broadcasts** — [broadcasts.md](./broadcasts.md) resolves a
  broadcast's recipient list by unioning one or more pools and de-duplicating
  again across them.
- **Aggregate exports** — CSV downloads (unsubscribes, mailing lists,
  attendee rosters) that must contain every person once.

## Model

| Table | Purpose |
|---|---|
| `data_pools` | Pool identity: `id`, `name`, `keyField`, `keyFieldExpr` |
| `data_pool_sources` | Which form + which field feeds the pool |
| `data_pool_submission_exclusions` | Per-pool opt-outs referencing `submission.id` |

The pool never stores the extracted keys — they are computed from the source
rows every time. When you exclude a submission from a pool it stays in the
form's own submission table; only the pool skips it.

## Deduplication rules

`data_pools.keyField` is validated against `/^[a-zA-Z0-9_.]+$/` before
reaching `sql.raw` — no user string ever hits SQL unquoted. The dedup query
is roughly:

```sql
SELECT DISTINCT ON (LOWER(form_data ->> $keyField))
  submission_id, form_data
FROM submissions
LEFT JOIN data_pool_submission_exclusions x
  ON x.submission_id = submissions.id AND x.pool_id = $pool
WHERE x.submission_id IS NULL
  AND form_instance_id IN ($sources)
ORDER BY LOWER(form_data ->> $keyField), submitted_at DESC;
```

The `LOWER()` normalisation means `Alice@Example.com` and `alice@example.com`
collapse into one row. Whitespace-only keys are dropped.

## Exclusions

Two ways to exclude a submission from every pool it would otherwise appear
in:

1. **Global soft-exclude** — set `submissions.excluded_from_data_pools = true`
   on the row itself. Use for RGPD "right to be forgotten" style requests.
2. **Per-pool exclusion** — insert a row in
   `data_pool_submission_exclusions` scoped to `(pool_id, submission_id)`.
   Use for "unsubscribe from this newsletter but stay in the CRM" style.

Both filters are applied on every read path (`getMergedDataPoolKeys`,
`previewDataPool`, CSV export) so a submission that leaves a pool is
invisible everywhere downstream, not just in one view.

The `data_pool_submission_exclusions.reason` column is free-text, curated
via `admin.exclusionReasons` in the YAML (a list of preset strings the UI
offers as a dropdown alongside a custom-text field). Operators can add or
remove presets under Configuration → DataPools.

## API surface

All routes live under `/api/admin/datapools/` and require `admin` role +
`requireAdminMutation` on writes.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/datapools` | List pools |
| POST | `/api/admin/datapools` | Create a pool |
| GET | `/api/admin/datapools/{id}` | Detail with source list + exclusion count |
| PUT | `/api/admin/datapools/{id}` | Rename, edit key, edit sources |
| DELETE | `/api/admin/datapools/{id}` | Cascade-delete sources + exclusions |
| GET | `/api/admin/datapools/{id}/preview` | Paginated preview of the merged rows |
| GET | `/api/admin/datapools/{id}/export.csv` | RFC 4180 CSV download |
| POST | `/api/admin/datapools/{id}/exclusions` | Exclude a submission |
| DELETE | `/api/admin/datapools/{id}/exclusions/{submissionId}` | Remove an exclusion |

Every write is audited under `datapool.create`, `datapool.update`,
`datapool.delete`, `datapool.exclusion.add`, `datapool.exclusion.remove`
and appears in the audit log timeline
([audit-log.md](./audit-log.md)).

## UI

Configuration → **DataPools** hosts:

- A grid of pool cards with source count, distinct-key count, last preview
  timestamp.
- The **Exclusion reasons** editor (a shared list used by every pool's
  exclusion dialog).

`/admin/datapools/{id}` is a master/detail editor with three tabs:

- **Sources** — pick a form + a key field; multiple sources are allowed
  and their key fields do not need to share the same name.
- **Preview** — see the current merged rows with paging.
- **Exclusions** — per-submission opt-out list with reason + optional free
  text. Removing an exclusion is gated by a confirmation dialog because the
  exclusion is often the compliance record of a consent revocation.

## YAML round-trip

Backups written by `/api/admin/config/backup` and the scheduled `export_backup`
job include the pool set:

```yaml
admin:
  dataPools:
    - id: attendees-2026
      name: Attendees 2026
      keyField: email
      sources:
        - formSlug: inscription-2026
          keyField: email
        - formSlug: inscription-vip-2026
          keyField: contactEmail
```

Restore accepts both `append` (upsert by id) and `replace` modes. Exclusion
lists are **archive-only** in the same way `users.jsonl` is — the composer
writes them in the ZIP but `restoreFromObject` does not currently replay
them. Rebuild the exclusion list from the audit log or from a separate CSV
if you need it on a fresh instance.
