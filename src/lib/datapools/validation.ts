import { z } from "zod";

const slugSchema = z
  .string()
  .min(1, "slug requis")
  .max(100, "slug trop long (max 100)")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/i, "slug invalide (alphanum + tirets uniquement)");

const fieldIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/, "id de champ invalide");

export const createDataPoolSchema = z.object({
  name: z.string().min(1, "name requis").max(255),
  slug: slugSchema,
  description: z.string().max(2000).nullable().optional(),
  keyField: fieldIdSchema,
  additionalFields: z.array(fieldIdSchema).max(20).default([]),
  sources: z
    .array(z.object({ formInstanceId: z.string().uuid("formInstanceId doit être un UUID") }))
    .min(1, "au moins un formulaire source"),
});

export const updateDataPoolSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  slug: slugSchema.optional(),
  description: z.string().max(2000).nullable().optional(),
  keyField: fieldIdSchema.optional(),
  additionalFields: z.array(fieldIdSchema).max(20).optional(),
  sources: z
    .array(z.object({ formInstanceId: z.string().uuid() }))
    .min(1)
    .optional(),
});

export const addSubmissionExclusionSchema = z.object({
  submissionId: z.string().uuid("submissionId doit être un UUID"),
  reason: z.string().max(500).nullable().optional(),
});

export type CreateDataPoolInput = z.infer<typeof createDataPoolSchema>;
export type UpdateDataPoolInput = z.infer<typeof updateDataPoolSchema>;
export type AddSubmissionExclusionInput = z.infer<typeof addSubmissionExclusionSchema>;
