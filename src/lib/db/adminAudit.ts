import { db } from "@/lib/db";
import { adminEvents } from "@/lib/db/schema";
import { dbLogger } from "@/lib/logger";

interface AuditParams {
  userId:       string | null;
  userEmail:    string | null;
  action:       string;
  resourceType?: string;
  resourceId?:  string;
  details?:     Record<string, unknown>;
}

/**
 * Appends an immutable admin audit event.
 * Fire-and-forget safe — errors are caught and logged, never thrown.
 *
 * Actions to log:
 *   user.create / user.delete / user.role_change / user.password_change
 *   form.create  / form.delete
 *   config.update
 */
export function logAdminEvent(params: AuditParams): void {
  db.insert(adminEvents).values({
    userId:       params.userId,
    userEmail:    params.userEmail,
    action:       params.action,
    resourceType: params.resourceType ?? null,
    resourceId:   params.resourceId   ?? null,
    details:      params.details       ?? null,
  }).catch(err => dbLogger.error({ err, action: params.action }, "Failed to write audit event"));
}
