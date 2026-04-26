"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "@/lib/context/LocaleContext";
import type { AdminBrandingConfig } from "@/types/config";

interface Props {
  branding?: AdminBrandingConfig;
  onChange: (branding: AdminBrandingConfig) => void;
}

// ─── LogoInput ──────────────────────────────────────────────────────────────

interface LogoInputProps {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  label?: string;
  urlPlaceholder: string;
  uploadLabel: string;
  clearLabel: string;
  orUrlLabel: string;
}

function LogoInput({ value, onChange, label, urlPlaceholder, uploadLabel, clearLabel, orUrlLabel }: LogoInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const isBase64 = value?.startsWith("data:image/");

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string);
    reader.readAsDataURL(file);
    // Reset so same file can be re-selected
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      {label && <p className="text-xs font-medium text-foreground">{label}</p>}

      {isBase64 ? (
        // ── Uploaded image: show thumbnail + replace/clear ──────────────────
        <div className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/30">
          <Image
            src={value!}
            alt="logo"
            width={40}
            height={40}
            unoptimized
            className="rounded shrink-0 object-contain bg-white border border-border"
            style={{ width: 40, height: 40 }}
          />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground truncate">
              {value!.slice(0, 40)}…
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="px-2.5 py-1 text-xs rounded-md border border-border bg-background hover:bg-muted transition-colors"
            >
              {uploadLabel}
            </button>
            <button
              type="button"
              onClick={() => onChange(undefined)}
              className="px-2.5 py-1 text-xs rounded-md border border-border text-destructive hover:bg-destructive/10 transition-colors"
            >
              {clearLabel}
            </button>
          </div>
        </div>
      ) : (
        // ── No image or URL: show file picker + URL input ───────────────────
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-dashed border-border bg-background hover:bg-muted/50 transition-colors w-full justify-center"
          >
            <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            {uploadLabel}
          </button>
          <p className="text-xs text-center text-muted-foreground">{orUrlLabel}</p>
          <input
            type="text"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value || undefined)}
            placeholder={urlPlaceholder}
            className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFile}
      />
    </div>
  );
}

// ─── AdminBrandingTab ────────────────────────────────────────────────────────

export function AdminBrandingTab({ branding = {}, onChange }: Props) {
  const tr = useTranslations();
  const b = tr.admin.config.adminBranding;

  const [perTheme, setPerTheme] = useState(
    !!(branding.logoLightUrl || branding.logoDarkUrl)
  );

  function patch(partial: Partial<AdminBrandingConfig>) {
    onChange({ ...branding, ...partial });
  }

  function handlePerThemeToggle(enabled: boolean) {
    setPerTheme(enabled);
    if (!enabled) {
      patch({ logoLightUrl: undefined, logoDarkUrl: undefined });
    } else {
      patch({ logoUrl: undefined });
    }
  }

  const previewLogoLight = perTheme
    ? (branding.logoLightUrl || branding.logoUrl)
    : branding.logoUrl;

  const previewLogoDark = perTheme
    ? (branding.logoDarkUrl || branding.logoUrl)
    : branding.logoUrl;

  const appName = branding.appName || b.appNamePlaceholder;

  return (
    <div className="space-y-6">
      {/* App name */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{b.title}</h2>
        <p className="text-xs text-muted-foreground">{b.description}</p>

        <div>
          <label className="block text-xs font-medium text-foreground mb-1">{b.appName}</label>
          <input
            type="text"
            value={branding.appName ?? ""}
            onChange={(e) => patch({ appName: e.target.value || undefined })}
            placeholder={b.appNamePlaceholder}
            className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring/50"
          />
        </div>
      </div>

      {/* Logo */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-foreground">{b.logoSection}</h2>

        {/* Toggle: single vs per-theme */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => handlePerThemeToggle(false)}
            className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
              !perTheme
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-foreground/30"
            }`}
          >
            {b.logoSingle}
          </button>
          <button
            type="button"
            onClick={() => handlePerThemeToggle(true)}
            className={`flex-1 py-2 px-3 text-xs font-medium rounded-lg border transition-colors ${
              perTheme
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-background text-muted-foreground border-border hover:border-foreground/30"
            }`}
          >
            {b.logoPerTheme}
          </button>
        </div>

        {!perTheme ? (
          <div>
            <p className="text-xs text-muted-foreground mb-3">{b.logoSingleHint}</p>
            <LogoInput
              value={branding.logoUrl}
              onChange={(v) => patch({ logoUrl: v })}
              urlPlaceholder={b.logoUrlPlaceholder}
              uploadLabel={b.uploadFile}
              clearLabel={b.clearLogo}
              orUrlLabel={b.orUrl}
            />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">{b.logoPerThemeHint}</p>
            <LogoInput
              value={branding.logoLightUrl}
              onChange={(v) => patch({ logoLightUrl: v })}
              label={b.logoLight}
              urlPlaceholder={b.logoUrlPlaceholder}
              uploadLabel={b.uploadFile}
              clearLabel={b.clearLogo}
              orUrlLabel={b.orUrl}
            />
            <LogoInput
              value={branding.logoDarkUrl}
              onChange={(v) => patch({ logoDarkUrl: v })}
              label={b.logoDark}
              urlPlaceholder={b.logoUrlPlaceholder}
              uploadLabel={b.uploadFile}
              clearLabel={b.clearLogo}
              orUrlLabel={b.orUrl}
            />
          </div>
        )}
      </div>

      {/* Preview */}
      <div className="rounded-xl border border-border bg-card p-5 space-y-3">
        <h2 className="text-sm font-semibold text-foreground">{b.preview}</h2>
        <div className="flex gap-3">
          {/* Light preview */}
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-2">{b.previewLight}</p>
            <div className="flex items-center gap-2.5 px-4 h-14 rounded-xl border border-border bg-white">
              {previewLogoLight ? (
                <Image
                  src={previewLogoLight}
                  alt={appName}
                  width={28}
                  height={28}
                  unoptimized
                  style={{ width: "28px", height: "28px", objectFit: "contain" }}
                  className="shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-gray-200 shrink-0" />
              )}
              <span className="font-semibold text-sm tracking-tight text-gray-900 truncate">{appName}</span>
            </div>
            {!previewLogoLight && (
              <p className="text-xs text-muted-foreground mt-1">{b.noLogo}</p>
            )}
          </div>

          {/* Dark preview */}
          <div className="flex-1">
            <p className="text-xs text-muted-foreground mb-2">{b.previewDark}</p>
            <div className="flex items-center gap-2.5 px-4 h-14 rounded-xl border border-border bg-gray-900">
              {previewLogoDark ? (
                <Image
                  src={previewLogoDark}
                  alt={appName}
                  width={28}
                  height={28}
                  unoptimized
                  style={{ width: "28px", height: "28px", objectFit: "contain" }}
                  className="shrink-0"
                />
              ) : (
                <div className="w-7 h-7 rounded-md bg-gray-700 shrink-0" />
              )}
              <span className="font-semibold text-sm tracking-tight text-gray-100 truncate">{appName}</span>
            </div>
            {!previewLogoDark && (
              <p className="text-xs text-muted-foreground mt-1">{b.noLogo}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
