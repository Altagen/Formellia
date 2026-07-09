"use client";

import { useMemo } from "react";
import type { AdminEvent } from "@/lib/db/schema";
import { getAuditLabel, type AuditKind } from "@/lib/audit/labels";
import { useTranslations } from "@/lib/context/LocaleContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const KIND_CIRCLE: Record<AuditKind, string> = {
  config:  "bg-blue-100 text-blue-700    dark:bg-blue-950/50    dark:text-blue-300",
  form:    "bg-blue-100 text-blue-700    dark:bg-blue-950/50    dark:text-blue-300",
  view:    "bg-blue-100 text-blue-700    dark:bg-blue-950/50    dark:text-blue-300",
  email:   "bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  data:    "bg-amber-100 text-amber-700   dark:bg-amber-950/50   dark:text-amber-300",
  auth:    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  danger:  "bg-red-100 text-red-700        dark:bg-red-950/50     dark:text-red-300",
  default: "bg-muted text-muted-foreground",
};

/**
 * Pulls a human-readable resource name from the event `details` payload if the
 * event happened to carry one alongside the id. Every `logAdminEvent` call in
 * the codebase attaches at least one of these fields when it can — we do NOT
 * hit the DB to resolve stale ids to their current names because the point of
 * an audit log is to freeze what the operator saw at the time.
 */
function humanTarget(event: AdminEvent): string | null {
  const d = (event.details ?? {}) as Record<string, unknown>;
  const candidates = ["name", "title", "slug", "email", "username", "label"];
  for (const key of candidates) {
    const v = d[key];
    if (typeof v === "string" && v.length > 0) return v;
  }
  // Sometimes we log oldSlug + newSlug on rename — show both.
  if (typeof d.oldSlug === "string" && typeof d.newSlug === "string") {
    return `${d.oldSlug} → ${d.newSlug}`;
  }
  return null;
}

interface Props {
  event:        AdminEvent | null;
  open:         boolean;
  onOpenChange: (o: boolean) => void;
  locale?:      "fr" | "en";
}

export function AuditEventDialog({ event, open, onOpenChange, locale = "fr" }: Props) {
  const tr = useTranslations();
  const al = tr.admin.auditLog;

  const meta = useMemo(() => event ? getAuditLabel(event.action, locale) : null, [event, locale]);

  if (!event || !meta) return null;

  const target = humanTarget(event);
  const timestamp = new Date(event.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR", {
    day:    "2-digit",
    month:  "long",
    year:   "numeric",
    hour:   "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <span className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${KIND_CIRCLE[meta.kind]}`} aria-hidden />
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base">{meta.label || event.action}</DialogTitle>
              <DialogDescription className="mt-1 font-mono text-[11px]">{event.action}</DialogDescription>
            </div>
            {meta.danger && (
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300">
                {al.dangerBadge}
              </span>
            )}
          </div>
        </DialogHeader>

        <dl className="space-y-3 text-sm">
          <div className="flex items-baseline gap-3">
            <dt className="w-24 text-xs font-medium text-muted-foreground shrink-0">{al.colDate}</dt>
            <dd className="font-mono text-xs text-foreground">{timestamp}</dd>
          </div>

          <div className="flex items-baseline gap-3">
            <dt className="w-24 text-xs font-medium text-muted-foreground shrink-0">{al.colUser}</dt>
            <dd className="text-xs text-foreground break-all">
              {event.userEmail ?? event.userId ?? <span className="italic text-muted-foreground">—</span>}
            </dd>
          </div>

          {event.resourceType && (
            <div className="flex items-baseline gap-3">
              <dt className="w-24 text-xs font-medium text-muted-foreground shrink-0">{al.colResource}</dt>
              <dd className="text-xs text-foreground min-w-0">
                <div className="font-mono">
                  {event.resourceType}
                  {event.resourceId && <span className="ml-1 text-muted-foreground">#{event.resourceId}</span>}
                </div>
                {target && (
                  <div className="mt-1 text-foreground/80 truncate">
                    {al.resourceNamed.replace("{name}", target)}
                  </div>
                )}
              </dd>
            </div>
          )}

          <div className="flex items-baseline gap-3">
            <dt className="w-24 text-xs font-medium text-muted-foreground shrink-0">{al.colDetails}</dt>
            <dd className="text-xs min-w-0 flex-1">
              {event.details != null ? (
                <pre className="text-[11px] font-mono text-foreground overflow-auto max-h-72 bg-muted rounded-md p-3 border border-border/60">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              ) : (
                <span className="italic text-muted-foreground">{al.detailsEmpty}</span>
              )}
            </dd>
          </div>
        </dl>
      </DialogContent>
    </Dialog>
  );
}
