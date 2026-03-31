import type {
  AppMetaConfig,
  PageConfig,
  FormDefinition,
  SecurityConfig,
  AdminConfig,
} from "@/types/config";
import type { FormAction } from "@/types/formActions";

// ─────────────────────────────────────────────────────────
// Per-form-instance feature flags
// ─────────────────────────────────────────────────────────

export interface FormFeatures {
  /** If false, the public URL returns 404 */
  landingPage: boolean;
  /** If false, landing page is visible but the wizard is hidden */
  form: boolean;
  /** If true, disposable/temporary email domains are rejected at submission (default: false) */
  blockDisposableEmails?: boolean;
  /** If false, config changes are NOT snapshotted and the version history drawer is hidden (default: true) */
  formVersioning?: boolean;
  /** If true, shows a sticky section navigation panel (anchored to section_header fields) */
  sectionNav?: boolean;
  /** If true, shows a global completion progress bar at the top of the form */
  completionBar?: boolean;
}

export interface EmailNotificationConfig {
  enabled: boolean;
  provider: "resend" | "sendgrid" | "mailgun";
  /** AES-256-GCM encrypted API key — never sent to client */
  apiKeyEncrypted: string;
  /** ISO date string (YYYY-MM-DD) — null means no expiration */
  apiKeyExpiresAt?: string | null;
  fromAddress: string;
  fromName?: string;
  /** Supports {{email}}, {{formName}}, {{submittedAt}}, {{fieldId}} */
  subject: string;
  /** Plain text body — same variable substitution as subject */
  bodyText: string;
}

export interface SubmitterConfirmationConfig {
  enabled: boolean;
  subject: string;
  bodyText: string;
  // Reuses provider/apiKey from notifications.email
}

export interface FormNotifications {
  /** Webhook URL called (fire-and-forget) on each new submission */
  webhookUrl?: string;
  enabled?: boolean;
  email?: EmailNotificationConfig;
  submitterConfirmation?: SubmitterConfirmationConfig;
}

// ─────────────────────────────────────────────────────────
// Config stored inside a form instance (meta / page / form / security)
// ─────────────────────────────────────────────────────────

export interface FormInstanceConfig {
  meta: AppMetaConfig;
  page: PageConfig;
  form: FormDefinition;
  security?: SecurityConfig;
  features: FormFeatures;
  notifications?: FormNotifications;
  /**
   * Custom statuses for this form instance.
   * When defined and non-empty, replaces the default statuses
   * (pending, in_progress, done, waiting_user) in the admin UI.
   */
  customStatuses?: { value: string; label: string; color: string }[];
  /**
   * Custom success message shown after form submission.
   * Supports {{fieldId}} variable substitution using submitted field values.
   * Falls back to instanceConfig.meta.translations?.successMessage, then the hardcoded default.
   */
  successMessage?: string;
  /**
   * If set, the user is redirected to this URL after a successful submission.
   */
  successRedirectUrl?: string;
  /**
   * Delay in seconds before the redirect fires. Defaults to 5.
   */
  successRedirectDelay?: number;
  /**
   * Per-form priority thresholds (days). Falls back to DEFAULT_THRESHOLDS when absent.
   */
  priorityThresholds?: {
    redMaxDays: number;
    orangeMaxDays: number;
    yellowMaxDays: number;
  };
  /**
   * Post-submit action pipeline.
   * Absent or [] → default behavior (implicit save_to_db).
   */
  onSubmitActions?: FormAction[];
  /**
   * Set to "yaml" when this instance is driven by config.yaml at startup.
   * Set to "ui-import" when this instance was last updated via a YAML import in the UI.
   * UI config tabs are shown read-only (except Code tab) until unlocked.
   */
  _managedBy?: "yaml" | "ui-import";
}

// ─────────────────────────────────────────────────────────
// Full FormInstance row (as returned by formInstanceLoader)
// ─────────────────────────────────────────────────────────

export interface FormInstance {
  id: string;
  slug: string;
  name: string;
  config: FormInstanceConfig;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────
// Legacy shape of form.config.ts / old form_config DB rows.
// Used only by the seeder to read the pre-migration config.
// ─────────────────────────────────────────────────────────

export interface FormFileConfig {
  version: number;
  meta: AppMetaConfig;
  page: PageConfig;
  form: FormDefinition;
  admin: AdminConfig;
  security?: SecurityConfig;
  priorityThresholds?: {
    redMaxDays: number;
    orangeMaxDays: number;
    yellowMaxDays: number;
  };
}
