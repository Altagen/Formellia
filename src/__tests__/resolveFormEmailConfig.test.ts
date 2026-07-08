/**
 * Post-UI-11 preset resolver. Locks in the four dispatch branches:
 *   1. Disabled template → gap "template_disabled" (no send attempted)
 *   2. Explicit providerId that exists → send via that preset (source: form)
 *   3. Explicit providerId that no longer exists BUT a default exists →
 *      send via the default (source: default) so operators aren't left
 *      dangling when a preset gets deleted
 *   4. No providerId + no default → gap "no_preset_referenced_and_no_default"
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the providers layer so the test doesn't need a real DB.
const mockGetById  = vi.fn();
const mockGetDefault = vi.fn();
vi.mock("@/lib/email/providers", () => ({
  getEmailProviderInternal: (id: string) => mockGetById(id),
  getDefaultEmailProvider:  () => mockGetDefault(),
}));

import { resolveFormEmailConfigFromDb } from "@/lib/email/resolveFormEmailConfig";

const PRESET_A = {
  id:               "preset-a",
  provider:         "resend" as const,
  fromAddress:      "team@example.com",
  fromName:         "Team",
  apiKeyEncrypted:  "enc-a",
  apiKeyExpiresAt:  null,
};

const PRESET_DEFAULT = {
  id:               "preset-default",
  provider:         "sendgrid" as const,
  fromAddress:      "default@example.com",
  fromName:         null,
  apiKeyEncrypted:  "enc-default",
  apiKeyExpiresAt:  null,
};

describe("resolveFormEmailConfigFromDb", () => {
  beforeEach(() => {
    mockGetById.mockReset();
    mockGetDefault.mockReset();
  });

  it("returns template_disabled when the form's email block is off", async () => {
    const result = await resolveFormEmailConfigFromDb({
      enabled: false, subject: "s", bodyText: "b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toBe("template_disabled");
    expect(mockGetById).not.toHaveBeenCalled();
    expect(mockGetDefault).not.toHaveBeenCalled();
  });

  it("resolves via the explicit preset when providerId points at an existing row", async () => {
    mockGetById.mockResolvedValueOnce(PRESET_A);
    const result = await resolveFormEmailConfigFromDb({
      enabled: true, providerId: "preset-a", subject: "hi", bodyText: "body",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providerId).toBe("preset-a");
      expect(result.config.apiKeySource).toBe("form");
      expect(result.config.provider).toBe("resend");
      expect(result.config.fromAddress).toBe("team@example.com");
      expect(result.config.subject).toBe("hi");
    }
    expect(mockGetDefault).not.toHaveBeenCalled();
  });

  it("falls back to the default preset when the referenced providerId no longer exists", async () => {
    mockGetById.mockResolvedValueOnce(null); // pointer is stale
    mockGetDefault.mockResolvedValueOnce(PRESET_DEFAULT);

    const result = await resolveFormEmailConfigFromDb({
      enabled: true, providerId: "ghost-uuid", subject: "s", bodyText: "b",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providerId).toBe("preset-default");
      expect(result.config.apiKeySource).toBe("default");
    }
  });

  it("returns referenced_preset_missing when the pointer is stale AND no default exists", async () => {
    mockGetById.mockResolvedValueOnce(null);
    mockGetDefault.mockResolvedValueOnce(null);

    const result = await resolveFormEmailConfigFromDb({
      enabled: true, providerId: "ghost", subject: "s", bodyText: "b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toBe("referenced_preset_missing");
  });

  it("uses the default preset when the form carries no providerId", async () => {
    mockGetDefault.mockResolvedValueOnce(PRESET_DEFAULT);

    const result = await resolveFormEmailConfigFromDb({
      enabled: true, subject: "s", bodyText: "b",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.providerId).toBe("preset-default");
      expect(result.config.apiKeySource).toBe("default");
    }
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it("returns no_preset_referenced_and_no_default when neither providerId nor default exist", async () => {
    mockGetDefault.mockResolvedValueOnce(null);
    const result = await resolveFormEmailConfigFromDb({
      enabled: true, subject: "s", bodyText: "b",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.gap.reason).toBe("no_preset_referenced_and_no_default");
  });
});
