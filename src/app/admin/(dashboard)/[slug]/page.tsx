import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { externalRecords, submissions as submissionsTable } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getFormConfig } from "@/lib/config";
import { getFormInstance, getFormInstanceById } from "@/lib/db/formInstanceLoader";
import Link from "next/link";
import { Pencil } from "lucide-react";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { externalRecordToSubmission } from "@/lib/utils/externalAdapter";
import { validateAdminSession } from "@/lib/auth/validateSession";
import { buildPresetCssVars } from "@/lib/theme/cssVars";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { CompletionFunnel } from "@/components/dashboard/CompletionFunnel";
import { PageEyebrow } from "@/components/admin/layout/PageEyebrow";
import { FormContextTabs, type FormContextTab } from "@/components/admin/layout/FormContextTabs";
import { getTranslations } from "@/i18n";
import { PrioritySettingsProvider } from "@/lib/context/PrioritySettingsContext";
import { DEFAULT_THRESHOLDS } from "@/lib/utils/priority";
import { flattenRepeaterRows, expandStepsForRepeater } from "@/lib/utils/flattenRepeater";
import type { StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminDynamicPage({ params }: Props) {
  const { slug } = await params;
  const config = await getFormConfig();
  const currentUser = await validateAdminSession();

  const page = config.admin.pages.find(p => p.slug === slug);
  if (!page) notFound();

  const needsData = page.widgets.length > 0;
  let formSteps: StepDef[] = [];
  let customStatuses: { value: string; label: string; color: string }[] | undefined;
  let formInstanceId: string | undefined;
  let formSlug: string | undefined;
  let initialSubmissions: Submission[] | undefined;
  let instanceThresholds = DEFAULT_THRESHOLDS;
  let instanceColorPreset: string | undefined;

  if (needsData) {
    if (page.dataSourceId) {
      // External dataset: fetch all records server-side (used for both charts and table)
      const records = await db
        .select()
        .from(externalRecords)
        .where(eq(externalRecords.datasetId, page.dataSourceId))
        .orderBy(desc(externalRecords.importedAt));
      initialSubmissions = records.map(externalRecordToSubmission);
    } else if (page.formInstanceId) {
      // Native form: derive config, table uses API
      const instance = await getFormInstanceById(page.formInstanceId);
      if (instance) {
        formSteps = instance.config.form.steps;
        customStatuses = instance.config.customStatuses;
        formInstanceId = instance.id;
        formSlug = instance.slug;
        instanceThresholds = instance.config.priorityThresholds ?? DEFAULT_THRESHOLDS;
        instanceColorPreset = instance.config.page.branding.colorPreset;

        // flattenRepeater: pre-expand each submission into one row per repeater item.
        // Treated like an external source so the table renders the synthetic rows
        // directly instead of round-tripping through the submissions API.
        if (page.flattenRepeater) {
          const rows = await db
            .select()
            .from(submissionsTable)
            .where(eq(submissionsTable.formInstanceId, instance.id))
            .orderBy(desc(submissionsTable.submittedAt));
          initialSubmissions = flattenRepeaterRows(rows, page.flattenRepeater.fieldId);
          formSteps = expandStepsForRepeater(formSteps, page.flattenRepeater.fieldId);
          formInstanceId = undefined;
        }
      }
    } else {
      // All native submissions — use root form instance for field metadata
      const rootInstance = await getFormInstance("/");
      if (rootInstance) {
        formSteps = rootInstance.config.form.steps;
        customStatuses = rootInstance.config.customStatuses;
      }
      // formInstanceId stays undefined → API will return all submissions
    }
  }

  const tableWidget = page.widgets.find(w => w.type === "submissions_table");
  const hasTable = !!tableWidget;
  const otherWidgets = page.widgets.filter(w => w.type !== "submissions_table");

  // Form preset overrides the global admin preset for this page
  const effectivePreset = instanceColorPreset ?? config.admin.branding?.colorPreset;
  const presetCss = buildPresetCssVars(effectivePreset);

  // Form context header (eyebrow + tabs) — only shown when the view targets one form
  const tr = getTranslations(config.locale);
  const fc = tr.admin.formContext;
  let formContext: {
    name: string;
    slug: string;
    isActive: boolean;
    tabs: FormContextTab[];
  } | null = null;
  if (page.formInstanceId) {
    const inst = await getFormInstanceById(page.formInstanceId);
    if (inst) {
      formContext = {
        name: inst.name,
        slug: inst.slug,
        isActive: inst.config.features?.form !== false,
        tabs: [
          { id: "dashboard",     label: fc.tabs.dashboard,     href: `/admin/${slug}` },
          { id: "configuration", label: fc.tabs.configuration, href: `/admin/forms/${inst.slug === "/" ? "_root" : inst.slug}` },
          { id: "publicPage",    label: fc.tabs.publicPage,    href: `/${inst.slug === "/" ? "" : inst.slug}`, external: true },
        ],
      };
    }
  }

  return (
    <PrioritySettingsProvider settings={instanceThresholds}>
      {presetCss && <style dangerouslySetInnerHTML={{ __html: presetCss }} />}
      <div className="space-y-6">
        <AutoRefresh intervalSeconds={page.refreshInterval ?? 0} />
        {formContext && (
          <div className="space-y-3 -mt-2">
            <PageEyebrow
              category={fc.eyebrowCategory}
              slug={formContext.slug}
              status={formContext.isActive ? "active" : "inactive"}
              statusLabels={{ active: fc.statusActive, inactive: fc.statusInactive }}
            />
            <h1 className="text-2xl font-bold tracking-tight">{formContext.name}</h1>
            <FormContextTabs tabs={formContext.tabs} activeId="dashboard" />
          </div>
        )}
        {!formContext && (
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>
            <Link
              href={`/admin/views/${encodeURIComponent(page.id)}/edit`}
              aria-label={tr.admin.chart.editView}
              title={tr.admin.chart.editView}
              className="inline-flex items-center justify-center h-9 w-9 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:text-primary transition-colors shrink-0"
            >
              <Pencil className="w-[18px] h-[18px]" />
            </Link>
          </div>
        )}

        {page.flattenRepeater && (
          <div className="flex items-start gap-3 rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-950/30 px-4 py-3 text-sm text-blue-900 dark:text-blue-200">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0 mt-0.5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            <p>
              {tr.admin.flattenBanner.lead}{" "}
              <code className="font-mono text-xs px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40">{page.flattenRepeater.fieldId}</code>{" "}
              {tr.admin.flattenBanner.tail}
            </p>
          </div>
        )}

        <DashboardView
          formInstanceId={formInstanceId}
          dataSourceId={page.dataSourceId ?? undefined}
          initialSubmissions={initialSubmissions}
          config={config}
          formSteps={formSteps}
          customStatuses={customStatuses}
          otherWidgets={otherWidgets}
          tableWidget={tableWidget?.type === "submissions_table" ? tableWidget : undefined}
          hasTable={hasTable}
          isExternalSource={!!page.dataSourceId || !!page.flattenRepeater}
          interactiveFilter={page.interactiveFilter ?? false}
          currentUserEmail={currentUser?.email ?? undefined}
        />

        {formSlug && page.showCompletionFunnel !== false && <CompletionFunnel formSlug={formSlug} />}
      </div>
    </PrioritySettingsProvider>
  );
}
