# Email setup

Formellia sends a confirmation email to each submitter (the address entered
in the form's `email` field) when `notifications.email.enabled: true`.
Three providers are supported.

## Providers and API key resolution

Sending happens over **HTTP API** (no SMTP). Code:
`src/lib/email/sender.ts`.

API key resolution order (`resolveApiKey`):

1. **`apiKeyEncrypted`** stored in DB (UI → Notifications tab, key encrypted
   AES-256-GCM with `ENCRYPTION_KEY`). May have an optional
   `apiKeyExpiresAt` that blocks sending past expiry.
2. **`EMAIL_API_KEY_{SLUG_UPPER}`** — form-specific key. The slug is
   canonicalized: `/` → `ROOT`, `my-form` → `MY_FORM`.
3. **`EMAIL_API_KEY`** — global fallback for every form.
4. No key found → sending is attempted and fails silently (the DB
   submission still succeeds).

## Useful environment variables

| Variable | Role |
|---|---|
| `ENCRYPTION_KEY` | 64 hex characters — used to encrypt API keys stored in DB. **Required** at startup. |
| `EMAIL_API_KEY` | Global API key (fallback) |
| `EMAIL_API_KEY_ROOT` | API key for the form with `slug: "/"` |
| `EMAIL_API_KEY_<SLUG_UPPER>` | API key for a specific form |
| `ADMIN_PASSWORD` | Admin password (created at boot if missing) |
| `ADMIN_UPDATE_PASSWORD_ON_RESTART` | `true` → updates the password on every restart |

## Variables interpolable in `subject` / `bodyText`

The template engine (`src/lib/email/template.ts`) accepts `{{var}}`:

- **System vars** (always injected, never overridden by submitted data):
  - `{{email}}` — submitter's address
  - `{{formName}}` — `meta.name` of the form
  - `{{submittedAt}}` — submission date formatted by the form's `locale`
- **Form fields**: every field `id` is available. E.g. `{{firstName}}`,
  `{{lastName}}`, `{{phone}}`. Values that are `null`/`undefined` become an
  empty string.

## Local testing — Resend (recommended)

Resend lets you test without verifying a domain by using
`onboarding@resend.dev` as the sender. Limit: you can only send to the
**email address registered on the Resend account** until you verify a
domain.

1. Create an account at https://resend.com using your personal address.
2. Grab an API key from the dashboard (starts with `re_`).
3. Add it to `.env`:
   ```
   EMAIL_API_KEY_ROOT=re_xxxxxxxxxxxxxxxxxxxx
   ```
   (the form slug is `/`, so the suffix is `_ROOT`).
4. In the YAML:
   ```yaml
   notifications:
     email:
       enabled:     true
       provider:    "resend"
       fromAddress: "onboarding@resend.dev"
       fromName:    "My Event"
       subject:     "Registration confirmed — {{formName}}"
       bodyText: |
         Hello {{firstName}},
         ...
   ```
5. Submit the form using the **email address of your Resend account** as
   the recipient. The email arrives within seconds.

## Production — verify a sending domain

To send to arbitrary recipients you must verify a sending domain on Resend.
Use a dedicated subdomain (`send.<your-domain>`) so the parent domain's
reputation is not affected by transactional traffic.

1. Resend → Domains → Add domain → `send.example.com`.
2. Resend shows 4 DNS records to add to your zone:

   | Type | Name | Content |
   |---|---|---|
   | TXT | `resend._domainkey.send` | DKIM key (long string starting with `p=...` or `v=DKIM1; k=rsa; p=...`) |
   | MX  | `send.send`              | `feedback-smtp.<region>.amazonses.com` priority 10 |
   | TXT | `send.send`              | `v=spf1 include:amazonses.com ~all` |
   | TXT | `_dmarc`                 | `v=DMARC1; p=none;` |

   The `send.send.<domain>` records are not a typo — Resend uses Amazon SES
   under the hood, which requires a custom MAIL FROM subdomain for bounce
   handling.

3. Verify propagation:
   ```bash
   dig +short TXT resend._domainkey.send.example.com @1.1.1.1
   dig +short MX  send.send.example.com @1.1.1.1
   dig +short TXT send.send.example.com @1.1.1.1
   dig +short TXT _dmarc.example.com @1.1.1.1
   ```
4. Click **Verify DNS Records** on Resend. Once verified, set the YAML's
   `fromAddress` to any address on that domain (e.g.
   `noreply@send.example.com`).

## Local testing — SendGrid / Mailgun alternatives

- **SendGrid**: single-sender verification is enough to get started, but
  enable DKIM for deliverability. The `fromAddress` domain is free once
  verified.
- **Mailgun**: a domain is mandatory. The domain is derived automatically
  from `fromAddress` (the part after the `@`).

## Troubleshooting

Sending is *fire-and-forget* — the submission always succeeds, the email
error appears only in server logs:

```
[email] Email notification failed err=Resend error 401: ...
```

Common cases:

| Symptom | Likely cause |
|---|---|
| `No API key available for form "/"` | None of the 3 sources has a key. Set `EMAIL_API_KEY_ROOT`. |
| `Resend error 401` | Invalid or revoked key. |
| `Resend error 422 You can only send to your own email address` | Domain not verified, recipient ≠ Resend account address. Verify a domain or test using your own email. |
| `API key expired on YYYY-MM-DD` | `apiKeyExpiresAt` in DB has passed. Update it through the UI. |
| No error log but no email received | Check spam. On Resend → *Logs* tab in the dashboard. |

## Disabling email

```yaml
notifications:
  email:
    enabled: false
```

Or remove the `notifications` key entirely.
