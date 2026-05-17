"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Save, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { BroadcastEmailConfig } from "@/lib/email/broadcastConfig";

interface Props { initial: BroadcastEmailConfig }

export function BroadcastProviderClient({ initial }: Props) {
  const trEmail = useTranslations().admin.email;
  const t = trEmail.provider;
  const [provider,    setProvider]    = useState<string>(initial.provider ?? "");
  const [fromAddress, setFromAddress] = useState<string>(initial.fromAddress ?? "");
  const [fromName,    setFromName]    = useState<string>(initial.fromName    ?? "");
  // Plaintext is never round-tripped — only set when the operator types a new
  // value. `apiKeyConfigured` reflects "is a key currently stored?".
  const [apiKey,      setApiKey]      = useState<string>("");
  const [apiKeyExp,   setApiKeyExp]   = useState<string>(initial.apiKeyExpiresAt ?? "");
  const [apiKeyConfigured, setApiKeyConfigured] = useState(initial.apiKeyConfigured);
  const [saving, setSaving] = useState(false);
  const [confirmClearKey, setConfirmClearKey] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        provider:     provider || null,
        fromAddress:  fromAddress.trim() || null,
        fromName:     fromName.trim()    || null,
      };
      // Only ship apiKey when the operator typed something — leaving the field
      // empty means "don't touch the stored key".
      if (apiKey.trim() !== "") body.apiKey = apiKey.trim();
      if (apiKeyExp.trim() !== initial.apiKeyExpiresAt) body.apiKeyExpiresAt = apiKeyExp.trim() || null;

      const res = await fetch("/api/admin/email/provider", {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = (await res.json()) as BroadcastEmailConfig;
      setApiKey("");                                  // clear the plaintext field after save
      setApiKeyConfigured(updated.apiKeyConfigured);
      toast.success(t.savedToast);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.saveFailedToast);
    } finally {
      setSaving(false);
    }
  }

  async function performClearKey() {
    const res = await fetch("/api/admin/email/provider", {
      method:  "PUT",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ apiKey: "" }),
    });
    if (!res.ok) { toast.error(t.clearFailedToast); return; }
    setApiKeyConfigured(false);
    toast.success(t.clearedToast);
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <Link href="/admin/email/broadcasts" className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1">
          <ChevronLeft className="w-3 h-3" /> {t.backLink}
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-2">{t.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
      </div>

      <div className="bg-card border border-border rounded-md p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t.providerLabel}</label>
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            className="w-full h-10 px-3 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-[3px] focus:ring-ring/50"
          >
            <option value="">{t.providerNone}</option>
            <option value="resend">Resend</option>
            <option value="sendgrid">SendGrid</option>
            <option value="mailgun">Mailgun</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t.fromAddressLabel}</label>
            <Input value={fromAddress} onChange={e => setFromAddress(e.target.value)} placeholder={t.fromAddressPlaceholder} />
          </div>
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">{t.fromNameLabel}</label>
            <Input value={fromName} onChange={e => setFromName(e.target.value)} placeholder={t.fromNamePlaceholder} />
          </div>
        </div>

        <div>
          <label className="flex items-center justify-between text-xs font-medium text-muted-foreground mb-1">
            <span>{t.apiKeyLabel}</span>
            {apiKeyConfigured && (
              <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-300">
                <KeyRound className="w-3 h-3" /> {t.apiKeyConfigured}
              </span>
            )}
          </label>
          <Input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder={apiKeyConfigured ? t.apiKeyPlaceholderConfigured : t.apiKeyPlaceholderUnconfigured}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground mt-1">{t.apiKeyHint}</p>
          {apiKeyConfigured && (
            <button type="button" onClick={() => setConfirmClearKey(true)}
                    className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1">
              {t.clearKeyLink}
            </button>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">{t.expiryLabel}</label>
          <Input type="date" value={apiKeyExp} onChange={e => setApiKeyExp(e.target.value)} />
          <p className="text-xs text-muted-foreground mt-1">{t.expiryHint}</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={save} disabled={saving}>
          <Save className="w-4 h-4 mr-1" /> {saving ? t.savingButton : t.saveButton}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmClearKey}
        title={t.clearKeyLink}
        description={t.clearKeyConfirm}
        confirmLabel={t.clearKeyLink}
        cancelLabel={trEmail.composer.confirmCancel}
        destructive
        onOpenChange={setConfirmClearKey}
        onConfirm={() => { void performClearKey(); }}
      />
    </div>
  );
}
