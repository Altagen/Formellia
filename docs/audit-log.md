# Audit log — timeline, retention and export

Every mutating admin action is written to `admin_events` via
`logAdminEvent(...)` — fire-and-forget, never blocking the request that
triggered it. The log is queryable and exportable from the admin UI, and a
scheduled purge honours a configurable retention policy so the table does
not grow unbounded.

## Model

```
admin_events
  id              uuid
  createdAt       timestamp (indexed)
  userId          text?          — null when the actor is the system
  userEmail       text?
  action          text (indexed) — e.g. "form.update", "email.broadcast.send"
  resourceType    text?          — the noun affected (form, view, datapool, …)
  resourceId      text?          — freezes the id at the time of the action
  details         jsonb?         — action-specific context (freeform)
```

The intent is a **frozen record of what the operator saw**: `resourceId`
never gets re-resolved to a current name because a form can be renamed or
deleted after the event. Where the event carries a human-readable snapshot
(`name`, `title`, `slug`, `email`, `label`), the UI surfaces it next to the
raw id.

## Timeline view

`/admin/audit` renders events in reverse chronological order grouped by day,
with a per-day header showing the relative day (`Today`, `Yesterday`) and
the action count. Each event is a clickable card:

- A coloured circle icon derived from the event's `kind`
  (config / form / view / email / data / auth / danger).
- The i18n label (via `getAuditLabel(action, locale)`), the raw action
  code and the operator's initials + email/username.
- A right-aligned timestamp + the resource id (or human name when the
  event carries one).
- A red left border on `danger: true` actions (deletes, session revokes,
  audit purges).

Clicking a card opens the **event dialog** — a modal with the full
timestamp, actor, resource block (resolved snapshot when available) and
the raw `details` JSON payload. The dialog never re-queries the database
for the resource; audit trails are frozen by design.

## Retention policy

Configuration lives under `admin.auditRetention` in the config YAML:

```yaml
admin:
  auditRetention:
    policy: keep_all    # or "days"
    days: 365           # required when policy is "days"; floored at 1
```

The nightly cron at **03:15** reads the policy on every tick (so a config
change takes effect the next night, not the next process restart) and
deletes every `admin_events` row older than the cutoff. The job is guarded:

- `policy != "days"` → no-op
- `days < 1` or `NaN` → defaulted to 365 days (never 0-day nuke)

The scheduler code lives in
[`src/lib/scheduler/scheduler.ts`](../src/lib/scheduler/scheduler.ts)
and the job in
[`src/lib/scheduler/jobs/auditPurge.ts`](../src/lib/scheduler/jobs/auditPurge.ts).

### Manual purge

`Administration → Audit retention` exposes a "Purge now" button that fires
`POST /api/admin/audit/purge` with a body of `{ olderThanDays: N }`
(1 ≤ N ≤ 3650). The route is `requireRole("admin") + requireAdminMutation`
gated and always self-logs an `audit.purge` event **before** deleting the
older rows so the purge itself survives.

## Export

`GET /api/admin/audit/export?format=csv|json|yaml&from=&to=&action=&userId=`

Streams the filtered event list as a downloadable file. `csv` is the
default, escaped per RFC 4180 via the shared `src/lib/csv/rfc4180.ts`
helper (unit-tested against embedded quotes, commas, newlines and CR).
`json` and `yaml` are pretty-printed with `js-yaml` (v5, ESM). The
Content-Disposition filename is dated (`audit-2026-07-09.csv`).

Timeline filters propagate into the export links so what you see is what
you download.

## Emitted actions

`getAuditLabel(code, locale)` in `src/lib/audit/labels.ts` covers every
action the codebase emits, in both English and French. A missing entry
falls back to the raw code with a neutral `Activity` icon — a coding smell
we sweep on each release.

Categories currently mapped:

- **config** — `config.update`, `config.reset`, `config.restore`,
  `config.import`, `config.yaml`, `config.auto_page.create`,
  `config.auto_pages.backfill`
- **form** — `form.create`, `form.update`, `form.delete`,
  `form.duplicate`, `form.import`, `form.unlock`,
  `form.notifications_update`
- **view** — `view.import`, `folder.create`, `folder.delete`
- **email** — broadcasts (`draft`, `update`, `send`, `send.failed`,
  `delete`) + providers (`create`, `update`, `delete`, `set_default`)
- **data** — datapool CRUD + exclusion add/remove, dataset CRUD +
  `dataset.import` (single) + `dataset.import.batch`
- **auth** — user CRUD, role change, grants, password change, reset
  token, temp password, session revoke (`session.revoke` +
  `session.revoke_all`), api key CRUD, account email change, recovery
  codes (`generated`, `cleared`, `used`)
- **danger** — `audit.purge`, `system.reencrypt`,
  `session.revoke_all`, every delete row

## Frozen snapshot rules

Two invariants that make the audit log useful for compliance:

1. **The `details` payload is written once and never rewritten.** If a
   downstream action makes an old event look stale (a slug rename, a form
   deletion), we do not amend the event. We emit a fresh event with a
   pointer to the previous one when the pairing matters.
2. **`resourceId` is a lookup key, not a foreign key.** No `ON DELETE
   CASCADE` on `admin_events`. Purging is time-based only.
