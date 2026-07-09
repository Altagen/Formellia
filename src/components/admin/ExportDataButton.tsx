"use client";

/**
 * Icon-only "Export data" action for form cards and the form editor.
 *
 * `/api/admin/submissions/export` is a POST (CSRF-guarded) that returns a
 * downloadable CSV/JSON blob. Anchor-with-download can't do POST, so this
 * component wraps the whole "POST → blob → temp anchor click → cleanup"
 * dance behind a single button. Filters other than `formInstanceId` are
 * intentionally left out here — the FormCard use case is "just give me
 * every row for this form"; advanced filtering goes through the dialog in
 * `SubmissionExportDialog`.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Sheet, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  formInstanceId: string;
  slug:           string;
  format?:        "csv" | "json";
  className?:     string;
  label?:         string;
}

export function ExportDataButton({ formInstanceId, slug, format = "csv", className, label }: Props) {
  const [busy, setBusy] = useState(false);
  const tr = useTranslations();
  const t  = tr.admin.exportData;

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/submissions/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ formInstanceId, format }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t.failedToast);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const safe = slug.replace(/[^a-z0-9-_]/gi, "-").replace(/^-+|-+$/g, "") || "form";
      const filename = `${safe}_${new Date().toISOString().slice(0, 10)}.${format}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      toast.error(t.networkError);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      aria-label={label ?? t.defaultLabel}
      title={label ?? t.defaultLabel}
      className={cn("inline-flex items-center justify-center h-8 w-8 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors disabled:opacity-50", className)}
    >
      {busy ? <Loader2 className="w-[18px] h-[18px] animate-spin" /> : <Sheet className="w-[18px] h-[18px]" />}
    </button>
  );
}
