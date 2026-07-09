import { z } from "zod";

const slugSchema = z
  .string()
  .min(1, "slug required")
  .max(100, "slug too long (max 100)")
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]?$/i, "invalid slug (alphanumeric + dashes only)");

const fieldIdSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_][A-Za-z0-9_.-]*$/, "invalid field id");

export const createDataPoolSchema = z.object({
  name: z.string().min(1, "name required").max(255),
  slug: slugSchema,
  description: z.string().max(2000).nullable().optional(),
  keyField: fieldIdSchema,
  additionalFields: z.array(fieldIdSchema).max(20).default([]),
  sources: z
    .array(z.object({ formInstanceId: z.string().uuid("formInstanceId must be a UUID") }))
    .min(1, "at least one source form is required"),
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
  submissionId: z.string().uuid("submissionId must be a UUID"),
  reason: z.string().max(500).nullable().optional(),
});

/**
 * Schema for a single pool inside the backup/restore YAML. Differs from the
 * runtime `createDataPoolSchema` in one way: sources are referenced by form
 * **slug** (portable across deployments), not by `formInstanceId` UUID
 * (deployment-specific). The restore handler resolves the slugs against the
 * forms that already exist after the `forms` section has been imported.
 */
export const yamlDataPoolSchema = z.object({
  slug: slugSchema,
  name: z.string().min(1).max(255),
  description: z.string().max(2000).nullable().optional(),
  keyField: fieldIdSchema,
  additionalFields: z.array(fieldIdSchema).max(20).default([]),
  sources: z
    .array(z.object({ formSlug: z.string().min(1) }))
    .min(1, "au moins un formulaire source"),
});

export type CreateDataPoolInput = z.infer<typeof createDataPoolSchema>;
export type UpdateDataPoolInput = z.infer<typeof updateDataPoolSchema>;
export type AddSubmissionExclusionInput = z.infer<typeof addSubmissionExclusionSchema>;
export type YamlDataPool = z.infer<typeof yamlDataPoolSchema>;
