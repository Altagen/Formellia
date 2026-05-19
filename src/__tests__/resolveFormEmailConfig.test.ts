import { describe, it, expect } from "vitest";
import { resolveFormEmailConfig } from "@/lib/email/resolveFormEmailConfig";
import type { GlobalEmailConfigInternal } from "@/lib/email/globalEmailConfig";
import type { EmailNotificationConfig } from "@/types/formInstance";

const fullGlobal: GlobalEmailConfigInternal = {
  provider:         "resend",
  fromAddress:      "global@example.org",
  fromName:         "Global Org",
  apiKeyConfigured: true,
  apiKeyExpiresAt:  null,
  apiKeyEncrypted:  "cur:enc:globalkey",
};

describe("resolveFormEmailConfig", () => {
  it("falls back to global when the per-form override is undefined", () => {
    const r = resolveFormEmailConfig(undefined, fullGlobal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.provider).toBe("resend");
      expect(r.config.fromAddress).toBe("global@example.org");
      expect(r.config.fromName).toBe("Global Org");
      expect(r.config.apiKeyEncrypted).toBe("cur:enc:globalkey");
      expect(r.config.apiKeySource).toBe("global");
    }
  });

  it("per-form override wins on each field independently", () => {
    const form: EmailNotificationConfig = {
      enabled: true,
      fromAddress: "form@special.example",
      // No apiKey override → still uses global key
      subject:  "x",
      bodyText: "y",
    };
    const r = resolveFormEmailConfig(form, fullGlobal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.fromAddress).toBe("form@special.example");
      expect(r.config.fromName).toBe("Global Org");        // inherited
      expect(r.config.apiKeyEncrypted).toBe("cur:enc:globalkey");
      expect(r.config.apiKeySource).toBe("global");
    }
  });

  it("uses the per-form API key + expiry when an override key is set", () => {
    const form: EmailNotificationConfig = {
      enabled: true,
      apiKeyEncrypted: "cur:enc:formkey",
      apiKeyExpiresAt: "2099-01-01",
      subject: "x", bodyText: "y",
    };
    const r = resolveFormEmailConfig(form, fullGlobal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.apiKeyEncrypted).toBe("cur:enc:formkey");
      expect(r.config.apiKeyExpiresAt).toBe("2099-01-01");
      expect(r.config.apiKeySource).toBe("form");
    }
  });

  it("empty strings in the per-form override are treated as 'not set'", () => {
    const form: EmailNotificationConfig = {
      enabled: true,
      fromAddress: "   ",
      apiKeyEncrypted: "",
      subject: "x", bodyText: "y",
    };
    const r = resolveFormEmailConfig(form, fullGlobal);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.config.fromAddress).toBe("global@example.org");
      expect(r.config.apiKeyEncrypted).toBe("cur:enc:globalkey");
    }
  });

  it("returns a gap when neither side fills required fields", () => {
    const blankGlobal: GlobalEmailConfigInternal = {
      provider: null, fromAddress: null, fromName: null,
      apiKeyConfigured: false, apiKeyExpiresAt: null, apiKeyEncrypted: null,
    };
    const r = resolveFormEmailConfig(undefined, blankGlobal);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.gap.missing.sort()).toEqual(["apiKey", "fromAddress", "provider"]);
    }
  });

  it("reports partial gap when the form fills some but not all fields", () => {
    const blankGlobal: GlobalEmailConfigInternal = {
      provider: null, fromAddress: null, fromName: null,
      apiKeyConfigured: false, apiKeyExpiresAt: null, apiKeyEncrypted: null,
    };
    const form: EmailNotificationConfig = {
      enabled: true,
      provider: "sendgrid",
      fromAddress: "form@example.org",
      // missing apiKey → gap.missing should only be ["apiKey"]
      subject: "x", bodyText: "y",
    };
    const r = resolveFormEmailConfig(form, blankGlobal);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.gap.missing).toEqual(["apiKey"]);
    }
  });
});
