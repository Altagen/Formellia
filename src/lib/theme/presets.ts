export type ColorPreset =
  | "default"
  | "indigo"
  | "violet"
  | "rose"
  | "blue"
  | "orange"
  | "green"
  | "teal";

interface PresetVars {
  primary: string;
  primaryForeground: string;
  ring: string;
  accent: string;
  accentForeground: string;
}

export interface Preset {
  label: string;
  /** Swatch hex color for the picker */
  swatch: string;
  light: PresetVars;
  dark: PresetVars;
}

export const COLOR_PRESETS: Record<ColorPreset, Preset> = {
  default: {
    label: "Zinc",
    swatch: "#18181b",
    light: {
      primary: "240 5.9% 10%",
      primaryForeground: "0 0% 98%",
      ring: "240 5.9% 10%",
      accent: "240 4.8% 95.9%",
      accentForeground: "240 5.9% 10%",
    },
    dark: {
      primary: "0 0% 98%",
      primaryForeground: "240 5.9% 10%",
      ring: "240 4.9% 83.9%",
      accent: "240 3.7% 15.9%",
      accentForeground: "0 0% 98%",
    },
  },
  indigo: {
    label: "Indigo",
    swatch: "#4f46e5",
    light: {
      primary: "239 84% 67%",
      primaryForeground: "0 0% 100%",
      ring: "239 84% 67%",
      accent: "240 100% 97%",
      accentForeground: "239 84% 40%",
    },
    dark: {
      primary: "239 84% 67%",
      primaryForeground: "0 0% 100%",
      ring: "239 84% 67%",
      accent: "239 30% 20%",
      accentForeground: "239 84% 80%",
    },
  },
  violet: {
    label: "Violet",
    swatch: "#7c3aed",
    light: {
      primary: "263 70% 50%",
      primaryForeground: "0 0% 100%",
      ring: "263 70% 50%",
      accent: "270 100% 97%",
      accentForeground: "263 70% 35%",
    },
    dark: {
      primary: "263 70% 60%",
      primaryForeground: "0 0% 100%",
      ring: "263 70% 60%",
      accent: "263 25% 18%",
      accentForeground: "263 70% 80%",
    },
  },
  rose: {
    label: "Rose",
    swatch: "#e11d48",
    light: {
      primary: "346 77% 50%",
      primaryForeground: "0 0% 100%",
      ring: "346 77% 50%",
      accent: "355 100% 97%",
      accentForeground: "346 77% 35%",
    },
    dark: {
      primary: "346 77% 60%",
      primaryForeground: "0 0% 100%",
      ring: "346 77% 60%",
      accent: "346 25% 18%",
      accentForeground: "346 77% 80%",
    },
  },
  blue: {
    label: "Blue",
    swatch: "#2563eb",
    light: {
      primary: "217 91% 60%",
      primaryForeground: "0 0% 100%",
      ring: "217 91% 60%",
      accent: "214 100% 97%",
      accentForeground: "217 91% 35%",
    },
    dark: {
      primary: "217 91% 60%",
      primaryForeground: "0 0% 100%",
      ring: "217 91% 60%",
      accent: "217 30% 18%",
      accentForeground: "217 91% 80%",
    },
  },
  orange: {
    label: "Orange",
    swatch: "#f97316",
    light: {
      primary: "25 95% 53%",
      primaryForeground: "0 0% 100%",
      ring: "25 95% 53%",
      accent: "33 100% 96%",
      accentForeground: "25 95% 35%",
    },
    dark: {
      primary: "25 95% 55%",
      primaryForeground: "0 0% 100%",
      ring: "25 95% 55%",
      accent: "25 30% 16%",
      accentForeground: "25 95% 75%",
    },
  },
  green: {
    label: "Green",
    swatch: "#16a34a",
    light: {
      primary: "142 71% 45%",
      primaryForeground: "0 0% 100%",
      ring: "142 71% 45%",
      accent: "142 70% 96%",
      accentForeground: "142 71% 25%",
    },
    dark: {
      primary: "142 71% 45%",
      primaryForeground: "0 0% 100%",
      ring: "142 71% 45%",
      accent: "142 30% 16%",
      accentForeground: "142 71% 75%",
    },
  },
  teal: {
    label: "Teal",
    swatch: "#0d9488",
    light: {
      primary: "174 72% 38%",
      primaryForeground: "0 0% 100%",
      ring: "174 72% 38%",
      accent: "174 70% 96%",
      accentForeground: "174 72% 25%",
    },
    dark: {
      primary: "174 72% 45%",
      primaryForeground: "0 0% 100%",
      ring: "174 72% 45%",
      accent: "174 30% 16%",
      accentForeground: "174 72% 75%",
    },
  },
};

export const PRESET_NAMES = Object.keys(COLOR_PRESETS) as ColorPreset[];
