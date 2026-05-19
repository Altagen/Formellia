import { z } from "zod";
import { ADDITIONAL_RECIPIENTS_MAX } from "./additionalRecipients";

export const broadcastProviderSchema = z.enum(["resend", "sendgrid", "mailgun"]);

/**
 * Shared shape for the optional free-text recipient list. We keep validation
 * loose (any non-empty string ≤ 320 chars — RFC 5321 limit for the whole
 * address) and let `additionalRecipients.ts` do the regex pass server-side
 * before the row is persisted. That way a malformed entry surfaces as a
 * normalisation skip rather than a 422 the operator has to chase down.
 */
const additionalRecipientsField = z.array(z.string().min(1).max(320)).max(ADDITIONAL_RECIPIENTS_MAX);

export const createBroadcastSchema = z.object({
  name:         z.string().min(1, "name requis").max(255),
  subject:      z.string().max(998, "RFC 5322 — subject too long").default(""),
  bodyHtml:     z.string().max(500_000, "body too large").default(""),
  bodyText:     z.string().max(500_000).default(""),
  // Allow empty pool list at create time — a draft may be all-ad-hoc and the
  // send endpoint guards on the merged recipient count anyway.
  dataPoolIds:          z.array(z.string().uuid()).default([]),
  additionalRecipients: additionalRecipientsField.default([]),
});

export const updateBroadcastSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  subject:     z.string().max(998).optional(),
  bodyHtml:    z.string().max(500_000).optional(),
  bodyText:    z.string().max(500_000).optional(),
  // Allow an empty array for drafts — the composer UI lets the operator
  // briefly clear the selection while picking a different set. The `/send`
  // endpoint refuses to fire with zero recipients, so a draft can never go
  // out without anyone to mail.
  dataPoolIds:          z.array(z.string().uuid()).optional(),
  additionalRecipients: additionalRecipientsField.optional(),
});

export const updateBroadcastConfigSchema = z.object({
  provider:        broadcastProviderSchema.nullable().optional(),
  fromAddress:     z.string().email().nullable().optional(),
  fromName:        z.string().max(255).nullable().optional(),
  /** Pass `""` to clear, `undefined` to leave unchanged. */
  apiKey:          z.string().max(2_000).nullable().optional(),
  apiKeyExpiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "format date YYYY-MM-DD requis").nullable().optional(),
});

export type CreateBroadcastInput  = z.infer<typeof createBroadcastSchema>;
export type UpdateBroadcastInput  = z.infer<typeof updateBroadcastSchema>;
export type UpdateBroadcastConfigInput = z.infer<typeof updateBroadcastConfigSchema>;
