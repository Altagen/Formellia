import { z } from "zod";

export const broadcastProviderSchema = z.enum(["resend", "sendgrid", "mailgun"]);

export const createBroadcastSchema = z.object({
  name:         z.string().min(1, "name requis").max(255),
  subject:      z.string().max(998, "RFC 5322 — subject too long").default(""),
  bodyHtml:     z.string().max(500_000, "body too large").default(""),
  bodyText:     z.string().max(500_000).default(""),
  dataPoolIds:  z.array(z.string().uuid()).min(1, "au moins un DataPool requis"),
});

export const updateBroadcastSchema = z.object({
  name:        z.string().min(1).max(255).optional(),
  subject:     z.string().max(998).optional(),
  bodyHtml:    z.string().max(500_000).optional(),
  bodyText:    z.string().max(500_000).optional(),
  // Allow an empty array for drafts — the composer UI lets the operator
  // briefly clear the selection while picking a different set. The `/send`
  // endpoint refuses to fire with zero pools, so a draft can never go out
  // without recipients.
  dataPoolIds: z.array(z.string().uuid()).optional(),
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
