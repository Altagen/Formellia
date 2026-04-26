import type { BrandingConfig } from "@/types/config";
import { COLOR_PRESETS, PRESET_NAMES } from "./presets";

// Allowlist: valid CSS color literals only (hex, rgb, hsl, named colors)
const CSS_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)|rgba\(\s*[\d.,\s]+\)|hsl\(\s*[\d.,\s%]+\)|hsla\(\s*[\d.,\s%]+\)|[a-zA-Z]{2,30})$/;

function sanitizeCssColor(value: string): string | null {
  const trimmed = value.trim();
  return CSS_COLOR_RE.test(trimmed) ? trimmed : null;
}

/**
 * Builds a CSS <style> block injecting branding colors as custom properties.
 * Injected server-side in the root layout — no client JS required.
 * Colors are validated against an allowlist to prevent CSS injection.
 */
export function buildCssVars(branding: BrandingConfig): string {
  const vars: string[] = [];

  if (branding.primaryColor) {
    const safe = sanitizeCssColor(branding.primaryColor);
    if (safe) vars.push(`--brand-primary: ${safe};`);
  }
  if (branding.secondaryColor) {
    const safe = sanitizeCssColor(branding.secondaryColor);
    if (safe) vars.push(`--brand-secondary: ${safe};`);
  }

  if (vars.length === 0) return "";
  return `:root { ${vars.join(" ")} }`;
}

/**
 * Builds a CSS <style> block that overrides the shadcn color variables
 * (--primary, --primary-foreground, --ring, --accent, --accent-foreground)
 * for both :root (light) and .dark from a named preset.
 *
 * Returns "" for unknown or "default" preset (globals.css already covers it).
 * Preset name is validated against the allowlist — no injection risk.
 */
export function buildPresetCssVars(preset: string | undefined): string {
  if (!preset || preset === "default") return "";
  if (!PRESET_NAMES.includes(preset as never)) return "";

  const p = COLOR_PRESETS[preset as keyof typeof COLOR_PRESETS];
  const light = p.light;
  const dark = p.dark;

  return (
    `:root { ` +
    `--primary: ${light.primary}; ` +
    `--primary-foreground: ${light.primaryForeground}; ` +
    `--ring: ${light.ring}; ` +
    `--accent: ${light.accent}; ` +
    `--accent-foreground: ${light.accentForeground}; ` +
    `} ` +
    `.dark { ` +
    `--primary: ${dark.primary}; ` +
    `--primary-foreground: ${dark.primaryForeground}; ` +
    `--ring: ${dark.ring}; ` +
    `--accent: ${dark.accent}; ` +
    `--accent-foreground: ${dark.accentForeground}; ` +
    `}`
  );
}
