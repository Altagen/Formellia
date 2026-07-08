import { NextRequest, NextResponse } from "next/server";
import { requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { getDataPool } from "@/lib/datapools/crud";
import { getDataPoolEntries } from "@/lib/datapools/compute";

type Props = { params: Promise<{ id: string }> };

// Same cap as the global submissions export — keeps response memory bounded
// (a typical 50k-entry pool serialises to a few MB, but unbounded growth on a
// runaway pool would block the handler and pressure the worker). Surfaced as
// a 400 with a clear message so operators know to paginate or split.
const MAX_EXPORT_ROWS = 10_000;

function escapeCsv(value: string): string {
  // RFC 4180: any field containing a comma, double-quote or newline must be
  // wrapped in double quotes, with embedded double quotes doubled.
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;
  const { id } = await params;

  const pool = await getDataPool(id);
  if (!pool) return NextResponse.json({ error: "DataPool not found" }, { status: 404 });

  const { entries, total } = await getDataPoolEntries(id, { limit: MAX_EXPORT_ROWS });
  if (total > MAX_EXPORT_ROWS) {
    return NextResponse.json(
      {
        error: `DataPool has ${total} entries — over the ${MAX_EXPORT_ROWS} export cap. Split it (filter sources) or request a paginated export.`,
      },
      { status: 400 },
    );
  }
  const columns = [pool.keyField, ...pool.additionalFields];
  const header = columns.map(escapeCsv).join(",");
  const rows = entries.map((e) => {
    const key = e.key;
    const extras = pool.additionalFields.map((f) => e.additional[f] ?? "");
    return [key, ...extras].map(escapeCsv).join(",");
  });
  const csv = [header, ...rows].join("\r\n") + "\r\n";

  const actor = await validateAdminSession(req);
  logAdminEvent({
    userId:       actor?.id ?? null,
    userEmail:    actor?.email ?? null,
    action:       "datapool.export",
    resourceType: "data_pool",
    resourceId:   id,
    details:      { count: entries.length, format: "csv" },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type":        "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${pool.slug}.csv"`,
    },
  });
}
