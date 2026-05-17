CREATE TABLE "email_broadcasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"subject" text DEFAULT '' NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"body_text" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"data_pool_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recipient_count" integer DEFAULT 0 NOT NULL,
	"sent_count" integer DEFAULT 0 NOT NULL,
	"failed_count" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp,
	"created_by_user_id" varchar(21),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_broadcasts_status_check" CHECK ("email_broadcasts"."status" IN ('draft', 'sending', 'sent', 'failed'))
);
--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "broadcast_email_provider" text;--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "broadcast_email_from_address" text;--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "broadcast_email_from_name" text;--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "broadcast_email_api_key_encrypted" text;--> statement-breakpoint
ALTER TABLE "app_config" ADD COLUMN "broadcast_email_api_key_expires_at" date;--> statement-breakpoint
ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_email_broadcasts_status_created_at" ON "email_broadcasts" USING btree ("status","created_at");