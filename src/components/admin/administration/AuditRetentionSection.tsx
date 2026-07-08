"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, ScrollText, Trash2 } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { AuditRetentionPolicy } from "@/types/config";

const PRESETS: Array<{ policy: "keep_all" | "days"; days?: number }> = [
  { policy: "keep_all" },
  { policy: "days", days: 30 },
  { policy: "days", days: 90 },
  { policy: "days", days: 180 },
  { policy: "days", days: 365 },
];

function labelFor(policy: AuditRetentionPolicy, tr: ReturnType<typeof useTranslations>): string {
  const ar = tr.admin.auditRetention;
  if (policy.policy === "keep_all") return ar.presetKeepAll;
  return ar.presetDays.replace("{n}", String(policy.days ?? 0));
}

export function AuditRetentionSection() {
  const tr = useTranslations();
  const ar = tr.admin.auditRetention;

  const [current, setCurrent] = useState<AuditRetentionPolicy>({ policy: "keep_all" });
  const [saving, setSaving] = useState(false);
  const [purging, setPurging] = useState(false);
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false);
  const [purgeDays, setPurgeDays] = useState(365);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/config", { credentials: "same-origin" })
      .then(r => r.ok ? r.json() : null)
      .then((data: { config?: { admin?: { auditRetention?: AuditRetentionPolicy } } } | null) => {
        const p = data?.config?.admin?.auditRetention;
        if (p) setCurrent(p);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function savePolicy(next: AuditRetentionPolicy) {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/config", { credentials: "same-origin" });
      if (!res.ok) throw new Error("config-fetch");
      const { config } = await res.json();
      const nextConfig = { ...config, admin: { ...config.admin, auditRetention: next } };
      const put = await fetch("/api/admin/config", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body:    JSON.stringify(nextConfig),
      });
      if (!put.ok) {
        const data = await put.json().catch(() => ({}));
        toast.error(data.error ?? ar.saveError);
        return;
      }
      setCurrent(next);
      toast.success(ar.saveSuccess);
    } catch {
      toast.error(ar.saveError);
    } finally {
      setSaving(false);
    }
  }

  async function runPurge() {
    setPurging(true);
    try {
      const res = await fetch("/api/admin/audit/purge", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body:    JSON.stringify({ olderThanDays: purgeDays }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? ar.purgeError);
        return;
      }
      const data = await res.json();
      toast.success(ar.purgeSuccess.replace("{n}", String(data.deleted ?? 0)));
    } catch {
      toast.error(ar.purgeError);
    } finally {
      setPurging(false);
      setConfirmPurgeOpen(false);
    }
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5 space-y-4">
      <header className="flex items-start gap-3">
        <span className="w-10 h-10 rounded-lg bg-purple-100 text-purple-700 dark:bg-purple-950/50 dark:text-purple-300 inline-flex items-center justify-center shrink-0">
          <ScrollText className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-foreground">{ar.title}</h2>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{ar.description}</p>
        </div>
      </header>

      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{ar.policyLabel}</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p, i) => {
            const isCurrent = p.policy === current.policy && (p.policy === "keep_all" || p.days === current.days);
            return (
              <button
                key={i}
                type="button"
                disabled={saving || loading}
                onClick={() => savePolicy(p)}
                className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                  isCurrent
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-foreground hover:bg-muted"
                } disabled:opacity-50`}
              >
                {labelFor(p, tr)}
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-muted-foreground">{ar.policyHint}</p>
      </div>

      <div className="pt-3 border-t border-border/50 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{ar.manualPurgeLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{ar.manualPurgePrefix}</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={purgeDays}
            onChange={(e) => setPurgeDays(Math.max(1, Math.min(3650, parseInt(e.target.value, 10) || 1)))}
            className="w-20 h-8 px-2 text-xs rounded border border-input bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
          <span className="text-xs text-muted-foreground">{ar.manualPurgeSuffix}</span>
          <button
            type="button"
            disabled={purging}
            onClick={() => setConfirmPurgeOpen(true)}
            className="ml-auto inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10 disabled:opacity-50 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {purging ? ar.purging : ar.manualPurgeAction}
          </button>
        </div>
      </div>

      <div className="pt-3 border-t border-border/50 space-y-2">
        <p className="text-xs font-medium text-muted-foreground">{ar.exportLabel}</p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">{ar.exportPrefix}</span>
          {(["csv", "json", "yaml"] as const).map((fmt) => (
            <a
              key={fmt}
              href={`/api/admin/audit/export?format=${fmt}`}
              download
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {fmt.toUpperCase()}
            </a>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmPurgeOpen}
        onOpenChange={setConfirmPurgeOpen}
        title={ar.purgeConfirmTitle}
        description={ar.purgeConfirmDesc.replace("{n}", String(purgeDays))}
        confirmLabel={ar.purgeConfirm}
        cancelLabel={ar.purgeCancel}
        destructive
        onConfirm={runPurge}
      />

      <div className="flex items-start gap-2 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md p-2">
        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <p>{ar.compliance}</p>
      </div>
    </section>
  );
}
