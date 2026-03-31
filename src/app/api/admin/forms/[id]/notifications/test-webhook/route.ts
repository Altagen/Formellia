import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole, validateAdminSession } from "@/lib/auth/validateSession";
import { getFormInstanceById } from "@/lib/db/formInstanceLoader";
import { db } from "@/lib/db";
import { submissions } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkAdminRateLimit } from "@/lib/security/adminRateLimit";
import { isSsrfUrl } from "@/lib/security/ssrfCheck";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireAdminMutation(req) ?? await requireRole("editor", req);
  if (guard) return guard;

  // Rate limit: 10 test calls per user per 10 minutes
  const user = await validateAdminSession(req);
  const rlKey = `test-webhook:${user?.id ?? "anon"}`;
  const rl = checkAdminRateLimit(rlKey, 10, 10 * 60 * 1000);
  if (rl.blocked) {
    return NextResponse.json({ error: "Too many requests. Try again in a few minutes." }, { status: 429 });
  }

  const { id } = await params;
  const instance = await getFormInstanceById(id);
  if (!instance) return NextResponse.json({ error: "Formulaire introuvable" }, { status: 404 });

  const webhookUrl = instance.config.notifications?.webhookUrl;
  if (!webhookUrl) return NextResponse.json({ error: "No webhook configured" }, { status: 400 });

  // SSRF protection — reject private/internal addresses
  if (isSsrfUrl(webhookUrl)) {
    return NextResponse.json({ error: "Internal/private URLs are not allowed for webhooks" }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  const submissionId = body.submissionId as string | undefined;

  // Build payload: use a real submission if provided, else a mock
  let payload: Record<string, unknown>;
  if (submissionId) {
    const [sub] = await db.select().from(submissions).where(eq(submissions.id, submissionId)).limit(1);
    if (!sub) return NextResponse.json({ error: "Soumission introuvable" }, { status: 404 });
    payload = {
      form: { slug: instance.slug, name: instance.config.meta.name },
      submission: { email: sub.email, formData: sub.formData, submittedAt: sub.submittedAt.toISOString() },
    };
  } else {
    payload = {
      form: { slug: instance.slug, name: instance.config.meta.name },
      submission: { email: "test@example.com", formData: { email: "test@example.com" }, submittedAt: new Date().toISOString() },
      _test: true,
    };
  }

  const start = Date.now();
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10_000),
    });
    const responseBody = await res.text().catch(() => "");
    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      responseBody: responseBody.slice(0, 500),
      durationMs: Date.now() - start,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Network error";
    // Strip potential internal details (IP, hostname resolution errors)
    const safeMessage = message.replace(/(\d{1,3}\.){3}\d{1,3}/g, "[ip]").replace(/ECONNREFUSED|ENOTFOUND|ETIMEDOUT/g, (m) => m);
    return NextResponse.json({
      ok: false,
      status: 0,
      responseBody: safeMessage,
      durationMs: Date.now() - start,
    });
  }
}
