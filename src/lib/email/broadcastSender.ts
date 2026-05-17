/**
 * Broadcast sender — fans out one HTML email to N recipients via BCC batches.
 *
 * Why BCC and not personalisation? The 0.3.0 composer is a **manual** broadcast
 * tool (organiser → invited attendees), not a newsletter. Per-recipient
 * personalisation (`{{firstName}}`) and unsubscribe tokens are intentionally
 * deferred — they require the suppression-list infrastructure that comes with
 * the future newsletter feature (see `project_newsletter_future_groundwork`
 * in the maintainers' memory). BCC keeps the recipients invisible to each
 * other and ships fast.
 *
 * Batch sizes mirror what each provider accepts in a single API call:
 *   - Resend   : 50 BCC addresses per request (their hard cap is also 50)
 *   - SendGrid : 1000 personalizations (we use 1 personalization + 999 BCCs;
 *                their hard cap is 1000 across all to+cc+bcc)
 *   - Mailgun  : 1000 to-addresses per request (their batch endpoint)
 *
 * On error mid-loop, we collect the failure and continue the next batch. The
 * caller wraps the whole thing and writes back `sent_count`, `failed_count`
 * and `last_error` to `email_broadcasts`.
 */
import { decryptApiKey } from "./crypto";
import type { BroadcastEmailConfigInternal } from "./broadcastConfig";

const BATCH_SIZE: Record<string, number> = {
  resend:   50,
  sendgrid: 999,   // 1 to + 999 bcc = 1000 personalizations
  mailgun:  1000,
};

export interface SendBroadcastOptions {
  config:   BroadcastEmailConfigInternal;
  /** Recipients — already deduplicated and free of empty strings. */
  to:       string[];
  subject:  string;
  /** Sanitised + CSS-inlined HTML. The sender does NOT sanitize again. */
  html:     string;
  /** Plain-text alternative. Required for spam-filter compliance. */
  text:     string;
}

export interface BroadcastSendReport {
  sent:    number;
  failed:  number;
  /** First provider error encountered (subsequent ones are dropped to keep the row tidy). */
  error?:  string;
}

export async function sendBroadcast(opts: SendBroadcastOptions): Promise<BroadcastSendReport> {
  const { config, to, subject, html, text } = opts;
  if (!config.provider)        throw new Error("Broadcast provider not configured");
  if (!config.fromAddress)     throw new Error("Broadcast from address not configured");
  if (!config.apiKeyEncrypted) throw new Error("Broadcast API key not configured");

  // Refuse expired keys — operator must rotate explicitly. Identical guard to
  // the per-form sender so behaviour stays predictable.
  if (config.apiKeyExpiresAt) {
    const expiry = new Date(config.apiKeyExpiresAt);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < new Date()) {
      throw new Error(`Broadcast API key expired on ${config.apiKeyExpiresAt}. Rotate it before sending.`);
    }
  }
  const apiKey = decryptApiKey(config.apiKeyEncrypted);

  const from = config.fromName
    ? `${config.fromName} <${config.fromAddress}>`
    : config.fromAddress;

  const batchSize = BATCH_SIZE[config.provider] ?? 50;
  const batches: string[][] = [];
  for (let i = 0; i < to.length; i += batchSize) batches.push(to.slice(i, i + batchSize));

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;

  for (const batch of batches) {
    try {
      switch (config.provider) {
        case "resend":
          await sendViaResend({ apiKey, from, to: config.fromAddress, bcc: batch, subject, html, text });
          break;
        case "sendgrid":
          await sendViaSendGrid({ apiKey, fromAddress: config.fromAddress, fromName: config.fromName, to: config.fromAddress, bcc: batch, subject, html, text });
          break;
        case "mailgun":
          await sendViaMailgun({ apiKey, from, fromAddress: config.fromAddress, to: batch, subject, html, text });
          break;
        default:
          throw new Error(`Unknown broadcast provider: ${config.provider}`);
      }
      sent += batch.length;
    } catch (e: unknown) {
      failed += batch.length;
      if (!firstError) firstError = e instanceof Error ? e.message : String(e);
    }
  }

  return { sent, failed, error: firstError };
}

// ── Resend ──────────────────────────────────────────────────────────────────
// "to" is the sender's own address (so the message has a valid To header for
// inbox display) and the real recipients ride in "bcc". This matches how
// Resend itself recommends doing batch mailings.
async function sendViaResend({ apiKey, from, to, bcc, subject, html, text }: {
  apiKey: string; from: string; to: string; bcc: string[];
  subject: string; html: string; text: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({ from, to: [to], bcc, subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── SendGrid ────────────────────────────────────────────────────────────────
// SendGrid uses `personalizations[].bcc` for batch BCCs; the sender's own
// address is the visible recipient.
async function sendViaSendGrid({ apiKey, fromAddress, fromName, to, bcc, subject, html, text }: {
  apiKey: string; fromAddress: string; fromName: string | null; to: string; bcc: string[];
  subject: string; html: string; text: string;
}) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      personalizations: [{
        to:  [{ email: to }],
        bcc: bcc.map(email => ({ email })),
      }],
      from: { email: fromAddress, name: fromName ?? undefined },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html",  value: html },
      ],
    }),
  });
  if (!res.ok && res.status !== 202) {
    const body = await res.text().catch(() => "");
    throw new Error(`SendGrid error ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── Mailgun ─────────────────────────────────────────────────────────────────
// Mailgun supports batch mailings natively via comma-separated `to`. Each
// recipient receives an individualised message so there's no privacy leak
// even though they're all in one API call.
async function sendViaMailgun({ apiKey, from, fromAddress, to, subject, html, text }: {
  apiKey: string; from: string; fromAddress: string; to: string[];
  subject: string; html: string; text: string;
}) {
  const domain = fromAddress.split("@")[1];
  if (!domain) throw new Error("Mailgun: cannot derive domain from fromAddress");

  // recipient-variables tells Mailgun "send to each address individually"; even
  // an empty object suffices to disable the "all recipients see each other"
  // behaviour that the bare /messages endpoint would otherwise produce.
  const recipientVars = Object.fromEntries(to.map(addr => [addr, {}]));

  const params = new URLSearchParams({
    from,
    to: to.join(","),
    subject, html, text,
    "recipient-variables": JSON.stringify(recipientVars),
  });
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type":  "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailgun error ${res.status}: ${body.slice(0, 200)}`);
  }
}
