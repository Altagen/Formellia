import { NextRequest, NextResponse } from "next/server";
import { requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { logAdminEvent } from "@/lib/db/adminAudit";
import { getDataPool } from "@/lib/datapools/crud";
import { getDataPoolEntries } from "@/lib/datapools/compute";

type Props = { params: Promise<{ id: string }> };

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

  const { entries } = await getDataPoolEntries(id);
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
