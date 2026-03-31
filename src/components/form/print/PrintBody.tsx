"use client";

import DOMPurify from "isomorphic-dompurify";
import type { PrintBlock, PrintCondition } from "@/types/formActions";
import type { PrintInterpolationVars } from "@/types/formActions";
import { interpolate } from "@/lib/print/interpolate";

interface PrintBodyProps {
  blocks: PrintBlock[];
  vars: PrintInterpolationVars;
  brandColor?: string;
}

function evaluateCondition(
  condition: PrintCondition,
  vars: PrintInterpolationVars
): boolean {
  const value = vars.fields[condition.fieldId] ?? "";
  switch (condition.operator) {
    case "eq":        return value === (condition.value ?? "");
    case "neq":       return value !== (condition.value ?? "");
    case "empty":     return value === "";
    case "not_empty": return value !== "";
    default:          return false; // unknown operator → hide block (safe fail)
  }
}

function PrintBlockRenderer({
  block,
  vars,
  index,
  brandColor,
}: {
  block: PrintBlock;
  vars: PrintInterpolationVars;
  index: number;
  brandColor?: string;
}) {
  const accent = brandColor ?? "#1e293b";
  // Tinted border for table rows: 20% opacity of brand color, or a neutral slate
  const rowBorder = brandColor ? `${brandColor}33` : "#e2e8f0";

  switch (block.type) {
    case "heading": {
      const Tag = (`h${block.level ?? 2}`) as "h1" | "h2" | "h3";
      const fontSizes: Record<number, string> = { 1: "22px", 2: "18px", 3: "15px" };
      return (
        <Tag
          key={index}
          style={{
            margin: "20px 0 8px",
            fontSize: fontSizes[block.level ?? 2],
            fontWeight: 700,
            color: block.color ?? accent,
            lineHeight: 1.3,
            textAlign: block.align ?? "left",
          }}
        >
          {interpolate(block.text, vars)}
        </Tag>
      );
    }

    case "paragraph":
      return (
        <p
          key={index}
          style={{
            margin: "8px 0",
            fontSize: "13px",
            color: "#334155",
            lineHeight: 1.6,
            textAlign: block.align ?? "left",
            fontWeight: block.bold ? 700 : 400,
            fontStyle: block.italic ? "italic" : "normal",
          }}
        >
          {interpolate(block.text, vars)}
        </p>
      );

    case "field_value": {
      const rawVal = vars.fields[block.fieldId] ?? "";
      if (block.hideIfEmpty && !rawVal) return null;
      const showLabel = block.showLabel !== false; // default: true
      const label = block.label ?? vars.fieldLabels[block.fieldId] ?? block.fieldId;

      if (block.inline) {
        return (
          <div key={index} style={{ margin: "6px 0", fontSize: "13px" }}>
            {showLabel && (
              <span style={{ fontWeight: 600, color: "#475569", marginRight: "4px" }}>
                {label}:
              </span>
            )}
            <span style={{ color: "#0f172a" }}>{rawVal || "—"}</span>
          </div>
        );
      }

      return (
        <div key={index} style={{ margin: "6px 0", display: "flex", gap: "8px", fontSize: "13px" }}>
          {showLabel && (
            <span style={{ fontWeight: 600, color: "#475569", minWidth: "160px", flexShrink: 0 }}>
              {label}
            </span>
          )}
          <span style={{ color: "#0f172a" }}>{rawVal || "—"}</span>
        </div>
      );
    }

    case "field_list": {
      const allFieldIds = Object.keys(vars.fields);
      let ids = block.includeFieldIds ?? allFieldIds;
      if (block.excludeFieldIds?.length) {
        ids = ids.filter(id => !block.excludeFieldIds!.includes(id));
      }
      const pairs = ids
        .map(id => ({ id, value: vars.fields[id] ?? "" }))
        .filter(({ value }) => value !== "");

      if (pairs.length === 0) return null;

      if (block.style === "table" || !block.style) {
        return (
          <table
            key={index}
            style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", margin: "12px 0" }}
          >
            {block.showHeader && (
              <thead>
                <tr>
                  <th style={{
                    padding: "6px 8px",
                    background: accent,
                    color: "#fff",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                    width: "40%",
                  }}>
                    {block.headerLabels?.field ?? vars.printLabels.fieldListFieldHeader}
                  </th>
                  <th style={{
                    padding: "6px 8px",
                    background: accent,
                    color: "#fff",
                    textAlign: "left",
                    fontSize: "12px",
                    fontWeight: 600,
                  }}>
                    {block.headerLabels?.value ?? vars.printLabels.fieldListValueHeader}
                  </th>
                </tr>
              </thead>
            )}
            <tbody>
              {pairs.map(({ id, value }) => (
                <tr key={id}>
                  <td
                    style={{
                      padding: "6px 8px",
                      fontWeight: 600,
                      color: "#475569",
                      borderBottom: `1px solid ${rowBorder}`,
                      width: "40%",
                    }}
                  >
                    {vars.fieldLabels[id] ?? id}
                  </td>
                  <td
                    style={{
                      padding: "6px 8px",
                      color: "#0f172a",
                      borderBottom: `1px solid ${rowBorder}`,
                    }}
                  >
                    {value}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      }

      return (
        <ul key={index} style={{ margin: "8px 0", paddingLeft: "20px", fontSize: "13px" }}>
          {pairs.map(({ id, value }) => (
            <li key={id} style={{ margin: "4px 0", color: "#334155" }}>
              <span style={{ fontWeight: 600, color: "#475569" }}>{vars.fieldLabels[id] ?? id}:</span> {value}
            </li>
          ))}
        </ul>
      );
    }

    case "divider":
      return (
        <hr
          key={index}
          style={{ border: "none", borderTop: `1px solid ${rowBorder}`, margin: "16px 0" }}
        />
      );

    case "html": {
      // Interpolate first so field values in templates are also sanitized
      const interpolated = interpolate(block.content, vars);
      const clean = DOMPurify.sanitize(interpolated);
      return (
        <div
          key={index}
          dangerouslySetInnerHTML={{ __html: clean }}
          style={{ fontSize: "13px", margin: "8px 0" }}
        />
      );
    }

    case "conditional_block": {
      if (!evaluateCondition(block.condition, vars)) return null;
      if (!block.blocks || block.blocks.length === 0) return null;
      return (
        <div key={index}>
          <PrintBody blocks={block.blocks} vars={vars} brandColor={brandColor} />
        </div>
      );
    }

    case "repeater_table": {
      const raw = vars.fields[block.fieldId] ?? "";
      let rows: Record<string, string>[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) rows = parsed as Record<string, string>[];
      } catch { /* ignore */ }

      if (rows.length === 0) return null;

      // Determine columns: explicit list or all keys from first row
      const colKeys = block.columns ?? Object.keys(rows[0] ?? {});
      const showHeader = block.showHeader !== false;

      // Compute totals for numeric columns
      const totals: Record<string, number> = {};
      if (block.showTotal) {
        for (const key of colKeys) {
          const sum = rows.reduce((acc, r) => acc + (parseFloat(r[key] ?? "") || 0), 0);
          totals[key] = sum;
        }
      }

      return (
        <table
          key={index}
          style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", margin: "12px 0" }}
        >
          {showHeader && (
            <thead>
              <tr>
                {colKeys.map(key => (
                  <th
                    key={key}
                    style={{
                      padding: "6px 8px",
                      background: accent,
                      color: "#fff",
                      textAlign: "left",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    {block.headerLabels?.[key] ?? key}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {colKeys.map(key => (
                  <td
                    key={key}
                    style={{
                      padding: "6px 8px",
                      color: "#0f172a",
                      borderBottom: `1px solid ${rowBorder}`,
                    }}
                  >
                    {row[key] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {block.showTotal && (
              <tr>
                {colKeys.map((key, ki) => (
                  <td
                    key={key}
                    style={{
                      padding: "6px 8px",
                      fontWeight: 700,
                      color: accent,
                      borderTop: `2px solid ${accent}`,
                    }}
                  >
                    {ki === 0
                      ? (block.totalLabel ?? "Total")
                      : totals[key]
                      ? String(totals[key])
                      : ""}
                  </td>
                ))}
              </tr>
            )}
          </tbody>
        </table>
      );
    }

    case "page_break":
      return (
        <div
          key={index}
          style={{
            pageBreakAfter: "always",
            breakAfter: "page",
            height: "1px",
          } as React.CSSProperties}
        />
      );

    case "signature_box": {
      const isHalf = block.width === "half";
      return (
        <div key={index} style={{ margin: "28px 0", width: isHalf ? "50%" : "100%" }}>
          <div style={{
            borderBottom: `1.5px solid ${accent}`,
            height: "60px",
            marginBottom: "6px",
          }} />
          {block.label && (
            <p style={{ margin: 0, fontSize: "11px", color: "#475569", fontWeight: 500 }}>
              {block.label}
            </p>
          )}
          {block.hint && (
            <p style={{ margin: "2px 0 0", fontSize: "10px", color: "#94a3b8" }}>
              {block.hint}
            </p>
          )}
        </div>
      );
    }

    default:
      return null;
  }
}

export function PrintBody({ blocks, vars, brandColor }: PrintBodyProps) {
  return (
    <div style={{ position: "relative", zIndex: 1 }}>
      {blocks.map((block, i) => (
        <PrintBlockRenderer key={i} block={block} vars={vars} index={i} brandColor={brandColor} />
      ))}
    </div>
  );
}
