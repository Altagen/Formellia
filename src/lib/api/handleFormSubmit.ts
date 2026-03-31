import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { buildSubmissionSchema } from "@/lib/config";
import { getHoneypotFieldName, isHoneypotFilled } from "@/lib/security/honeypot";
import { isRateLimited } from "@/lib/security/rateLimit";
import { getClientIp } from "@/lib/security/getClientIp";
import type { FormInstance } from "@/types/formInstance";
import type { SecurityConfig } from "@/types/config";
import { isDisposableEmail } from "@/lib/utils/disposableEmails";
import { formLogger as log } from "@/lib/logger";

// Reserved field IDs that map to DB columns instead of formData JSONB
const RESERVED_KEYS = new Set(["email", "dateEcheance"]);

/**
 * Shared form submission handler.
 * Validates and inserts a submission for the given FormInstance.
 */
export async function handleFormSubmit(
  req: NextRequest,
  instance: FormInstance
): Promise<NextResponse> {
  try {
    const { config } = instance;
    const body = await req.json();

    // ── Honeypot check (silent 200 — don't signal failure to bots) ──
    if (config.security?.honeypot?.enabled) {
      const fieldName = getHoneypotFieldName(config.security, config.meta.name);
      if (isHoneypotFilled(body as Record<string, unknown>, fieldName)) {
        return NextResponse.json({ success: true }, { status: 201 });
      }
    }

    // ── IP hash (GDPR-compliant analytics) ──
    const ip = getClientIp(req);
    const ipHash = createHash("sha256").update(ip).digest("hex");

    // ── Rate limit check ──
    // Per-form config takes precedence; fallback enforces a global hard cap
    // even when rateLimit.enabled = false, to protect against floods.
    const globalFallbackConfig: SecurityConfig = {
      rateLimit: { enabled: true, maxPerHour: 30, maxPerDay: 100 },
    };
    const securityConfig = config.security?.rateLimit?.enabled
      ? config.security
      : globalFallbackConfig;

    const blocked = await isRateLimited(ipHash, securityConfig);
    if (blocked) {
      return NextResponse.json(
        { error: "Too many submissions. Please try again later." },
        { status: 429 }
      );
    }

    // ── Extract reserved fields ──
    const rawFormData = (body.formData ?? {}) as Record<string, unknown>;

    const emailRaw = rawFormData["email"] as string | undefined;
    const email = emailRaw && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw : null;
    const dateEcheance = rawFormData["dateEcheance"] as string | undefined;
    const dateReception = body.dateReception as string | undefined;

    // Separate formData JSONB payload (everything except reserved keys)
    const formDataPayload: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(rawFormData)) {
      if (!RESERVED_KEYS.has(key)) {
        formDataPayload[key] = value;
      }
    }

    // ── Validate ──
    // Validate against the full rawFormData (includes reserved keys like email)
    // so the schema built from step definitions can find all declared fields.
    const schema = buildSubmissionSchema(config.form.steps);
    const parsed = schema.safeParse({
      formData: rawFormData,
      dateEcheance,
      dateReception,
    });

    // ── Disposable email check (only if email provided) ──
    if (email && config.features.blockDisposableEmails && isDisposableEmail(email)) {
      return NextResponse.json(
        { error: "Temporary email addresses are not accepted." },
        { status: 422 }
      );
    }

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid data", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    // ── Insert ──
    const formInstanceId = instance.id === "file-root" ? null : instance.id;

    const [insertedSubmission] = await db.insert(submissions).values({
      email,
      formData: formDataPayload,
      ipHash,
      dateReception: dateReception ?? null,
      dateEcheance: dateEcheance ?? null,
      formInstanceId,
    }).returning({ id: submissions.id });

    // ── Webhook notification (queued with retry) ──
    const notif = config.notifications;
    if (notif?.enabled && notif.webhookUrl) {
      const { queueWebhookDelivery } = await import("@/lib/webhook/deliveries");
      await queueWebhookDelivery({
        submissionId:   insertedSubmission?.id ?? null,
        formInstanceId: formInstanceId,
        webhookUrl:     notif.webhookUrl,
        payload: {
          form: { slug: instance.slug, name: instance.config.meta.name },
          submission: { email, formData: formDataPayload, submittedAt: new Date().toISOString() },
        },
      }).catch(err => log.error({ err }, "Failed to queue webhook delivery"));
    }

    // ── Email notification (fire-and-forget) ──
    const emailConf = notif?.email;
    if (emailConf?.enabled && email) {
      import("@/lib/email/sender")
        .then(({ sendEmailNotification }) =>
          sendEmailNotification(emailConf, email, formDataPayload, config.meta.name, instance.slug)
        )
        .catch(err => log.error({ err }, "Email notification failed"));
    }

    // ── Submitter confirmation email (fire-and-forget) ──
    const confirmConf = notif?.submitterConfirmation;
    if (confirmConf?.enabled && notif?.email?.enabled && email) {
      const confirmEmailConf = {
        ...notif.email,
        subject: confirmConf.subject,
        bodyText: confirmConf.bodyText,
      };
      import("@/lib/email/sender")
        .then(({ sendEmailNotification }) =>
          sendEmailNotification(confirmEmailConf, email, formDataPayload, config.meta.name, instance.slug)
        )
        .catch(err => log.error({ err }, "Submitter confirmation email failed"));
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    log.error({ err: error }, "Submit error");
    return NextResponse.json({ error: "Erreur interne du serveur" }, { status: 500 });
  }
}
