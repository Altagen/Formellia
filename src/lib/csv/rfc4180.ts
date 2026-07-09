/**
 * RFC 4180 CSV helpers.
 *
 * Fields containing double-quote, comma, LF or CR MUST be enclosed in double
 * quotes; embedded double-quotes are escaped by doubling them. Dates are
 * emitted as ISO-8601 strings; objects are JSON-stringified so structured
 * `details` payloads survive the round-trip to a spreadsheet.
 */

export function escapeCsvField(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string"
    ? v
    : v instanceof Date
      ? v.toISOString()
      : JSON.stringify(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/**
 * Serialises an array of records to a CSV string using the given column
 * order. Missing keys become empty cells. Line separator is `\n` — Excel and
 * every modern reader accept it; use CRLF only if a downstream consumer is
 * fussy about the standard.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: readonly T[],
  columns: readonly (keyof T & string)[],
): string {
  const header = columns.join(",");
  const body = rows.map(row =>
    columns.map(c => escapeCsvField(row[c])).join(","),
  );
  return [header, ...body].join("\n");
}
