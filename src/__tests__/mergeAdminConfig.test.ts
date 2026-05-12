import { describe, it, expect } from "vitest";
import { mergeAdminPages, mergeTableColumns } from "@/lib/admin/mergeAdminConfig";
import type { AdminPage, TableColumnDef } from "@/types/config";

function page(id: string, title = id): AdminPage {
  return { id, title, slug: id, widgets: [] } as AdminPage;
}
function col(id: string, label = id): TableColumnDef {
  return { id, label, source: id } as TableColumnDef;
}

describe("mergeAdminPages", () => {
  const current = [page("a"), page("b"), page("c")];

  it("replace mode returns the incoming list verbatim", () => {
    const incoming = [page("x"), page("a")];
    expect(mergeAdminPages(current, incoming, "replace")).toBe(incoming);
  });

  it("append mode keeps untouched pages and appends new ones at the end", () => {
    const out = mergeAdminPages(current, [page("d")], "append");
    expect(out.map(p => p.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("append mode updates a same-id page in place, preserving order", () => {
    const out = mergeAdminPages(current, [page("b", "B-updated")], "append");
    expect(out.map(p => p.id)).toEqual(["a", "b", "c"]);
    expect(out.find(p => p.id === "b")?.title).toBe("B-updated");
  });

  it("append mode mixes updates and additions", () => {
    const out = mergeAdminPages(current, [page("a", "A2"), page("z")], "append");
    expect(out.map(p => p.id)).toEqual(["a", "b", "c", "z"]);
    expect(out.find(p => p.id === "a")?.title).toBe("A2");
  });

  it("append mode throws when an incoming page has no id", () => {
    expect(() => mergeAdminPages(current, [{ title: "x", slug: "x", widgets: [] } as unknown as AdminPage], "append")).toThrow();
  });

  it("append into an empty config just adds the pages", () => {
    expect(mergeAdminPages([], [page("a"), page("b")], "append").map(p => p.id)).toEqual(["a", "b"]);
  });
});

describe("mergeTableColumns", () => {
  const current = [col("c1"), col("c2")];

  it("replace mode returns incoming verbatim", () => {
    const incoming = [col("c9")];
    expect(mergeTableColumns(current, incoming, "replace")).toBe(incoming);
  });

  it("append mode upserts by id, preserving order", () => {
    const out = mergeTableColumns(current, [col("c2", "C2!"), col("c3")], "append");
    expect(out.map(c => c.id)).toEqual(["c1", "c2", "c3"]);
    expect(out.find(c => c.id === "c2")?.label).toBe("C2!");
  });

  it("append mode throws when an incoming column has no id", () => {
    expect(() => mergeTableColumns(current, [{ label: "x", source: "x" } as unknown as TableColumnDef], "append")).toThrow();
  });
});
