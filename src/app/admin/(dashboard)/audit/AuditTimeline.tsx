"use client";

import { useMemo, useState } from "react";
import type { AdminEvent } from "@/lib/db/schema";
import { getAuditLabel, type AuditKind } from "@/lib/audit/labels";
import { useTranslations } from "@/lib/context/LocaleContext";
import { AuditEventDialog } from "./AuditEventDialog";
import {
  Activity, Settings, RotateCcw, Undo2, Upload, FileCode, LayoutDashboard,
  FileText, Trash2, Copy, Unlock, Bell, FileEdit, Mail, Send, MailWarning,
  Database, Download, MinusCircle, PlusCircle, Archive, FileArchive,
  UserPlus, UserMinus, Shield, Key, Plus,
} from "lucide-react";

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Activity, Settings, RotateCcw, Undo2, Upload, FileCode, LayoutDashboard,
  FileText, Trash2, Copy, Unlock, Bell, FileEdit, Mail, Send, MailWarning,
  Database, Download, MinusCircle, PlusCircle, Archive, FileArchive,
  UserPlus, UserMinus, Shield, Key, Plus,
};

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


function avatarColor(seed: string): string {
  // Tiny hash to a Tailwind palette index. Deterministic per user.
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  const palette = [
    "bg-zinc-700",
    "bg-blue-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-purple-600",
    "bg-rose-600",
    "bg-cyan-700",
  ];
  return palette[Math.abs(h) % palette.length];
}

function initials(s: string): string {
  const cleaned = s.replace(/[^a-zA-Z@. ]/g, "");
  const parts = cleaned.split(/[@. ]/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

function relativeDayLabel(eventDay: number, todayDay: number, today: string, yesterday: string): string | null {
  const diff = Math.round((todayDay - eventDay) / 86_400_000);
  if (diff === 0) return today;
  if (diff === 1) return yesterday;
  return null;
}

interface AuditTimelineProps {
  events: AdminEvent[];
  locale?: "fr" | "en";
}

export function AuditTimeline({ events, locale = "fr" }: AuditTimelineProps) {
  const tr = useTranslations();
  const al = tr.admin.auditLog;
  const [selected, setSelected] = useState<AdminEvent | null>(null);
  const groups = useMemo(() => {
    const todayDay = startOfDay(new Date());
    const byDay = new Map<number, AdminEvent[]>();
    for (const ev of events) {
      const d = startOfDay(new Date(ev.createdAt));
      const arr = byDay.get(d) ?? [];
      arr.push(ev);
      byDay.set(d, arr);
    }
    return Array.from(byDay.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([day, items]) => ({
        day,
        relative: relativeDayLabel(day, todayDay, al.relativeToday, al.relativeYesterday),
        items: items.sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      }));
  }, [events, al.relativeToday, al.relativeYesterday]);

  if (events.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-12 text-center text-sm text-muted-foreground">
        {al.timelineEmpty}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <div key={g.day} className="space-y-2">
          <div className="flex items-center gap-2.5 pb-1.5 border-b border-border">
            {g.relative && (
              <span className="px-2 py-0.5 rounded-full bg-muted text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {g.relative}
              </span>
            )}
            <span className="text-sm font-bold tracking-tight">
              {new Date(g.day).toLocaleDateString(locale === "en" ? "en-US" : "fr-FR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })}
            </span>
            <span className="ml-auto text-xs font-mono text-muted-foreground">
              {(g.items.length === 1 ? al.actionCount_one : al.actionCount_other).replace("{n}", String(g.items.length))}
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            {g.items.map((ev) => (
              <EventRow key={ev.id} event={ev} locale={locale} onOpen={() => setSelected(ev)} />
            ))}
          </div>
        </div>
      ))}

      <AuditEventDialog
        event={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        locale={locale}
      />
    </div>
  );
}

function EventRow({ event, locale, onOpen }: { event: AdminEvent; locale: "fr" | "en"; onOpen: () => void }) {
  const meta = getAuditLabel(event.action, locale);
  const Icon = ICON_MAP[meta.icon] ?? Activity;
  const time = new Date(event.createdAt).toLocaleTimeString(
    locale === "en" ? "en-US" : "fr-FR",
    { hour: "2-digit", minute: "2-digit" },
  );
  const userId = event.userEmail ?? event.userId ?? "—";
  // Prefer a human-readable name from the event details when the resource id
  // alone would just be a UUID — resolves the "click for form name" ask.
  const details = (event.details ?? {}) as Record<string, unknown>;
  const humanName = (["name", "title", "slug", "email", "label"] as const)
    .map(k => details[k])
    .find(v => typeof v === "string" && v.length > 0) as string | undefined;
  const target = event.resourceType
    ? (humanName
        ? `${event.resourceType} · ${humanName}`
        : `${event.resourceType}${event.resourceId ? ` · ${event.resourceId}` : ""}`)
    : "";

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`flex flex-wrap items-start gap-3 px-4 py-3 rounded-lg border bg-card cursor-pointer transition-colors hover:bg-muted/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring
        ${meta.danger ? "border-l-4 border-l-red-500 border-border" : "border-border"}`}
    >
      <span
        className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${KIND_CIRCLE[meta.kind]}`}
        aria-hidden
      >
        <Icon className="w-4 h-4" />
      </span>

      <div className="min-w-0 flex-1 basis-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground break-words">
            {meta.label || event.action}
          </span>
          <code className="shrink-0 px-1.5 py-0.5 rounded bg-muted text-[11px] font-mono text-muted-foreground">
            {event.action}
          </code>
        </div>
        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <span
            className={`w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white shrink-0 ${avatarColor(userId)}`}
            aria-hidden
          >
            {initials(userId)}
          </span>
          <span className="font-medium text-foreground/80 truncate">{userId}</span>
        </div>
      </div>

      <div className="text-right shrink-0 ml-auto sm:ml-0">
        <div className="text-xs font-mono font-medium text-foreground/80">{time}</div>
        {target && (
          <div className="mt-0.5 max-w-[180px] sm:max-w-[260px] truncate text-[11px] font-mono text-muted-foreground">
            {target}
          </div>
        )}
      </div>
    </article>
  );
}
