CREATE TABLE "admin_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(21),
	"user_email" varchar(255),
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" varchar(255),
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(64) NOT NULL,
	"role" varchar(20) DEFAULT 'editor' NOT NULL,
	"created_by_user_id" varchar(21),
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "app_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"enforce_password_policy" boolean DEFAULT false NOT NULL,
	"session_duration_days" integer DEFAULT 30 NOT NULL,
	"user_creation_rate_limit" integer DEFAULT 5 NOT NULL,
	"login_rate_limit_max_attempts" integer DEFAULT 10 NOT NULL,
	"login_rate_limit_window_minutes" integer DEFAULT 15 NOT NULL,
	"use_custom_root" boolean DEFAULT false NOT NULL,
	"protected_slugs" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "app_config_single_row" CHECK ("app_config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"id" integer PRIMARY KEY NOT NULL,
	"red_max_days" integer DEFAULT 7 NOT NULL,
	"orange_max_days" integer DEFAULT 14 NOT NULL,
	"yellow_max_days" integer DEFAULT 30 NOT NULL,
	CONSTRAINT "app_settings_single_row" CHECK ("app_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "backup_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"type" varchar(20) NOT NULL,
	"encrypted_config" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"encrypt_backup" boolean DEFAULT false NOT NULL,
	"retention_policy" jsonb DEFAULT '{"type":"keep_all"}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_ca_certs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"pem" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_datasets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"source_type" varchar(20) NOT NULL,
	"api_url" text,
	"api_headers" jsonb,
	"poll_interval_minutes" integer,
	"import_mode" varchar(20) DEFAULT 'append' NOT NULL,
	"dedup_key" text,
	"field_map" jsonb,
	"column_defs" jsonb,
	"record_count" integer DEFAULT 0,
	"last_imported_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "external_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"imported_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "form_analytics" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"form_slug" varchar(100) NOT NULL,
	"step" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_config" (
	"id" integer PRIMARY KEY NOT NULL,
	"config" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "form_config_single_row" CHECK ("form_config"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "form_instances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" varchar(100) NOT NULL,
	"name" varchar(255) NOT NULL,
	"config" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "form_instances_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "form_version_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_instance_id" uuid NOT NULL,
	"config" jsonb NOT NULL,
	"saved_by_user_id" varchar(21),
	"saved_by_email" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"started_at" timestamp NOT NULL,
	"completed_at" timestamp,
	"status" varchar(10) NOT NULL,
	"result" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"ip_hash" varchar(64) PRIMARY KEY NOT NULL,
	"attempt_count" smallint DEFAULT 0 NOT NULL,
	"window_start" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_slug" varchar(100) NOT NULL,
	"session_id" varchar(64) NOT NULL,
	"source" varchar(20) DEFAULT 'direct' NOT NULL,
	"referrer_domain" varchar(255),
	"utm_source" varchar(100),
	"utm_medium" varchar(100),
	"utm_campaign" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_tokens" (
	"token" text PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "saved_filters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"user_email" varchar(255),
	"name" varchar(100) NOT NULL,
	"form_slug" varchar(100),
	"filters" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheduled_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"action" varchar(50) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"schedule" varchar(50) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"last_status" varchar(10),
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schema_meta" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submission_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid NOT NULL,
	"user_id" varchar(21),
	"user_email" varchar(255),
	"action" varchar(50) NOT NULL,
	"changes" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255),
	"form_data" jsonb NOT NULL,
	"submitted_at" timestamp DEFAULT now() NOT NULL,
	"ip_hash" varchar(64),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"priority" varchar(10) DEFAULT 'none' NOT NULL,
	"received_at" date,
	"due_date" date,
	"notes" text,
	"assigned_to_id" varchar(21),
	"assigned_to_email" varchar(255),
	"form_instance_id" uuid
);
--> statement-breakpoint
CREATE TABLE "user_form_grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar(21) NOT NULL,
	"form_instance_id" uuid NOT NULL,
	"role" varchar(20) NOT NULL,
	"granted_by" varchar(21),
	"granted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(21) PRIMARY KEY NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255),
	"hashed_password" varchar NOT NULL,
	"role" varchar(20),
	"theme_mode" varchar(10) DEFAULT 'light' NOT NULL,
	"color_preset" varchar(20) DEFAULT 'default' NOT NULL,
	"locale" varchar(5) DEFAULT 'fr' NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"recovery_codes" jsonb,
	"sidebar_layout" jsonb,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submission_id" uuid,
	"form_instance_id" uuid,
	"webhook_url" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"next_retry_at" timestamp DEFAULT now() NOT NULL,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_events" ADD CONSTRAINT "admin_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_records" ADD CONSTRAINT "external_records_dataset_id_external_datasets_id_fk" FOREIGN KEY ("dataset_id") REFERENCES "public"."external_datasets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_version_history" ADD CONSTRAINT "form_version_history_form_instance_id_form_instances_id_fk" FOREIGN KEY ("form_instance_id") REFERENCES "public"."form_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_version_history" ADD CONSTRAINT "form_version_history_saved_by_user_id_users_id_fk" FOREIGN KEY ("saved_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_runs" ADD CONSTRAINT "job_runs_job_id_scheduled_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."scheduled_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_filters" ADD CONSTRAINT "saved_filters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submission_events" ADD CONSTRAINT "submission_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_form_instance_id_form_instances_id_fk" FOREIGN KEY ("form_instance_id") REFERENCES "public"."form_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_form_grants" ADD CONSTRAINT "user_form_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_form_grants" ADD CONSTRAINT "user_form_grants_form_instance_id_form_instances_id_fk" FOREIGN KEY ("form_instance_id") REFERENCES "public"."form_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_form_grants" ADD CONSTRAINT "user_form_grants_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_form_instance_id_form_instances_id_fk" FOREIGN KEY ("form_instance_id") REFERENCES "public"."form_instances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_admin_events_created_at" ON "admin_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_admin_events_action" ON "admin_events" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_admin_events_user_id" ON "admin_events" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ca_certs_enabled" ON "custom_ca_certs" USING btree ("enabled");--> statement-breakpoint
CREATE INDEX "idx_form_analytics_form_slug" ON "form_analytics" USING btree ("form_slug");--> statement-breakpoint
CREATE INDEX "idx_form_analytics_session_id" ON "form_analytics" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_form_version_history_form_instance_id" ON "form_version_history" USING btree ("form_instance_id");--> statement-breakpoint
CREATE INDEX "idx_job_runs_job_id" ON "job_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "idx_page_views_form_slug_created" ON "page_views" USING btree ("form_slug","created_at");--> statement-breakpoint
CREATE INDEX "idx_page_views_session" ON "page_views" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_pwd_reset_user_id" ON "password_reset_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_pwd_reset_expires_at" ON "password_reset_tokens" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_saved_filters_user_id" ON "saved_filters" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_submission_events_submission_id" ON "submission_events" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_form_instance_id" ON "submissions" USING btree ("form_instance_id");--> statement-breakpoint
CREATE INDEX "idx_submissions_status_priority" ON "submissions" USING btree ("status","priority");--> statement-breakpoint
CREATE INDEX "idx_submissions_submitted_at" ON "submissions" USING btree ("submitted_at");--> statement-breakpoint
CREATE INDEX "idx_ufg_user_id" ON "user_form_grants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_ufg_form_instance_id" ON "user_form_grants" USING btree ("form_instance_id");--> statement-breakpoint
CREATE INDEX "idx_wh_delivery_status_retry" ON "webhook_deliveries" USING btree ("status","next_retry_at");--> statement-breakpoint
CREATE INDEX "idx_wh_delivery_submission" ON "webhook_deliveries" USING btree ("submission_id");