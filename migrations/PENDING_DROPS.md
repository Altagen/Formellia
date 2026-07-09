# Expand/Contract — Deferred Drops Convention

## Context

For Docker Compose deployments (single-server), Drizzle migrations are
transactional and applied automatically at startup. The full Expand/Contract
pattern is **not required** (it is only useful for rolling zero-downtime deployments).

That said, to keep the codebase clean and avoid accidents, any **deprecated** column
or table must be registered here **before being dropped**. The rule:

> A DROP may only appear in a migration where the code no longer references
> the column/table at all.

## Deprecated columns/tables pending removal

| Column / Table | Deprecated in | DROP planned for | Ticket / PR |
|----------------|---------------|------------------|-------------|
| `app_config.email_provider`, `email_from_address`, `email_from_name`, `email_api_key_encrypted`, `email_api_key_expires_at` | 0006 | 0.4.0 | UI-11 — moved to `email_providers` presets |
| `form_instances.config.notifications.email.{provider,fromAddress,fromName,apiKeyEncrypted,apiKeyExpiresAt}` (JSONB fields, stripped at boot) | 0006 | 0.4.0 | UI-11 — replaced by `providerId` reference |
| `form_instances.config.notifications.submitterConfirmation` (JSONB subtree, dropped at boot) | 0006 | 0.4.0 | UI-11 — feature removed (duplicate of main confirmation) |

## Format

| Column / Table | Deprecated in | DROP planned for | Ticket / PR |
|----------------|---------------|------------------|-------------|
| example        | v0.2.0        | v0.3.0           | #123        |

## History

| Column / Table | Deprecated in | Dropped in | Notes |
|----------------|---------------|------------|-------|
| `users.role NOT NULL DEFAULT 'admin'` | 0035 | 0035 | Made nullable (non-destructive — DROP DEFAULT + DROP NOT NULL) |
