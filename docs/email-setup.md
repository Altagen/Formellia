# Email setup

Formellia sends transactional email in two flows:

1. **Submitter notifications** — one confirmation per form submission
   (`notifications.email.enabled: true` on the form config).
2. **Broadcasts** — bulk sends to a DataPool-derived audience, triggered
   manually from `/admin/email/broadcasts` (see
   [broadcasts.md](./broadcasts.md)).

Both flows dispatch over the same **HTTP API** (no SMTP) and share the
same provider preset resolver.

## Providers

Since 0.4.0 an **email provider** is a first-class row in the
`email_providers` table, not a per-form config field. Configuration →
**Providers** manages the pool of provider presets:

| Field | Meaning |
|---|---|
| `name` | Display name (`"Resend prod"`) |
| `provider` | `resend` \| `sendgrid` \| `mailgun` |
| `fromAddress`, `fromName` | Sender identity |
| `apiKeyEncrypted` | AES-256-GCM at rest, keyed on `ENCRYPTION_KEY` |
| `apiKeyExpiresAt?` | Optional expiry; UI warns 30 days out, sender refuses past |
| `isDefault` | Exactly one row per instance can be the default |

Every form points at one of these rows via
`notifications.email.providerId` (a UUID). Broadcasts do the same via
`email_broadcasts.provider_id`. When `providerId` is `null` the resolver
falls back to the default row.

Provider CRUD writes emit audit events (`email.provider.create`,
`email.provider.update`, `email.provider.delete`,
`email.provider.set_default`) — see [audit-log.md](./audit-log.md).

## Legacy per-form API keys — dropped

Before 0.4.0 each form could carry its own `apiKey` and
`submitterConfirmation` config, or fall back to
`EMAIL_API_KEY_<SLUG_UPPER>` / `EMAIL_API_KEY` environment variables.
That model is **gone**. On first boot after upgrading, the migration in
`src/lib/email/legacyMigration.ts` copies any per-form key it finds into a
new `email_providers` row (`Migrated from <slug>`) and rewires the form's
`notifications.email.providerId` to it. The old fields are stripped from
`form_instances.config` on the same boot.

You still need `ENCRYPTION_KEY` — it now protects `email_providers` rows.
The `EMAIL_API_KEY_*` env vars are silently ignored.

## Required environment variables

| Variable | Role |
|---|---|
| `ENCRYPTION_KEY` | 64 hex characters. Protects `email_providers.api_key_encrypted`. **Required** at startup. |
| `ENCRYPTION_KEY_PREV` | Optional — old key during rotation. See [security.md](./security.md#encryption). |
| `ADMIN_PASSWORD` | Bootstrap admin password (only used the first time the DB is empty). |

## Template variables

Both notifications and broadcasts share `src/lib/email/template.ts` and
accept `{{var}}` interpolation:

- **System vars** (always injected, never overridden by submitted data):
  - `{{email}}` — submitter's address (notifications only)
  - `{{formName}}` — `meta.name` of the form
  - `{{submittedAt}}` — submission date formatted by the form's `locale`
- **Form fields** (notifications only): every field `id` is available.
  E.g. `{{firstName}}`, `{{lastName}}`, `{{phone}}`. `null`/`undefined`
  values become empty strings.

Broadcasts have no per-recipient variables — their body is one HTML
string shared by every BCC. See
[broadcasts.md](./broadcasts.md#composer) for why.

## Local testing — Resend

Resend lets you test without verifying a domain by using
`onboarding@resend.dev` as the sender. Limit: you can only send to the
**email address registered on the Resend account** until you verify a
domain.

1. Sign up at https://resend.com with your personal address.
2. Grab an API key from the dashboard (starts with `re_`).
3. Boot Formellia (a `.env` with just `ENCRYPTION_KEY` is enough) and
   open the admin at `/admin`.
4. Configuration → Providers → **New provider**:
   - Name: `Resend dev`
   - Provider: `resend`
   - From address: `onboarding@resend.dev`
   - From name: `My Event`
   - API key: paste your `re_…` key
   - Mark as default.
5. In your form's config or via the Notifications tab:
   ```yaml
   notifications:
     email:
       enabled: true
       # providerId can be omitted — the default provider will be used.
       subject: "Registration confirmed — {{formName}}"
       bodyText: |
         Hello {{firstName}},
         ...
   ```
6. Submit the form using the **email address of your Resend account** as
   the recipient. The email arrives within seconds.

## Production — verify a sending domain

To send to arbitrary recipients you must verify a sending domain. Use a
dedicated subdomain (`send.<your-domain>`) so the parent domain's
reputation is not affected by transactional traffic.

1. Resend → Domains → Add domain → `send.example.com`.
2. Resend shows 4 DNS records to add to your zone:

   | Type | Name | Content |
   |---|---|---|
   | TXT | `resend._domainkey.send` | DKIM key (long string starting with `p=…` or `v=DKIM1; k=rsa; p=…`) |
   | MX  | `send.send`              | `feedback-smtp.<region>.amazonses.com` priority 10 |
   | TXT | `send.send`              | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc`                 | `v=DMARC1; p=none;` |

   The `send.send.<domain>` records are not a typo — Resend uses Amazon
   SES under the hood, which requires a custom MAIL FROM subdomain for
   bounce handling.

3. Verify propagation:
   ```bash
   dig +short TXT resend._domainkey.send.example.com @1.1.1.1
   dig +short MX  send.send.example.com @1.1.1.1
   dig +short TXT send.send.example.com @1.1.1.1
   dig +short TXT _dmarc.example.com @1.1.1.1
   ```
4. Click **Verify DNS Records** on Resend. Once verified, edit your
   provider preset and set `fromAddress` to any address on that domain
   (e.g. `noreply@send.example.com`).

## SendGrid / Mailgun

- **SendGrid**: single-sender verification is enough to get started, but
  enable DKIM for deliverability. The `fromAddress` domain is free once
  verified.
- **Mailgun**: a domain is mandatory. The domain is derived automatically
  from `fromAddress` (the part after the `@`).

Batch sizes per provider (broadcasts only) are documented in
[broadcasts.md](./broadcasts.md#sender).

## Troubleshooting

Submitter notifications are *fire-and-forget* — the submission always
succeeds, the email error appears only in server logs:

```
[email] Email notification failed err=Resend error 401: …
```

Broadcast errors are surfaced in the UI: the row flips to `failed` with
`last_error` populated (recipient addresses redacted).

| Symptom | Likely cause |
|---|---|
| `Broadcast provider not configured` | No default provider + the form/broadcast has no `providerId`. Set one in Configuration → Providers. |
| `Resend error 401` | Invalid or revoked key. |
| `Resend error 422 You can only send to your own email address` | Domain not verified, recipient ≠ Resend account address. Verify a domain or test using your own email. |
| `API key expired on YYYY-MM-DD` | `apiKeyExpiresAt` in the provider row has passed. Update it through the UI. |
| Broadcast stuck in `sending` for > 10 min | Container died mid-send. The nightly reaper flips it back to `failed` within 5 minutes so you can re-send. |
| No error log, no email received | Check spam. On Resend → *Logs* tab in the dashboard. |

## Disabling email

Per form:

```yaml
notifications:
  email:
    enabled: false
```

Or remove the `notifications` key entirely. To pause a provider globally
without deleting it, remove `isDefault` and leave every form's
`providerId` explicit — new forms will refuse to send until you re-point
them.
