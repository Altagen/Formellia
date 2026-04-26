import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { pageViews } from "@/lib/db/schema";
import { categorizeReferrer } from "@/lib/utils/referrer";

const schema = z.object({
  sessionId: z.string().min(1).max(64),
  referrer:    z.string().max(2048).optional(),
  utmSource:   z.string().max(100).optional(),
  utmMedium:   z.string().max(100).optional(),
  utmCampaign: z.string().max(100).optional(),
});

// In-memory rate limit: 1 event per sessionId per 10 minutes
const recentSessions = new Map<string, number>();
const RATE_LIMIT_MS = 10 * 60 * 1_000;

// Lazy cleanup: prune stale entries every ~1000 inserts to prevent unbounded memory growth
let _insertCount = 0;
function maybePrune() {
  if (++_insertCount % 1_000 !== 0) return;
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const [key, ts] of recentSessions) {
    if (ts < cutoff) recentSessions.delete(key);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: true });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: true });

  const { sessionId, referrer, utmSource, utmMedium, utmCampaign } = parsed.data;

  // Rate limit per sessionId
  const last = recentSessions.get(sessionId) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) return NextResponse.json({ ok: true });
  recentSessions.set(sessionId, Date.now());
  maybePrune();

  const { domain, source } = categorizeReferrer(referrer);

  await db.insert(pageViews).values({
    formSlug: slug,
    sessionId,
    source,
    referrerDomain: domain ?? undefined,
    utmSource: utmSource ?? undefined,
    utmMedium: utmMedium ?? undefined,
    utmCampaign: utmCampaign ?? undefined,
  }).catch(() => {});

  return NextResponse.json({ ok: true });
}
