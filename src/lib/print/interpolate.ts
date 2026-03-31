import type { PrintInterpolationVars } from "@/types/formActions";
import type { FormInstanceConfig } from "@/types/formInstance";
import { evaluateFormula } from "@/lib/config/formula";

/** Maps short locale codes to full BCP-47 tags for reliable toLocaleString output. */
export const BCP47: Record<string, string> = {
  fr: "fr-FR", en: "en-GB", de: "de-DE", es: "es-ES",
};

/** Locale-aware UI labels needed at print render time (not for field content). */
export const PRINT_LABELS: Record<string, { fieldListFieldHeader: string; fieldListValueHeader: string }> = {
  fr: { fieldListFieldHeader: "Champ",  fieldListValueHeader: "Valeur" },
  en: { fieldListFieldHeader: "Field",  fieldListValueHeader: "Value" },
  de: { fieldListFieldHeader: "Feld",   fieldListValueHeader: "Wert" },
  es: { fieldListFieldHeader: "Campo",  fieldListValueHeader: "Valor" },
};

/**
 * Replaces {{fieldId}}, {{submittedAt}}, {{formName}}, {{formDescription}}, {{submissionId}}
 * in a template string.
 */
export function interpolate(template: string, vars: PrintInterpolationVars): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    if (key === "submittedAt")     return vars.submittedAt;
    if (key === "formName")        return vars.formName;
    if (key === "formDescription") return vars.formDescription;
    if (key === "submissionId")    return vars.submissionId;
    return vars.fields[key] ?? "";
  });
}

/**
 * Builds interpolation vars from submitted form data and instance config.
 * @param submissionId Optional — pass the actual DB submission ID when available.
 *                     Falls back to a short random reference.
 */
export function buildInterpolationVars(
  formData: Record<string, string>,
  instanceConfig: FormInstanceConfig,
  submissionId?: string,
): PrintInterpolationVars {
  const shortLocale = instanceConfig.meta.locale ?? "fr";
  const locale = BCP47[shortLocale] ?? shortLocale;

  const fieldLabels: Record<string, string> = {};
  // Inject computed field values so they're available in print templates
  const enrichedData = { ...formData };
  for (const step of instanceConfig.form.steps) {
    for (const field of step.fields) {
      if (field.type === "section_header") continue;
      fieldLabels[field.id] = field.label;
      if (field.type === "computed" && field.formula) {
        const val = evaluateFormula(field.formula, enrichedData);
        if (val !== "") enrichedData[field.id] = val;
      }
    }
  }

  const printLabels = PRINT_LABELS[shortLocale] ?? PRINT_LABELS["en"];

  const sid = submissionId
    ?? crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();

  return {
    fields: enrichedData,
    fieldLabels,
    submittedAt: new Date().toLocaleString(locale, {
      dateStyle: "long",
      timeStyle: "short",
    }),
    formName: instanceConfig.meta.name,
    formDescription: instanceConfig.meta.description ?? "",
    submissionId: sid,
    printLabels,
  };
}
