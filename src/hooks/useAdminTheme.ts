"use client";

import { useState, useEffect } from "react";
import type { ThemeMode } from "@/types/config";

const STORAGE_KEY = "admin-ui-theme";

/**
 * Manages the admin's personal UI theme preference.
 * Stored in localStorage, applied as a `dark` class on <html>.
 * Completely independent of config.page.branding (the visitor-facing theme).
 */
export function useAdminTheme() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (stored === "light" || stored === "dark") {
      setTheme(stored);
    }
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    if (theme === "dark") {
      html.classList.add("dark");
    } else {
      html.classList.remove("dark");
    }
  }, [theme]);

  function toggle() {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }

  return { theme, toggle };
}
