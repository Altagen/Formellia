import { describe, it, expect } from "vitest";
import { serializeConfigToString, serializeConfig } from "@/lib/serialization/serializeConfig";

function fakeReq(accept: string): { headers: { get: (name: string) => string | null } } {
  return { headers: { get: (name: string) => (name.toLowerCase() === "accept" ? accept : null) } };
}

describe("serializeConfigToString", () => {
  it("produces valid YAML without anchors (noRefs)", () => {
    const y = serializeConfigToString({ a: 1, b: [1, 2, 3] });
    expect(y).toMatch(/^a: 1/);
    expect(y).toContain("b:");
    expect(y).not.toMatch(/[*&]\w/);
  });
});

describe("serializeConfig (Accept-header dispatch)", () => {
  const payload = { hello: "world" };

  it("returns JSON when Accept: application/json", async () => {
    const res = serializeConfig(payload, fakeReq("application/json") as unknown as import("next/server").NextRequest);
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const text = await res.text();
    expect(JSON.parse(text)).toEqual(payload);
  });

  it("defaults to YAML when Accept is missing", async () => {
    const res = serializeConfig(payload, fakeReq("") as unknown as import("next/server").NextRequest);
    expect(res.headers.get("Content-Type")).toContain("application/x-yaml");
    expect(await res.text()).toContain("hello: world");
  });

  it("defaults to YAML when Accept is text/html or */*", async () => {
    const res = serializeConfig(payload, fakeReq("*/*") as unknown as import("next/server").NextRequest);
    expect(res.headers.get("Content-Type")).toContain("application/x-yaml");
  });

  it("sets Content-Disposition when filename is provided (YAML)", () => {
    const res = serializeConfig(payload, fakeReq("*/*") as unknown as import("next/server").NextRequest, "backup.yaml");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="backup.yaml"');
  });

  it("rewrites filename extension to .json for JSON responses", () => {
    const res = serializeConfig(payload, fakeReq("application/json") as unknown as import("next/server").NextRequest, "backup.yaml");
    expect(res.headers.get("Content-Disposition")).toBe('attachment; filename="backup.json"');
  });

  it("omits Content-Disposition when no filename is provided", () => {
    const res = serializeConfig(payload, fakeReq("*/*") as unknown as import("next/server").NextRequest);
    expect(res.headers.get("Content-Disposition")).toBeNull();
  });
});
