import { describe, it, expect } from "vitest";
import { dedupKeysAcrossLists } from "@/lib/datapools/dedup";

describe("dedupKeysAcrossLists", () => {
  it("returns an empty array when no lists are passed", () => {
    expect(dedupKeysAcrossLists([])).toEqual([]);
  });

  it("returns the single list as-is when no duplicates", () => {
    expect(dedupKeysAcrossLists([["a@x", "b@x", "c@x"]])).toEqual(["a@x", "b@x", "c@x"]);
  });

  it("removes within-list duplicates", () => {
    expect(dedupKeysAcrossLists([["a@x", "a@x", "b@x"]])).toEqual(["a@x", "b@x"]);
  });

  it("removes cross-list duplicates, first occurrence wins", () => {
    const out = dedupKeysAcrossLists([
      ["a@x", "b@x"],
      ["b@x", "c@x"],
    ]);
    expect(out).toEqual(["a@x", "b@x", "c@x"]);
  });

  it("is case-insensitive on the comparison but keeps the first casing seen", () => {
    const out = dedupKeysAcrossLists([
      ["Alice@X.com"],
      ["alice@x.com", "BOB@x.com"],
    ]);
    expect(out).toEqual(["Alice@X.com", "BOB@x.com"]);
  });

  it("handles many lists with overlapping addresses", () => {
    const out = dedupKeysAcrossLists([
      ["a@x", "b@x"],
      ["b@x", "c@x"],
      ["a@x", "d@x"],
      ["e@x"],
    ]);
    expect(out).toEqual(["a@x", "b@x", "c@x", "d@x", "e@x"]);
  });

  it("preserves order of first occurrence", () => {
    const out = dedupKeysAcrossLists([
      ["z@x", "y@x"],
      ["a@x", "z@x"],
    ]);
    expect(out).toEqual(["z@x", "y@x", "a@x"]);
  });
});
