import { describe, it, expect } from "vitest";
import yaml from "js-yaml";
import { buildFormExportData, serializeFormInstanceToYaml } from "@/lib/yaml/formExporter";
import { buildViewExportData, serializeViewToYaml } from "@/lib/yaml/viewExporter";
import type { FormInstance } from "@/types/formInstance";
import type { AdminPage } from "@/types/config";

function makeForm(overrides: Partial<FormInstance["config"]> = {}): FormInstance {
  return {
    id:        "form-1",
    slug:      "contact",
    name:      "Contact",
    active:    true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    config: {
      meta: { name: "Contact", title: "", description: "", locale: "en" },
      page: { branding: { defaultTheme: "light" }, hero: { title: "", ctaLabel: "", backgroundVariant: "gradient" } },
      form: { steps: [{ id: "s1", title: "", fields: [{ id: "email", type: "email", label: "", placeholder: "", required: true }] }] },
      features: { form: true, landingPage: true },
      ...overrides,
    },
    _managedBy: "db",
  } as unknown as FormInstance;
}

describe("buildFormExportData", () => {
  it("omits `_managedBy` internal marker", () => {
    const exported = buildFormExportData(makeForm());
    expect(exported).not.toHaveProperty("_managedBy");
  });

  it("keeps only the preset-model notification fields (no legacy apiKey/provider strings)", () => {
    const withNotifs = makeForm({
      notifications: {
        enabled: true,
        webhookUrl: "https://hooks.example/x",
        email: {
          enabled: true,
          providerId: "prov-1",
          subject: "Hi",
          bodyText: "Hello {{name}}",
        },
      },
    } as FormInstance["config"]);

    const exported = buildFormExportData(withNotifs);
    const notifs = exported.notifications as Record<string, unknown>;
    const email  = notifs.email as Record<string, unknown>;

    expect(email).toEqual({
      enabled:    true,
      providerId: "prov-1",
      subject:    "Hi",
      bodyText:   "Hello {{name}}",
    });
    expect(email).not.toHaveProperty("apiKey");
    expect(email).not.toHaveProperty("apiKeyEncrypted");
    expect(email).not.toHaveProperty("provider");
    expect(email).not.toHaveProperty("fromAddress");
    expect(email).not.toHaveProperty("fromName");
  });

  it("skips undefined top-level fields (does not emit `field: undefined`)", () => {
    const minimal = buildFormExportData(makeForm());
    expect(minimal).not.toHaveProperty("customStatuses");
    expect(minimal).not.toHaveProperty("priorityThresholds");
    expect(minimal).not.toHaveProperty("security");
  });

  it("round-trips: YAML → parse → equals the export data", () => {
    const form = makeForm({
      notifications: {
        enabled: true,
        email:   { enabled: false, subject: "", bodyText: "" },
      },
    } as FormInstance["config"]);
    const y = serializeFormInstanceToYaml(form);
    const back = yaml.load(y);
    expect(back).toEqual(buildFormExportData(form));
  });

  it("outputs deterministic YAML without anchors (noRefs)", () => {
    const y = serializeFormInstanceToYaml(makeForm());
    expect(y).not.toMatch(/[*&]\w/);
  });
});

describe("buildViewExportData", () => {
  const base: AdminPage = {
    id:      "p-1",
    title:   "My view",
    slug:    "my-view",
    widgets: [],
  };

  it("emits only defined optional fields", () => {
    const exported = buildViewExportData(base);
    expect(exported).toEqual({
      id: "p-1", title: "My view", slug: "my-view", widgets: [],
    });
    expect(exported).not.toHaveProperty("icon");
    expect(exported).not.toHaveProperty("dataSourceId");
    expect(exported).not.toHaveProperty("formInstanceId");
    expect(exported).not.toHaveProperty("refreshInterval");
    expect(exported).not.toHaveProperty("flattenRepeater");
  });

  it("preserves optional fields when present", () => {
    const exported = buildViewExportData({
      ...base,
      icon: "chart-bar",
      formInstanceId: "form-1",
      refreshInterval: 30,
      showCompletionFunnel: false,
    });
    expect(exported.icon).toBe("chart-bar");
    expect(exported.formInstanceId).toBe("form-1");
    expect(exported.refreshInterval).toBe(30);
    expect(exported.showCompletionFunnel).toBe(false);
  });

  it("round-trips: YAML → parse → equals the export data", () => {
    const y = serializeViewToYaml({ ...base, icon: "layout-dashboard" });
    const back = yaml.load(y);
    expect(back).toEqual(buildViewExportData({ ...base, icon: "layout-dashboard" }));
  });
});
