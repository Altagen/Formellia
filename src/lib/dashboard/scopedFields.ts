import type { AdminView, StepDef } from "@/types/config";
import type { FormInstance } from "@/types/formInstance";
import { expandStepsForRepeater } from "@/lib/utils/flattenRepeater";

/**
 * The form steps whose fields are relevant to a dashboard page — used to scope
 * the column / filter / groupBy pickers in the dashboard editor.
 *
 *   - Page bound to a form (`formInstanceId`) → that form's steps, with the
 *     repeater expanded into synthetic columns when `flattenRepeater` is set.
 *   - "All submissions" page (no `formInstanceId`, no `dataSourceId`) → every
 *     form's steps merged (the page legitimately spans all forms).
 *   - Page referencing a form that no longer exists → empty list.
 *
 * Pages backed by an external dataset (`dataSourceId`) don't go through this —
 * their fields come from the dataset's column definitions.
 */
export function stepsForPage(
  page: Pick<AdminView, "formInstanceId" | "flattenRepeater">,
  formInstances: FormInstance[],
  allFormsSteps: StepDef[],
): StepDef[] {
  if (!page.formInstanceId) return allFormsSteps;
  const inst = formInstances.find(fi => fi.id === page.formInstanceId);
  if (!inst) return [];
  const steps = inst.config.form.steps;
  return page.flattenRepeater ? expandStepsForRepeater(steps, page.flattenRepeater.fieldId) : steps;
}
