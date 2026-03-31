import { pgTable, varchar, jsonb, timestamp, uuid, date, text, integer, smallint, boolean, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { SidebarLayout } from "@/types/sidebarLayout";

// ─────────────────────────────────────────────────────────
// Multi-form: each form instance has its own config
// ─────────────────────────────────────────────────────────

export const formInstances = pgTable("form_instances", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 255 }).notNull(),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const submissions = pgTable("submissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }),
  formData: jsonb("form_data").notNull(),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  ipHash: varchar("ip_hash", { length: 64 }),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  priority: varchar("priority", { length: 10 }).notNull().default("none"),
  dateReception: date("date_reception"),
  dateEcheance: date("date_echeance"),
  notes: text("notes"),
  assignedToId:    varchar("assigned_to_id",    { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  assignedToEmail: varchar("assigned_to_email", { length: 255 }),
  formInstanceId: uuid("form_instance_id").references(() => formInstances.id, { onDelete: "cascade" }),
}, (t) => [
  index("idx_submissions_form_instance_id").on(t.formInstanceId),
  index("idx_submissions_status_priority").on(t.status, t.priority),
  index("idx_submissions_submitted_at").on(t.submittedAt),
]);

export const users = pgTable("users", {
  id: varchar("id", { length: 21 }).primaryKey(),
  username: varchar("username", { length: 50 }).notNull().unique(),
  email: varchar("email", { length: 255 }).unique(),
  hashedPassword: varchar("hashed_password").notNull(),
  // null = scoped-only access via user_form_grants; non-null = global role
  role: varchar("role", { length: 20 }),
  themeMode: varchar("theme_mode", { length: 10 }).notNull().default("light"),
  colorPreset: varchar("color_preset", { length: 20 }).notNull().default("default"),
  locale: varchar("locale", { length: 5 }).notNull().default("fr"),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  /** SHA-256 hashes of one-time recovery codes. Null = none generated. */
  recoveryCodes: jsonb("recovery_codes").$type<string[]>(),
  /** Per-user sidebar customization: favorites, pinned forms, custom links, categories. */
  sidebarLayout: jsonb("sidebar_layout").$type<SidebarLayout>(),
});

export const sessions = pgTable("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 21 })
    .notNull()
    .references(() => users.id),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
});

// Single-row settings table (id always = 1)
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey(),
  redMaxDays: integer("red_max_days").notNull().default(7),
  orangeMaxDays: integer("orange_max_days").notNull().default(14),
  yellowMaxDays: integer("yellow_max_days").notNull().default(30),
}, (t) => [
  check("app_settings_single_row", sql`${t.id} = 1`),
]);

// Single-row config table — id always = 1.
// Only used when CONFIG_SOURCE=db. In file mode this table may be empty.
export const formConfig = pgTable("form_config", {
  id: integer("id").primaryKey(),
  config: jsonb("config").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  check("form_config_single_row", sql`${t.id} = 1`),
]);

export const externalDatasets = pgTable("external_datasets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  description: text("description"),
  sourceType: varchar("source_type", { length: 20 }).notNull(), // 'file' | 'api'
  apiUrl: text("api_url"),
  apiHeaders: jsonb("api_headers"),
  pollIntervalMinutes: integer("poll_interval_minutes"),
  importMode: varchar("import_mode", { length: 20 }).notNull().default("append"), // append|replace|dedup
  dedupKey: text("dedup_key"),
  fieldMap: jsonb("field_map"),
  columnDefs: jsonb("column_defs"),
  recordCount: integer("record_count").default(0),
  lastImportedAt: timestamp("last_imported_at"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const externalRecords = pgTable("external_records", {
  id: uuid("id").primaryKey().defaultRandom(),
  datasetId: uuid("dataset_id").notNull().references(() => externalDatasets.id, { onDelete: "cascade" }),
  data: jsonb("data").notNull(),
  importedAt: timestamp("imported_at").defaultNow(),
});

export const submissionEvents = pgTable("submission_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  submissionId: uuid("submission_id").notNull().references(() => submissions.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  userEmail: varchar("user_email", { length: 255 }),
  action: varchar("action", { length: 50 }).notNull(), // e.g. "update_status"
  changes: jsonb("changes").notNull(), // { field, from, to }
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_submission_events_submission_id").on(t.submissionId),
]);

// Single-row app-level configuration (id always = 1).
// Driven by config.yaml at startup — also editable via admin UI (YAML takes priority on restart).
export const appConfig = pgTable("app_config", {
  id: integer("id").primaryKey(),
  enforcePasswordPolicy: boolean("enforce_password_policy").notNull().default(false),
  sessionDurationDays: integer("session_duration_days").notNull().default(30),
  userCreationRateLimit: integer("user_creation_rate_limit").notNull().default(5),
  loginRateLimitMaxAttempts: integer("login_rate_limit_max_attempts").notNull().default(10),
  loginRateLimitWindowMinutes: integer("login_rate_limit_window_minutes").notNull().default(15),
  useCustomRoot: boolean("use_custom_root").notNull().default(false),
  protectedSlugs: jsonb("protected_slugs").$type<string[]>().notNull().default([]),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (t) => [
  check("app_config_single_row", sql`${t.id} = 1`),
]);

// Persists login rate-limit state across restarts.
// One row per IP hash — upserted on every login attempt, TTL-cleaned by a periodic job.
export const loginAttempts = pgTable("login_attempts", {
  ipHash:       varchar("ip_hash", { length: 64 }).primaryKey(),
  attemptCount: smallint("attempt_count").notNull().default(0),
  windowStart:  timestamp("window_start", { withTimezone: true, mode: "date" }).notNull(),
});

// Audit log for sensitive admin actions (user mgmt, form mgmt, config changes).
// Append-only — never deleted, never updated.
export const adminEvents = pgTable("admin_events", {
  id:           uuid("id").primaryKey().defaultRandom(),
  userId:       varchar("user_id",    { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  userEmail:    varchar("user_email", { length: 255 }),
  action:       varchar("action",        { length: 100 }).notNull(),
  resourceType: varchar("resource_type", { length: 50 }),
  resourceId:   varchar("resource_id",   { length: 255 }),
  details:      jsonb("details"),
  createdAt:    timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_admin_events_created_at").on(t.createdAt),
  index("idx_admin_events_action").on(t.action),
  index("idx_admin_events_user_id").on(t.userId),
]);

// ─────────────────────────────────────────────────────────
// Saved dashboard filter views (per user, optionally scoped to a form)
// ─────────────────────────────────────────────────────────
export const savedFilters = pgTable("saved_filters", {
  id:        uuid("id").primaryKey().defaultRandom(),
  userId:    varchar("user_id",    { length: 21 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  userEmail: varchar("user_email", { length: 255 }),
  name:      varchar("name",       { length: 100 }).notNull(),
  formSlug:  varchar("form_slug",  { length: 100 }), // null = global
  filters:   jsonb("filters").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_saved_filters_user_id").on(t.userId),
]);

// ─────────────────────────────────────────────────────────
// Form config version history — snapshot before each save
// ─────────────────────────────────────────────────────────
export const formVersionHistory = pgTable("form_version_history", {
  id:             uuid("id").primaryKey().defaultRandom(),
  formInstanceId: uuid("form_instance_id").notNull().references(() => formInstances.id, { onDelete: "cascade" }),
  config:         jsonb("config").notNull(),
  savedByUserId:  varchar("saved_by_user_id", { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  savedByEmail:   varchar("saved_by_email",   { length: 255 }),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_form_version_history_form_instance_id").on(t.formInstanceId),
]);

// ─────────────────────────────────────────────────────────
// Form completion analytics — step-level funnel tracking
// ─────────────────────────────────────────────────────────
export const formAnalytics = pgTable("form_analytics", {
  id:        uuid("id").primaryKey().defaultRandom(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  formSlug:  varchar("form_slug",  { length: 100 }).notNull(),
  step:      integer("step").notNull(),
  action:    varchar("action", { length: 20 }).notNull(), // "view" | "abandon" | "complete"
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_form_analytics_form_slug").on(t.formSlug),
  index("idx_form_analytics_session_id").on(t.sessionId),
]);

// ─────────────────────────────────────────────────────────
// Page view tracking — captures visits before form interaction
// ─────────────────────────────────────────────────────────
export const pageViews = pgTable("page_views", {
  id: uuid("id").primaryKey().defaultRandom(),
  formSlug: varchar("form_slug", { length: 100 }).notNull(),
  sessionId: varchar("session_id", { length: 64 }).notNull(),
  source: varchar("source", { length: 20 }).notNull().default("direct"), // direct|social|search|referral
  referrerDomain: varchar("referrer_domain", { length: 255 }),
  utmSource: varchar("utm_source", { length: 100 }),
  utmMedium: varchar("utm_medium", { length: 100 }),
  utmCampaign: varchar("utm_campaign", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_page_views_form_slug_created").on(t.formSlug, t.createdAt),
  index("idx_page_views_session").on(t.sessionId),
]);

export const scheduledJobs = pgTable("scheduled_jobs", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 100 }).notNull(),
  action: varchar("action", { length: 50 }).notNull(), // 'retention_cleanup' | 'export_json' | 'export_csv'
  config: jsonb("config").notNull().default({}),       // action-specific params
  schedule: varchar("schedule", { length: 50 }).notNull(), // cron expression e.g. "0 2 * * *"
  enabled: boolean("enabled").notNull().default(false),
  lastRunAt: timestamp("last_run_at"),
  nextRunAt: timestamp("next_run_at"),
  lastStatus: varchar("last_status", { length: 10 }), // 'ok' | 'error'
  lastError: text("last_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const jobRuns = pgTable("job_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").notNull().references(() => scheduledJobs.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at").notNull(),
  completedAt: timestamp("completed_at"),
  status: varchar("status", { length: 10 }).notNull(), // 'ok' | 'error' | 'running'
  result: jsonb("result"),   // { deleted: 5 } or { exported: 100, filePath: '...' }
  error: text("error"),
}, (t) => [
  index("idx_job_runs_job_id").on(t.jobId),
]);

// ─────────────────────────────────────────────────────────
// Password reset tokens — generated by admin, expires in 1h
// ─────────────────────────────────────────────────────────
export const passwordResetTokens = pgTable("password_reset_tokens", {
  // Stores SHA-256 hex of the plain token — plain token is never persisted
  token: text("token").primaryKey(),
  userId: varchar("user_id", { length: 21 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true, mode: "date" }),
}, (t) => [
  index("idx_pwd_reset_user_id").on(t.userId),
  index("idx_pwd_reset_expires_at").on(t.expiresAt),
]);

// ─────────────────────────────────────────────────────────
// API keys — programmatic access (bearer token auth)
// The raw key is shown once at creation; only its SHA-256 hash is stored.
// ─────────────────────────────────────────────────────────
export const apiKeys = pgTable("api_keys", {
  id:              uuid("id").primaryKey().defaultRandom(),
  name:            varchar("name",     { length: 100 }).notNull(),
  keyHash:         varchar("key_hash", { length: 64  }).notNull().unique(), // SHA-256 hex of raw key
  role:            varchar("role",     { length: 20  }).notNull().default("editor"), // editor | admin | viewer
  createdByUserId: varchar("created_by_user_id", { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  lastUsedAt:      timestamp("last_used_at"),
  expiresAt:       timestamp("expires_at"),
  createdAt:       timestamp("created_at").defaultNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;

// ─────────────────────────────────────────────────────────
// Per-form access grants — scopes a user to specific forms
// Only applies when users.role IS NULL (scoped-only users)
// ─────────────────────────────────────────────────────────
export const userFormGrants = pgTable("user_form_grants", {
  id:             uuid("id").primaryKey().defaultRandom(),
  userId:         varchar("user_id",          { length: 21 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  formInstanceId: uuid("form_instance_id").notNull().references(() => formInstances.id, { onDelete: "cascade" }),
  role:           varchar("role",             { length: 20 }).notNull(), // 'editor' | 'agent' | 'viewer'
  grantedBy:      varchar("granted_by",       { length: 21 }).references(() => users.id, { onDelete: "set null" }),
  grantedAt:      timestamp("granted_at").defaultNow().notNull(),
}, (t) => [
  index("idx_ufg_user_id").on(t.userId),
  index("idx_ufg_form_instance_id").on(t.formInstanceId),
]);

// ─────────────────────────────────────────────────────────
// Schema metadata — boot-time migration state tracking
// ─────────────────────────────────────────────────────────
export const schemaMeta = pgTable("schema_meta", {
  key:   text("key").primaryKey(),
  value: text("value").notNull(),
});

// ─────────────────────────────────────────────────────────
// Backup providers — local filesystem or S3-compatible storage
// ─────────────────────────────────────────────────────────
export type RetentionPolicy =
  | { type: "keep_all" }
  | { type: "keep_last_n"; n: number }
  | { type: "keep_last_days"; days: number };

export const backupProviders = pgTable("backup_providers", {
  id:               uuid("id").primaryKey().defaultRandom(),
  name:             varchar("name",  { length: 100 }).notNull(),
  type:             varchar("type",  { length: 20  }).notNull(), // 'local' | 's3'
  encryptedConfig:  text("encrypted_config").notNull(),          // AES-256-GCM, see src/lib/email/crypto.ts
  enabled:          boolean("enabled").notNull().default(true),
  encryptBackup:    boolean("encrypt_backup").notNull().default(false),
  retentionPolicy:  jsonb("retention_policy").$type<RetentionPolicy>().notNull().default({ type: "keep_all" } as RetentionPolicy),
  createdAt:        timestamp("created_at").defaultNow().notNull(),
  updatedAt:        timestamp("updated_at").defaultNow().notNull(),
});

// ─── Custom CA Certificates ───────────────────────────────────────────────────
export const customCaCerts = pgTable("custom_ca_certs", {
  id:        uuid("id").primaryKey().defaultRandom(),
  name:      varchar("name", { length: 200 }).notNull(),
  pem:       text("pem").notNull(),
  enabled:   boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("idx_ca_certs_enabled").on(t.enabled),
]);

// ─── Webhook Delivery Queue ───────────────────────────────────────────────────
/** Tracks each webhook delivery attempt with retry state. */
export const webhookDeliveries = pgTable("webhook_deliveries", {
  id:             uuid("id").primaryKey().defaultRandom(),
  submissionId:   uuid("submission_id").references(() => submissions.id, { onDelete: "cascade" }),
  formInstanceId: uuid("form_instance_id").references(() => formInstances.id, { onDelete: "cascade" }),
  webhookUrl:     text("webhook_url").notNull(),
  payload:        jsonb("payload").notNull().$type<Record<string, unknown>>(),
  // status: pending | success | failed
  status:         varchar("status", { length: 20 }).notNull().default("pending"),
  attempts:       integer("attempts").notNull().default(0),
  maxAttempts:    integer("max_attempts").notNull().default(5),
  nextRetryAt:    timestamp("next_retry_at").notNull().default(sql`now()`),
  lastError:      text("last_error"),
  createdAt:      timestamp("created_at").defaultNow().notNull(),
  updatedAt:      timestamp("updated_at").defaultNow().notNull(),
}, (t) => [
  index("idx_wh_delivery_status_retry").on(t.status, t.nextRetryAt),
  index("idx_wh_delivery_submission").on(t.submissionId),
]);

export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type CustomCaCert = typeof customCaCerts.$inferSelect;
export type BackupProvider = typeof backupProviders.$inferSelect;
export type PageView = typeof pageViews.$inferSelect;
export type AdminEvent = typeof adminEvents.$inferSelect;
export type SubmissionEvent = typeof submissionEvents.$inferSelect;
export type FormInstanceRow = typeof formInstances.$inferSelect;
export type Submission = typeof submissions.$inferSelect;
export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type AppSettings = typeof appSettings.$inferSelect;
export type FormConfigRow = typeof formConfig.$inferSelect;
export type ExternalDataset = typeof externalDatasets.$inferSelect;
export type ExternalRecord = typeof externalRecords.$inferSelect;
export type SavedFilter = typeof savedFilters.$inferSelect;
export type FormVersionHistory = typeof formVersionHistory.$inferSelect;
export type FormAnalytic = typeof formAnalytics.$inferSelect;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type JobRun = typeof jobRuns.$inferSelect;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type UserFormGrant = typeof userFormGrants.$inferSelect;
