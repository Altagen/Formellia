import { fr } from "./fr";
import { en } from "./en";
export type { TranslationKeys } from "./fr";

export type Locale = "fr" | "en";

const TRANSLATIONS: Record<Locale, typeof fr> = { fr, en };

/** Return the translations object for a given locale (defaults to en). */
export function getTranslations(locale?: string | null): typeof fr {
  const l = locale === "fr" ? "fr" : "en";
  return TRANSLATIONS[l];
}

/**
 * Interpolate `{key}` placeholders in a string.
 * @example t("Étape {step} / {total}", { step: 2, total: 5 }) → "Étape 2 / 5"
 */
export function t(str: string, params?: Record<string, string | number>): string {
  if (!params) return str;
  return str.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}
