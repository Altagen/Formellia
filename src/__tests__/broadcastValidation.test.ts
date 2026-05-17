import { describe, it, expect } from "vitest";
import {
  createBroadcastSchema,
  updateBroadcastSchema,
  updateBroadcastConfigSchema,
  broadcastProviderSchema,
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

  it("requires at least one dataPoolId", () => {
    expect(createBroadcastSchema.safeParse({ ...ok, dataPoolIds: [] }).success).toBe(false);
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

describe("broadcastProviderSchema", () => {
  it.each(["resend", "sendgrid", "mailgun"])("accepts %s", (p) => {
    expect(broadcastProviderSchema.safeParse(p).success).toBe(true);
  });
  it("rejects unknown provider", () => {
    expect(broadcastProviderSchema.safeParse("postmark").success).toBe(false);
  });
});

describe("updateBroadcastConfigSchema", () => {
  it("accepts a full valid config", () => {
    const parsed = updateBroadcastConfigSchema.safeParse({
      provider: "resend",
      fromAddress: "from@example.com",
      fromName: "Org",
      apiKey: "re_xxx",
      apiKeyExpiresAt: "2027-01-01",
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid fromAddress", () => {
    expect(
      updateBroadcastConfigSchema.safeParse({ fromAddress: "not an email" }).success,
    ).toBe(false);
  });

  it("rejects expiry not in YYYY-MM-DD shape", () => {
    expect(
      updateBroadcastConfigSchema.safeParse({ apiKeyExpiresAt: "01-01-2027" }).success,
    ).toBe(false);
  });

  it("accepts apiKey: \"\" (clear)", () => {
    expect(updateBroadcastConfigSchema.safeParse({ apiKey: "" }).success).toBe(true);
  });

  it("accepts apiKey: null (clear)", () => {
    expect(updateBroadcastConfigSchema.safeParse({ apiKey: null }).success).toBe(true);
  });

  it("accepts provider: null (disable broadcasts)", () => {
    expect(updateBroadcastConfigSchema.safeParse({ provider: null }).success).toBe(true);
  });
});
