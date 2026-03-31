import { describe, it, expect } from "vitest";
import { parseBody } from "@/lib/serialization/parseBody";

// Minimal NextRequest-compatible stub: parseBody only needs headers.get() and text()
function makeReq(body: string, contentType = ""): Parameters<typeof parseBody>[0] {
  return {
    headers: { get: (h: string) => (h === "content-type" ? contentType : null) },
    text:    async () => body,
  } as unknown as Parameters<typeof parseBody>[0];
}

describe("parseBody — JSON path", () => {
  it("parses a valid JSON object", async () => {
    const result = await parseBody(makeReq('{"foo":"bar"}', "application/json"));
    expect(result).toEqual({ foo: "bar" });
  });

  it("parses JSON with charset parameter in content-type", async () => {
    const result = await parseBody(makeReq('{"x":1}', "application/json; charset=utf-8"));
    expect(result).toEqual({ x: 1 });
  });

  it("throws on invalid JSON", async () => {
    await expect(parseBody(makeReq("{bad json}", "application/json"))).rejects.toThrow("JSON invalide");
  });
});

describe("parseBody — YAML path", () => {
  it("parses a valid YAML object", async () => {
    const result = await parseBody(makeReq("foo: bar\nbaz: 42"));
    expect(result).toEqual({ foo: "bar", baz: 42 });
  });

  it("parses YAML with explicit yaml content-type", async () => {
    const result = await parseBody(makeReq("version: 1\n", "application/x-yaml"));
    expect(result).toEqual({ version: 1 });
  });

  it("throws on invalid YAML", async () => {
    await expect(parseBody(makeReq("key: [\nunclosed"))).rejects.toThrow("YAML invalide");
  });

  it("js-yaml v4 DEFAULT schema does NOT execute !!js/undefined tags", async () => {
    // In js-yaml v4, !!js/undefined is not supported by the DEFAULT schema — it throws
    await expect(parseBody(makeReq("key: !!js/undefined ~"))).rejects.toThrow();
  });
});

describe("parseBody — empty body", () => {
  it("throws on empty body", async () => {
    await expect(parseBody(makeReq(""))).rejects.toThrow("Empty request body");
  });

  it("throws on whitespace-only body", async () => {
    await expect(parseBody(makeReq("   \n  "))).rejects.toThrow("Empty request body");
  });
});
