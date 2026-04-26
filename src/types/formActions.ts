// ─────────────────────────────────────────────────────────
// Form Action Pipeline — types
// ─────────────────────────────────────────────────────────

/** Shared condition used by conditional_block and runIf */
export interface PrintCondition {
  fieldId: string;
  operator: "eq" | "neq" | "empty" | "not_empty";
  value?: string;
}

interface FormActionBase {
  /** Stable UUID — React key + admin editor key */
  id: string;
  /** Display name in admin */
  label?: string;
  /** false → action skipped at runtime */
  enabled?: boolean;
  /** Skip this action if condition evaluates to false */
  runIf?: PrintCondition;
}

export interface SaveToDbAction extends FormActionBase {
  type: "save_to_db";
}

export interface PrintViewAction extends FormActionBase {
  type: "print_view";
  template: PrintTemplate;
  /** Document title / PDF filename template. Supports {{formName}}, {{submittedAt}}, etc.
   *  Default: "{{formName}}" */
  filenameTemplate?: string;
}

export interface WebhookPostAction extends FormActionBase {
  type: "webhook_post";
  url: string;
  headers?: Record<string, string>;
}

export type FormAction = SaveToDbAction | PrintViewAction | WebhookPostAction;

// ─────────────────────────────────────────────────────────
// Print Template
// ─────────────────────────────────────────────────────────

export interface PrintMargins {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface PrintTemplate {
  /** Page orientation. Defaults to portrait. */
  orientation?: "portrait" | "landscape";
  /** Page margins in mm. Default: 20mm all sides. */
  margins?: PrintMargins;
  header?: {
    showLogo?: boolean;
    /** Logo alignment within the header. Default: "left" */
    logoAlign?: "left" | "right";
    /** Logo height in px. Default: 48 */
    logoHeight?: number;
    title?: string;
    subtitle?: string;
    showDate?: boolean;
  };
  footer?: {
    text?: string;
    showPageNumbers?: boolean;
    /** Page number display format. Default: "n_of_m" */
    pageNumberFormat?: "n_of_m" | "n" | "dash_n";
    showLogo?: boolean;
    /** Logo alignment within the footer. Default: "left" */
    logoAlign?: "left" | "center" | "right";
  };
  watermark?: {
    text: string;
    opacity?: number;
    angle?: number;
    fontSize?: number;
    /** Watermark text color (hex). Default: #000000 */
    color?: string;
  };
  body: PrintBlock[];
}

export type PrintBlock =
  | {
      type: "heading";
      text: string;
      level?: 1 | 2 | 3;
      align?: "left" | "center" | "right";
      /** Override default brand color for this heading */
      color?: string;
    }
  | {
      type: "paragraph";
      text: string;
      align?: "left" | "center" | "right";
      bold?: boolean;
      italic?: boolean;
    }
  | {
      type: "field_value";
      fieldId: string;
      label?: string;
      hideIfEmpty?: boolean;
      /** Show the field label. Default: true */
      showLabel?: boolean;
      /** Display label and value on the same line (inline). Default: false (block) */
      inline?: boolean;
    }
  | {
      type: "field_list";
      includeFieldIds?: string[];
      excludeFieldIds?: string[];
      style?: "table" | "list";
      /** Show a branded header row (table style only). Default: false. */
      showHeader?: boolean;
      /** Override default column header labels */
      headerLabels?: { field?: string; value?: string };
    }
  | { type: "divider" }
  | { type: "html"; content: string }
  | {
      type: "conditional_block";
      condition: PrintCondition;
      blocks: PrintBlock[];
    }
  | { type: "page_break" }
  | {
      type: "signature_box";
      label?: string;
      hint?: string;
      width?: "half" | "full";
    }
  | {
      type: "repeater_table";
      /** fieldId of a `repeater` field — value is a JSON array of rows */
      fieldId: string;
      /** Subset of column IDs to display (default: all) */
      columns?: string[];
      showHeader?: boolean;
      /** Override column header labels */
      headerLabels?: Record<string, string>;
      /** Show a totals row for numeric columns */
      showTotal?: boolean;
      totalLabel?: string;
    };

// ─────────────────────────────────────────────────────────
// Interpolation vars available in templates
// ─────────────────────────────────────────────────────────

export interface PrintInterpolationVars {
  /** All submitted field values, keyed by fieldId */
  fields: Record<string, string>;
  /** Human-readable labels for each fieldId (e.g. "First Name") */
  fieldLabels: Record<string, string>;
  /** Formatted date-time of submission */
  submittedAt: string;
  /** Form instance name */
  formName: string;
  /** Form instance description */
  formDescription: string;
  /** Short submission reference ID (e.g. "A3F9B2C1") */
  submissionId: string;
  /** Locale-aware UI labels used at print render time */
  printLabels: {
    fieldListFieldHeader: string;
    fieldListValueHeader: string;
  };
}
