/**
 * Structured logger — pino.
 *
 * Usage in server code:
 *   import { logger } from "@/lib/logger";
 *   logger.info({ userId }, "User logged in");
 *   logger.error({ err }, "Database error");
 *
 * In API routes, extract requestId from the x-request-id header (set by middleware)
 * and create a child logger:
 *   const log = logger.child({ requestId: req.headers.get("x-request-id") ?? undefined });
 *
 * Log level: LOG_LEVEL env var (default "info").
 * Format: JSON in production, pretty in development.
 */
import pino from "pino";

const isDev = process.env.NODE_ENV === "development";
const level = process.env.LOG_LEVEL ?? "info";

const transport = isDev
  ? pino.transport({ target: "pino-pretty", options: { colorize: true, ignore: "pid,hostname" } })
  : undefined;

export const logger = pino(
  {
    level,
    base: { service: "formellia" },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: {
      level(label) {
        return { level: label };
      },
    },
  },
  transport
);

// ── Module-specific child loggers ────────────────────────────────────────────

export const authLogger      = logger.child({ module: "auth" });
export const dbLogger        = logger.child({ module: "db" });
export const schedulerLogger = logger.child({ module: "scheduler" });
export const startupLogger   = logger.child({ module: "startup" });
export const configLogger    = logger.child({ module: "config" });
export const backupLogger    = logger.child({ module: "backup" });
export const formLogger      = logger.child({ module: "form" });
