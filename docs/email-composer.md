# Email composer (manual broadcasts)

The composer lets an operator compose a single HTML email and send it to the
deduplicated union of one or more DataPools. Introduced in **0.3.0** as a
manual-broadcast feature — not a newsletter (see
[the newsletter rationale](#why-this-isnt-a-newsletter) below).

## When to use it

You have a list of people (organisers, attendees, customers) who filled out a
form and you want to send them a one-off message — an update about the event,
a thank-you note, a follow-up survey.

The composer is not appropriate for:

- Recurring marketing campaigns to an unbounded audience → that requires
  permanent unsubscribe handling (Art. 21(2)). Wait for the future newsletter
  feature.
- Transactional notifications tied to a form submission → use the per-form
  `notifications.email` configuration (`docs/email-setup.md`).

## How it works

1. Compose a draft in **Admin → Diffusions email → Nouveau brouillon**.
2. Pick one or more DataPools as the recipient source. The composer
   computes the union, deduplicates on email (case-insensitive), and removes
   any submissions flagged via the per-pool or global exclusion list.
3. Hit **Prévisualiser** to:
   - See the exact HTML the provider will receive (sanitized + CSS-inlined),
   - Verify the recipient count and a redacted sample of addresses.
4. Hit **Envoyer** to fire. Recipients ride in **BCC** so they can't see each
   other, and the message is split into provider-appropriate batches:

   | Provider | Batch size |
   |---|---|
   | Resend  | 50 BCC / request |
   | SendGrid | 999 BCC / request |
   | Mailgun  | 1 000 to / request (recipient-variables enabled) |

5. Status updates in real time. On success the row is marked `sent` with the
   recipient count + sent/failed counts; on failure `last_error` is set.

## Setting up the global provider

The composer uses a **single global provider** rather than per-form keys (a
broadcast is a deployment-level operation, not a form-level one). Configure
it once at **Admin → Diffusions email → Provider d'envoi global** (or via
`PUT /api/admin/email/provider`):

| Field | Notes |
|---|---|
| Provider | `resend`, `sendgrid` or `mailgun` |
| Email expéditeur | Must match the verified sender / domain on your provider |
| Nom expéditeur | Optional display name |
| Clé API | Stored AES-256-GCM encrypted in `app_config.broadcast_email_api_key_encrypted` — never echoed back |
| Expiration | Optional rotation reminder; sends are refused once passed |

The encryption key is the same `ENCRYPTION_KEY` that protects per-form keys,
so an `ENCRYPTION_KEY` rotation (`/api/admin/system/reencrypt`) migrates this
column transparently.

## Security model

- **WYSIWYG output sanitised on the server.** TipTap produces clean-ish HTML
  on the client, but the server re-runs `DOMPurify` with an email-friendly
  allow-list (`p, div, a, table, …, style` attributes allowed; `script`,
  inline event handlers, `javascript:`/`data:` URLs blocked) before passing
  the HTML to the send engine.
- **CSS inlining.** [juice](https://github.com/Automattic/juice) folds
  `<style>` blocks into inline `style=` attributes — required for Gmail and
  Outlook which strip the `<head>` entirely.
- **BCC isolation.** Recipients never see each other's addresses in any
  provider mode.
- **No tracking pixel.** No click rewriting. The composer never injects
  anything that wasn't in the operator's HTML.
- **Audit log.** Every action (`email.broadcast.draft`, `…update`,
  `…delete`, `…send`, `…send.failed`, `email.provider.update`) is recorded
  in `admin_events` via `logAdminEvent`.

## GDPR notes

- **No copies of personal data.** The broadcast row references the source
  DataPools by id. Recipient addresses are recomputed at send time. If a
  submission is erased (Art. 17) between draft and send, the person drops
  out of the recipient list automatically.
- **The recipient count snapshot (`recipient_count`) is operator metadata**,
  not personal data. It's the number of distinct emails resolved when the
  send was fired.
- **Exclusions are honoured.** Both the per-pool exclusion
  (`data_pool_submission_exclusions`) and the global soft-exclude
  (`submissions.excludedFromDataPools`) remove the row from the recipient
  set before the engine sees it.
- **No permanent suppression list.** This is a manual operational tool, not
  a marketing channel. If you need a hashed permanent-suppression list, wait
  for the future newsletter feature.

## API reference

All endpoints live under `/api/admin/email/`. Admin role required;
state-changing routes also require a same-origin POST/PATCH/DELETE (Lucia
session + CSRF check on `Origin`).

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/admin/email/provider` | Current global config (safe shape — no plaintext key) |
| `PUT`  | `/api/admin/email/provider` | Partial update; `apiKey: ""` clears the stored key, `apiKey: undefined` leaves it alone |
| `GET`  | `/api/admin/email/broadcasts` | List broadcasts (most recent first) |
| `POST` | `/api/admin/email/broadcasts` | Create a draft |
| `GET`  | `/api/admin/email/broadcasts/:id` | Read |
| `PATCH`| `/api/admin/email/broadcasts/:id` | Update draft fields (409 if not `draft`) |
| `DELETE`| `/api/admin/email/broadcasts/:id` | Delete |
| `POST` | `/api/admin/email/broadcasts/:id/preview` | Build the final HTML + resolve recipients without sending |
| `POST` | `/api/admin/email/broadcasts/:id/send` | Fire (transitions `draft → sending → sent | failed`) |

Validation schemas live in `src/lib/email/broadcastValidation.ts`.

## File map

| Path | Role |
|---|---|
| `src/lib/db/schema.ts` | `emailBroadcasts` table + 5 broadcast columns on `appConfig` |
| `migrations/0002_amusing_nocturne.sql` | Generated migration |
| `src/lib/email/broadcastSanitize.ts` | DOMPurify wrapper + HTML→text fallback |
| `src/lib/email/broadcastConfig.ts` | Read / write global provider config (uses `crypto.ts` for AES-GCM) |
| `src/lib/email/broadcastSender.ts` | Provider-specific batch send (Resend / SendGrid / Mailgun) |
| `src/lib/email/broadcastService.ts` | Orchestration: preview build + execute |
| `src/lib/email/broadcastCrud.ts` | Drizzle CRUD over `email_broadcasts` |
| `src/lib/email/broadcastValidation.ts` | zod schemas (create/update/config) |
| `src/app/api/admin/email/**` | REST endpoints |
| `src/app/admin/(dashboard)/email/**` | Admin UI (list / composer / provider config) |
| `src/components/admin/email/RichTextEditor.tsx` | TipTap wrapper used by the composer |

## Why this isn't a newsletter

GDPR splits the legal grounds:

- **Manual broadcast (this feature)** = operational comms / legitimate interest.
  Art. 17 (erasure) is the only obligation that's perpetual — handled by the
  FK-based exclusion design that breaks cleanly on hard-delete.
- **Newsletter (future)** = direct marketing under Art. 21(2). Requires a
  **permanent suppression list** (hashed emails that survive the deletion
  of the source submission), plus a public `/unsubscribe/[token]` route, plus
  Gmail/Yahoo-compliant headers for bulk senders.

The 0.3.0 design reuses everything for the newsletter when it ships — the
broadcast send engine, the DataPool aggregator, the composer UI, the
provider HTTP layer. See the maintainers' note in
`project_newsletter_future_groundwork.md` (memory) for the detailed
forward-compat analysis.
