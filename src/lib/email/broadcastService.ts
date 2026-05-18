/**
 * High-level orchestration for the email composer:
 *
 *   - buildPreview()    — resolve recipients, sanitize the body, inline CSS
 *                         (juice), produce the final HTML + plain text the
 *                         provider would receive.
 *   - executeBroadcast() — same prep then call the send engine, then write
 *                         back counts to `email_broadcasts`.
 *
 * Keeping the sanitization + CSS-inlining + preview path identical to the
 * actual-send path means what the operator sees in the preview pane is
 * byte-for-byte what the inbox receives.
 */
import juice from "juice";
import { getMergedDataPoolKeys } from "@/lib/datapools/compute";
import { dedupKeysAcrossLists } from "@/lib/datapools/dedup";
import { sanitizeBroadcastHtml, htmlToPlainText } from "./broadcastSanitize";
import { sendBroadcast, type BroadcastSendReport } from "./broadcastSender";
import { getBroadcastEmailConfig } from "./broadcastConfig";
import { markBroadcastSent, markBroadcastFailed } from "./broadcastCrud";
import { normalizeAdditionalRecipients } from "./additionalRecipients";
import type { EmailBroadcast } from "@/lib/db/schema";

export interface BroadcastPreview {
  /** Distinct recipient email addresses (post DataPool union + dedup). */
  recipients:   string[];
  recipientCount: number;
  /** Final HTML — sanitized + CSS-inlined. Identical to what the provider sees. */
  html:         string;
  /** Plain-text alternative (HTML stripped). */
  text:         string;
  /** Echo of the subject (for completeness in the preview pane). */
  subject:      string;
}

/**
 * Compose-side only: take a broadcast row and produce the ready-to-send
 * artefacts without contacting the provider. Suitable for the "Preview"
 * button in the composer.
 */
export async function buildBroadcastPreview(broadcast: EmailBroadcast): Promise<BroadcastPreview> {
  // Pools first, then the operator's ad-hoc list — the dedup helper is
  // case-insensitive and first-wins, so an address present in both surfaces
  // exactly once and keeps the casing of the pool-resolved version (which
  // already went through provider-style normalisation when ingested).
  const poolKeys = await getMergedDataPoolKeys(broadcast.dataPoolIds);
  const extras   = normalizeAdditionalRecipients(broadcast.additionalRecipients);
  const recipients = dedupKeysAcrossLists([poolKeys, extras]);

  // ── CSS inline + sanitize, in that order ─────────────────────────────────
  //
  // Order matters: juice MUST run before DOMPurify, otherwise the <style>
  // block is stripped by the allow-list before juice ever sees it, and no
  // CSS gets folded into inline `style=""` attributes. That made the
  // composer look like the styles were silently dropped (only inline-style
  // properties already on the tags survived).
  //
  // juice is safe to run on untrusted HTML — it parses CSS with mensch and
  // applies it via cheerio, no JS execution, no external resource fetching
  // unless explicitly enabled. Anything dangerous in the result (script
  // tags, javascript: URLs in href, on* handlers, expression() in style)
  // is caught by the sanitize step that runs right after.
  //
  // `removeStyleTags: true` drops the <style> block once juice is done —
  // Gmail/Outlook strip <head>/<style> anyway, so inline is the only thing
  // that survives in real inboxes.
  const inlined = juice(broadcast.bodyHtml, { removeStyleTags: true });
  const html    = sanitizeBroadcastHtml(inlined);
  const text    = broadcast.bodyText.trim() !== "" ? broadcast.bodyText : htmlToPlainText(html);

  return {
    recipients,
    recipientCount: recipients.length,
    html,
    text,
    subject: broadcast.subject,
  };
}

export interface ExecuteBroadcastResult extends BroadcastSendReport {
  recipientCount: number;
}

/**
 * Send the broadcast. Caller is responsible for transitioning the row to
 * `sending` first (so the UI shows progress immediately and concurrent
 * requests are blocked). This function:
 *   - rebuilds the preview (same code path as the preview pane),
 *   - delegates to the provider via `sendBroadcast`,
 *   - writes back `sent_count` / `failed_count` / `last_error` / `sent_at`
 *     so the row reflects reality.
 *
 * Throws if the global provider config is missing — caller catches and
 * marks the row as `failed`.
 */
export async function executeBroadcast(broadcast: EmailBroadcast): Promise<ExecuteBroadcastResult> {
  const config = await getBroadcastEmailConfig();
  if (!config.provider || !config.fromAddress || !config.apiKeyEncrypted) {
    await markBroadcastFailed(broadcast.id, "Broadcast provider is not configured");
    throw new Error("Broadcast provider is not configured");
  }

  const preview = await buildBroadcastPreview(broadcast);
  if (preview.recipientCount === 0) {
    // Belt-and-suspenders: the API route already rejects an empty-selection
    // draft, but a pool that resolves to zero addresses (e.g. all submissions
    // excluded) only surfaces here. We still want a clear message in the
    // archived row.
    await markBroadcastFailed(broadcast.id, "No recipients after pool dedup + manual list merge");
    throw new Error("No recipients to send to");
  }

  try {
    const report = await sendBroadcast({
      config,
      to:      preview.recipients,
      subject: broadcast.subject,
      html:    preview.html,
      text:    preview.text,
    });
    await markBroadcastSent(broadcast.id, preview.recipientCount, report.sent, report.failed, report.error ?? null);
    return { ...report, recipientCount: preview.recipientCount };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    await markBroadcastFailed(broadcast.id, msg);
    throw e;
  }
}
