"use client";

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
  function update(idx: number, value: string) {
    const next = [...reasons];
    next[idx] = value;
    onChange(next);
  }
  function remove(idx: number) { onChange(reasons.filter((_, i) => i !== idx)); }
  function add()             { onChange([...reasons, ""]); }

  return (
    <div className="space-y-2">
      {reasons.length === 0 && (
        <p className="text-xs text-muted-foreground italic">{labelEmpty}</p>
      )}
      {reasons.map((r, idx) => (
        <div key={idx} className="flex items-center gap-2">
          <Input
            value={r}
            onChange={(e) => update(idx, e.target.value)}
            placeholder={labelPlaceholder}
            className="text-sm"
          />
          <Button
            type="button" variant="ghost" size="icon"
            onClick={() => remove(idx)}
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
