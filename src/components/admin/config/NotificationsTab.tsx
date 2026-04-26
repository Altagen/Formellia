"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Eye, EyeOff, Info, Trash2, Loader2 } from "lucide-react";
import type { FormInstance } from "@/types/formInstance";
import { useTranslations } from "@/lib/context/LocaleContext";

interface NotificationsTabProps {
  instance: FormInstance;
  onChange: (patch: Partial<FormInstance>) => void;
}

type Provider = "resend" | "sendgrid" | "mailgun";

const PROVIDER_LABELS: Record<Provider, string> = {
  resend:   "Resend",
  sendgrid: "SendGrid",
  mailgun:  "Mailgun",
};

/** Returns days until expiration (negative = already expired). null if no expiry set. */
function daysUntilExpiry(expiresAt: string | null | undefined): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).setHours(23, 59, 59, 999) - Date.now();
  return Math.ceil(diff / 86_400_000);
}

function ExpiryBadge({ expiresAt, n }: { expiresAt: string | null | undefined; n: ReturnType<typeof useTranslations>["admin"]["config"]["notifications"] }) {
  const days = daysUntilExpiry(expiresAt);
  if (days === null) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
      {n.noExpiry}
    </span>
  );
  if (days < 0) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300">
      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
      {n.expired}
    </span>
  );
  if (days <= 30) return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
      {n.expiresSoon.replace("{days}", String(days))}
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      {n.expiresOn.replace("{date}", new Date(expiresAt!).toLocaleDateString(undefined))}
    </span>
  );
}

type WebhookTestResult = {
  ok: boolean;
  status: number;
  responseBody: string;
  durationMs: number;
};

export function NotificationsTab({ instance, onChange }: NotificationsTabProps) {
  const tr = useTranslations();
  const n = tr.admin.config.notifications;

  const PROVIDER_HELP: Record<Provider, string> = {
    resend:   n.resendHelp,
    sendgrid: n.sendgridHelp,
    mailgun:  n.mailgunHelp,
  };

  const email = instance.config.notifications?.email;

  // Local state mirrors the config (minus the encrypted key)
  const [enabled,     setEnabled]     = useState(email?.enabled     ?? false);
  const [provider,    setProvider]    = useState<Provider>(email?.provider ?? "resend");
  const [fromAddress, setFromAddress] = useState(email?.fromAddress ?? "");
  const [fromName,    setFromName]    = useState(email?.fromName    ?? "");
  const [subject,     setSubject]     = useState(email?.subject     ?? "");
  const [bodyText,    setBodyText]    = useState(email?.bodyText    ?? "");

  // Webhook state
  const [webhookUrl, setWebhookUrl] = useState(instance.config.notifications?.webhookUrl ?? "");
  const [webhookTesting, setWebhookTesting] = useState(false);
  const [webhookTestResult, setWebhookTestResult] = useState<WebhookTestResult | null>(null);

  // Submitter confirmation state
  const sc = instance.config.notifications?.submitterConfirmation;
  const [scEnabled,  setScEnabled]  = useState(sc?.enabled  ?? false);
  const [scSubject,  setScSubject]  = useState(sc?.subject  ?? "");
  const [scBodyText, setScBodyText] = useState(sc?.bodyText ?? "");

  // API key — independent save path, never in main draft
  const [apiKeySet,      setApiKeySet]      = useState(false);
  const [apiKeyExpiresAt, setApiKeyExpiresAt] = useState<string | null>(null);
  const [apiKeyInput,    setApiKeyInput]    = useState("");
  const [noExpiry,       setNoExpiry]       = useState(true);
  const [expiryInput,    setExpiryInput]    = useState("");
  const [showKey,        setShowKey]        = useState(false);
  const [savingKey,      setSavingKey]      = useState(false);
  const [confirmDelete,  setConfirmDelete]  = useState(false);
  const [deletingKey,    setDeletingKey]    = useState(false);

  // Fetch current key status on mount
  useEffect(() => {
    fetch(`/api/admin/forms/${instance.id}/notifications`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data) return;
        setApiKeySet(data.apiKeySet ?? false);
        const exp = data.apiKeyExpiresAt ?? null;
        setApiKeyExpiresAt(exp);
        setNoExpiry(exp === null);
        if (exp) setExpiryInput(exp);
        // Pre-fill structural fields if not yet in draft
        if (!email?.fromAddress && data.fromAddress) setFromAddress(data.fromAddress);
        if (!email?.fromName    && data.fromName)    setFromName(data.fromName);
        if (!email?.subject     && data.subject)     setSubject(data.subject);
        if (!email?.bodyText    && data.bodyText)    setBodyText(data.bodyText);
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [instance.id]);

  function pushToParent(overrides: Partial<{
    enabled: boolean; provider: Provider;
    fromAddress: string; fromName: string; subject: string; bodyText: string;
  }> = {}) {
    const merged = {
      enabled:     overrides.enabled     ?? enabled,
      provider:    overrides.provider    ?? provider,
      fromAddress: overrides.fromAddress ?? fromAddress,
      fromName:    overrides.fromName    ?? fromName,
      subject:     overrides.subject     ?? subject,
      bodyText:    overrides.bodyText    ?? bodyText,
    };
    onChange({
      config: {
        ...instance.config,
        notifications: {
          ...instance.config.notifications,
          email: {
            ...(instance.config.notifications?.email ?? {
              apiKeyEncrypted: "",
              enabled: false,
              provider: "resend" as Provider,
              fromAddress: "",
              subject: "",
              bodyText: "",
            }),
            ...merged,
          },
        },
      },
    });
  }

  function pushScToParent(overrides: Partial<{ enabled: boolean; subject: string; bodyText: string }> = {}) {
    onChange({
      config: {
        ...instance.config,
        notifications: {
          ...instance.config.notifications,
          submitterConfirmation: {
            enabled:  overrides.enabled  ?? scEnabled,
            subject:  overrides.subject  ?? scSubject,
            bodyText: overrides.bodyText ?? scBodyText,
          },
        },
      },
    });
  }

  function handleToggle(checked: boolean) {
    setEnabled(checked);
    pushToParent({ enabled: checked });
  }

  function handleProvider(v: Provider) {
    setProvider(v);
    pushToParent({ provider: v });
  }

  async function handleSaveApiKey() {
    if (!apiKeyInput.trim()) return;
    setSavingKey(true);
    try {
      const expiresAt = noExpiry ? null : (expiryInput || null);
      const res = await fetch(`/api/admin/forms/${instance.id}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: apiKeyInput, apiKeyExpiresAt: expiresAt }),
      });
      if (res.ok) {
        const data = await res.json();
        setApiKeyInput("");
        setApiKeySet(true);
        setApiKeyExpiresAt(data.apiKeyExpiresAt ?? null);
        toast.success(n.apiKeySaved);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? n.saveError);
      }
    } catch {
      toast.error(n.networkError);
    } finally {
      setSavingKey(false);
    }
  }

  async function handleDeleteKey() {
    setDeletingKey(true);
    try {
      const res = await fetch(`/api/admin/forms/${instance.id}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deleteKey: true }),
      });
      if (res.ok) {
        setApiKeySet(false);
        setApiKeyExpiresAt(null);
        setExpiryInput("");
        setNoExpiry(true);
        setConfirmDelete(false);
        toast.success(n.apiKeyDeleted);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error ?? n.deleteError);
      }
    } catch {
      toast.error(n.networkError);
    } finally {
      setDeletingKey(false);
    }
  }

  function pushWebhookUrl(url: string) {
    onChange({
      config: {
        ...instance.config,
        notifications: {
          ...instance.config.notifications,
          webhookUrl: url || undefined,
        },
      },
    });
  }

  async function handleTestWebhook() {
    setWebhookTesting(true);
    setWebhookTestResult(null);
    try {
      const res = await fetch(`/api/admin/forms/${instance.id}/notifications/test-webhook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({ ok: false, status: 0, responseBody: n.invalidResponse, durationMs: 0 }));
      setWebhookTestResult(data);
    } catch (err) {
      setWebhookTestResult({ ok: false, status: 0, responseBody: String(err), durationMs: 0 });
    } finally {
      setWebhookTesting(false);
    }
  }

  const allFields = instance.config.form.steps
    .flatMap(s => s.fields)
    .filter(f => f.type !== "section_header")
    .map(f => f.dbKey ?? f.id);

  const expiredOrSoon = (() => {
    const d = daysUntilExpiry(apiKeyExpiresAt);
    return d !== null && d <= 30;
  })();

  return (
    <div className="space-y-6">

      {/* Toggle + structural config */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">{n.emailTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">
              {n.emailDesc}
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            aria-label={n.enableEmailLabel}
          />
        </div>

        {enabled && (
          <div className="border-t border-border pt-6 mt-4 space-y-5">
            {/* Provider */}
            <div>
              <Label className="text-xs text-muted-foreground mb-1.5">{n.provider}</Label>
              <div className="flex gap-2 mt-1.5">
                {(Object.keys(PROVIDER_LABELS) as Provider[]).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => handleProvider(p)}
                    className={`px-3 py-1.5 text-sm rounded-md border transition-colors cursor-pointer ${
                      provider === p
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background text-foreground border-input hover:border-primary/50"
                    }`}
                  >
                    {PROVIDER_LABELS[p]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">{PROVIDER_HELP[provider]}</p>
            </div>

            {/* From */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="from-address" className="text-xs text-muted-foreground mb-1.5">
                  {n.fromEmail} <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="from-address"
                  type="email"
                  value={fromAddress}
                  onChange={e => { setFromAddress(e.target.value); pushToParent({ fromAddress: e.target.value }); }}
                  placeholder={n.fromPlaceholder}
                />
              </div>
              <div>
                <Label htmlFor="from-name" className="text-xs text-muted-foreground mb-1.5">
                  {n.fromName}
                </Label>
                <Input
                  id="from-name"
                  type="text"
                  value={fromName}
                  onChange={e => { setFromName(e.target.value); pushToParent({ fromName: e.target.value }); }}
                  placeholder={n.fromNamePlaceholder}
                />
              </div>
            </div>

            {/* Subject */}
            <div>
              <Label htmlFor="email-subject" className="text-xs text-muted-foreground mb-1.5">
                {n.subject} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email-subject"
                type="text"
                value={subject}
                onChange={e => { setSubject(e.target.value); pushToParent({ subject: e.target.value }); }}
                placeholder={n.subjectPlaceholder}
              />
            </div>

            {/* Body */}
            <div>
              <Label htmlFor="email-body" className="text-xs text-muted-foreground mb-1.5">
                {n.body} <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="email-body"
                rows={7}
                value={bodyText}
                onChange={e => { setBodyText(e.target.value); pushToParent({ bodyText: e.target.value }); }}
                placeholder={n.bodyPlaceholder}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50 resize-y"
              />
            </div>

            {/* Variables */}
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                <p className="font-medium">{n.availableVars}</p>
                <p>
                  <code className="font-mono">{"{{email}}"}</code>{" "}
                  <code className="font-mono">{"{{formName}}"}</code>{" "}
                  <code className="font-mono">{"{{submittedAt}}"}</code>
                  {allFields.length > 0 && (
                    <> + {allFields.map(f => (
                      <code key={f} className="font-mono mr-1">{`{{${f}}}`}</code>
                    ))}</>
                  )}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Webhook card */}
      <div className="bg-card rounded-xl border p-6 space-y-4">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{n.webhookTitle}</h2>
          <p className="text-xs text-muted-foreground mt-1">
            {n.webhookDesc}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="webhook-url" className="text-xs text-muted-foreground">
            {n.webhookUrlLabel}
          </Label>
          <div className="flex gap-2">
            <Input
              id="webhook-url"
              type="url"
              value={webhookUrl}
              onChange={e => {
                const v = e.target.value;
                setWebhookUrl(v);
                setWebhookTestResult(null);
                pushWebhookUrl(v);
              }}
              placeholder={n.webhookPlaceholder}
              className="text-sm font-mono"
            />
            {webhookUrl && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleTestWebhook}
                disabled={webhookTesting}
              >
                {webhookTesting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  n.test
                )}
              </Button>
            )}
          </div>
          {webhookTestResult && (
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
              webhookTestResult.ok
                ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300"
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${webhookTestResult.ok ? "bg-green-500" : "bg-red-500"}`} />
              {webhookTestResult.ok
                ? `✓ HTTP ${webhookTestResult.status} — ${webhookTestResult.durationMs}ms`
                : `✗ HTTP ${webhookTestResult.status} — ${webhookTestResult.responseBody} (${webhookTestResult.durationMs}ms)`}
            </div>
          )}
        </div>
      </div>

      {/* Submitter confirmation card */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">{n.scTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{n.scDesc}</p>
          </div>
          <Switch
            checked={scEnabled}
            onCheckedChange={v => { setScEnabled(v); pushScToParent({ enabled: v }); }}
            aria-label={n.scTitle}
          />
        </div>

        {scEnabled && (
          <div className="border-t border-border pt-6 mt-4 space-y-4">
            {!enabled && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
                <Info className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-300">{n.scRequiresEmail}</p>
              </div>
            )}
            <div>
              <Label htmlFor="sc-subject" className="text-xs text-muted-foreground mb-1.5">
                {n.subject} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="sc-subject"
                type="text"
                value={scSubject}
                onChange={e => { setScSubject(e.target.value); pushScToParent({ subject: e.target.value }); }}
                placeholder={n.scSubjectPlaceholder}
              />
            </div>
            <div>
              <Label htmlFor="sc-body" className="text-xs text-muted-foreground mb-1.5">
                {n.body} <span className="text-destructive">*</span>
              </Label>
              <textarea
                id="sc-body"
                rows={6}
                value={scBodyText}
                onChange={e => { setScBodyText(e.target.value); pushScToParent({ bodyText: e.target.value }); }}
                placeholder={n.scBodyPlaceholder}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50 resize-y"
              />
            </div>
            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{n.scVarsHint}</p>
            </div>
          </div>
        )}
      </div>

      {/* API Key card */}
      {enabled && (
        <div className="bg-card rounded-xl border p-6 space-y-5">

          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-foreground">{n.apiKeyTitle}</h2>
              <p className="text-xs text-muted-foreground mt-1">
                {n.apiKeyDesc}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {/* Key status badge */}
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
                apiKeySet
                  ? "bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300"
                  : "bg-amber-100 dark:bg-amber-900 text-amber-700 dark:text-amber-300"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${apiKeySet ? "bg-green-500" : "bg-amber-500"}`} />
                {apiKeySet ? n.keyConfigured : n.noKey}
              </span>
              {/* Expiry badge */}
              {apiKeySet && <ExpiryBadge expiresAt={apiKeyExpiresAt} n={n} />}
            </div>
          </div>

          {/* Expiry warning */}
          {apiKeySet && expiredOrSoon && (
            <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <svg className="w-4 h-4 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
              </svg>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                {daysUntilExpiry(apiKeyExpiresAt)! < 0
                  ? n.expiredWarning
                  : n.expiringSoonWarning}
              </p>
            </div>
          )}

          {/* New key input */}
          <div className="space-y-3">
            <Label className="text-xs text-muted-foreground">
              {apiKeySet ? n.replaceKey : n.addKey}
            </Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type={showKey ? "text" : "password"}
                  value={apiKeyInput}
                  onChange={e => setApiKeyInput(e.target.value)}
                  placeholder={apiKeySet ? n.newKeyPlaceholder : n.addKeyPlaceholder}
                  className="pr-10"
                  autoComplete="off"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(v => !v)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  tabIndex={-1}
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <Button
                type="button"
                onClick={handleSaveApiKey}
                disabled={!apiKeyInput.trim() || savingKey}
                size="sm"
              >
                {savingKey ? "…" : n.save}
              </Button>
            </div>

            {/* Expiry date picker */}
            <div className="flex items-center gap-3 flex-wrap">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={noExpiry}
                  onChange={e => {
                    setNoExpiry(e.target.checked);
                    if (e.target.checked) setExpiryInput("");
                  }}
                  className="rounded border-input cursor-pointer"
                />
                {n.noExpireToggle}
              </label>
              {!noExpiry && (
                <div className="flex items-center gap-2">
                  <Label htmlFor="key-expiry" className="text-xs text-muted-foreground whitespace-nowrap">
                    {n.expiresAt}
                  </Label>
                  <Input
                    id="key-expiry"
                    type="date"
                    value={expiryInput}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={e => setExpiryInput(e.target.value)}
                    className="h-8 w-40 text-sm"
                  />
                </div>
              )}
            </div>
          </div>

          {/* Delete key */}
          {apiKeySet && (
            <div className="border-t border-border pt-4">
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-xs text-destructive hover:text-destructive/80 cursor-pointer transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {n.deleteKey}
                </button>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="text-xs text-destructive font-medium">{n.deleteKeyConfirm}</span>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="text-xs px-2 py-1 rounded border border-border hover:bg-muted cursor-pointer transition-colors"
                  >
                    {n.cancel}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteKey}
                    disabled={deletingKey}
                    className="text-xs px-2 py-1 rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer disabled:opacity-50 transition-colors"
                  >
                    {deletingKey ? "…" : n.delete}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
