"use client";

import { createContext, useContext } from "react";
import { getTranslations } from "@/i18n";
import type { TranslationKeys } from "@/i18n";

interface LocaleContextValue {
  tr: TranslationKeys;
  locale: string;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({
  locale,
  children,
}: {
  locale?: string | null;
  children: React.ReactNode;
}) {
  const resolvedLocale = locale ?? "fr";
  const tr = getTranslations(resolvedLocale);
  return <LocaleContext.Provider value={{ tr, locale: resolvedLocale }}>{children}</LocaleContext.Provider>;
}

/** Returns the translations for the current locale. Must be used inside a LocaleProvider. */
export function useTranslations(): TranslationKeys {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useTranslations must be used within a LocaleProvider");
  return ctx.tr;
}

/** Returns the current locale string (e.g. "fr", "en"). Must be used inside a LocaleProvider. */
export function useLocale(): string {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx.locale;
}
