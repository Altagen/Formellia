import { describe, it, expect } from "vitest";
import {
  ADDITIONAL_RECIPIENTS_MAX,
  parseAdditionalRecipients,
  normalizeAdditionalRecipients,
} from "@/lib/email/additionalRecipients";

describe("parseAdditionalRecipients", () => {
  it("splits on commas, semicolons, whitespace and newlines", () => {
    const r = parseAdditionalRecipients(`a@x.io, b@x.io; c@x.io\n d@x.io\te@x.io`);
    expect(r.valid).toEqual(["a@x.io", "b@x.io", "c@x.io", "d@x.io", "e@x.io"]);
    expect(r.invalid).toEqual([]);
  });

  it("lowercases and dedupes case-insensitively", () => {
    const r = parseAdditionalRecipients("Alice@X.io, alice@x.io, ALICE@X.IO");
    expect(r.valid).toEqual(["alice@x.io"]);
  });

  it("separates invalid tokens for UI surfacing", () => {
    const r = parseAdditionalRecipients("ok@x.io, not-an-email, @nope.io, no@");
    expect(r.valid).toEqual(["ok@x.io"]);
    expect(r.invalid).toEqual(["not-an-email", "@nope.io", "no@"]);
  });

  it("treats an empty / whitespace input as no addresses", () => {
    expect(parseAdditionalRecipients("")).toEqual({ valid: [], invalid: [] });
    expect(parseAdditionalRecipients("   \n  \t")).toEqual({ valid: [], invalid: [] });
  });

  it("ignores non-string input defensively", () => {
    // Cast through unknown — the public type is string, but a runtime caller
    // (e.g. a hand-crafted fetch from the network) could still send junk.
    const r = parseAdditionalRecipients(null as unknown as string);
    expect(r).toEqual({ valid: [], invalid: [] });
  });
});

describe("normalizeAdditionalRecipients", () => {
  it("trims, lowercases, dedupes and drops malformed entries", () => {
    const out = normalizeAdditionalRecipients([
      "  Alice@X.io  ",
      "alice@x.io",
      "bob@x.io",
      "not-an-email",
      "",
      123 as unknown as string,
    ]);
    expect(out).toEqual(["alice@x.io", "bob@x.io"]);
  });

  it("returns an empty array for non-array input", () => {
    expect(normalizeAdditionalRecipients(null)).toEqual([]);
    expect(normalizeAdditionalRecipients("alice@x.io" as unknown as string[])).toEqual([]);
  });
});

describe("ADDITIONAL_RECIPIENTS_MAX", () => {
  it("is a sane upper bound (not too small, not unbounded)", () => {
    expect(ADDITIONAL_RECIPIENTS_MAX).toBeGreaterThanOrEqual(100);
    expect(ADDITIONAL_RECIPIENTS_MAX).toBeLessThanOrEqual(10_000);
  });
});
