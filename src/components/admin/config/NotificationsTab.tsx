"use client";

/**
 * Notifications tab — post UI-11 design.
 *
 * The tab is organised into three cards mirroring the mock layout:
 *   1. Email — enabled toggle, provider preset, subject, body, "send test".
 *   2. Webhook — URL + test button.
 *   3. Legacy-stripped banner (top of the page when a form's own credentials
 *      were removed by the boot migration).
 *
 * Credentials are never per-form now: everything routes through the shared
 * `email_providers` table via `providerId`. When no explicit reference is
 * set the resolver falls back to the default preset. The tab surfaces the
 * effective preset so operators can see at a glance which identity will
 * carry the send.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Loader2, ExternalLink, Mail, Webhook, AlertTriangle, Info, Send } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FormInstance } from "@/types/formInstance";
import { useTranslations } from "@/lib/context/LocaleContext";

interface NotificationsTabProps {
  instance: FormInstance;
  onChange: (patch: Partial<FormInstance>) => void;
}

interface ProviderOption {
  id:               string;
  name:             string;
  provider:         "resend" | "sendgrid" | "mailgun";
  fromAddress:      string;
  fromName:         string | null;
  apiKeyConfigured: boolean;
  isDefault:        boolean;
}

type WebhookTestResult = {
  ok: boolean;
  status: number;
  responseBody: string;
  durationMs: number;
};

export function NotificationsTab({ instance, onChange }: NotificationsTabProps) {
  const tr = useTranslations();
  const n  = tr.admin.config.notifications;

  const email = instance.config.notifications?.email;
  const legacyStripped = (instance.config.meta as unknown as Record<string, unknown> | undefined)?._notificationLegacyStripped === true;

  const [enabled,    setEnabled]    = useState(email?.enabled    ?? false);
  const [providerId, setProviderId] = useState<string | null>(email?.providerId ?? null);
  const [subject,    setSubject]    = useState(email?.subject    ?? "");
  const [bodyText,   setBodyText]   = useState(email?.bodyText   ?? "");

  const [webhookUrl, setWebhookUrl] = useState(instance.config.notifications?.webhookUrl ?? "");
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);

  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loadingProviders, setLoadingProviders] = useState(true);

  useEffect(() => {
    fetch("/api/admin/email/providers")
      .then(r => r.ok ? r.json() : [])
      .then((rows: ProviderOption[]) => setProviders(Array.isArray(rows) ? rows : []))
      .catch(() => setProviders([]))
      .finally(() => setLoadingProviders(false));
  }, []);

  function pushEmailToParent(next: {
    enabled: boolean;
    providerId: string | null;
    subject: string;
    bodyText: string;
  }) {
    onChange({
      config: {
        ...instance.config,
        notifications: {
          ...instance.config.notifications,
          email: {
            enabled:    next.enabled,
            providerId: next.providerId ?? undefined,
            subject:    next.subject,
            bodyText:   next.bodyText,
          },
        },
      },
    });
  }

  function pushWebhookToParent(next: string) {
    onChange({
      config: {
        ...instance.config,
        notifications: {
          ...instance.config.notifications,
          webhookUrl: next,
        },
      },
    });
  }

  async function testWebhook() {
    if (!webhookUrl.trim()) return;
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch(`/api/admin/forms/${instance.id}/webhook-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ webhookUrl }),
      });
      const data = await res.json();
      setWebhookTestResult(data);
      if (data.ok) toast.success(n.webhookTestOk);
      else toast.error(n.webhookTestFailed);
    } catch {
      toast.error(n.webhookTestFailed);
    } finally {
      setWebhookTesting(false);
    }
  }

  const defaultProvider = providers.find(p => p.isDefault) ?? null;
  const activeProvider  = providerId ? providers.find(p => p.id === providerId) ?? null : defaultProvider;
  const noProviders     = !loadingProviders && providers.length === 0;

  return (
    <div className="space-y-4">
      {/* ── Legacy stripped banner ─────────────────────────────── */}
      {legacyStripped && (
        <div className="rounded-lg border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex gap-3">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{n.legacyStrippedTitle}</p>
            <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">{n.legacyStrippedBody}</p>
          </div>
        </div>
      )}

      {/* ── Header info banner ─────────────────────────────────── */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 flex gap-3">
        <Info className="w-4 h-4 shrink-0 mt-0.5 text-muted-foreground" />
        <div className="text-xs text-muted-foreground">
          {n.headerInfo}{" "}
          <Link href="/admin/configuration?tab=emails" className="text-primary hover:underline inline-flex items-center gap-0.5">
            {n.headerInfoLink} <ExternalLink className="w-3 h-3" />
          </Link>
        </div>
      </div>

      {/* ── Email notification card ────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <Mail className="w-5 h-5 text-primary shrink-0 mt-0.5" />
            <div>
              <h2 className="text-sm font-semibold text-foreground">{n.emailTitle}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">{n.emailDesc}</p>
            </div>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={(v) => { setEnabled(v); pushEmailToParent({ enabled: v, providerId, subject, bodyText }); }}
          />
        </div>

        {enabled && (
          <div className="space-y-4 pl-8">
            {/* Provider preset picker */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{n.providerLabel}</Label>
              {loadingProviders ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> {n.providerLoading}
                </div>
              ) : noProviders ? (
                <div className="rounded-md border border-dashed border-border px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                  {n.providerNoneUI11}{" "}
                  <Link href="/admin/configuration?tab=emails" className="underline inline-flex items-center gap-0.5">
                    {n.providerCreateLink} <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>
              ) : (
                <>
                  <select
                    value={providerId ?? ""}
                    onChange={e => {
                      const v = e.target.value || null;
                      setProviderId(v);
                      pushEmailToParent({ enabled, providerId: v, subject, bodyText });
                    }}
                    className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
                  >
                    <option value="">
                      {defaultProvider ? n.providerUseDefault.replace("{name}", defaultProvider.name) : n.providerUseDefaultNone}
                    </option>
                    {providers.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.provider}{p.isDefault ? ` (${n.providerDefaultMarker})` : ""}
                      </option>
                    ))}
                  </select>
                  {activeProvider && activeProvider.apiKeyConfigured && (
                    <p className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 flex items-center gap-1">
                      <Send className="w-3 h-3" />
                      {n.providerActive.replace("{name}", activeProvider.name).replace("{provider}", activeProvider.provider)}
                    </p>
                  )}
                  {activeProvider && !activeProvider.apiKeyConfigured && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {n.providerNoKey}
                    </p>
                  )}
                </>
              )}
            </div>

            {/* Subject */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{n.subject}</Label>
              <Input
                value={subject}
                onChange={e => { setSubject(e.target.value); pushEmailToParent({ enabled, providerId, subject: e.target.value, bodyText }); }}
                placeholder={n.subjectPlaceholder}
              />
            </div>

            {/* Body */}
            <div>
              <Label className="text-xs font-medium text-muted-foreground mb-1 block">{n.body}</Label>
              <textarea
                value={bodyText}
                onChange={e => { setBodyText(e.target.value); pushEmailToParent({ enabled, providerId, subject, bodyText: e.target.value }); }}
                rows={8}
                className="w-full font-mono text-xs border border-input rounded-md px-3 py-2 bg-background focus:outline-none focus:ring-[3px] focus:ring-ring/50 resize-y"
                placeholder={n.bodyPlaceholder}
              />
              <p className="text-[11px] text-muted-foreground mt-1">{n.templateVarsHint}</p>
            </div>
          </div>
        )}
      </div>

      {/* ── Webhook card ───────────────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <Webhook className="w-5 h-5 text-primary shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">{n.webhookTitle}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{n.webhookDesc}</p>
          </div>
        </div>

        <div className="pl-8">
          <Label className="text-xs font-medium text-muted-foreground mb-1 block">{n.webhookUrlLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              value={webhookUrl}
              onChange={e => { setWebhookUrl(e.target.value); pushWebhookToParent(e.target.value); }}
              placeholder="https://hooks.example.com/my-webhook"
              className="flex-1 font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" disabled={!webhookUrl.trim() || webhookTesting} onClick={testWebhook}>
              {webhookTesting ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : null}
              {n.test}
            </Button>
          </div>
          {webhookTestResult && (
            <p className={`text-[11px] mt-1 ${webhookTestResult.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {webhookTestResult.ok
                ? n.webhookTestOkDetail.replace("{status}", String(webhookTestResult.status)).replace("{ms}", String(webhookTestResult.durationMs))
                : n.webhookTestFailedDetail.replace("{status}", String(webhookTestResult.status)).replace("{ms}", String(webhookTestResult.durationMs))}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
