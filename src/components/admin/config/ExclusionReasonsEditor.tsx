"use client";

import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X } from "lucide-react";

/**
 * Editor for the operator-defined exclusion reasons surfaced as dropdown
 * suggestions in the DataPool exclusion dialog. Kept deliberately simple —
 * no drag-to-reorder, no validation beyond trim+dedup at the parent's
 * `onChange` boundary. The values are short policy labels, not freeform
 * content, so the editor stays compact.
 *
 * Extracted from ViewsTab in 0.3.0 when the exclusion list moved out of
 * the Views config tab into its own DataPools tab.
 */
export function ExclusionReasonsEditor({
  reasons, onChange, labelAdd, labelPlaceholder, labelRemove, labelEmpty,
}: {
  reasons: string[];
  onChange: (next: string[]) => void;
  labelAdd: string;
  labelPlaceholder: string;
  labelRemove: string;
  labelEmpty: string;
}) {
  // Editor maintains stable per-row identity so the input keeps focus / IME
  // composition when the operator deletes a sibling row. The parent only sees
  // `string[]`, so we track our own (id, value) shadow state and sync it back
  // through onChange. Removing a row by id avoids the index-shift focus loss
  // that `key={idx}` causes.
  const idCounter = useRef(0);
  const newId = () => `row-${idCounter.current++}`;
  type Row = { id: string; value: string };
  const [rows, setRows] = useState<Row[]>(() => reasons.map((v) => ({ id: newId(), value: v })));

  // Re-sync when the prop changes due to an external reset (e.g. parent
  // discards draft). Skip when the prop matches our state — the common case
  // is "onChange just bubbled, now reasons === rows.map(r => r.value)" and
  // re-creating IDs there would defeat the whole purpose.
  useEffect(() => {
    setRows((prev) => {
      const matches =
        prev.length === reasons.length && prev.every((p, i) => p.value === reasons[i]);
      if (matches) return prev;
      return reasons.map((v, i) => ({ id: prev[i]?.id ?? newId(), value: v }));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reasons]);

  function commit(next: Row[]) {
    setRows(next);
    onChange(next.map((r) => r.value));
  }
  function update(id: string, value: string) {
    commit(rows.map((r) => (r.id === id ? { ...r, value } : r)));
  }
  function remove(id: string) { commit(rows.filter((r) => r.id !== id)); }
  function add()              { commit([...rows, { id: newId(), value: "" }]); }

  return (
    <div className="space-y-2">
      {rows.length === 0 && (
        <p className="text-xs text-muted-foreground italic">{labelEmpty}</p>
      )}
      {rows.map((row) => (
        <div key={row.id} className="flex items-center gap-2">
          <Input
            value={row.value}
            onChange={(e) => update(row.id, e.target.value)}
            placeholder={labelPlaceholder}
            className="text-sm"
          />
          <Button
            type="button" variant="ghost" size="icon"
            onClick={() => remove(row.id)}
            title={labelRemove}
            className="h-9 w-9 text-muted-foreground hover:text-destructive shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
        <Plus className="w-3.5 h-3.5" /> {labelAdd}
      </Button>
    </div>
  );
}
