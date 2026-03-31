import type { FormFileConfig } from "./src/types/formInstance";

/**
 * Default form configuration — minimal blank template.
 *
 * Used as seed on first boot (CONFIG_SOURCE=db) or as the immutable source
 * of truth (CONFIG_SOURCE=file). Configure everything through the admin UI
 * after first login.
 *
 * Reserved field IDs (extracted by the submit API, not stored in formData JSONB):
 *   "email"        → submissions.email column
 *   "dateEcheance" → submissions.dateEcheance column
 */
const config: FormFileConfig = {
  version: 1,

  // ───────────────────────────────────────────────────────
  // Metadata
  // ───────────────────────────────────────────────────────
  meta: {
    name: "my-app",
    title: "Submit a request",
    description: "Request submission form",
    locale: "en",
  },

  // ───────────────────────────────────────────────────────
  // Landing page — minimal blank template
  // ───────────────────────────────────────────────────────
  page: {
    branding: {
      primaryColor: "#2563eb",
      defaultTheme: "light",
    },
    hero: {
      title: "Submit a request",
      description: "Fill in the form below to submit your request.",
      ctaLabel: "Get started",
      backgroundVariant: "gradient",
    },
  },

  // ───────────────────────────────────────────────────────
  // Form — empty by default, configure through the admin UI
  // ───────────────────────────────────────────────────────
  form: {
    steps: [],
  },

  // ───────────────────────────────────────────────────────
  // Admin dashboard — empty by default, configure through the admin UI
  // ───────────────────────────────────────────────────────
  admin: {
    pages: [],
    tableColumns: [
      { id: "col-email",     label: "Email",        source: "email" },
      { id: "col-status",    label: "Status",       source: "status" },
      { id: "col-submitted", label: "Submitted at", source: "submittedAt" },
    ],
  },

  // ───────────────────────────────────────────────────────
  // Security — all disabled by default
  // Enable for public web deployments
  // ───────────────────────────────────────────────────────
  security: {
    honeypot: { enabled: false },
    rateLimit: { enabled: false, maxPerHour: 10, maxPerDay: 50 },
  },

  priorityThresholds: {
    redMaxDays: 7,
    orangeMaxDays: 14,
    yellowMaxDays: 30,
  },
};

export default config;
