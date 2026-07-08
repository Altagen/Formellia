CREATE TABLE "email_providers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"provider" text NOT NULL,
	"from_address" text NOT NULL,
	"from_name" text,
	"api_key_encrypted" text NOT NULL,
	"api_key_expires_at" date,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "email_providers_name_unique" UNIQUE("name"),
	CONSTRAINT "email_providers_provider_check" CHECK ("email_providers"."provider" IN ('resend', 'sendgrid', 'mailgun'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "email_providers_default_unique" ON "email_providers" USING btree ("is_default") WHERE "email_providers"."is_default" = true;
--> statement-breakpoint
-- Data migration: seed the first preset from any existing app_config.email_* singleton so
-- broadcasts + form notifications keep working without an operator having to reconfigure.
-- If no global config was set, no row is inserted; the operator must create one before
-- notifications will send.
INSERT INTO "email_providers" ("name", "provider", "from_address", "from_name", "api_key_encrypted", "api_key_expires_at", "is_default")
SELECT
  'Default',
  "email_provider",
  "email_from_address",
  "email_from_name",
  "email_api_key_encrypted",
  "email_api_key_expires_at",
  true
FROM "app_config"
WHERE "id" = 1
  AND "email_provider" IS NOT NULL
  AND "email_from_address" IS NOT NULL
  AND "email_api_key_encrypted" IS NOT NULL
ON CONFLICT ("name") DO NOTHING;