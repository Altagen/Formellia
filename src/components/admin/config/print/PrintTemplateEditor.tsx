"use client";

import { useState } from "react";
import type { PrintTemplate } from "@/types/formActions";
import type { FieldDef } from "@/types/config";
import { PrintBodyEditor } from "./PrintBodyEditor";
import { PrintPreviewModal } from "./PrintPreviewModal";

interface PrintTemplateEditorProps {
  template: PrintTemplate;
  fieldDefs: FieldDef[];
  formName?: string;
  formLocale?: string;
  logoUrl?: string;
  brandColor?: string;
  labels: {
    documentSection: string;
    orientationLabel: string;
    orientationPortrait: string;
    orientationLandscape: string;
    marginsLabel: string;
    marginTop: string;
    marginRight: string;
    marginBottom: string;
    marginLeft: string;
    marginUnit: string;
    headerSection: string;
    bodySection: string;
    footerSection: string;
    watermarkSection: string;
    showLogo: string;
    logoAlign: string;
    logoAlignLeft: string;
    logoAlignRight: string;
    logoHeight: string;
    title: string;
    subtitle: string;
    showDate: string;
    footerText: string;
    footerShowPageNumbers: string;
    pageNumberFormat: string;
    pageNumFormatNofM: string;
    pageNumFormatN: string;
    pageNumFormatDash: string;
    footerShowLogo: string;
    footerLogoAlign: string;
    footerLogoAlignLeft: string;
    footerLogoAlignCenter: string;
    footerLogoAlignRight: string;
    watermarkEnabled: string;
    watermarkText: string;
    watermarkOpacity: string;
    watermarkAngle: string;
    watermarkFontSize: string;
    watermarkColor: string;
    addBlock: string;
    blockType: string;
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
    previewButton: string;
    previewClose: string;
    previewMockNotice: string;
  };
  onChange: (template: PrintTemplate) => void;
}

type Section = "document" | "header" | "body" | "footer" | "watermark";

export function PrintTemplateEditor({
  template, fieldDefs, formName, formLocale, logoUrl, brandColor, labels, onChange,
}: PrintTemplateEditorProps) {
  const [open, setOpen] = useState<Section>("body");
  const [showPreview, setShowPreview] = useState(false);

  const toggle = (s: Section) => setOpen(prev => prev === s ? "body" : s);

  const inputClass = "w-full px-2 py-1.5 text-xs rounded border border-border bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary";
  const labelClass = "text-xs font-medium text-muted-foreground";

  function SectionHeader({ id, title }: { id: Section; title: string }) {
    return (
      <button
        type="button"
        onClick={() => toggle(id)}
        className={`w-full flex items-center justify-between px-3 py-2 text-xs font-semibold rounded-lg transition-colors ${
          open === id
            ? "bg-primary/10 text-primary"
            : "bg-muted/50 text-muted-foreground hover:text-foreground"
        }`}
      >
        <span>{title}</span>
        <span>{open === id ? "▲" : "▼"}</span>
      </button>
    );
  }

  const blockLabels = {
    typeHeading: labels.typeHeading,
    typeParagraph: labels.typeParagraph,
    typeFieldValue: labels.typeFieldValue,
    typeFieldList: labels.typeFieldList,
    typeDivider: labels.typeDivider,
    typeHtml: labels.typeHtml,
    typeConditional: labels.typeConditional,
    typePageBreak: labels.typePageBreak,
    typeSignatureBox: labels.typeSignatureBox,
    headingText: labels.headingText,
    headingLevel: labels.headingLevel,
    headingAlign: labels.headingAlign,
    headingColor: labels.headingColor,
    paragraphText: labels.paragraphText,
    paragraphAlign: labels.paragraphAlign,
    paragraphBold: labels.paragraphBold,
    paragraphItalic: labels.paragraphItalic,
    textAlignLeft: labels.textAlignLeft,
    textAlignCenter: labels.textAlignCenter,
    textAlignRight: labels.textAlignRight,
    fieldIdLabel: labels.fieldIdLabel,
    fieldLabel: labels.fieldLabel,
    hideIfEmpty: labels.hideIfEmpty,
    fieldValueShowLabel: labels.fieldValueShowLabel,
    fieldValueInline: labels.fieldValueInline,
    htmlContent: labels.htmlContent,
    conditionField: labels.conditionField,
    conditionOperator: labels.conditionOperator,
    conditionValue: labels.conditionValue,
    opEq: labels.opEq,
    opNeq: labels.opNeq,
    opEmpty: labels.opEmpty,
    opNotEmpty: labels.opNotEmpty,
    chooseField: labels.chooseField,
    moveUp: labels.moveUp,
    moveDown: labels.moveDown,
    removeBlock: labels.removeBlock,
    styleLabel: labels.styleLabel,
    styleTable: labels.styleTable,
    styleList: labels.styleList,
    headingPlaceholder: labels.headingPlaceholder,
    htmlPlaceholder: labels.htmlPlaceholder,
    fieldListHint: labels.fieldListHint,
    conditionalNestedBlocks: labels.conditionalNestedBlocks,
    dividerHint: labels.dividerHint,
    pageBreakHint: labels.pageBreakHint,
    showHeader: labels.showHeader,
    headerFieldLabel: labels.headerFieldLabel,
    headerValueLabel: labels.headerValueLabel,
    defaultFieldHeader: labels.defaultFieldHeader,
    defaultValueHeader: labels.defaultValueHeader,
    signatureLabel: labels.signatureLabel,
    signatureHint: labels.signatureHint,
    signatureWidth: labels.signatureWidth,
    signatureHalf: labels.signatureHalf,
    signatureFull: labels.signatureFull,
  };

  return (
    <>
      <div className="space-y-2 mt-2">
        {/* Preview button */}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setShowPreview(true)}
            className="text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground hover:bg-muted/60 hover:border-primary/40 transition-colors font-medium"
          >
            👁 {labels.previewButton}
          </button>
        </div>

        {/* ── Document section — orientation + margins ── */}
        <SectionHeader id="document" title={labels.documentSection} />
        {open === "document" && (
          <div className="px-3 py-2 space-y-3 rounded-lg border border-border bg-card/50">
            <div>
              <p className={labelClass}>{labels.orientationLabel}</p>
              <select
                value={template.orientation ?? "portrait"}
                onChange={e => onChange({ ...template, orientation: e.target.value as "portrait" | "landscape" })}
                className={inputClass}
              >
                <option value="portrait">{labels.orientationPortrait}</option>
                <option value="landscape">{labels.orientationLandscape}</option>
              </select>
            </div>

            <div>
              <p className={labelClass}>{labels.marginsLabel} ({labels.marginUnit})</p>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {(["top", "right", "bottom", "left"] as const).map(side => (
                  <div key={side}>
                    <p className="text-[10px] text-muted-foreground text-center mb-0.5">
                      {labels[`margin${side.charAt(0).toUpperCase() + side.slice(1)}` as "marginTop"|"marginRight"|"marginBottom"|"marginLeft"]}
                    </p>
                    <input
                      type="number"
                      min={0}
                      max={50}
                      value={template.margins?.[side] ?? 20}
                      onChange={e => onChange({
                        ...template,
                        margins: { ...template.margins, [side]: Number(e.target.value) },
                      })}
                      className={inputClass + " text-center"}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Header section ── */}
        <SectionHeader id="header" title={labels.headerSection} />
        {open === "header" && (
          <div className="px-3 py-2 space-y-2 rounded-lg border border-border bg-card/50">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={template.header?.showLogo ?? false}
                onChange={e => onChange({ ...template, header: { ...template.header, showLogo: e.target.checked } })}
              />
              {labels.showLogo}
            </label>
            {template.header?.showLogo && (
              <div className="grid grid-cols-2 gap-1.5 pl-4">
                <div>
                  <p className={labelClass}>{labels.logoAlign}</p>
                  <select
                    value={template.header?.logoAlign ?? "left"}
                    onChange={e => onChange({ ...template, header: { ...template.header, logoAlign: e.target.value as "left"|"right" } })}
                    className={inputClass}
                  >
                    <option value="left">{labels.logoAlignLeft}</option>
                    <option value="right">{labels.logoAlignRight}</option>
                  </select>
                </div>
                <div>
                  <p className={labelClass}>{labels.logoHeight} (px)</p>
                  <input
                    type="number"
                    min={16}
                    max={120}
                    value={template.header?.logoHeight ?? 48}
                    onChange={e => onChange({ ...template, header: { ...template.header, logoHeight: Number(e.target.value) } })}
                    className={inputClass}
                  />
                </div>
              </div>
            )}
            <div>
              <p className={labelClass}>{labels.title}</p>
              <input
                type="text"
                value={template.header?.title ?? ""}
                onChange={e => onChange({ ...template, header: { ...template.header, title: e.target.value || undefined } })}
                className={inputClass}
                placeholder="{{formName}}"
              />
            </div>
            <div>
              <p className={labelClass}>{labels.subtitle}</p>
              <input
                type="text"
                value={template.header?.subtitle ?? ""}
                onChange={e => onChange({ ...template, header: { ...template.header, subtitle: e.target.value || undefined } })}
                className={inputClass}
                placeholder="{{submittedAt}}"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={template.header?.showDate ?? false}
                onChange={e => onChange({ ...template, header: { ...template.header, showDate: e.target.checked } })}
              />
              {labels.showDate}
            </label>
          </div>
        )}

        {/* ── Body section ── */}
        <SectionHeader id="body" title={labels.bodySection} />
        {open === "body" && (
          <div className="px-3 py-2 rounded-lg border border-border bg-card/50">
            <PrintBodyEditor
              blocks={template.body}
              fieldDefs={fieldDefs}
              addBlockLabel={labels.addBlock}
              blockLabels={blockLabels}
              onChange={blocks => onChange({ ...template, body: blocks })}
            />
          </div>
        )}

        {/* ── Footer section ── */}
        <SectionHeader id="footer" title={labels.footerSection} />
        {open === "footer" && (
          <div className="px-3 py-2 space-y-2 rounded-lg border border-border bg-card/50">
            <div>
              <p className={labelClass}>{labels.footerText}</p>
              <input
                type="text"
                value={template.footer?.text ?? ""}
                onChange={e => onChange({ ...template, footer: { ...template.footer, text: e.target.value || undefined } })}
                className={inputClass}
                placeholder="{{formName}} — {{submittedAt}}"
              />
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={template.footer?.showPageNumbers ?? false}
                onChange={e => onChange({ ...template, footer: { ...template.footer, showPageNumbers: e.target.checked } })}
              />
              {labels.footerShowPageNumbers}
            </label>
            {template.footer?.showPageNumbers && (
              <div className="pl-4">
                <p className={labelClass}>{labels.pageNumberFormat}</p>
                <select
                  value={template.footer?.pageNumberFormat ?? "n_of_m"}
                  onChange={e => onChange({ ...template, footer: { ...template.footer, pageNumberFormat: e.target.value as "n_of_m"|"n"|"dash_n" } })}
                  className={inputClass}
                >
                  <option value="n_of_m">{labels.pageNumFormatNofM}</option>
                  <option value="n">{labels.pageNumFormatN}</option>
                  <option value="dash_n">{labels.pageNumFormatDash}</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={template.footer?.showLogo ?? false}
                onChange={e => onChange({ ...template, footer: { ...template.footer, showLogo: e.target.checked } })}
              />
              {labels.footerShowLogo}
            </label>
            {template.footer?.showLogo && (
              <div className="pl-4">
                <p className={labelClass}>{labels.footerLogoAlign}</p>
                <select
                  value={template.footer?.logoAlign ?? "left"}
                  onChange={e => onChange({ ...template, footer: { ...template.footer, logoAlign: e.target.value as "left"|"center"|"right" } })}
                  className={inputClass}
                >
                  <option value="left">{labels.footerLogoAlignLeft}</option>
                  <option value="center">{labels.footerLogoAlignCenter}</option>
                  <option value="right">{labels.footerLogoAlignRight}</option>
                </select>
              </div>
            )}
          </div>
        )}

        {/* ── Watermark section ── */}
        <SectionHeader id="watermark" title={labels.watermarkSection} />
        {open === "watermark" && (
          <div className="px-3 py-2 space-y-2 rounded-lg border border-border bg-card/50">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={!!template.watermark}
                onChange={e => onChange({
                  ...template,
                  watermark: e.target.checked ? { text: "CONFIDENTIEL", opacity: 0.12, angle: -45, fontSize: 80 } : undefined,
                })}
              />
              {labels.watermarkEnabled}
            </label>
            {template.watermark && (
              <>
                <div>
                  <p className={labelClass}>{labels.watermarkText}</p>
                  <input
                    type="text"
                    value={template.watermark.text}
                    onChange={e => onChange({ ...template, watermark: { ...template.watermark!, text: e.target.value } })}
                    className={inputClass}
                  />
                </div>
                <div>
                  <p className={labelClass}>{labels.watermarkColor}</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={template.watermark.color ?? "#000000"}
                      onChange={e => onChange({ ...template, watermark: { ...template.watermark!, color: e.target.value } })}
                      className="h-8 w-10 rounded border border-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={template.watermark.color ?? ""}
                      onChange={e => onChange({ ...template, watermark: { ...template.watermark!, color: e.target.value || undefined } })}
                      className={inputClass}
                      placeholder="#000000"
                    />
                    {template.watermark.color && (
                      <button type="button"
                        onClick={() => onChange({ ...template, watermark: { ...template.watermark!, color: undefined } })}
                        className="text-xs text-muted-foreground hover:text-foreground shrink-0">✕</button>
                    )}
                  </div>
                </div>
                <div>
                  <p className={labelClass}>{labels.watermarkOpacity} ({Math.round((template.watermark.opacity ?? 0.12) * 100)}%)</p>
                  <input
                    type="range" min={1} max={60}
                    value={Math.round((template.watermark.opacity ?? 0.12) * 100)}
                    onChange={e => onChange({ ...template, watermark: { ...template.watermark!, opacity: Number(e.target.value) / 100 } })}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className={labelClass}>{labels.watermarkAngle} ({template.watermark.angle ?? -45}°)</p>
                  <input
                    type="range" min={-90} max={90}
                    value={template.watermark.angle ?? -45}
                    onChange={e => onChange({ ...template, watermark: { ...template.watermark!, angle: Number(e.target.value) } })}
                    className="w-full"
                  />
                </div>
                <div>
                  <p className={labelClass}>{labels.watermarkFontSize} ({template.watermark.fontSize ?? 80}px)</p>
                  <input
                    type="range" min={20} max={200}
                    value={template.watermark.fontSize ?? 80}
                    onChange={e => onChange({ ...template, watermark: { ...template.watermark!, fontSize: Number(e.target.value) } })}
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Live preview modal */}
      {showPreview && (
        <PrintPreviewModal
          template={template}
          fieldDefs={fieldDefs}
          formName={formName}
          formLocale={formLocale}
          logoUrl={logoUrl}
          brandColor={brandColor}
          closeLabel={labels.previewClose}
          mockNotice={labels.previewMockNotice}
          onClose={() => setShowPreview(false)}
        />
      )}
    </>
  );
}
