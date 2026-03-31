"use client";

import { useState } from "react";
import type { AppMetaConfig } from "@/types/config";
import { useTranslations } from "@/lib/context/LocaleContext";

interface MetaTabProps {
  meta: AppMetaConfig;
  onChange: (m: AppMetaConfig) => void;
}

export function MetaTab({ meta, onChange }: MetaTabProps) {
  const tr = useTranslations();
  const m = tr.admin.config.meta;

  const [showTranslations, setShowTranslations] = useState(
    // Open by default if any translation is already set
    Object.values(meta.translations ?? {}).some(Boolean)
  );

  function update(key: keyof AppMetaConfig, value: string) {
    onChange({ ...meta, [key]: value });
  }

  function updateTranslation(key: keyof NonNullable<AppMetaConfig["translations"]>, value: string) {
    onChange({
      ...meta,
      translations: {
        ...meta.translations,
        [key]: value || undefined,
      },
    });
  }

  const inputClass = "w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-background text-foreground";
  const labelClass = "block text-xs text-muted-foreground mb-1";

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-xl border border-border p-6">
        <h2 className="text-sm font-semibold text-foreground mb-4">{m.title}</h2>
        <div className="space-y-4">
          <div className="grid grid-cols-[1fr_auto] gap-3 items-start">
            <div>
              <label className={labelClass}>{m.appName}</label>
              <input
                type="text"
                value={meta.name}
                onChange={(e) => update("name", e.target.value)}
                className={inputClass}
                placeholder={m.appNamePlaceholder}
              />
              <p className="text-xs text-muted-foreground mt-1">{m.appNameHint}</p>
            </div>
            <div className="w-20">
              <label className={labelClass}>{m.emoji}</label>
              <input
                type="text"
                value={meta.emoji ?? ""}
                onChange={(e) => update("emoji", e.target.value)}
                className={`${inputClass} text-center text-xl`}
                placeholder="📋"
                maxLength={4}
              />
            </div>
          </div>

          <div>
            <label className={labelClass}>{m.displayTitle}</label>
            <input
              type="text"
              value={meta.title}
              onChange={(e) => update("title", e.target.value)}
              className={inputClass}
              placeholder={m.displayTitlePlaceholder}
            />
          </div>

          <div>
            <label className={labelClass}>{m.description}</label>
            <textarea
              value={meta.description}
              onChange={(e) => update("description", e.target.value)}
              rows={3}
              className={`${inputClass} resize-none`}
              placeholder={m.descriptionPlaceholder}
            />
          </div>

          <div>
            <label className={labelClass}>{m.language}</label>
            <select
              value={meta.locale}
              onChange={(e) => update("locale", e.target.value)}
              className={inputClass}
            >
              <option value="fr">{m.localeFr}</option>
              <option value="en">{m.localeEn}</option>

            </select>
          </div>
        </div>
      </div>

      {/* Label overrides */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <button
          type="button"
          onClick={() => setShowTranslations(v => !v)}
          className="w-full flex items-center justify-between px-6 py-4 text-sm font-semibold text-foreground hover:bg-muted/30 transition-colors"
        >
          <span>{m.translationsTitle}</span>
          <span className="text-muted-foreground text-xs">{showTranslations ? "▲" : "▼"}</span>
        </button>

        {showTranslations && (
          <div className="px-6 pb-6 space-y-4 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">{m.translationsDesc}</p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>{m.submitButtonLabel}</label>
                <input
                  type="text"
                  value={meta.translations?.submitButton ?? ""}
                  onChange={e => updateTranslation("submitButton", e.target.value)}
                  className={inputClass}
                  placeholder={m.submitButtonPlaceholder}
                />
              </div>

              <div>
                <label className={labelClass}>{m.nextButtonLabel}</label>
                <input
                  type="text"
                  value={meta.translations?.nextButton ?? ""}
                  onChange={e => updateTranslation("nextButton", e.target.value)}
                  className={inputClass}
                  placeholder={m.nextButtonPlaceholder}
                />
              </div>

              <div>
                <label className={labelClass}>{m.backButtonLabel}</label>
                <input
                  type="text"
                  value={meta.translations?.backButton ?? ""}
                  onChange={e => updateTranslation("backButton", e.target.value)}
                  className={inputClass}
                  placeholder={m.backButtonPlaceholder}
                />
              </div>

              <div>
                <label className={labelClass}>{m.successTitleLabel}</label>
                <input
                  type="text"
                  value={meta.translations?.successTitle ?? ""}
                  onChange={e => updateTranslation("successTitle", e.target.value)}
                  className={inputClass}
                  placeholder={m.successTitlePlaceholder}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>{m.successMessageLabel}</label>
              <textarea
                value={meta.translations?.successMessage ?? ""}
                onChange={e => updateTranslation("successMessage", e.target.value)}
                rows={2}
                className={`${inputClass} resize-none`}
                placeholder={m.successMessagePlaceholder}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
