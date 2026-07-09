"use client";

import { useState, useEffect, useCallback } from "react";
import { Activity, Download, Table as TableIcon } from "lucide-react";
import type { AdminEvent } from "@/lib/db/schema";
import { useTranslations, useLocale } from "@/lib/context/LocaleContext";
import type { Locale } from "@/i18n";
import { AuditTimeline } from "./AuditTimeline";

interface AuditResponse {
  events: AdminEvent[];
  total: number;
  page: number;
  pages: number;
}

export function AuditLogClient() {
  const [events, setEvents]   = useState<AdminEvent[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [pages, setPages]     = useState(1);
  const [loading, setLoading] = useState(true);
  const tr = useTranslations();
  const locale = useLocale() as Locale;
  const al = tr.admin.auditLog;
  const tb = tr.admin.table.pagination;

  // Filter state
  const [action, setAction]   = useState("");
  const [userId, setUserId]   = useState("");
  const [from, setFrom]       = useState("");
  const [to, setTo]           = useState("");

  // Applied filters (only update on "Rechercher" click)
  const [applied, setApplied] = useState({ action: "", userId: "", from: "", to: "" });

  // Visualisation mode : timeline (default, richer) or table (data-dense).
  const [view, setView] = useState<"timeline" | "table">("timeline");

  const fetchEvents = useCallback(async (p: number, filters: typeof applied) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p) });
      if (filters.action) params.set("action", filters.action);
      if (filters.userId) params.set("userId", filters.userId);
      if (filters.from)   params.set("from", filters.from);
      if (filters.to)     params.set("to", filters.to);

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load audit events");
      const data: AuditResponse = await res.json();
      setEvents(data.events);
      setTotal(data.total);
      setPage(data.page);
      setPages(data.pages);
    } catch (err) {
      console.error("[audit] fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchEvents(1, applied);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const next = { action, userId, from, to };
    setApplied(next);
    fetchEvents(1, next);
  }

  function handlePage(next: number) {
    fetchEvents(next, applied);
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <form onSubmit={handleSearch} className="flex flex-wrap gap-3 items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">{al.filterAction}</label>
          <input
            type="text"
            value={action}
            onChange={e => setAction(e.target.value)}
            placeholder={al.filterActionPlaceholder}
            className="h-8 px-2.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">{al.filterUserId}</label>
          <input
            type="text"
            value={userId}
            onChange={e => setUserId(e.target.value)}
            placeholder={al.filterUserIdPlaceholder}
            className="h-8 px-2.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring w-44"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">{al.filterFrom}</label>
          <input
            type="date"
            value={from}
            onChange={e => setFrom(e.target.value)}
            className="h-8 px-2.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring w-36"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground font-medium">{al.filterTo}</label>
          <input
            type="date"
            value={to}
            onChange={e => setTo(e.target.value)}
            className="h-8 px-2.5 text-sm border border-border rounded-md bg-background focus:outline-none focus:ring-1 focus:ring-ring w-36"
          />
        </div>
        <button
          type="submit"
          className="h-8 px-3 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
        >
          {al.filterSearch}
        </button>
        {(applied.action || applied.userId || applied.from || applied.to) && (
          <button
            type="button"
            onClick={() => {
              setAction(""); setUserId(""); setFrom(""); setTo("");
              const reset = { action: "", userId: "", from: "", to: "" };
              setApplied(reset);
              fetchEvents(1, reset);
            }}
            className="h-8 px-3 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-accent/50 transition-colors"
          >
            {al.reset}
          </button>
        )}
      </form>

      {/* Stats + view toggle + export */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground">
          {loading ? al.loading : (total === 1 ? al.eventCount_one.replace("{n}", String(total)) : al.eventCount_other.replace("{n}", String(total)))}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/30">
            {(["csv", "json", "yaml"] as const).map((fmt) => (
              <a
                key={fmt}
                href={`/api/admin/audit/export?format=${fmt}${applied.from ? `&from=${applied.from}` : ""}${applied.to ? `&to=${applied.to}` : ""}${applied.action ? `&action=${encodeURIComponent(applied.action)}` : ""}${applied.userId ? `&userId=${encodeURIComponent(applied.userId)}` : ""}`}
                download
                className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded text-muted-foreground hover:text-foreground hover:bg-background transition-colors"
                title={al.exportFormat.replace("{fmt}", fmt.toUpperCase())}
              >
                <Download className="w-3 h-3" />
                {fmt.toUpperCase()}
              </a>
            ))}
          </div>
          <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/30">
            <button
              type="button"
              onClick={() => setView("timeline")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${view === "timeline" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={view === "timeline"}
            >
              <Activity className="w-3 h-3" />
              {al.viewTimeline}
            </button>
            <button
              type="button"
              onClick={() => setView("table")}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded transition-colors ${view === "table" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              aria-pressed={view === "table"}
            >
              <TableIcon className="w-3 h-3" />
              {al.viewTable}
            </button>
          </div>
        </div>
      </div>

      {/* Timeline view (default) */}
      {view === "timeline" && !loading && (
        <AuditTimeline events={events} locale={locale} />
      )}

      {/* Table view (data-dense, for power users) */}
      {view === "table" && (
      <div className="border border-border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{al.colDate}</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{al.colUser}</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{al.colAction}</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{al.colResource}</th>
                <th className="text-left px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">{al.colDetails}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    {al.loading}
                  </td>
                </tr>
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground text-sm">
                    {al.noEvents}
                  </td>
                </tr>
              ) : (
                events.map(event => (
                  <tr key={event.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                      {new Date(event.createdAt).toLocaleString(locale === "en" ? "en-US" : "fr-FR", {
                        day: "2-digit", month: "2-digit", year: "numeric",
                        hour: "2-digit", minute: "2-digit", second: "2-digit",
                      })}
                    </td>
                    <td className="px-3 py-2.5 text-xs max-w-[160px] truncate" title={event.userEmail ?? event.userId ?? ""}>
                      {event.userEmail ?? event.userId ?? <span className="text-muted-foreground italic">—</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-mono bg-muted text-foreground">
                        {event.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {event.resourceType ? (
                        <span>
                          {event.resourceType}
                          {event.resourceId && <span className="ml-1 opacity-60">#{event.resourceId}</span>}
                        </span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      {event.details != null ? (
                        <details className="cursor-pointer">
                          <summary className="text-xs text-primary hover:underline select-none">{al.detailsView}</summary>
                          <pre className="text-xs overflow-auto max-w-sm mt-1 bg-muted rounded p-2">
                            {JSON.stringify(event.details, null, 2)}
                          </pre>
                        </details>
                      ) : (
                        <span className="text-xs text-muted-foreground italic">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

      {/* Pagination */}
      {pages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            {tb.pageXofY.replace("{page}", String(page)).replace("{pages}", String(pages))}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => handlePage(page - 1)}
              disabled={page <= 1 || loading}
              className="h-7 px-3 text-xs border border-border rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/50 transition-colors"
            >
              {tb.previous}
            </button>
            <button
              onClick={() => handlePage(page + 1)}
              disabled={page >= pages || loading}
              className="h-7 px-3 text-xs border border-border rounded-md disabled:opacity-40 disabled:cursor-not-allowed hover:bg-accent/50 transition-colors"
            >
              {tb.next}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
