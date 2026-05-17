import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { externalRecords, submissions as submissionsTable } from "@/lib/db/schema";
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
import { flattenRepeaterRows, expandStepsForRepeater } from "@/lib/utils/flattenRepeater";
import { getTranslations } from "@/i18n";
import type { StepDef } from "@/types/config";
import type { Submission } from "@/lib/db/schema";

interface Props {
  params: Promise<{ slug: string }>;
}

export default async function AdminDynamicPage({ params }: Props) {
  const { slug } = await params;
  const config = await getFormConfig();
  const currentUser = await validateAdminSession();

  const page = config.admin.views.find(p => p.slug === slug);
  if (!page) notFound();

  const needsData = page.widgets.length > 0;
  let formSteps: StepDef[] = [];
  let customStatuses: { value: string; label: string; color: string }[] | undefined;
  let formInstanceId: string | undefined;
  let formSlug: string | undefined;
  let initialSubmissions: Submission[] | undefined;
  let instanceThresholds = DEFAULT_THRESHOLDS;
  let instanceColorPreset: string | undefined;
  let orphanedPoolId: string | undefined;

  if (needsData) {
    if (page.dataPoolId) {
      // DataPool source: compute the deduplicated entries server-side and
      // synthesise Submission-shaped rows so the existing widgets render
      // unchanged. Each entry's key + additional fields become formData;
      // lastSubmittedAt becomes submittedAt; submissionCount + firstSubmittedAt
      // travel through formData so widgets can expose them as columns.
      const { getDataPool } = await import("@/lib/datapools/crud");
      const { getDataPoolEntries } = await import("@/lib/datapools/compute");
      const pool = await getDataPool(page.dataPoolId);
      if (!pool) {
        // Page references a deleted/missing pool. Surface a banner so the
        // operator knows to fix the source binding instead of seeing an
        // empty page silently.
        orphanedPoolId = page.dataPoolId;
      } else {
        const { entries } = await getDataPoolEntries(page.dataPoolId);
        // Defensive Date coercion — the pg driver can hand back timestamps as
        // either Date objects (modern path) or ISO strings (older configs /
        // when the column is timestamp-without-tz), depending on the deployment.
        // The Submission type wants Date, so we coerce both ends.
        const toDate = (v: unknown): Date => v instanceof Date ? v : new Date(v as string);
        initialSubmissions = entries.map(e => {
          const first = toDate(e.firstSubmittedAt);
          const last  = toDate(e.lastSubmittedAt);
          return {
            id:              e.sourceSubmissionId,
            formInstanceId:  e.sourceFormInstanceId,
            email:           pool.keyField === "email" ? e.key : (e.additional.email ?? null),
            formData:        { [pool.keyField]: e.key, ...e.additional, _submissionCount: e.submissionCount, _firstSubmittedAt: first.toISOString() },
            submittedAt:     last,
            createdAt:       first,
            updatedAt:       last,
            ipHash:          null,
            status:          null,
            priority:        null,
            dueDate:         null,
            receivedAt:      null,
            assignedToId:    null,
            excludedFromDataPools: false,
          } as unknown as Submission;
        });

        // Synthesise a single-step formSteps so column pickers + table headers
        // see the pool's keyField + additionalFields. Pool entries never have
        // urgency/dueDate, so step metadata stays minimal.
        formSteps = [{
          id:    "pool-fields",
          title: pool.name,
          fields: [
            { id: pool.keyField, type: "text", label: pool.keyField, required: false },
            ...pool.additionalFields.map(f => ({
              id: f, type: "text" as const, label: f, required: false,
            })),
          ],
        }];
        formInstanceId = undefined;          // table widget hits initialSubmissions directly
      }
    } else if (page.dataSourceId) {
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

  // A page is in "every form mixed together" mode when no source is bound
  // (no form instance, no external dataset, no flattened repeater). Show a
  // banner so the operator sees at a glance that the table mixes submissions
  // from every form — a behaviour the page editor warns about but that's
  // easy to forget once the page is saved and being viewed day-to-day.
  const isAllSubmissionsMode = !page.formInstanceId && !page.dataSourceId && !page.dataPoolId && !page.flattenRepeater;
  const tr = getTranslations(config.locale);

  return (
    <PrioritySettingsProvider settings={instanceThresholds}>
      {presetCss && <style dangerouslySetInnerHTML={{ __html: presetCss }} />}
      <div className="space-y-6">
        <AutoRefresh intervalSeconds={page.refreshInterval ?? 0} />
        <h1 className="text-2xl font-bold tracking-tight">{page.title}</h1>

        {isAllSubmissionsMode && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            ⚠ {tr.admin.dashboard.allSubmissionsBanner}
          </div>
        )}
        {orphanedPoolId && (
          <div className="rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-900 dark:text-red-200">
            ⚠ {tr.admin.dashboard.orphanPoolBanner.replace("{id}", orphanedPoolId)}
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
          isExternalSource={!!page.dataSourceId || !!page.flattenRepeater || !!page.dataPoolId}
          interactiveFilter={page.interactiveFilter ?? false}
          currentUserEmail={currentUser?.email ?? undefined}
        />

        {formSlug && page.showCompletionFunnel !== false && <CompletionFunnel formSlug={formSlug} />}
      </div>
    </PrioritySettingsProvider>
  );
}
