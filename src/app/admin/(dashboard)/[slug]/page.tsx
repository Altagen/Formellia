import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { externalRecords } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getFormConfig } from "@/lib/config";
import { getFormInstance, getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { externalRecordToSubmission } from "@/lib/utils/externalAdapter";
import { validateAdminSession } from "@/lib/auth/validateSession";
import { buildPresetCssVars } from "@/lib/theme/cssVars";
import { DashboardView } from "@/components/dashboard/DashboardView";
import { CompletionFunnel } from "@/components/dashboard/CompletionFunnel";
import { PrioritySettingsProvider } from "@/lib/context/PrioritySettingsContext";
import { DEFAULT_THRESHOLDS } from "@/lib/utils/priority";
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

  return (
    <PrioritySettingsProvider settings={instanceThresholds}>
      {presetCss && <style dangerouslySetInnerHTML={{ __html: presetCss }} />}
      <div className="space-y-6">
        <AutoRefresh intervalSeconds={page.refreshInterval ?? 0} />
        <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>

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
          isExternalSource={!!page.dataSourceId}
          interactiveFilter={page.interactiveFilter ?? false}
          currentUserEmail={currentUser?.email ?? undefined}
        />

        {formSlug && <CompletionFunnel formSlug={formSlug} />}
      </div>
    </PrioritySettingsProvider>
  );
}
