import { z } from "zod";
import type { StepDef } from "@/types/config";

/**
 * Builds a flat Zod object schema from config steps.
 * Fields with visibleWhen are always optional server-side (the hidden field
 * value is simply ignored; client already prevents submission of invisible fields).
 * section_header fields are skipped (not submitted).
 */
export function buildDynamicZodSchema(steps: StepDef[]): z.ZodObject<Record<string, z.ZodTypeAny>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const step of steps) {
    for (const field of step.fields) {
      if (field.type === "section_header") continue;

      const key = field.dbKey ?? field.id;

      // Base schema per type
      let schema: z.ZodTypeAny;
      switch (field.type) {
        case "email":
          schema = z.string().email(`${field.label} : email invalide`);
          break;
        case "number":
          schema = z.coerce.number();
          break;
        default:
          schema = z.string();
      }

      // Apply validation rules
      if (field.validation && schema instanceof z.ZodString) {
        const v = field.validation;
        if (v.minLength != null)
          schema = (schema as z.ZodString).min(
            v.minLength,
            v.message ?? `${field.label} : minimum ${v.minLength} characters`
          );
        if (v.maxLength != null)
          schema = (schema as z.ZodString).max(
            v.maxLength,
            v.message ?? `${field.label} : maximum ${v.maxLength} characters`
          );
        if (v.pattern != null) {
          try {
            schema = (schema as z.ZodString).regex(
              new RegExp(v.pattern),
              v.message ?? `${field.label} : format invalide`
            );
          } catch {
            // Invalid regex in config — skip pattern validation rather than crashing
            console.warn(`[validation] Invalid regex pattern for field "${field.id}":`, v.pattern);
          }
        }
      }

      if (field.validation && schema instanceof z.ZodNumber) {
        const v = field.validation;
        if (v.min != null) schema = (schema as z.ZodNumber).min(v.min);
        if (v.max != null) schema = (schema as z.ZodNumber).max(v.max);
      }

      // Conditional or optional fields are not required server-side
      const isOptional = !!field.visibleWhen || !field.required;
      shape[key] = isOptional ? schema.optional() : schema;
    }
  }

  return z.object(shape);
}

/**
 * Full submission schema including top-level DB columns.
 * Reserved field IDs extracted by the submit handler:
 *   "email"        → submissions.email
 *   "dateEcheance" → submissions.dateEcheance
 */
export function buildSubmissionSchema(steps: StepDef[]) {
  const formDataSchema = buildDynamicZodSchema(steps);

  return z.object({
    formData: formDataSchema,
    dateReception: z.string().optional(),
    dateEcheance: z.string().optional(),
    // Honeypot field — name varies, validated separately in submit handler
  });
}
