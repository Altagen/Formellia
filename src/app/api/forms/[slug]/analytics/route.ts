import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { formAnalytics } from "@/lib/db/schema";

const schema = z.object({
  sessionId: z.string().max(64),
  step:      z.number().int().min(0).max(100),
  action:    z.enum(["view", "abandon", "complete"]),
});

// Rate limit: simple in-memory map (per deployment instance)
const recentSessions = new Map<string, number>();
const RATE_LIMIT_MS = 1_000; // min 1 second between events per session

// Lazy cleanup: prune stale entries every ~1000 inserts to prevent unbounded memory growth
// (mirrors the same pattern in pageview/route.ts)
let _insertCount = 0;
function maybePrune() {
  if (++_insertCount % 1_000 !== 0) return;
  const cutoff = Date.now() - RATE_LIMIT_MS;
  for (const [key, ts] of recentSessions) {
    if (ts < cutoff) recentSessions.delete(key);
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  // Parse body — this endpoint is public so we're lenient
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false }, { status: 400 });

  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });

  const { sessionId, step, action } = parsed.data;

  // Simple in-memory rate limit
  const key = `${sessionId}:${step}:${action}`;
  const last = recentSessions.get(key) ?? 0;
  if (Date.now() - last < RATE_LIMIT_MS) return NextResponse.json({ ok: true });
  recentSessions.set(key, Date.now());
  maybePrune();

  await db.insert(formAnalytics).values({ sessionId, formSlug: slug, step, action }).catch(() => {});

  return NextResponse.json({ ok: true });
}
