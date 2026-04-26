"use client";

import type { PrintBlock } from "@/types/formActions";
import type { FieldDef } from "@/types/config";

interface PrintBlockCardProps {
  block: PrintBlock;
  index: number;
  total: number;
  fieldDefs: FieldDef[];
  labels: {
    typeHeading: string;
    typeParagraph: string;
    typeFieldValue: string;
    typeFieldList: string;
    typeDivider: string;
    typeHtml: string;
    typeConditional: string;
    typePageBreak: string;
    typeSignatureBox: string;
    headingText: string;
    headingLevel: string;
    headingAlign: string;
    headingColor: string;
    paragraphText: string;
    paragraphAlign: string;
    paragraphBold: string;
    paragraphItalic: string;
    textAlignLeft: string;
    textAlignCenter: string;
    textAlignRight: string;
    fieldIdLabel: string;
    fieldLabel: string;
    hideIfEmpty: string;
    fieldValueShowLabel: string;
    fieldValueInline: string;
    htmlContent: string;
    conditionField: string;
    conditionOperator: string;
    conditionValue: string;
    opEq: string;
    opNeq: string;
    opEmpty: string;
    opNotEmpty: string;
    chooseField: string;
    moveUp: string;
    moveDown: string;
    removeBlock: string;
    styleLabel: string;
    styleTable: string;
    styleList: string;
    headingPlaceholder: string;
    htmlPlaceholder: string;
    fieldListHint: string;
    conditionalNestedBlocks: string;
    dividerHint: string;
    pageBreakHint: string;
    showHeader: string;
    headerFieldLabel: string;
    headerValueLabel: string;
    defaultFieldHeader: string;
    defaultValueHeader: string;
    signatureLabel: string;
    signatureHint: string;
    signatureWidth: string;
    signatureHalf: string;
    signatureFull: string;
  };
  /** Rendered inside conditional_block to allow editing nested blocks inline. */
  nestedEditor?: React.ReactNode;
  onChange: (block: PrintBlock) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

function defaultBlock(type: PrintBlock["type"]): PrintBlock {
  switch (type) {
    case "heading":     return { type: "heading", text: "", level: 2 };
    case "paragraph":   return { type: "paragraph", text: "" };
    case "field_value": return { type: "field_value", fieldId: "" };
    case "field_list":  return { type: "field_list", style: "table" };
    case "divider":     return { type: "divider" };
    case "html":        return { type: "html", content: "" };
    case "page_break":  return { type: "page_break" };
    case "signature_box": return { type: "signature_box", width: "full" };
    case "conditional_block": return {
      type: "conditional_block",
      condition: { fieldId: "", operator: "not_empty" },
      blocks: [],
    };
    case "repeater_table": return { type: "repeater_table", fieldId: "" };
    default: return { type: "paragraph", text: "" };
  }
}

export function PrintBlockCard({
  block, index, total, fieldDefs, labels, nestedEditor,
  onChange, onMoveUp, onMoveDown, onRemove,
}: PrintBlockCardProps) {
  const inputClass = "w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const labelClass = "text-xs font-medium text-muted-foreground";

  const blockTypes: Array<{ value: PrintBlock["type"]; label: string }> = [
    { value: "heading",           label: labels.typeHeading },
    { value: "paragraph",         label: labels.typeParagraph },
    { value: "field_value",       label: labels.typeFieldValue },
    { value: "field_list",        label: labels.typeFieldList },
    { value: "divider",           label: labels.typeDivider },
    { value: "page_break",        label: labels.typePageBreak },
    { value: "signature_box",     label: labels.typeSignatureBox },
    { value: "html",              label: labels.typeHtml },
    { value: "conditional_block", label: labels.typeConditional },
  ];

  const alignOptions = [
    { value: "left",   label: labels.textAlignLeft },
    { value: "center", label: labels.textAlignCenter },
    { value: "right",  label: labels.textAlignRight },
  ];

  return (
    <div className="border border-border rounded-lg p-3 space-y-2 bg-card">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <select
            value={block.type}
            onChange={e => onChange(defaultBlock(e.target.value as PrintBlock["type"]))}
            className="text-xs px-2 py-1 rounded border border-border bg-background text-foreground focus:outline-none"
          >
            {blockTypes.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">#{index + 1}</span>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" onClick={onMoveUp} disabled={index === 0}
            className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            title={labels.moveUp}>▲</button>
          <button type="button" onClick={onMoveDown} disabled={index === total - 1}
            className="text-xs px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
            title={labels.moveDown}>▼</button>
          <button type="button" onClick={onRemove}
            className="text-xs px-1.5 py-0.5 rounded border border-destructive/30 text-destructive hover:bg-destructive/10"
            title={labels.removeBlock}>✕</button>
        </div>
      </div>

      {/* ── heading ── */}
      {block.type === "heading" && (
        <div className="space-y-1.5">
          <div>
            <p className={labelClass}>{labels.headingText}</p>
            <input
              type="text"
              value={block.text}
              onChange={e => onChange({ ...block, text: e.target.value })}
              className={inputClass}
              placeholder={labels.headingPlaceholder}
            />
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <p className={labelClass}>{labels.headingLevel}</p>
              <select
                value={block.level ?? 2}
                onChange={e => onChange({ ...block, level: Number(e.target.value) as 1|2|3 })}
                className={inputClass}
              >
                <option value={1}>H1</option>
                <option value={2}>H2</option>
                <option value={3}>H3</option>
              </select>
            </div>
            <div>
              <p className={labelClass}>{labels.headingAlign}</p>
              <select
                value={block.align ?? "left"}
                onChange={e => onChange({ ...block, align: e.target.value as "left"|"center"|"right" })}
                className={inputClass}
              >
                {alignOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <p className={labelClass}>{labels.headingColor}</p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={block.color ?? "#1e293b"}
                onChange={e => onChange({ ...block, color: e.target.value })}
                className="h-8 w-10 rounded border border-border cursor-pointer"
              />
              <input
                type="text"
                value={block.color ?? ""}
                onChange={e => onChange({ ...block, color: e.target.value || undefined })}
                className={inputClass}
                placeholder="#1e293b"
              />
              {block.color && (
                <button type="button" onClick={() => onChange({ ...block, color: undefined })}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── paragraph ── */}
      {block.type === "paragraph" && (
        <div className="space-y-1.5">
          <div>
            <p className={labelClass}>{labels.paragraphText}</p>
            <textarea
              value={block.text}
              onChange={e => onChange({ ...block, text: e.target.value })}
              rows={3}
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>{labels.paragraphAlign}</p>
            <select
              value={block.align ?? "left"}
              onChange={e => onChange({ ...block, align: e.target.value as "left"|"center"|"right" })}
              className={inputClass}
            >
              {alignOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={block.bold ?? false}
                onChange={e => onChange({ ...block, bold: e.target.checked })}
              />
              {labels.paragraphBold}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={block.italic ?? false}
                onChange={e => onChange({ ...block, italic: e.target.checked })}
              />
              {labels.paragraphItalic}
            </label>
          </div>
        </div>
      )}

      {/* ── field_value ── */}
      {block.type === "field_value" && (
        <div className="space-y-1.5">
          <div>
            <p className={labelClass}>{labels.fieldIdLabel}</p>
            <select
              value={block.fieldId}
              onChange={e => onChange({ ...block, fieldId: e.target.value })}
              className={inputClass}
            >
              <option value="">{labels.chooseField}</option>
              {fieldDefs.filter(f => f.type !== "section_header").map(f => (
                <option key={f.id} value={f.id}>{f.label || f.id}</option>
              ))}
            </select>
          </div>
          <div>
            <p className={labelClass}>{labels.fieldLabel}</p>
            <input
              type="text"
              value={block.label ?? ""}
              onChange={e => onChange({ ...block, label: e.target.value || undefined })}
              className={inputClass}
              placeholder={block.fieldId ? (fieldDefs.find(f => f.id === block.fieldId)?.label ?? block.fieldId) : ""}
            />
          </div>
          <div className="flex flex-wrap gap-4">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={block.hideIfEmpty ?? false}
                onChange={e => onChange({ ...block, hideIfEmpty: e.target.checked })}
              />
              {labels.hideIfEmpty}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={block.showLabel !== false}
                onChange={e => onChange({ ...block, showLabel: e.target.checked })}
              />
              {labels.fieldValueShowLabel}
            </label>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={block.inline ?? false}
                onChange={e => onChange({ ...block, inline: e.target.checked })}
              />
              {labels.fieldValueInline}
            </label>
          </div>
        </div>
      )}

      {/* ── field_list ── */}
      {block.type === "field_list" && (
        <div className="space-y-1.5">
          <div>
            <p className={labelClass}>{labels.styleLabel}</p>
            <select
              value={block.style ?? "table"}
              onChange={e => onChange({ ...block, style: e.target.value as "table"|"list" })}
              className={inputClass}
            >
              <option value="table">{labels.styleTable}</option>
              <option value="list">{labels.styleList}</option>
            </select>
          </div>
          {(block.style === "table" || !block.style) && (
            <>
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={block.showHeader ?? false}
                  onChange={e => onChange({
                    ...block,
                    showHeader: e.target.checked,
                    headerLabels: e.target.checked
                      ? { field: block.headerLabels?.field ?? labels.defaultFieldHeader, value: block.headerLabels?.value ?? labels.defaultValueHeader }
                      : undefined,
                  })}
                />
                {labels.showHeader}
              </label>
              {block.showHeader && (
                <div className="grid grid-cols-2 gap-1.5 pl-4">
                  <div>
                    <p className={labelClass}>{labels.headerFieldLabel}</p>
                    <input
                      type="text"
                      value={block.headerLabels?.field ?? ""}
                      onChange={e => onChange({ ...block, headerLabels: { ...block.headerLabels, field: e.target.value || undefined } })}
                      className={inputClass}
                      placeholder={labels.defaultFieldHeader}
                    />
                  </div>
                  <div>
                    <p className={labelClass}>{labels.headerValueLabel}</p>
                    <input
                      type="text"
                      value={block.headerLabels?.value ?? ""}
                      onChange={e => onChange({ ...block, headerLabels: { ...block.headerLabels, value: e.target.value || undefined } })}
                      className={inputClass}
                      placeholder={labels.defaultValueHeader}
                    />
                  </div>
                </div>
              )}
            </>
          )}
          <p className="text-xs text-muted-foreground italic">{labels.fieldListHint}</p>
        </div>
      )}

      {/* ── html ── */}
      {block.type === "html" && (
        <div>
          <p className={labelClass}>{labels.htmlContent}</p>
          <textarea
            value={block.content}
            onChange={e => onChange({ ...block, content: e.target.value })}
            rows={4}
            className={inputClass}
            placeholder={labels.htmlPlaceholder}
          />
        </div>
      )}

      {/* ── conditional_block ── */}
      {block.type === "conditional_block" && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-1.5">
            <div>
              <p className={labelClass}>{labels.conditionField}</p>
              <select
                value={block.condition.fieldId}
                onChange={e => onChange({ ...block, condition: { ...block.condition, fieldId: e.target.value } })}
                className={inputClass}
              >
                <option value="">{labels.chooseField}</option>
                {fieldDefs.filter(f => f.type !== "section_header").map(f => (
                  <option key={f.id} value={f.id}>{f.label || f.id}</option>
                ))}
              </select>
            </div>
            <div>
              <p className={labelClass}>{labels.conditionOperator}</p>
              <select
                value={block.condition.operator}
                onChange={e => onChange({ ...block, condition: { ...block.condition, operator: e.target.value as "eq"|"neq"|"empty"|"not_empty" } })}
                className={inputClass}
              >
                <option value="eq">{labels.opEq}</option>
                <option value="neq">{labels.opNeq}</option>
                <option value="empty">{labels.opEmpty}</option>
                <option value="not_empty">{labels.opNotEmpty}</option>
              </select>
            </div>
            {(block.condition.operator === "eq" || block.condition.operator === "neq") && (
              <div>
                <p className={labelClass}>{labels.conditionValue}</p>
                <input
                  type="text"
                  value={block.condition.value ?? ""}
                  onChange={e => onChange({ ...block, condition: { ...block.condition, value: e.target.value } })}
                  className={inputClass}
                />
              </div>
            )}
          </div>

          {/* Nested blocks editor — passed by PrintBodyEditor */}
          {nestedEditor && (
            <div className="pl-3 border-l-2 border-primary/20 space-y-1 pt-1">
              <p className="text-xs font-medium text-muted-foreground">{labels.conditionalNestedBlocks}</p>
              {nestedEditor}
            </div>
          )}
        </div>
      )}

      {/* ── divider / page_break / signature_box ── */}
      {block.type === "divider" && (
        <p className="text-xs text-muted-foreground italic">{labels.dividerHint}</p>
      )}

      {block.type === "page_break" && (
        <p className="text-xs text-muted-foreground italic">{labels.pageBreakHint}</p>
      )}

      {block.type === "signature_box" && (
        <div className="space-y-1.5">
          <div>
            <p className={labelClass}>{labels.signatureLabel}</p>
            <input
              type="text"
              value={block.label ?? ""}
              onChange={e => onChange({ ...block, label: e.target.value || undefined })}
              className={inputClass}
              placeholder="Signature"
            />
          </div>
          <div>
            <p className={labelClass}>{labels.signatureHint}</p>
            <input
              type="text"
              value={block.hint ?? ""}
              onChange={e => onChange({ ...block, hint: e.target.value || undefined })}
              className={inputClass}
            />
          </div>
          <div>
            <p className={labelClass}>{labels.signatureWidth}</p>
            <select
              value={block.width ?? "full"}
              onChange={e => onChange({ ...block, width: e.target.value as "half"|"full" })}
              className={inputClass}
            >
              <option value="full">{labels.signatureFull}</option>
              <option value="half">{labels.signatureHalf}</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
