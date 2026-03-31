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

None currently.

## Format

| Column / Table | Deprecated in | DROP planned for | Ticket / PR |
|----------------|---------------|------------------|-------------|
| example        | v0.2.0        | v0.3.0           | #123        |

## History

| Column / Table | Deprecated in | Dropped in | Notes |
|----------------|---------------|------------|-------|
| `users.role NOT NULL DEFAULT 'admin'` | 0035 | 0035 | Made nullable (non-destructive — DROP DEFAULT + DROP NOT NULL) |
