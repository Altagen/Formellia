import { decryptApiKey } from "./crypto";
import { buildEmailHtml, buildEmailText, substituteVars } from "./template";
import type { EmailNotificationConfig } from "@/types/formInstance";

// ── API key resolution ─────────────────────────────────────────────────────
// Priority:
//   1. apiKeyEncrypted in DB (set via UI) → decrypt with AES key
//   2. EMAIL_API_KEY_{SLUG_UPPER} env var  (e.g. EMAIL_API_KEY_ROOT, EMAIL_API_KEY_MY_FORM)
//   3. EMAIL_API_KEY env var               (global fallback)
//   4. None found → throws (email fails silently, submission still succeeds)

function canonicalizeSlug(slug: string): string {
  // "/" → "ROOT", "my-form" → "MY_FORM"
  return (slug === "/" ? "ROOT" : slug)
    .replace(/-/g, "_")
    .toUpperCase();
}

function resolveApiKey(config: EmailNotificationConfig, formSlug: string): string {
  if (config.apiKeyEncrypted?.trim()) {
    return decryptApiKey(config.apiKeyEncrypted);
  }
  const slugKey = `EMAIL_API_KEY_${canonicalizeSlug(formSlug)}`;
  if (process.env[slugKey]?.trim()) return process.env[slugKey]!.trim();
  if (process.env.EMAIL_API_KEY?.trim()) return process.env.EMAIL_API_KEY.trim();
  throw new Error(
    `[email] No API key available for form "${formSlug}". ` +
    `Set ${slugKey} or EMAIL_API_KEY, or configure a key via the admin UI.`
  );
}

/**
 * Sends a transactional email notification after a form submission.
 * No tracking pixels. No click-tracking links. Fire-and-forget safe.
 *
 * Supports: Resend, SendGrid, Mailgun (BYOK — key stored encrypted in DB).
 * Mailgun domain is derived from fromAddress (must match your Mailgun sending domain).
 */
export async function sendEmailNotification(
  config: EmailNotificationConfig,
  to: string,
  formData: Record<string, unknown>,
  formName: string,
  formSlug: string,
): Promise<void> {
  // Refuse to send if the DB-stored key has passed its expiry date
  // (env-var keys have no expiry — operators manage rotation themselves)
  if (config.apiKeyEncrypted?.trim() && config.apiKeyExpiresAt) {
    const expiry = new Date(config.apiKeyExpiresAt);
    expiry.setHours(23, 59, 59, 999);
    if (expiry < new Date()) {
      throw new Error(
        `[email] API key expired on ${config.apiKeyExpiresAt} for form "${formSlug}". ` +
        `Update the key in Notification settings.`
      );
    }
  }

  const apiKey = resolveApiKey(config, formSlug);

  // Build variable map — formData first, then system vars AFTER so they can't be
  // overridden by a malicious submission containing {"email": "...", "formName": "..."}
  const systemVars: Record<string, string> = {
    email: to,
    formName,
    submittedAt: new Date().toLocaleString("fr-FR", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    }),
  };
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(formData)) {
    vars[k] = v != null ? String(v) : "";
  }
  // System vars always win — overwrite any field with the same key
  Object.assign(vars, systemVars);

  const subject = substituteVars(config.subject, vars);
  const html = buildEmailHtml(config.bodyText, { ...vars, subject });
  const text = buildEmailText(config.bodyText, vars);
  const from = config.fromName
    ? `${config.fromName} <${config.fromAddress}>`
    : config.fromAddress;

  switch (config.provider) {
    case "resend":
      await sendViaResend({ apiKey, to, from, subject, html, text });
      break;
    case "sendgrid":
      await sendViaSendGrid({ apiKey, to, fromAddress: config.fromAddress, fromName: config.fromName, subject, html, text });
      break;
    case "mailgun":
      await sendViaMailgun({ apiKey, to, from, fromAddress: config.fromAddress, subject, html, text });
      break;
    default:
      throw new Error(`Unknown email provider: ${config.provider}`);
  }
}

// ── Resend ────────────────────────────────────────────────
async function sendViaResend({ apiKey, to, from, subject, html, text }: {
  apiKey: string; to: string; from: string; subject: string; html: string; text: string;
}) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: [to], subject, html, text }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${body.slice(0, 200)}`);
  }
}

// ── SendGrid ──────────────────────────────────────────────
async function sendViaSendGrid({ apiKey, to, fromAddress, fromName, subject, html, text }: {
  apiKey: string; to: string; fromAddress: string; fromName?: string;
  subject: string; html: string; text: string;
}) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: fromAddress, name: fromName },
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

// ── Mailgun ───────────────────────────────────────────────
// Domain is derived from the fromAddress (must be your Mailgun sending domain).
async function sendViaMailgun({ apiKey, to, from, fromAddress, subject, html, text }: {
  apiKey: string; to: string; from: string; fromAddress: string;
  subject: string; html: string; text: string;
}) {
  const domain = fromAddress.split("@")[1];
  if (!domain) throw new Error("Mailgun: cannot derive domain from fromAddress");

  const params = new URLSearchParams({ from, to, subject, html, text });
  const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      "Authorization": `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Mailgun error ${res.status}: ${body.slice(0, 200)}`);
  }
}
