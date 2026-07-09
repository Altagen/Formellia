# Email broadcasts

A **broadcast** is a manual, admin-triggered email to a curated audience.
Think "call for speakers, second edition" or "we moved rooms, here is the
new schedule". It is deliberately **not** a newsletter — no per-recipient
personalisation, no unsubscribe token, no scheduled sends. The
newsletter-shaped features (Art. 21(2) suppression lists, one-click
unsubscribes, per-domain throttling) live behind the same DataPool model
but are out of scope until we ship them.

## Model

| Table | Purpose |
|---|---|
| `email_broadcasts` | Broadcast identity + status + body |
| `email_providers` | Per-instance SMTP/API provider credentials (encrypted) |

An `email_broadcast` row carries:

- `subject`, `bodyHtml`, `bodyText` — the message
- `dataPoolIds: uuid[]` — union of the pools that feed the recipient list
- `additionalRecipients: text[]` — a small handful of free-text addresses
  added on top of the pool union (an operator asked to CC one extra person)
- `providerId?: uuid` — which `email_providers` row does the sending; falls
  back to the default provider when null
- `status: 'draft' | 'sending' | 'sent' | 'failed'`
- `sentCount`, `failedCount`, `recipientCount`, `lastError` — populated on
  send

## Composer

`/admin/email/broadcasts/{id}` is a two-pane composer:

- Left pane: recipient controls (pools multi-select, additional recipients
  editor, provider dropdown, per-provider expiry warning).
- Right pane: subject + tiptap rich-text editor + live preview panel.

The preview renders through the same pipeline the send path uses so
"looks fine in the preview → looks fine in the inbox":

1. `juice(bodyHtml, { removeStyleTags: true })` inlines the `<style>`
   block into per-element `style=""` attributes (essential for the
   subset of CSS most inboxes accept).
2. `DOMPurify.sanitize(inlined)` strips `<script>`, event handlers,
   `javascript:` URLs and anything that would render differently in a
   webmail hostile environment.
3. `htmlToPlainText(html)` derives the `bodyText` fallback when the
   operator hasn't hand-written one. Extraction goes through DOMPurify
   again so no HTML entity leaks into the plain-text alternative.

The order (juice **then** sanitize) is locked in by
`broadcastPipeline.test.ts`. Reversing it means DOMPurify removes the
`<style>` block before juice sees it and every email arrives unstyled.

## Sender

The batched fan-out engine lives in `src/lib/email/broadcastSender.ts`.
It receives the resolved provider config + the final recipient list and:

- Chunks the recipients into per-provider batch sizes:
  - Resend: **50** BCC / call
  - SendGrid: **999** personalizations / call (one `to` + 999 `bcc`)
  - Mailgun: **1000** individualised `to` addresses / call
- Refuses to send when `email_providers.api_key_expires_at < today` — the
  operator must rotate first.
- On mid-loop failure it counts the failed batch, remembers the first
  error, and **continues** with the remaining batches. A single blocked
  address never nukes a whole broadcast.
- Redacts recipient email addresses out of provider error bodies before
  persisting to `email_broadcasts.last_error`, so PII never lingers in a
  long-lived row.

## Sending flow

The operator clicks **Send**. The frontend hits
`POST /api/admin/email/broadcasts/{id}/send` which:

1. `claimForSend(id)` atomically flips the row from `draft` or `failed`
   to `sending` in a single UPDATE. Rejected if the row is already
   `sending` or `sent` — this closes the double-click TOCTOU.
2. Resolves the provider preset (`providerId` explicit → default →
   error) and gets the decrypted API key.
3. Resolves the recipient union: `getMergedDataPoolKeys(pool_ids)` +
   `normalizeAdditionalRecipients(additional_recipients)`.
4. Calls `sendBroadcast(...)` which walks the batches.
5. Persists the outcome via `markBroadcastSent(...)` (row → `sent` or
   `failed`) with `sent_count`, `failed_count`, `last_error`.
6. Emits `email.broadcast.send` or `email.broadcast.send.failed` to the
   audit log.

If the process dies between steps 1 and 5 the row is stuck in `sending`
forever. The scheduler runs a **stuck-broadcast reaper every 5 minutes**
(see [`src/lib/scheduler/scheduler.ts`](../src/lib/scheduler/scheduler.ts)):
rows that have been `sending` for more than 10 minutes get flipped back to
`failed` with a synthetic `last_error`, restoring the composer's "edit +
re-send" path.

## Email providers

Configuration → **Providers** manages the pool of `email_providers` rows.
Each row carries:

- `name` — display name (`"Resend prod"`, `"SendGrid staging"`)
- `provider` — `resend | sendgrid | mailgun`
- `fromAddress`, `fromName`
- `apiKeyEncrypted` — AES-256-GCM at rest, keyed on `ENCRYPTION_KEY`
  (rotation via `ENCRYPTION_KEY_PREV`, see
  [security.md](./security.md#encryption))
- `apiKeyExpiresAt?` — optional expiry date; the composer surfaces a
  warning banner starting 30 days out
- `isDefault: boolean` — exactly one row per instance can be the default;
  `set_default` is atomic

Every provider write is audited (`email.provider.create`,
`email.provider.update`, `email.provider.delete`,
`email.provider.set_default`) and each form's notification tab exposes a
dropdown that resolves down to one of these rows.

The old per-form `apiKey` field is dropped from `form_instances.config`
in favour of `providerId`. The bootstrap migration converts existing
config on first boot; details in
[email-setup.md](./email-setup.md#0-4-0-migration).

## Broadcast list UI

`/admin/email/broadcasts` shows the broadcast archive as a table (desktop)
or card list (mobile) with:

- Subject preview + provider badge (which preset was used)
- Sent count / recipient count with a % completion indicator
- Sent-at date, status pill
- Row menu: edit (drafts + failed only), duplicate, delete

The provider column and toolbar badge make it obvious at a glance
which provider a given broadcast used — helpful when a domain reputation
issue appears and you need to trace which sends went through it.
