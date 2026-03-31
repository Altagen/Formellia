"use client";

import type { PrintBlock } from "@/types/formActions";
import type { FieldDef } from "@/types/config";
import { PrintBlockCard } from "./PrintBlockCard";

interface PrintBodyEditorProps {
  blocks: PrintBlock[];
  fieldDefs: FieldDef[];
  addBlockLabel: string;
  blockLabels: React.ComponentProps<typeof PrintBlockCard>["labels"];
  onChange: (blocks: PrintBlock[]) => void;
}

export function PrintBodyEditor({ blocks, fieldDefs, addBlockLabel, blockLabels, onChange }: PrintBodyEditorProps) {
  function addBlock() {
    onChange([...blocks, { type: "paragraph", text: "" }]);
  }

  function updateBlock(index: number, block: PrintBlock) {
    const next = [...blocks];
    next[index] = block;
    onChange(next);
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  function moveBlock(index: number, dir: -1 | 1) {
    const next = [...blocks];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  return (
    <div className="space-y-2">
      {blocks.map((block, i) => (
        <PrintBlockCard
          key={i}
          block={block}
          index={i}
          total={blocks.length}
          fieldDefs={fieldDefs}
          labels={blockLabels}
          onChange={b => updateBlock(i, b)}
          onMoveUp={() => moveBlock(i, -1)}
          onMoveDown={() => moveBlock(i, 1)}
          onRemove={() => removeBlock(i)}
          nestedEditor={
            block.type === "conditional_block" ? (
              <PrintBodyEditor
                blocks={block.blocks}
                fieldDefs={fieldDefs}
                addBlockLabel={addBlockLabel}
                blockLabels={blockLabels}
                onChange={nestedBlocks => updateBlock(i, { ...block, blocks: nestedBlocks })}
              />
            ) : undefined
          }
        />
      ))}
      <button
        type="button"
        onClick={addBlock}
        className="w-full text-xs px-3 py-2 rounded border border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary transition-colors"
      >
        {addBlockLabel}
      </button>
    </div>
  );
}
