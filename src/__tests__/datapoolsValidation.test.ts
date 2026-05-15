import { describe, it, expect } from "vitest";
import {
  createDataPoolSchema,
  updateDataPoolSchema,
  addSubmissionExclusionSchema,
} from "@/lib/datapools/validation";

const validUuid = "01234567-89ab-4def-8123-456789abcdef";

describe("createDataPoolSchema", () => {
  const ok = {
    name: "MU-1ère - Audience",
    slug: "mu-1ere-audience",
    keyField: "email",
    additionalFields: ["firstName", "lastName"],
    sources: [{ formInstanceId: validUuid }],
  };

  it("accepts a well-formed input", () => {
    expect(createDataPoolSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects empty name", () => {
    expect(createDataPoolSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
  });

  it("rejects a slug with spaces", () => {
    expect(createDataPoolSchema.safeParse({ ...ok, slug: "my pool" }).success).toBe(false);
  });

  it("rejects a slug starting with a dash", () => {
    expect(createDataPoolSchema.safeParse({ ...ok, slug: "-leading" }).success).toBe(false);
  });

  it("requires at least one source", () => {
    expect(createDataPoolSchema.safeParse({ ...ok, sources: [] }).success).toBe(false);
  });

  it("rejects non-uuid formInstanceId", () => {
    expect(
      createDataPoolSchema.safeParse({ ...ok, sources: [{ formInstanceId: "not-a-uuid" }] }).success,
    ).toBe(false);
  });

  it("defaults additionalFields to []", () => {
    const { additionalFields: _omit, ...without } = ok;
    void _omit;
    const parsed = createDataPoolSchema.safeParse(without);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.additionalFields).toEqual([]);
  });

  it("caps additionalFields at 20 items", () => {
    const tooMany = Array.from({ length: 21 }, (_, i) => `f${i}`);
    expect(
      createDataPoolSchema.safeParse({ ...ok, additionalFields: tooMany }).success,
    ).toBe(false);
  });
});

describe("updateDataPoolSchema", () => {
  it("accepts an empty patch (no-op)", () => {
    expect(updateDataPoolSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a partial patch with just a name", () => {
    expect(updateDataPoolSchema.safeParse({ name: "renamed" }).success).toBe(true);
  });

  it("rejects sources: [] (a pool with zero sources is meaningless)", () => {
    expect(updateDataPoolSchema.safeParse({ sources: [] }).success).toBe(false);
  });
});

describe("addSubmissionExclusionSchema", () => {
  it("accepts a uuid submissionId", () => {
    const out = addSubmissionExclusionSchema.safeParse({ submissionId: validUuid, reason: "opted out by email" });
    expect(out.success).toBe(true);
  });

  it("rejects a non-uuid submissionId", () => {
    expect(addSubmissionExclusionSchema.safeParse({ submissionId: "x" }).success).toBe(false);
  });

  it("accepts a null reason", () => {
    expect(addSubmissionExclusionSchema.safeParse({ submissionId: validUuid, reason: null }).success).toBe(true);
  });
});
