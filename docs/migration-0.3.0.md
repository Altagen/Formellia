# Upgrading to Formellia 0.3.0

0.3.0 ships three large feature areas and one terminology rename. The upgrade
is **fully automatic** — drop in the new release, restart the app, done. This
document explains what changed, what we did to keep existing deployments
working without operator action, and the few things you may want to clean up
once the new version is live.

If you only want the short version: **upgrade in place, nothing else to do**.

---

## What's new

### DataPools
Deduplicated audiences computed on the fly over form submissions. Operators
create a pool, point it at one or more form instances, pick a `keyField`
(usually `email`) and optional `additionalFields`, and the pool emits a
unique list of recipients without storing a separate copy. Exclusions are
managed per-pool (Art. 21-style block) or globally per-submission (Art. 17
erasure marker). See `docs/datapools.md`.

### Email broadcasts
Manual one-off email blasts to a DataPool audience. Send-time recipient
resolution, BCC batching (Resend / SendGrid / Mailgun), AES-256-GCM
encrypted API key in `app_config`, juice → DOMPurify sanitisation
pipeline, in-app preview. See `docs/email-composer.md`.

### Page → View rename
The thing previously called a "dashboard page" is now called a "dashboard
view". Same widget editor, same routing, just a more accurate name (a view
is a configurable arrangement of widgets over a source — calling it a page
clashed with Next.js's own `page.tsx` convention).

The rename touches:
- TypeScript: `AdminPage` → `AdminView`, `pages` → `views`, `defaultPage` →
  `defaultView`, `autoCreateDashboardPageOnFormCreate` →
  `autoCreateDashboardViewOnFormCreate`, helpers `mergeAdminPages`,
  `ensureAutoPageForForm`, `removeAutoPageForForm`, `backfillAutoPages`
  all switched to their `…Views`/`…View` equivalents.
- JSON / YAML keys: `admin.pages` → `admin.views`, `admin.defaultPage` →
  `admin.defaultView`.
- File paths: `src/components/admin/config/PagesTab.tsx` → `ViewsTab.tsx`;
  `src/lib/admin/autoFormPage.ts` → `autoFormView.ts`; matching test renames.
- UI strings: "Pages" → "Vues" in French, "Pages" → "Views" in English.
- Configuration tab label.

### Other improvements
- **Collapsible admin sidebar** (per-user pref, persisted in `users.sidebar_collapsed`).
- **Master/detail layout** for the Views configuration tab (rail + editor).
- **New DataPools config tab** with the exclusion-reason policy list and an
  entry-point card to the CRUD page (sidebar nav simplified).
- **Instant actions** in the Views tab — add / delete / move / set-default /
  toggle no longer require an explicit Save click; only text-field edits do.
- **ConfirmDialog on view delete** (Radix-based, replaces the bare button).
- **Form delete cleanup** — see "Form deletion semantics" below.

---

## What the upgrade does automatically

When the new code first boots against an existing 0.2.x database, four
migrations run via `drizzle-orm/migrator`:

| Migration | Adds |
|---|---|
| `0001_old_ultimo.sql` | `data_pools`, `data_pool_sources`, `data_pool_submission_exclusions`, `submissions.excluded_from_data_pools` |
| `0002_amusing_nocturne.sql` | `email_broadcasts`, 5 nullable columns on `app_config` for broadcast provider |
| `0003_user-sidebar-collapsed.sql` | `users.sidebar_collapsed boolean DEFAULT false NOT NULL` |

All three migrations are **additive** — new tables and new nullable (or
defaulted) columns. None drop or rename anything on existing tables, so a
populated 0.2.x DB upgrades without rewrites or downtime.

The `admin.pages` → `admin.views` rename is **forward-compatible at the
storage layer**: `getFormConfig()` normalises legacy `admin.pages` to
`admin.views` on read (and `admin.defaultPage` → `admin.defaultView`),
so the rest of the codebase never sees the old shape. The same applies to:
- the YAML backup restore endpoint (`POST /api/admin/config/backup`),
- the section-import endpoint (`POST /api/admin/config/admin-import`),
- the JSON `PUT /api/admin/config`.

All three accept either key name as input. Writes emit the canonical
`admin.views` shape. The next save persists the normalised form, so the
legacy `admin.pages` field is gone from the DB row on the first config
save after upgrade (no separate migration step needed).

---

## What you may want to do post-upgrade

Nothing is forced, but a couple of items are worth knowing.

### If you maintain a `config.yaml` (CONFIG_SOURCE=file)
- Rename `admin.pages:` → `admin.views:` in the YAML if you have any.
- Rename `admin.defaultPage:` → `admin.defaultView:`.
- Rename
  `admin.features.autoCreateDashboardPageOnFormCreate:` →
  `admin.features.autoCreateDashboardViewOnFormCreate:`.

Both old and new keys are accepted in 0.3.0; the old ones are scheduled for
removal in 0.4.0. The boot logger warns once if it normalises a legacy key.

### YAML backups taken under 0.2.x
A backup file produced by 0.2.x carries `admin.pages`. Restoring it into
0.3.0 works fine (the restore endpoint maps the keys transparently). A
backup produced under 0.3.0 carries `admin.views` and **cannot be
restored into a 0.2.x deployment** without manual key renaming — keep
this in mind if you maintain an emergency rollback procedure.

### Stable identifiers we deliberately kept
A few public-facing identifiers stayed unchanged so existing operator
scripts, audit-log parsers and bookmarks keep working:

- The dynamic route `/admin/<slug>` is unchanged.
- The internal tab id in `/admin/configuration?tab=pages` is unchanged
  (the URL parameter is "pages", the UI label is "Vues" / "Views").
- The auto-view slug pattern `auto-form-<formId>` is unchanged.
- The audit-log action `config.auto_pages.backfill` is unchanged.
- The admin-import section name `?section=pages` still works alongside
  the new `?section=views`.

---

## Form deletion semantics

0.3.0 closes a long-standing zombie-data gap on `DELETE /api/admin/forms/:id`.
Direct FK paths (submissions, events, grants, version history, webhook
deliveries, data-pool sources & exclusions) already cascade — those are
unchanged. The new behaviour applies to references stored in JSONB columns
that have no FK:

| Reference | 0.2.x | 0.3.0 |
|---|---|---|
| `users.sidebar_layout.pinnedForms` | leaked (zombie UUID) | **stripped** |
| `users.sidebar_layout.formOrder` | leaked | **stripped** |
| `users.sidebar_layout.favorites` | leaked | **stripped** |
| `users.sidebar_layout.categories[].formIds` | leaked | **stripped** |
| `users.sidebar_layout.categories[].itemOrder` (`form:<id>`) | leaked | **stripped** |
| `saved_filters` rows tied to that form's slug | leaked | **DELETED** |
| Auto-generated dashboard view (`autoGeneratedFor === formId`) | deleted (already) | deleted |
| Manual view with `formInstanceId === formId` | left in broken state | **`formInstanceId` unbound**, view kept |
| `form_analytics.form_slug`, `page_views.form_slug` | kept | kept (history is intentional) |

Manual views are **kept, not deleted**: the operator may have invested
real time configuring widgets, columns, filters. Unbinding `formInstanceId`
turns the view into an "all submissions" view that the operator can
re-target or delete on their own terms. The dashboard surfaces a
yellow "all submissions" banner that explains the state.

All sweep counts are reported in the `form.delete` audit event under
`autoPagesRemoved`, `sidebarLayoutsUpdated`, `savedFiltersDeleted`,
`manualViewsUnbound`.

---

## Compatibility matrix

| Direction | Works? |
|---|---|
| 0.2.x → 0.3.0 in-place upgrade | yes (this doc) |
| 0.2.x YAML backup restored into 0.3.0 | yes (key normalisation) |
| 0.3.0 → 0.2.x downgrade | **no** — DB has new tables + columns 0.2.x doesn't know about |
| 0.3.0 YAML backup restored into 0.2.x | **no** — `admin.views` is unrecognised, rename required |

If you need a hot rollback path, take a full DB snapshot before the
0.3.0 boot and restore it instead of trying to downgrade in-place.

---

## What ships in 0.4.0

The fwd-compat layer is intentionally short-lived. In 0.4.0 we remove
read-time normalisation of the legacy keys; YAML files still using
`admin.pages` will fail validation at that point. The audit log already
records when normalisation triggers, so it's easy to see which deployments
still need a YAML rename.
