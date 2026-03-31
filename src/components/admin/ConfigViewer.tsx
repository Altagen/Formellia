"use client";

import type { FormConfig } from "@/types/config";
import type { FormInstance } from "@/types/formInstance";
import { useTranslations } from "@/lib/context/LocaleContext";

interface ConfigViewerProps {
  config: FormConfig;
  rootInstance?: FormInstance;
}

export function ConfigViewer({ config, rootInstance }: ConfigViewerProps) {
  const tr = useTranslations();
  const cv = tr.admin.configViewer;
  const meta = rootInstance?.config.meta;
  const form = rootInstance?.config.form;
  const page = rootInstance?.config.page;
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tr.admin.config.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {cv.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-muted-foreground text-xs font-medium">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50"></span>
            {cv.fileMode}
          </span>
          <a
            href="/api/admin/config/export"
            download="form.config.ts"
            className="inline-flex items-center gap-2 px-4 py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {tr.admin.config.export}
          </a>
        </div>
      </div>

      {/* Info banner */}
      <div className="flex items-start gap-3 p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-xl">
        <svg className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <div>
          <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{cv.readOnly}</p>
          <p className="text-sm text-blue-600 dark:text-blue-300 mt-0.5">
            {cv.readOnlyHint} <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">form.config.ts</code> {cv.readOnlyHint2} <code className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">CONFIG_SOURCE=db</code>
          </p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Meta */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">{cv.meta}</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">{cv.name}</dt>
              <dd className="text-sm text-foreground font-medium">{meta?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{cv.title}</dt>
              <dd className="text-sm text-foreground">{meta?.title ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{cv.locale}</dt>
              <dd className="text-sm text-foreground">{meta?.locale ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{cv.version}</dt>
              <dd className="text-sm text-foreground">{config.version}</dd>
            </div>
          </dl>
        </div>

        {/* Form */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">{cv.formSection}</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">{cv.steps}</dt>
              <dd className="text-sm text-foreground font-medium">{form?.steps.length ?? 0}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{cv.totalFields}</dt>
              <dd className="text-sm text-foreground font-medium">
                {form?.steps.reduce((acc, s) => acc + s.fields.length, 0) ?? 0}
              </dd>
            </div>
          </dl>
          <div className="mt-3 space-y-1">
            {(form?.steps ?? []).map((step, i) => (
              <div key={step.id} className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{i + 1}. {step.title}</span>
                <span className="text-muted-foreground">{step.fields.length} {cv.fields}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Admin */}
        <div className="bg-card rounded-xl border border-border p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">{cv.adminSection}</h2>
          <dl className="space-y-2">
            <div>
              <dt className="text-xs text-muted-foreground">{cv.widgets}</dt>
              <dd className="text-sm text-foreground font-medium">{config.admin.pages.reduce((acc, p) => acc + p.widgets.length, 0)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">{cv.tableColumns}</dt>
              <dd className="text-sm text-foreground font-medium">{config.admin.tableColumns.length}</dd>
            </div>
          </dl>
          <div className="mt-3 space-y-1">
            {config.admin.pages.map((p) => (
              <div key={p.id} className="flex items-center gap-2 text-xs">
                <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">/admin/{p.slug}</span>
                <span className="text-muted-foreground truncate">{p.title} · {cv.widgetCount.replace("{n}", String(p.widgets.length))}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Branding */}
      <div className="bg-card rounded-xl border border-border p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">{cv.branding}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{cv.defaultTheme}</p>
            <p className="text-foreground">{page?.branding.defaultTheme ?? "—"}</p>
          </div>
          {page?.branding.primaryColor && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">{cv.primaryColor}</p>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border border-border" style={{ backgroundColor: page.branding.primaryColor }} />
                <p className="text-foreground font-mono text-xs">{page.branding.primaryColor}</p>
              </div>
            </div>
          )}
          <div>
            <p className="text-xs text-muted-foreground mb-1">{cv.heroTitle}</p>
            <p className="text-foreground truncate">{page?.hero.title ?? "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{cv.cta}</p>
            <p className="text-foreground">{page?.hero.ctaLabel ?? "—"}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
