import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { externalRecords } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { isDisposableEmail } from "@/lib/utils/disposableEmails";

interface Props {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Props) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const { id } = await params;

  // Fetch all non-null email values from the dataset in one query
  const rows = await db.execute<{ email: string }>(sql`
    SELECT data->>'email' AS email
    FROM ${externalRecords}
    WHERE dataset_id = ${id}
      AND data->>'email' IS NOT NULL
      AND data->>'email' <> ''
  `);

  const emails = rows.rows.map(r => r.email).filter(Boolean);
  const total = emails.length;
  const disposable = emails.filter(e => isDisposableEmail(e)).length;
  const disposablePercent = total > 0 ? Math.round((disposable / total) * 100) : 0;

  return NextResponse.json({ total, disposable, disposablePercent });
}
