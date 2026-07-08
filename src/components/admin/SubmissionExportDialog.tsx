"use client";

/**
 * Filtered CSV/JSON export dialog for a single form's submissions.
 *
 * Wraps the same POST call as `ExportDataButton` but exposes the filters the
 * endpoint accepts (format, date range, status, "assigned to me"). Used from
 * the form editor's toolbar where power users can trim the export before
 * downloading — the card-level icon stays a one-click "give me everything".
 */
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sheet, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTranslations } from "@/lib/context/LocaleContext";

interface Props {
  open:           boolean;
  onOpenChange:   (o: boolean) => void;
  formInstanceId: string;
  slug:           string;
}

export function SubmissionExportDialog({ open, onOpenChange, formInstanceId, slug }: Props) {
  const tr = useTranslations();
  const t  = tr.admin.exportDialog;

  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [from,   setFrom]   = useState("");
  const [to,     setTo]     = useState("");
  const [status, setStatus] = useState("");
  const [assignedToMe, setAssignedToMe] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/submissions/export", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          formInstanceId,
          format,
          ...(from   ? { from }   : {}),
          ...(to     ? { to }     : {}),
          ...(status ? { status } : {}),
          ...(assignedToMe ? { assignedToMe: true } : {}),
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? t.error);
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
      onOpenChange(false);
    } catch {
      toast.error(t.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="max-w-md">
        <DialogHeader>
          <div className="flex items-center justify-between gap-2">
            <DialogTitle className="flex items-center gap-2"><Sheet className="w-4 h-4" /> {t.title}</DialogTitle>
            <button type="button" onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <DialogDescription>{t.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.formatLabel}</Label>
            <div className="inline-flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-muted/30">
              {(["csv", "json"] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFormat(f)}
                  className={`px-3 py-1 text-xs font-medium rounded transition-colors ${format === f ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  aria-pressed={format === f}
                >
                  {f.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.fromLabel}</Label>
              <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.toLabel}</Label>
              <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="text-xs font-medium text-muted-foreground mb-1 block">{t.statusLabel}</Label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
            >
              <option value="">{t.statusAny}</option>
              <option value="pending">pending</option>
              <option value="in_progress">in_progress</option>
              <option value="done">done</option>
              <option value="waiting_user">waiting_user</option>
            </select>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={assignedToMe}
              onChange={e => setAssignedToMe(e.target.checked)}
              className="accent-primary"
            />
            {t.assignedToMe}
          </label>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>{t.cancel}</Button>
          <Button type="button" size="sm" onClick={handleExport} disabled={busy}>
            {busy ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Sheet className="w-3 h-3 mr-1" />}
            {busy ? t.exporting : t.exportButton}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
