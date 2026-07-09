import { describe, it, expect } from "vitest";
import {
  createBroadcastSchema,
  updateBroadcastSchema,
} from "@/lib/email/broadcastValidation";

const validUuid = "01234567-89ab-4def-8123-456789abcdef";

describe("createBroadcastSchema", () => {
  const ok = {
    name: "First test",
    subject: "Hello",
    bodyHtml: "<p>Hi</p>",
    bodyText: "Hi",
    dataPoolIds: [validUuid],
  };

  it("accepts a well-formed input", () => {
    expect(createBroadcastSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts dataPoolIds: [] (composer allows all-ad-hoc broadcasts)", () => {
    // 0.3.x relaxed the legacy `min(1)` constraint when the composer learned
    // to accept free-text addresses on top of (or instead of) DataPools.
    // The /send endpoint still refuses when the merged recipient count is 0.
    expect(createBroadcastSchema.safeParse({ ...ok, dataPoolIds: [] }).success).toBe(true);
  });

  it("accepts an additionalRecipients array", () => {
    const parsed = createBroadcastSchema.safeParse({
      ...ok,
      additionalRecipients: ["a@x.io", "b@x.io"],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an additionalRecipients entry longer than the RFC 5321 limit", () => {
    const longAddr = "a".repeat(321);
    expect(
      createBroadcastSchema.safeParse({ ...ok, additionalRecipients: [longAddr] }).success,
    ).toBe(false);
  });

  it("rejects non-uuid dataPoolId", () => {
    expect(createBroadcastSchema.safeParse({ ...ok, dataPoolIds: ["not-a-uuid"] }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(createBroadcastSchema.safeParse({ ...ok, name: "" }).success).toBe(false);
  });

  it("rejects subject longer than 998 chars (RFC 5322)", () => {
    const longSubject = "x".repeat(999);
    expect(createBroadcastSchema.safeParse({ ...ok, subject: longSubject }).success).toBe(false);
  });

  it("defaults empty subject + body to empty strings", () => {
    const parsed = createBroadcastSchema.safeParse({ name: "x", dataPoolIds: [validUuid] });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.subject).toBe("");
      expect(parsed.data.bodyHtml).toBe("");
    }
  });
});

describe("updateBroadcastSchema", () => {
  it("accepts an empty patch", () => {
    expect(updateBroadcastSchema.safeParse({}).success).toBe(true);
  });

  it("accepts dataPoolIds: [] (transient empty state during pool re-selection)", () => {
    // The composer UI lets the operator uncheck every pool before re-checking
    // a different set. The PATCH must accept that transient state; the
    // SEND endpoint refuses to fire when the row's dataPoolIds is empty.
    expect(updateBroadcastSchema.safeParse({ dataPoolIds: [] }).success).toBe(true);
  });

  it("rejects non-uuid dataPoolId entries", () => {
    expect(updateBroadcastSchema.safeParse({ dataPoolIds: ["not-a-uuid"] }).success).toBe(false);
  });
});

