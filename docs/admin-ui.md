# Admin UI

Tour of the back-office layout for operators.

## Layout primitives

Every admin page renders inside the same shell defined by
`src/components/admin/AdminShell.tsx`:

- **Sidebar** on the left (desktop) or slide-over (mobile). Collapsible
  to a rail of icons via the header edge toggle. Persisted per user in
  `users.sidebar_collapsed`.
- **Master/detail body** on the right. Configuration, form editor and
  view editor all use the shared `MasterDetailLayout` — a left rail of
  sections and a right pane with the details of the selected item. The
  URL keeps `?tab=` in sync so refreshes and shareable links land on the
  right pane.
- **Page eyebrow** on top of every detail — small breadcrumb chip
  ("Configuration › Forms › Contact"), used as a mobile back button and
  a desktop context hint.

## Sidebar

The sidebar renders three collapsible categories:

- **Content** — pinned forms and views curated by the operator, plus
  folders that group them further (see [Folders](#folders)).
- **Tools** — top-level actions (broadcasts, DataPools, audit log,
  submissions global view).
- **Platform** — Configuration, Administration and the profile drawer.

Per-user layout lives in `users.sidebar_layout` (jsonb). The API
endpoint `PATCH /api/admin/account/sidebar-layout` accepts partial
updates so pin/unpin doesn't rewrite the whole record. Category
collapsed state is client-only (localStorage).

## Folders

Folders group forms and views under nested nodes visible both in the
sidebar and in the `/admin/forms` + `/admin/views` grid toolbars. They
are declared globally in `admin.folders` (see
[yaml-schema.md](./yaml-schema.md#folders)) and referenced from each
form or view via `folderId`.

Rules the CRUD API enforces:

- Deleting a folder detaches every descendant back to the root (never
  orphans). Confirmation dialog on the frontend covers this.
- Renaming propagates instantly — the sidebar reads from RSC and the
  affected mutation calls `revalidatePath("/admin", "layout")`.
- YAML view export does **not** carry `folderId` (it is a per-instance
  organisational field). Re-importing a view preserves the existing
  `folderId` on the target row when the incoming YAML omits it.

## Configuration

`/admin/configuration` is a master/detail with two section groups:

- **Content** — Forms and Views (global settings only: default provider,
  priority thresholds, features globales for new forms).
- **Platform** — General, DataPools, Providers, Sources, Jobs, Backup,
  Danger zone, Administration landing.

Deep-diving into a form or a view happens via cards (`/admin/forms`,
`/admin/views`) — the Configuration tab keeps only cross-cutting
settings.

## Forms and Views cards

`/admin/forms` and `/admin/views` are card grids with a rich toolbar:

- **Sort** — by name, by creation date, by folder.
- **View mode** — grid vs list (persisted per user).
- **Folders** — folder chips act as filters; a breadcrumb reflects the
  current subtree.
- **Search** — matches on name and slug.
- **Import** — YAML upload endpoint (`/api/admin/forms/[id]/import` or
  `/api/admin/views/import`) with append or replace mode.

## Administration

`/admin/administration` is a landing page with three subpages:

- `/administration/users` — user list + role edition + per-form grants.
  Also hosts the "temp password" reissue flow (audited).
- `/administration/security` — password policy toggle, session
  duration, root page toggle, audit retention policy.
- `/administration/audit` — the audit-log timeline (see
  [audit-log.md](./audit-log.md)).

## Profile

`/admin/profile` is a master/detail drill-down over your own account:

- General — email, locale, theme mode, colour preset.
- Password — change flow, refuses to accept the current password.
- Sessions — active sessions in reverse-chronological order (current
  session on top). Each row can be revoked.
- Recovery codes — generate, view once, clear. Regenerate refuses to
  overwrite existing codes without a confirmation dialog.
- API keys — personal tokens for programmatic access.

## Theme

Theme mode (`light` / `dark`), colour preset and locale are three
per-user preferences persisted in `users.theme_mode`,
`users.color_preset`, `users.locale`. The `UserPreferencesContext` is
the single source of truth — the header toggle, Sonner toaster and
every RSC-rendered admin page read from it.

## Destructive flows

Every destructive action is gated by a `ConfirmDialog`:

- Form / view / folder / DataPool / provider / session / API key delete.
- Recovery codes regenerate (only when codes already exist).
- Exclusion removal from a DataPool (its own confirmation copy points
  out that the removal reintegrates the person in every future export
  and broadcast).
- Manual audit purge with an explicit `olderThanDays` number.

The primitive is `src/components/ui/confirm-dialog.tsx`. Native
`window.confirm` is not used anywhere in the admin.
