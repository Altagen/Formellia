"use client";

import { useUserPreferences } from "@/lib/context/UserPreferencesContext";
import { useTranslations } from "@/lib/context/LocaleContext";

export function AdminThemeToggle() {
  const { themeMode, setThemeMode } = useUserPreferences();
  const tr = useTranslations();
  const tt = tr.admin.themeToggle;

  const isDark = themeMode === "dark";

  return (
    <button
      onClick={() => setThemeMode(isDark ? "light" : "dark")}
      aria-label={isDark ? tt.switchToLight : tt.switchToDark}
      className="p-1.5 rounded-lg text-muted-foreground hover:bg-muted transition-colors"
    >
      {isDark ? (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z"
          />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
          />
        </svg>
      )}
    </button>
  );
}
