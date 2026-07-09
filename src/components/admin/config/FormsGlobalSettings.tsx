"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PrioritySettingsForm } from "@/components/dashboard/PrioritySettingsForm";
import { DEFAULT_THRESHOLDS, type PriorityThresholds } from "@/lib/utils/priority";
import { useTranslations } from "@/lib/context/LocaleContext";

interface FeaturesState {
  defaultFormVersioning: boolean;
  defaultBlockDisposableEmails: boolean;
}

/**
 * Instance-wide forms settings rendered at the top of Configuration > Forms.
 *
 * Two sections:
 *   1. Priority thresholds — red/orange/yellow age indicators (appSettings).
 *   2. Global features — defaults that pre-apply to every new form
 *      (versioning, disposable-email block). Admin-password policy lives in
 *      Administration > Security, not here.
 */
export function FormsGlobalSettings() {
  const tr = useTranslations();
  const fg = tr.admin.config.formsGlobal;
  const [thresholds, setThresholds] = useState<PriorityThresholds | null>(null);
  const [features, setFeatures] = useState<FeaturesState | null>(null);
  const [saving, setSaving] = useState<keyof FeaturesState | null>(null);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setThresholds(data ?? DEFAULT_THRESHOLDS))
      .catch(() => setThresholds(DEFAULT_THRESHOLDS));

    fetch("/api/admin/config")
      .then((r) => (r.ok ? r.json() : {}))
      .then((cfg: Record<string, unknown>) => {
        const inner = (cfg.config as { admin?: { defaultFormFeatures?: { formVersioning?: boolean; blockDisposableEmails?: boolean } } }) ?? {};
        const defaults = inner.admin?.defaultFormFeatures ?? {};
        setFeatures({
          defaultFormVersioning: !!defaults.formVersioning,
          defaultBlockDisposableEmails: !!defaults.blockDisposableEmails,
        });
      })
      .catch(() => {
        setFeatures({
          defaultFormVersioning: false,
          defaultBlockDisposableEmails: false,
        });
      });
  }, []);

  async function toggle(key: keyof FeaturesState) {
    if (!features) return;
    const next = { ...features, [key]: !features[key] };
    setFeatures(next);
    setSaving(key);
    try {
      const cfgRes = await fetch("/api/admin/config");
      if (!cfgRes.ok) throw new Error("load-failed");
      const cfg = (await cfgRes.json()).config;
      const patched = {
        ...cfg,
        admin: {
          ...cfg.admin,
          defaultFormFeatures: {
            ...(cfg.admin.defaultFormFeatures ?? {}),
            ...(key === "defaultFormVersioning"
              ? { formVersioning: next.defaultFormVersioning }
              : { blockDisposableEmails: next.defaultBlockDisposableEmails }),
          },
        },
      };
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patched),
      });
      if (!res.ok) throw new Error("save-failed");
    } catch {
      // Rollback on failure
      setFeatures(features);
      toast.error(fg.saveError);
    } finally {
      setSaving(null);
    }
  }

  return (
    <>
      {/* Features globales — primary (opinionated defaults for new forms) */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{fg.featuresTitle}</h2>
        <p className="text-xs text-muted-foreground mb-4">{fg.featuresDesc}</p>
        {!features ? (
          <p className="text-xs text-muted-foreground">{fg.loading}</p>
        ) : (
          <div className="space-y-3">
            <FeatureRow
              label={fg.defaultFormVersioning}
              hint={fg.defaultFormVersioningHint}
              checked={features.defaultFormVersioning}
              onChange={() => void toggle("defaultFormVersioning")}
              saving={saving === "defaultFormVersioning"}
            />
            <FeatureRow
              label={fg.defaultBlockDisposableEmails}
              hint={fg.defaultBlockDisposableEmailsHint}
              checked={features.defaultBlockDisposableEmails}
              onChange={() => void toggle("defaultBlockDisposableEmails")}
              saving={saving === "defaultBlockDisposableEmails"}
            />
          </div>
        )}
      </div>

      {/* Priority thresholds — secondary (fine-tuning) */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-1">{fg.priorityTitle}</h2>
        <p className="text-xs text-muted-foreground mb-4">{fg.priorityDesc}</p>
        {thresholds ? (
          <PrioritySettingsForm initial={thresholds} />
        ) : (
          <p className="text-xs text-muted-foreground">{fg.loading}</p>
        )}
      </div>
    </>
  );
}

function FeatureRow({
  label,
  hint,
  checked,
  onChange,
  saving,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
  saving: boolean;
}) {
  return (
    <label className="flex items-start gap-3 rounded-lg border border-border/60 p-3 cursor-pointer hover:bg-muted/30 transition-colors">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 rounded border-input"
        checked={checked}
        onChange={onChange}
        disabled={saving}
      />
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{hint}</span>
      </span>
    </label>
  );
}
