"use client";

import { useState, useEffect } from "react";
import type { ThemeMode } from "@/types/config";

const STORAGE_KEY = "form-theme";

/**
 * Manages the visitor-facing theme for the public form page.
 * 1. Reads localStorage("form-theme") as the visitor's saved preference
 * 2. Falls back to config.page.branding.defaultTheme if no preference saved
 *
 * Independent of the admin UI theme (admin-ui-theme key).
 */
export function useFormTheme(defaultTheme: ThemeMode) {
  const [theme, setTheme] = useState<ThemeMode>(defaultTheme);

  // Sync from localStorage after mount (avoids SSR mismatch)
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { theme, toggle };
}
