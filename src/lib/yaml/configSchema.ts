import { z } from "zod";

// ─────────────────────────────────────────────────────────
// Secret field scanner
// Scans every key in the parsed object tree recursively.
// Any key matching the pattern causes a hard validation error.
// ─────────────────────────────────────────────────────────

// Keys that suggest secret values — matched case-insensitively against every YAML key
const SECRET_KEY_RE =
  /api.?key|apikey|password|passphrase|passwd|secret|token|credential|private.?key|auth.?key|oauth|bearer|hmac|encryption.?key|signing.?key/i;

// Value patterns that look like secrets (hex keys, base64 blobs)
const SECRET_VALUE_RE = [
  /^[0-9a-f]{32,}$/i,          // 32+ hex chars → likely a key
  /^[A-Za-z0-9+/]{40,}={0,2}$/, // 40+ base64 chars → likely encoded secret
];

function scanForSecrets(value: unknown, path = ""): string[] {
  if (value === null || value === undefined) return [];
  if (typeof value === "string") {
    for (const re of SECRET_VALUE_RE) {
      if (re.test(value)) return [`${path} (value looks like an encoded secret)`];
    }
    return [];
  }
  if (typeof value !== "object") return [];
  if (Array.isArray(value)) {
    return value.flatMap((item, i) => scanForSecrets(item, `${path}[${i}]`));
  }
  const violations: string[] = [];
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const fullPath = path ? `${path}.${k}` : k;
    if (SECRET_KEY_RE.test(k)) violations.push(fullPath);
    violations.push(...scanForSecrets(v, fullPath));
  }
  return violations;
}

// ─────────────────────────────────────────────────────────
// Email notification sub-schema (intentionally omits apiKey* fields)
// ─────────────────────────────────────────────────────────

const yamlEmailNotifSchema = z.object({
  enabled:         z.boolean().default(false),
  provider:        z.enum(["resend", "sendgrid", "mailgun"]).default("resend"),
  fromAddress:     z.string().email("notifications.email.fromAddress invalide"),
  fromName:        z.string().optional(),
  subject:         z.string().default(""),
  bodyText:        z.string().default(""),
  apiKeyExpiresAt: z.string().nullable().optional(),
  // apiKeyEncrypted is intentionally absent — caught by the secret scanner if someone adds it
});

const yamlNotifSchema = z.object({
  webhookUrl: z.union([z.string().url(), z.literal("")]).optional(),
  enabled:    z.boolean().optional(),
  email:      yamlEmailNotifSchema.optional(),
});

// ─────────────────────────────────────────────────────────
// Per-form schema
// meta / page / form / security are permissive (complex nested types)
// — their contents are validated by the DB layer, not here.
// ─────────────────────────────────────────────────────────

export const yamlFormConfigSchema = z.object({
  slug:          z.string().min(1, "slug requis"),
  name:          z.string().min(1, "name requis"),
  features:      z.object({
    landingPage:           z.boolean().default(true),
    form:                  z.boolean().default(true),
    blockDisposableEmails: z.boolean().optional(),
    formVersioning:        z.boolean().optional(),
    sectionNav:            z.boolean().optional(),
    completionBar:         z.boolean().optional(),
  }).optional(),
  notifications:        yamlNotifSchema.optional(),
  meta:                 z.record(z.string(), z.unknown()).optional(),
  page:                 z.record(z.string(), z.unknown()).optional(),
  form:                 z.record(z.string(), z.unknown()).optional(),
  security:             z.record(z.string(), z.unknown()).optional(),
  onSubmitActions:      z.array(z.record(z.string(), z.unknown())).optional(),
  customStatuses:       z.array(z.record(z.string(), z.unknown())).optional(),
  successMessage:       z.string().optional(),
  successRedirectUrl:   z.string().url("successRedirectUrl must be a valid URL").optional(),
  successRedirectDelay: z.number().int().min(0).max(60).optional(),
  priorityThresholds:   z.object({
    redMaxDays:    z.number().int().positive(),
    orangeMaxDays: z.number().int().positive(),
    yellowMaxDays: z.number().int().positive(),
  }).optional(),
});

// ─────────────────────────────────────────────────────────
// Root schema
// ─────────────────────────────────────────────────────────

export const yamlConfigSchema = z.object({
  version: z.number().int().positive().default(1),

  app: z.object({
    enforcePasswordPolicy: z.boolean().default(false),
  }).optional(),

  admin: z.object({
    // Password intentionally absent — env var ADMIN_PASSWORD only
    email: z.string().email("admin.email invalide").optional(),
  }).optional(),

  priorityThresholds: z.object({
    redMaxDays:    z.number().int().positive(),
    orangeMaxDays: z.number().int().positive(),
    yellowMaxDays: z.number().int().positive(),
  }).optional(),

  forms: z.array(yamlFormConfigSchema).optional(),

}).superRefine((data, ctx) => {
  // 1. Reject any key that looks like a secret
  const violations = scanForSecrets(data);
  for (const path of violations) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: path.split("."),
      message:
        `"${path}" looks like a secret. ` +
        `Secrets must never appear in config.yaml — ` +
        `use environment variables instead (e.g. EMAIL_API_KEY, ADMIN_PASSWORD).`,
    });
  }

  // 2. Enforce unique slugs
  const slugs = data.forms?.map(f => f.slug) ?? [];
  const seen = new Set<string>();
  for (const slug of slugs) {
    if (seen.has(slug)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Slug "${slug}" is duplicated in forms[].`,
      });
    }
    seen.add(slug);
  }
});

export type YamlConfig     = z.infer<typeof yamlConfigSchema>;
export type YamlFormConfig = z.infer<typeof yamlFormConfigSchema>;
