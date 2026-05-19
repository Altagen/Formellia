-- Rename the per-broadcast email columns to plain `email_*`.
-- The same provider config now serves both the broadcast composer AND the
-- per-form transactional emails (fallback: per-form override → global → env).
ALTER TABLE "app_config" RENAME COLUMN "broadcast_email_provider"            TO "email_provider";
ALTER TABLE "app_config" RENAME COLUMN "broadcast_email_from_address"        TO "email_from_address";
ALTER TABLE "app_config" RENAME COLUMN "broadcast_email_from_name"           TO "email_from_name";
ALTER TABLE "app_config" RENAME COLUMN "broadcast_email_api_key_encrypted"   TO "email_api_key_encrypted";
ALTER TABLE "app_config" RENAME COLUMN "broadcast_email_api_key_expires_at"  TO "email_api_key_expires_at";
