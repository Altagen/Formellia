"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Download, Upload, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "@/lib/context/LocaleContext";
import { BackupProvidersSection } from "./BackupProvidersSection";

type RestoreMode    = "append" | "replace";
type RestoreSection = "forms" | "scheduledJobs" | "datasets" | "admin" | "app";

const ALL_SECTIONS: RestoreSection[] = ["forms", "scheduledJobs", "datasets", "admin", "app"];

export function BackupTab() {
  const tr = useTranslations();
  const b  = tr.admin.config.backup;

  const [downloading, setDownloading]     = useState(false);
  const [showRestore, setShowRestore]     = useState(false);
  const [restoreText, setRestoreText]     = useState("");
  const [restoreMode, setRestoreMode]     = useState<RestoreMode>("replace");
  const [sections, setSections]           = useState<RestoreSection[]>([...ALL_SECTIONS]);
  const [applying, setApplying]           = useState(false);

  function toggleSection(s: RestoreSection) {
    setSections(prev =>
      prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
    );
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/config/backup");
      if (!res.ok) { toast.error(b.networkError); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `backup-${new Date().toISOString().slice(0, 10)}.yaml`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error(b.networkError);
    } finally {
      setDownloading(false);
    }
  }

  async function handleRestore() {
    if (!restoreText.trim()) return;
    setApplying(true);
    try {
      const url = sections.length < ALL_SECTIONS.length
        ? `/api/admin/config/backup?mode=${restoreMode}&sections=${sections.join(",")}`
        : `/api/admin/config/backup?mode=${restoreMode}`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/yaml" },
        body: restoreText,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error ?? b.networkError);
        return;
      }
      toast.success(b.restoreSuccess);
      setShowRestore(false);
      setRestoreText("");
    } catch {
      toast.error(b.networkError);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{b.title}</h2>
        <p className="text-xs text-muted-foreground mb-4">{b.description}</p>

        <div className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={downloading}
            onClick={handleDownload}
          >
            <Download className="w-3.5 h-3.5 mr-1.5" />
            {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b.exportBtn}
          </Button>
          <p className="text-xs text-muted-foreground self-center">{b.exportHint}</p>
        </div>
      </div>

      {/* ── Provider-based backup ───────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5">
        <BackupProvidersSection />
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-foreground">{b.restoreTitle}</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRestore(v => !v)}
          >
            {showRestore ? <X className="w-3.5 h-3.5 mr-1.5" /> : <Upload className="w-3.5 h-3.5 mr-1.5" />}
            {b.restoreBtn}
          </Button>
        </div>

        {showRestore && (
          <div className="space-y-4">
            {/* Mode */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{b.restoreModeLabel}</p>
              <div className="flex gap-4">
                {(["append", "replace"] as RestoreMode[]).map(m => (
                  <label key={m} className="flex items-center gap-1.5 text-sm cursor-pointer">
                    <input
                      type="radio"
                      name="restoreMode"
                      value={m}
                      checked={restoreMode === m}
                      onChange={() => setRestoreMode(m)}
                      className="accent-primary"
                    />
                    {m === "append" ? b.restoreModeAppend : b.restoreModeReplace}
                  </label>
                ))}
              </div>
            </div>

            {/* Sections */}
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-2">{b.restoreSectionsLabel}</p>
              <div className="flex flex-wrap gap-2">
                {ALL_SECTIONS.map(s => (
                  <label key={s} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sections.includes(s)}
                      onChange={() => toggleSection(s)}
                      className="accent-primary"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {/* YAML input */}
            <textarea
              value={restoreText}
              onChange={e => setRestoreText(e.target.value)}
              rows={12}
              spellCheck={false}
              placeholder="version: 2\nexportedAt: …"
              className="w-full font-mono text-xs border border-input rounded-lg px-3 py-2.5 bg-muted/30 focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => { setShowRestore(false); setRestoreText(""); }}>
                {tr.admin.config.forms.cancel}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!restoreText.trim() || applying || sections.length === 0}
                onClick={handleRestore}
              >
                {applying ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b.restoreApply}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
