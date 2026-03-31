"use client";

import type { FormInstance, FormFeatures, FormNotifications } from "@/types/formInstance";
import { Input } from "@/components/ui/input";
import { useTranslations } from "@/lib/context/LocaleContext";

interface FormFeaturesTabProps {
  instance: FormInstance;
  onChange: (updated: Partial<FormInstance>) => void;
}

export function FormFeaturesTab({ instance, onChange }: FormFeaturesTabProps) {
  const tr = useTranslations();
  const f = tr.admin.config.features;
  const { config } = instance;
  const { features } = config;
  const notifications = config.notifications ?? {};

  function setFeature(key: keyof FormFeatures, value: boolean) {
    onChange({ config: { ...config, features: { ...features, [key]: value } } });
  }

  function setNotification(patch: Partial<FormNotifications>) {
    onChange({ config: { ...config, notifications: { ...notifications, ...patch } } });
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{f.infoTitle}</h3>
        <p className="text-xs text-muted-foreground">{f.infoDesc}</p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">{f.formName}</label>
        <Input
          value={instance.name}
          onChange={e => onChange({ name: e.target.value })}
          placeholder={f.formNamePlaceholder}
          className="text-sm max-w-sm"
        />
      </div>

      {/* Slug (read-only for root) */}
      <div>
        <label className="block text-xs text-muted-foreground mb-1.5">
          {f.slug}
          {instance.slug === "/" && (
            <span className="ml-2 text-xs text-amber-600 dark:text-amber-400 font-normal">
              {f.rootCannotMove}
            </span>
          )}
        </label>
        <Input
          value={instance.slug}
          readOnly
          disabled
          className="text-sm font-mono max-w-sm bg-muted"
        />
        {instance.slug !== "/" && (
          <p className="text-xs text-muted-foreground mt-1">
            {f.slugHint.replace("{slug}", instance.slug)}
          </p>
        )}
      </div>

      {/* Features toggles */}
      <div className="space-y-3 pt-2">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide">
          {f.activationTitle}
        </h4>

        {/* Landing page toggle */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={features.landingPage}
            onChange={e => setFeature("landingPage", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">{f.publicPage}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{f.publicPageDesc}</p>
          </div>
        </label>

        {/* Form toggle */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={features.form}
            onChange={e => setFeature("form", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">{f.formInput}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{f.formInputDesc}</p>
          </div>
        </label>

        {/* Block disposable emails toggle */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={features.blockDisposableEmails ?? false}
            onChange={e => setFeature("blockDisposableEmails", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">{f.blockDisposableEmails}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{f.blockDisposableEmailsDesc}</p>
          </div>
        </label>

        {/* Form versioning toggle */}
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={features.formVersioning === true}
            onChange={e => setFeature("formVersioning", e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">{f.formVersioning}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{f.formVersioningDesc}</p>
          </div>
        </label>
      </div>

      {/* Webhook notifications */}
      <div className="space-y-3 pt-2 border-t border-border">
        <h4 className="text-xs font-semibold text-foreground uppercase tracking-wide pt-2">
          {f.notificationsTitle}
        </h4>
        <label className="flex items-start gap-3 p-3 rounded-lg border border-border hover:bg-muted/30 transition-colors cursor-pointer">
          <input
            type="checkbox"
            checked={notifications.enabled ?? false}
            onChange={e => setNotification({ enabled: e.target.checked })}
            className="mt-0.5 w-4 h-4 rounded border-input accent-primary"
          />
          <div>
            <p className="text-sm font-medium text-foreground">{f.webhookEnabled}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{f.webhookDesc}</p>
          </div>
        </label>
        {notifications.enabled && (
          <div>
            <label className="block text-xs text-muted-foreground mb-1.5">{f.webhookUrl}</label>
            <Input
              value={notifications.webhookUrl ?? ""}
              onChange={e => setNotification({ webhookUrl: e.target.value })}
              placeholder={f.webhookPlaceholder}
              className="text-sm font-mono"
            />
            <p className="text-xs text-muted-foreground mt-1">
              <code className="font-mono bg-muted px-1 rounded">{f.webhookPayload}</code>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
