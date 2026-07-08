/**
 * Unit tests for the shared RFC 4180 CSV helpers used by the audit export
 * and any other admin download that emits spreadsheet data.
 */
import { describe, it, expect } from "vitest";
import { escapeCsvField, toCsv } from "@/lib/csv/rfc4180";

describe("escapeCsvField", () => {
  it("passes plain strings unchanged", () => {
    expect(escapeCsvField("hello")).toBe("hello");
  });

  it("returns empty for null / undefined", () => {
    expect(escapeCsvField(null)).toBe("");
    expect(escapeCsvField(undefined)).toBe("");
  });

  it("quotes fields with commas", () => {
    expect(escapeCsvField("one, two")).toBe(`"one, two"`);
  });

  it("quotes fields with double-quotes and doubles them", () => {
    expect(escapeCsvField(`he said "hi"`)).toBe(`"he said ""hi"""`);
  });

  it("quotes fields with newlines", () => {
    expect(escapeCsvField("line1\nline2")).toBe(`"line1\nline2"`);
  });

  it("quotes fields with CR (Windows-style)", () => {
    expect(escapeCsvField("line1\r\nline2")).toBe(`"line1\r\nline2"`);
  });

  it("emits Dates as ISO-8601", () => {
    const d = new Date("2026-05-01T12:34:56Z");
    expect(escapeCsvField(d)).toBe("2026-05-01T12:34:56.000Z");
  });

  it("JSON-stringifies objects and quotes the result", () => {
    const out = escapeCsvField({ a: 1, b: "x,y" });
    expect(out).toBe(`"{""a"":1,""b"":""x,y""}"`);
  });
});

describe("toCsv", () => {
  it("emits a header row followed by data rows", () => {
    const rows = [
      { id: "1", name: "Alice" },
      { id: "2", name: "Bob"   },
    ];
    const out = toCsv(rows, ["id", "name"]);
    expect(out).toBe("id,name\n1,Alice\n2,Bob");
  });

  it("emits empty cells for missing keys", () => {
    const rows = [{ id: "1" }] as { id: string; name?: string }[];
    const out = toCsv(rows, ["id", "name"]);
    expect(out).toBe("id,name\n1,");
  });

  it("survives round-trip with quoted, newlined, and JSON payloads", () => {
    const rows = [
      { id: "1", details: { note: 'said "hi"', addr: "1, main st" } },
    ];
    const out = toCsv(rows as unknown as Record<string, unknown>[], ["id", "details"]);
    // Header + 1 line = 2 lines exactly (the JSON payload's inner \n is quoted).
    expect(out.split("\n")).toHaveLength(2);
    expect(out).toContain(`"{""note"":""said \\""hi\\"""",""addr"":""1, main st""}"`);
  });
});
