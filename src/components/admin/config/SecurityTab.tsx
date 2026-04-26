"use client";

import type { SecurityConfig } from "@/types/config";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { TriangleAlert } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";

interface SecurityTabProps {
  security: SecurityConfig | undefined;
  onChange: (s: SecurityConfig) => void;
}

export function SecurityTab({ security, onChange }: SecurityTabProps) {
  const tr = useTranslations();
  const s = tr.admin.config.security;
  const honeypot = security?.honeypot ?? { enabled: false };
  const rateLimit = security?.rateLimit ?? { enabled: false };

  function updateHoneypot(patch: Partial<typeof honeypot>) {
    onChange({ ...security, honeypot: { ...honeypot, ...patch } });
  }

  function updateRateLimit(patch: Partial<typeof rateLimit>) {
    onChange({ ...security, rateLimit: { ...rateLimit, ...patch } });
  }

  return (
    <div className="space-y-6">
      {/* Honeypot */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">{s.honeypotTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{s.honeypotDesc}</p>
          </div>
          <Switch
            checked={honeypot.enabled}
            onCheckedChange={(checked) => updateHoneypot({ enabled: checked })}
            aria-label={s.honeypotAriaLabel}
          />
        </div>

        {honeypot.enabled && (
          <div className="border-t border-border pt-4">
            <Label htmlFor="honeypot-field-name" className="text-xs text-muted-foreground mb-1.5">
              {s.fieldName}
            </Label>
            <Input
              id="honeypot-field-name"
              type="text"
              value={honeypot.fieldName ?? ""}
              onChange={(e) => updateHoneypot({ fieldName: e.target.value || undefined })}
              className="w-full max-w-xs"
              placeholder={s.fieldPlaceholder}
            />
            <p className="text-xs text-muted-foreground mt-1.5">{s.fieldHint}</p>
          </div>
        )}
      </div>

      {/* Rate limit */}
      <div className="bg-card rounded-xl border p-6">
        <div className="flex items-start justify-between mb-4 gap-4">
          <div className="flex-1">
            <h2 className="text-sm font-semibold text-foreground">{s.rateLimitTitle}</h2>
            <p className="text-xs text-muted-foreground mt-1">{s.rateLimitDesc}</p>
          </div>
          <Switch
            checked={rateLimit.enabled}
            onCheckedChange={(checked) => updateRateLimit({ enabled: checked })}
            aria-label={s.rateLimitAriaLabel}
          />
        </div>

        {rateLimit.enabled && (
          <div className="border-t border-border pt-4 grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="rate-limit-hour" className="text-xs text-muted-foreground mb-1.5">
                {s.maxPerHour}
              </Label>
              <Input
                id="rate-limit-hour"
                type="number"
                min={1}
                max={1000}
                value={rateLimit.maxPerHour ?? 10}
                onChange={(e) => updateRateLimit({ maxPerHour: parseInt(e.target.value) || 10 })}
              />
              <p className="text-xs text-muted-foreground mt-1">{s.hourDefault}</p>
            </div>
            <div>
              <Label htmlFor="rate-limit-day" className="text-xs text-muted-foreground mb-1.5">
                {s.maxPerDay}
              </Label>
              <Input
                id="rate-limit-day"
                type="number"
                min={1}
                max={10000}
                value={rateLimit.maxPerDay ?? 50}
                onChange={(e) => updateRateLimit({ maxPerDay: parseInt(e.target.value) || 50 })}
              />
              <p className="text-xs text-muted-foreground mt-1">{s.dayDefault}</p>
            </div>
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 rounded-lg">
        <TriangleAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">{s.warning}</p>
      </div>
    </div>
  );
}
