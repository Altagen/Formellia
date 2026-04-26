// ─────────────────────────────────────────────────────────
// Field types
// ─────────────────────────────────────────────────────────

export type FieldType =
  | "text"
  | "email"
  | "tel"
  | "number"
  | "date"
  | "textarea"
  | "select"
  | "radio"
  | "checkbox"
  | "section_header" // Visual title only — not submitted, not validated
  | "computed"       // Read-only calculated field (formula-driven)
  | "alert"          // Conditional message box (info/warning/error/success)
  | "repeater";      // Dynamic table with user-addable rows

// ─────────────────────────────────────────────────────────
// Icons — Lucide icon name (e.g. "bar-chart-2", "clock")
// Fallback to emoji rendering if name is not recognized
// ─────────────────────────────────────────────────────────

export type LucideIconName = string;

// ─────────────────────────────────────────────────────────
// Conditional visibility
// V2 extension (no breaking change): { all: VisibleWhen[] }
// ─────────────────────────────────────────────────────────

export interface VisibleWhen {
  field: string; // id of the parent field
  operator: "eq" | "neq" | "in" | "notIn" | "gt" | "gte" | "lt" | "lte";
  value: string | string[];
}

// VisibleWhenMulti: backward-compatible union
// - single condition (legacy): VisibleWhen
// - all: all conditions must be true (AND)
// - any: at least one condition must be true (OR)
export type VisibleWhenMulti =
  | VisibleWhen
  | { all: VisibleWhen[] }
  | { any: VisibleWhen[] };

// ─────────────────────────────────────────────────────────
// Field definition
// ─────────────────────────────────────────────────────────

export interface FieldOption {
  value: string;
  label: string;
  description?: string;
}

export interface FieldValidation {
  min?: number;
  max?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  message?: string;
}

// ─────────────────────────────────────────────────────────
// Formula expressions — used by computed field type
// Safe DSL (no eval). Evaluated by src/lib/config/formula.ts
// ─────────────────────────────────────────────────────────

export type FormulaExpr =
  | { op: "date_diff"; from: string; to: string; unit?: "days" | "months" | "years" }
  | { op: "date_add"; base: string; days: string | number }
  | { op: "sum"; fields: string[] }
  | { op: "field"; id: string }
  | { op: "literal"; value: string };

// ─────────────────────────────────────────────────────────
// Repeater column definition — used by repeater field type
// ─────────────────────────────────────────────────────────

export interface RepeaterColumn {
  id: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  options?: FieldOption[];
  required?: boolean;
  placeholder?: string;
  width?: "sm" | "md" | "lg";
  validation?: FieldValidation;
}

// ─────────────────────────────────────────────────────────
// Alert variant — used by alert field type
// ─────────────────────────────────────────────────────────

export type AlertVariant = "info" | "warning" | "error" | "success";

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  defaultValue?: string;
  options?: FieldOption[]; // for select / radio
  validation?: FieldValidation;
  visibleWhen?: VisibleWhenMulti;
  // Key used in formData JSONB. Defaults to `id` if absent.
  // WARNING: changing dbKey breaks display of existing submissions.
  dbKey?: string;
  helpText?: string;
  // computed field
  formula?: FormulaExpr;
  computedUnit?: string;       // suffix: "jours", "€", etc.
  computedFormat?: "number" | "date" | "text";
  // alert field
  alertVariant?: AlertVariant;
  // repeater field
  repeaterColumns?: RepeaterColumn[];
  repeaterMin?: number;        // default 0
  repeaterMax?: number;        // default 20
  repeaterAddLabel?: string;   // custom "Add row" label
}

// ─────────────────────────────────────────────────────────
// Form steps
// ─────────────────────────────────────────────────────────

export interface StepDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
}

export interface FormDefinition {
  steps: StepDef[];
}

// ─────────────────────────────────────────────────────────
// Admin dashboard widgets
// ─────────────────────────────────────────────────────────

export type ChartType = "bar" | "line" | "area" | "pie";

// Built-ins: "date" | "status" | "priority"
// Any other string = key path into submission.formData
export type ChartGroupBy = "date" | "status" | "priority" | string;

export interface ChartDef {
  id: string;
  title: string;
  type: ChartType;
  groupBy: ChartGroupBy;
  dateRange?: "7d" | "14d" | "30d" | "90d" | "all";
  color?: string;
  /** When true and type is "line" or "area", renders a dotted comparison line for the previous period */
  showComparison?: boolean;
  /**
   * Instead of counting records per period/group, aggregate a numeric field.
   * e.g. { fn: "sum", field: "amount" } → total € per day
   */
  aggregate?: { fn: "sum" | "avg"; field: string };
  /**
   * Which date field to use for groupBy:"date" bucketing.
   * Defaults to sub.submittedAt. Accepts system fields or any formData key.
   * e.g. "registration_date", "dueDate", "submittedAt"
   */
  dateField?: string;
}

/** Legacy string queries — kept for backward compatibility */
export type StatsCardQueryLegacy =
  | "count_total"
  | "count_today"
  | "count_week"
  | "count_overdue"
  | "count_urgent"
  | "count_done";

export type StatsFilterOp = "eq" | "neq" | "gt" | "lt" | "gte" | "lte" | "contains";

export interface StatsQueryFilter {
  field: string;
  op: StatsFilterOp;
  value: string;
}

/** Structured parametric query */
export interface StatsQueryDef {
  fn: "count" | "sum" | "avg" | "min" | "max";
  field?: string;              // required for sum / avg / min / max
  filters: StatsQueryFilter[];
  filterLogic: "and" | "or";  // how multiple filters are combined
  scope: "all" | "today" | "week" | "month";
}

export type StatsCardQuery = StatsCardQueryLegacy | StatsQueryDef;

export interface StatsCardDef {
  id: string;
  title: string;
  icon: LucideIconName;
  query: StatsCardQuery;
  accent?: "blue" | "red" | "orange" | "green" | "purple" | "gray";
  /** Display format for the computed value */
  format?: "number" | "currency";
  /** Currency symbol to display when format is "currency" (e.g. "€", "$", "£") */
  currencySymbol?: string;
}

export interface TableColumnDef {
  id: string;
  label: string;
  // Built-ins: "email" | "submittedAt" | "status" | "priority" | "dueDate"
  // Any other string = key in formData JSONB
  source: string;
  width?: string;
  hidden?: boolean;
}

export interface StatsTableColumn {
  id: string;
  label: string;
  fn: "count" | "sum" | "avg" | "min" | "max" | "first";
  field?: string; // required for sum / avg / min / max / first
}

export interface StatsTableDef {
  groupBy: string;
  groupByLabel?: string; // display alias for the groupBy column header
  columns: StatsTableColumn[];
  sortColumnId?: string;
  sortDir?: "asc" | "desc";
  limit?: number;
  scope?: "all" | "today" | "week" | "month";
  filters?: StatsQueryFilter[];
  filterLogic?: "and" | "or";
}

export type WidgetDef =
  | { type: "chart"; id: string; title: string; span?: 1 | 2; chartConfig: ChartDef }
  | { type: "stats_card"; id: string; statsConfig: StatsCardDef }
  | { type: "stats_table"; id: string; title?: string; span?: 1 | 2; tableConfig: StatsTableDef }
  | { type: "recent"; id: string; title: string; limit?: number }
  | { type: "info_card"; id: string; title: string; content: string; accent?: string }
  | { type: "submissions_table"; id: string; title?: string; searchFields?: string[]; hiddenColumns?: string[] }
  | { type: "traffic_chart"; id: string; title?: string; span?: 1 | 2 }
  | { type: "email_quality"; id: string; title?: string }
  | { type: "urgency_distribution"; id: string; title?: string; span?: 1 | 2 }
  | { type: "funnel_chart"; id: string; title?: string; span?: 1 | 2; stepField: string; maxStep?: number; stepLabels?: string[] }
  | {
      type: "deadline_distribution";
      id: string;
      title?: string;
      span?: 1 | 2;
      /** Field to read as deadline date. Defaults to "dueDate". Accepts system fields or any formData key. */
      dateField?: string;
      /** Override default time buckets. maxDays is the upper bound (exclusive) in days from today. */
      buckets?: { label: string; maxDays: number; color?: string }[];
    }
  | {
      type: "filter_pills";
      id: string;
      title?: string;
      span?: 1 | 2;
      /** Field whose distinct values become clickable pills */
      field: string;
    };

export interface AdminPage {
  id: string;
  title: string;
  slug: string;         // URL segment: /admin/[slug]
  icon?: string;        // Lucide icon name
  widgets: WidgetDef[];
  dataSourceId?: string;    // option 2: external dataset
  formInstanceId?: string;  // option 3: filter by form instance (id or slug)
  refreshInterval?: number; // auto-refresh in seconds for this page (0 or undefined = disabled)
  interactiveFilter?: boolean; // clicking a chart segment filters all other widgets on the page
  /**
   * Page-level flattening: if set, submissions are pre-expanded into one synthetic
   * row per item of the named repeater field. The repeater item's columns are
   * merged into the parent formData at the top level, and the repeater field
   * itself is dropped. Widgets and the table then operate on the flat dataset.
   * Requires `formInstanceId` to be set.
   */
  flattenRepeater?: { fieldId: string };
}

export interface AdminFeatures {
  /** Global view (/admin/global) — all submissions aggregated, default: false */
  globalView?: boolean;
  /** Audit log (/admin/audit) — admin action history, default: false */
  auditLog?: boolean;
}

/**
 * Admin UI branding — logo and app name displayed in the sidebar and login page.
 * Supports separate logos for light / dark themes so text-based logos remain legible.
 * Use external URLs or base64 data URIs (prefer SVG < 10 KB or optimised PNG < 50 KB).
 *
 * Resolution order (per theme):
 *   dark  → logoDarkUrl  → logoUrl → (no image)
 *   light → logoLightUrl → logoUrl → (no image)
 */
export interface AdminBrandingConfig {
  appName?: string;        // label next to logo; defaults to "Admin"
  logoUrl?: string;        // single logo for both themes
  logoLightUrl?: string;   // logo for light theme (overrides logoUrl)
  logoDarkUrl?: string;    // logo for dark theme  (overrides logoUrl)
  colorPreset?: string;    // one of the named presets from src/lib/theme/presets.ts
}

export interface AdminConfig {
  pages: AdminPage[];
  defaultPage?: string;       // slug → /admin redirects here if set
  tableColumns: TableColumnDef[];
  /** Optional pages and features — all disabled by default */
  features?: AdminFeatures;
  /** Admin UI branding (sidebar + login page) */
  branding?: AdminBrandingConfig;
}

// ─────────────────────────────────────────────────────────
// Landing page
// ─────────────────────────────────────────────────────────

export type ThemeMode = "light" | "dark";

// Visitor theme resolution:
//   1. localStorage("form-theme") if present (visitor's saved preference)
//   2. config.page.branding.defaultTheme otherwise
// Admin UI theme → localStorage("admin-ui-theme"), independent of FormConfig.

export interface BrandingConfig {
  // URL external OR base64 data URL. API limit: 500 KB hard, 200 KB warning.
  // Prefer SVG (< 10 KB) or optimized PNG (< 50 KB).
  logoUrl?: string;
  primaryColor?: string; // hex e.g. "#2563eb"
  secondaryColor?: string; // hex e.g. "#7c3aed"
  colorPreset?: string;    // named preset (overrides primaryColor/secondaryColor when set)
  defaultTheme: ThemeMode; // visitors' default theme — toggle available, not forced
  fontFamily?: "system" | "inter" | "geist" | "serif";
}

export type PageBlock =
  // ── Existing blocks (enhanced) ──────────────────────────
  | { type: "info"; title: string; content: string; icon?: LucideIconName; variant?: "default" | "highlight" | "warning" | "success" }
  | { type: "features"; items: { icon: LucideIconName; title: string; desc: string }[]; columns?: 2 | 3 | 4; style?: "cards" | "icons_row" | "bullets" }
  | { type: "divider" }
  // ── New blocks ───────────────────────────────────────────
  | { type: "faq"; title?: string; items: { question: string; answer: string }[] }
  | { type: "stats"; items: { value: string; label: string; icon?: string }[] }
  | { type: "testimonials"; title?: string; items: { name: string; role?: string; text: string; rating?: number; avatar?: string }[] }
  | { type: "quote"; text: string; author?: string; role?: string }
  | { type: "cta"; title: string; description?: string; label: string; scrollToForm?: boolean }
  | { type: "html"; content: string };

export interface PageConfig {
  branding: BrandingConfig;
  /** Overall page layout */
  layout?: "page" | "form_only" | "hero_form_split";
  /** Max-width of the form container for form_only layout (default: "md") */
  formWidth?: "sm" | "md" | "lg" | "xl" | "2xl" | "full";
  /** Top navigation bar */
  nav?: {
    links?: { label: string; href: string }[];
    showCta?: boolean;   // CTA button in navbar that scrolls to form
    sticky?: boolean;    // stick nav to top on scroll
  };
  hero: {
    title: string;
    subtitle?: string;
    description?: string;
    ctaLabel: string;
    backgroundVariant?: "gradient" | "solid" | "image";
    backgroundImage?: string;
    /** Small badge/label above the title */
    eyebrow?: string;
    /** Height of the hero section */
    height?: "compact" | "normal" | "tall" | "fullscreen";
    /** Text alignment */
    textAlign?: "center" | "left";
    /** Key metrics shown below the description */
    stats?: { value: string; label: string }[];
    /** If true, CTA button scrolls smoothly to #form instead of doing nothing */
    ctaScrollToForm?: boolean;
  };
  blocks?: PageBlock[];
  footer?: {
    text?: string;
    links?: { label: string; url: string }[];
    /**
     * CGU / CGV section in the footer.
     * mode "inline"  → content (Markdown) rendered in a modal on click
     * mode "link"    → external URL opened in a new tab
     */
    cguCgv?: {
      enabled: boolean;
      mode: "inline" | "link";
      label?: string;     // button text, defaults to "CGU / CGV"
      content?: string;   // Markdown text (mode=inline)
      url?: string;       // External URL (mode=link)
    };
  };
}

// ─────────────────────────────────────────────────────────
// Security — all opt-in, all disabled by default
// Internal/enterprise usage: leave security undefined or all false
// Public web usage: enable what you need
// ─────────────────────────────────────────────────────────

export interface SecurityConfig {
  honeypot?: {
    enabled: boolean;
    // Hidden trap field name. Auto-generated from meta.name if absent (obscurity).
    fieldName?: string;
  };
  rateLimit?: {
    enabled: boolean;
    maxPerHour?: number; // default: 10
    maxPerDay?: number; // default: 50
  };
}

// ─────────────────────────────────────────────────────────
// App metadata
// ─────────────────────────────────────────────────────────

export interface AppMetaConfig {
  name: string;
  title: string;
  description: string;
  locale: string;
  /** Optional emoji prefix shown in admin sidebar and form lists */
  emoji?: string;
  /** Override public form UI labels (i18n light) */
  translations?: {
    submitButton?: string;
    nextButton?: string;
    backButton?: string;
    successTitle?: string;
    successMessage?: string;
    editResponseLabel?: string;
  };
}

// ─────────────────────────────────────────────────────────
// Root config (global / admin settings only)
// meta / page / form / security live in form_instances now
// ─────────────────────────────────────────────────────────

export interface FormConfig {
  version: number;
  locale?: string; // admin UI locale ("fr" default, "en" supported)
  admin: AdminConfig;
  priorityThresholds?: {
    redMaxDays: number;
    orangeMaxDays: number;
    yellowMaxDays: number;
  };
}

// ─────────────────────────────────────────────────────────
// Re-export legacy status/priority types (kept for DB layer)
// ─────────────────────────────────────────────────────────

// Open string type to support custom per-form statuses (Phase 3I).
// Default values: "pending" | "in_progress" | "done" | "waiting_user"
export type SubmissionStatus = string;
export type SubmissionPriority = "none" | "yellow" | "orange" | "red" | "green";
