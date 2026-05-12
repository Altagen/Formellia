import { describe, it, expect } from "vitest";
import { stepsForPage } from "@/lib/dashboard/scopedFields";
import type { StepDef } from "@/types/config";
import type { FormInstance } from "@/types/formInstance";

function step(id: string, fieldIds: string[]): StepDef {
  return { id, title: id, fields: fieldIds.map(fid => ({ id: fid, type: "text", label: fid })) } as StepDef;
}

function instance(id: string, slug: string, steps: StepDef[]): FormInstance {
  return {
    id,
    slug,
    name: slug,
    config: { form: { steps } },
  } as unknown as FormInstance;
}

const formA = instance("id-a", "a", [step("s1", ["a1", "a2"])]);
const formB = instance("id-b", "b", [
  step("s1", ["b1"]),
  { id: "s2", title: "s2", fields: [
    { id: "rep", type: "repeater", label: "Rep", repeaterColumns: [
      { id: "col1", type: "text", label: "Col 1" },
      { id: "col2", type: "number", label: "Col 2" },
    ] },
  ] } as StepDef,
]);
const allForms = [...formA.config.form.steps, ...formB.config.form.steps];

describe("stepsForPage", () => {
  it("returns only the bound form's steps when formInstanceId is set", () => {
    const steps = stepsForPage({ formInstanceId: "id-a" }, [formA, formB], allForms);
    expect(steps.flatMap(s => s.fields).map(f => f.id)).toEqual(["a1", "a2"]);
  });

  it("expands the repeater into synthetic columns when flattenRepeater is set", () => {
    const steps = stepsForPage(
      { formInstanceId: "id-b", flattenRepeater: { fieldId: "rep" } },
      [formA, formB],
      allForms,
    );
    const fieldIds = steps.flatMap(s => s.fields).map(f => f.id);
    expect(fieldIds).toContain("col1");
    expect(fieldIds).toContain("col2");
    expect(fieldIds).not.toContain("rep");
  });

  it("returns every form's steps for an all-submissions page (no formInstanceId)", () => {
    const steps = stepsForPage({}, [formA, formB], allForms);
    expect(steps).toBe(allForms);
  });

  it("returns an empty list when the referenced form no longer exists", () => {
    const steps = stepsForPage({ formInstanceId: "id-gone" }, [formA, formB], allForms);
    expect(steps).toEqual([]);
  });
});
