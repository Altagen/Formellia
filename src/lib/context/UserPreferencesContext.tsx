"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { buildPresetCssVars } from "@/lib/theme/cssVars";
import type { ThemeMode } from "@/types/config";
import type { Locale } from "@/i18n";

interface UserPreferences {
  themeMode:   ThemeMode;
  colorPreset: string;
  locale:      Locale;
  setThemeMode:   (mode: ThemeMode) => void;
  setColorPreset: (preset: string) => void;
  setLocale:      (locale: Locale) => void;
  saving: boolean;
}

const UserPreferencesContext = createContext<UserPreferences>({
  themeMode:      "light",
  colorPreset:    "default",
  locale:         "fr",
  setThemeMode:   () => {},
  setColorPreset: () => {},
  setLocale:      () => {},
  saving:         false,
});

export function useUserPreferences() {
  return useContext(UserPreferencesContext);
}

interface UserPreferencesProviderProps {
  initialThemeMode:   ThemeMode;
  initialColorPreset: string;
  initialLocale:      Locale;
  children: React.ReactNode;
}

export function UserPreferencesProvider({
  initialThemeMode,
  initialColorPreset,
  initialLocale,
  children,
}: UserPreferencesProviderProps) {
  const router = useRouter();
  const [themeMode,   setThemeModeState]   = useState<ThemeMode>(initialThemeMode);
  const [colorPreset, setColorPresetState] = useState<string>(initialColorPreset);
  const [locale,      setLocaleState]      = useState<Locale>(initialLocale);
  const [saving,      setSaving]           = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Apply dark class to <html>
  useEffect(() => {
    const html = document.documentElement;
    if (themeMode === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [themeMode]);

  // Apply color preset CSS vars dynamically
  useEffect(() => {
    const id = "admin-user-preset-css";
    let style = document.getElementById(id) as HTMLStyleElement | null;
    const css = buildPresetCssVars(colorPreset);
    if (!css) {
      style?.remove();
      return;
    }
    if (!style) {
      style = document.createElement("style");
      style.id = id;
      document.head.appendChild(style);
    }
    style.textContent = css;
  }, [colorPreset]);

  function persist(patch: { themeMode?: ThemeMode; colorPreset?: string; locale?: Locale }) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch("/api/admin/account/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } finally {
        setSaving(false);
      }
    }, 400);
  }

  function setThemeMode(mode: ThemeMode) {
    setThemeModeState(mode);
    persist({ themeMode: mode });
  }

  function setColorPreset(preset: string) {
    setColorPresetState(preset);
    persist({ colorPreset: preset });
  }

  async function setLocale(newLocale: Locale) {
    if (newLocale === locale) return;
    setLocaleState(newLocale);
    setSaving(true);
    try {
      await fetch("/api/admin/account/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale: newLocale }),
      });
      // Trigger server re-render so LocaleProvider picks up the new locale
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <UserPreferencesContext.Provider value={{ themeMode, colorPreset, locale, setThemeMode, setColorPreset, setLocale, saving }}>
      {children}
    </UserPreferencesContext.Provider>
  );
}
