"use client";

/**
 * Configuration → Emails tab.
 *
 * Hosts the global email provider config (provider, fromAddress, fromName,
 * API key, expiry) inside the unified Configuration UI. The same component
 * is used at `/admin/email/provider` — we just toggle `embedded` so the
 * page-level breadcrumb is hidden when rendered inside the ConfigEditor
 * tab strip.
 *
 * The form's transactional notifications and the broadcast composer both
 * fall back to this config when they don't have a per-form override, so
 * "configure once here" is enough for the simple case.
 */
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { BroadcastProviderClient } from "@/app/admin/(dashboard)/email/provider/BroadcastProviderClient";
import type { BroadcastEmailConfig } from "@/lib/email/globalEmailConfig";
import { useTranslations } from "@/lib/context/LocaleContext";

export function EmailsTab() {
  const tr = useTranslations();
  const [config, setConfig] = useState<BroadcastEmailConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/admin/email/provider")
      .then(r => r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`)))
      .then((data: BroadcastEmailConfig) => setConfig(data))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "fetch failed"));
  }, []);

  if (error) {
    return <p className="text-sm text-destructive">{error}</p>;
  }
  if (!config) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-8">
        <Loader2 className="w-4 h-4 animate-spin" />
        {tr.admin.email.provider.savingButton}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{tr.admin.email.provider.title}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {tr.admin.email.provider.description}
        </p>
      </div>
      <BroadcastProviderClient initial={config} embedded />
    </div>
  );
}
