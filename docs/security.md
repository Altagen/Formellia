# Security model

Self-hosted by design — there is no shared service to leak into. This
page documents the controls that ship by default and the knobs to tune
for a production deployment.

## Threat model in one paragraph

Formellia stores **form submissions** (sometimes PII), **admin
credentials**, and **integration secrets** (email API keys, S3
credentials). The hostile attacker has network access to the public
form endpoint and possibly a stolen session cookie; the careless
operator has shell on the box but mustn't be able to dump plaintext
API keys from the database. The model is built around those two
realities.

## Authentication

- **Sessions**: [Lucia v3](https://lucia-auth.com) — server-side
  sessions identified by a `auth_session` cookie. Signed with
  `AUTH_SECRET` (≥ 32 chars). `HttpOnly` + `Secure` + `SameSite=Lax`
  in production.
- **Lifetime**: `SESSION_DURATION_DAYS` (default 30, range 1–365).
  Changed live from the admin UI, written to `app_config_doc.sessionDurationDays`.
- **Passwords**: hashed with **Argon2id** (memory-hard, side-channel
  resistant). Strength policy is optional and DB-toggled
  (`app_config.enforcePasswordPolicy`). When on, zod requires ≥ 12
  characters, mixed case + digit + symbol.
- **Recovery**: email-based reset tokens stored AES-encrypted and
  single-use. `NEXT_PUBLIC_APP_URL` is used to build the reset link.
- **Login rate limit**: per-IP, configurable (`login_rate_limit_max_attempts`,
  `login_rate_limit_window_minutes`). The 429 response is returned
  before any password check, so brute-force attempts can't time-side-channel
  account existence.

## Authorization

- **Roles**: `admin`, `editor`, `agent`, `viewer`.
- **Per-form grants**: roles can be scoped to specific forms via
  `user_form_grants` — useful when several teams share an instance.
- **Mutation guard**: every admin API route calls
  `requireAdminMutation` (CSRF token check) **and** `requireRole(...)`.
  Both must pass.
- **Admin host gate** (optional): set `ADMIN_HOST=admin.example.com`
  to make `/admin*`, `/api/admin*`, `/api/auth*` return **404** when
  the `Host` header doesn't match. Lets you publish the public form on
  one domain and lock the admin to another, behind a different DNS or
  even a VPN.

## Secrets at rest

- **`ENCRYPTION_KEY`** — 64 hex characters. Mandatory at boot, the
  process exits if missing or malformed. Used for AES-256-GCM
  encryption of:
  - Email provider API keys (`email_providers.api_key_encrypted`, one
    row per preset — see [email-setup.md](./email-setup.md))
  - Password reset tokens
  - S3 credentials in backup providers
  - Backup archive contents when a per-provider passphrase is set
- **`AUTH_SECRET`** — ≥ 32 chars. Signs session cookies. Rotating
  it invalidates every active session at once.
- Both live in `.env` (production: `/srv/formellia/.env`, `chmod 600`).
  Neither is exposed to the client. The boot YAML scanner refuses any
  key that looks like a secret (see [Secret scrubbing](#secret-scrubbing-in-yaml)).

## Input validation

zod schemas run at every API boundary:

- **YAML config** — `src/lib/yaml/configSchema.ts`. Rejects unknown
  top-level keys, requires `slug` / `name` on forms, validates step
  and field shapes.
- **Form submissions** — `src/app/api/forms/[slug]/submit/route.ts`
  validates against the form's own field schema (built from the YAML
  step definitions). Repeater rows are validated row by row.
- **Admin API mutations** — every PATCH / POST / DELETE has its own
  zod schema (slug shape, role values, etc.).

## Secret scrubbing in YAML

`src/lib/yaml/configSchema.ts` runs a `scanForSecrets` recursive pass
**after** parsing. Any **string** value under a key matching:

```
api.?key | apikey | password | passphrase | passwd | secret | token
| credential | private.?key | auth.?key | oauth | bearer | hmac
| encryption.?key | signing.?key
```

is rejected with a clear error pointing to the offending path. Same
for values that match the typical-secret regexes (32+ hex chars, 40+
base64 chars).

The check is **scoped to string values** — booleans (`app.enforcePasswordPolicy:
true`) and numbers pass through. This was the 0.2.0 fix; older versions
flagged `enforcePasswordPolicy` because of the substring `password`.

## CSRF

- **Mutating admin routes** require a CSRF header read from the same
  session cookie payload. The client adds it from the bootstrapped
  session.
- Read-only routes (`GET`) are not CSRF-protected — they have no
  side effect.
- The pattern is implemented in `src/lib/auth/validateSession.ts` →
  `requireAdminMutation`.

## Rate limiting

`src/lib/security/` ships small in-process token-bucket-style rate
limiters keyed by IP and / or email. Used on:

- `/api/auth/login` — login attempts
- `/api/forms/[slug]/submit` — form submissions (per-IP and per-email)
- `/api/admin/backup/restore` — restore attempts (this is the one the
  e2e BKSEC-04 / BKSEC-05 flakes hit — the same suite saturates the
  budget by design)
- `/api/auth/recovery` — password reset triggers

`getClientIp` honours `X-Forwarded-For` **only when** `TRUSTED_PROXY`
is set — without it, a hostile client can't spoof a different IP via
the header.

## Honeypot + bot filtering

Forms can declare:

```yaml
security:
  honeypot:
    enabled: true
  rateLimit:
    enabled:    true
    maxPerHour: 20
    maxPerDay:  100
```

- The honeypot renders a hidden field that legitimate browsers leave
  empty; submissions where it's filled are accepted (HTTP 200) but
  silently discarded.
- The per-form rate limit applies on top of the global one.
- The honeypot is a **default-on** behaviour for forms that opt in
  via the schema. There is no captcha by design.

## Audit log

Every admin mutation is appended to `admin_events` via
`logAdminEvent(...)` — fire-and-forget so no request blocks on the write.

| Column | Content |
|---|---|
| `userId`, `userEmail` | who did it |
| `action` | e.g. `config.update`, `form.import`, `user.delete` |
| `resourceType`, `resourceId` | what was touched |
| `details` (JSONB) | the patch payload |
| `createdAt` | timestamp (indexed) |

Visible in the admin under **Audit log** — no feature flag. The nightly
purge respects `admin.auditRetention.policy` (`keep_all` or `days`) with
a 1-day floor to guard against a misconfigured 0-day nuke. Manual purges
self-log an `audit.purge` event **before** deleting, so the purge is
always recoverable via the log itself. Full model in
[audit-log.md](./audit-log.md).

## Email broadcasts — PII handling

Broadcast recipient addresses are **not stored on the broadcast row**.
`email_broadcasts.data_pool_ids` + `additional_recipients` describe how
to resolve them at send time; the row keeps only aggregate counters
(`sent_count`, `failed_count`, `recipient_count`) plus a redacted
`last_error`.

The sender walks provider errors through `redactErrorBody(...)` which
scrubs anything matching an email-address regex before persisting to
`last_error`. This keeps the log helpful without leaving a long-lived
row that lists who received (or bounced) a given send.

Broadcast provider API keys live in `email_providers.api_key_encrypted`
just like per-form notification keys — same rotation flow, same
[Re-encrypt](#encryption-at-rest--implementation-note) system endpoint.

## Encryption at rest — implementation note

`src/lib/security/aesGcm.ts` is a thin wrapper around node's
`crypto.subtle`. Each encrypted blob is `iv:ciphertext:authTag` with
random 12-byte IVs. `ENCRYPTION_KEY` itself is 32 bytes (decoded from
the 64 hex chars).

Rotating the key:

1. Set a new `ENCRYPTION_KEY` and add the old one to
   `ENCRYPTION_KEY_LEGACY` (semicolon-separated if multiple).
2. Boot — the decrypt path tries the current key first, then each
   legacy key.
3. From the admin UI, **System → Re-encrypt** rewrites every blob
   with the current key (use the `/api/admin/system/reencrypt`
   endpoint or its UI button).
4. After confirmation, remove `ENCRYPTION_KEY_LEGACY`.

## Backups

- Local provider: writes a ZIP archive to a configurable path. The
  archive is itself AES-encrypted with a per-provider key when
  `passphrase` is set.
- S3 provider: same archive, uploaded to a bucket. Credentials live
  encrypted in `backup_providers.encryptedConfig`.
- Restore: `restoreFromYaml` validates structure before touching the
  DB and rejects pages without a string `id` in append mode.

## What we deliberately *don't* do

- **No external auth (OIDC / OAuth) yet** — self-hosted, no IdP.
  Possible but explicitly out of scope for the lean deploy story.
- **No captcha** — honeypot + per-IP rate limit have caught every
  bot wave we've seen on real deploys.
- **No Redis cache** — the in-process caches are small and busted on
  every PATCH that could change them. A multi-replica deploy needs
  sticky sessions (Lucia is server-side, but cache invalidation is
  per-process for now — track as a follow-up).
- **No mTLS between app and DB by default** — Postgres listens on the
  internal compose network; published-port + SSL is the operator's
  choice if needed.

## Reporting a vulnerability

Open a [private security advisory](https://github.com/Altagen/Formellia/security/advisories)
on GitHub. Avoid public issues for anything credentials-adjacent.
