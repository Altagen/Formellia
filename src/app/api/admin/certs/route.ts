import { NextRequest, NextResponse } from "next/server";
import { requireAdminMutation, requireRole } from "@/lib/auth/validateSession";
import { db } from "@/lib/db";
import { customCaCerts } from "@/lib/db/schema";
import { z } from "zod";

const createSchema = z.object({
  name: z.string().min(1).max(200),
  pem:  z.string().min(1).refine(
    v => v.includes("-----BEGIN CERTIFICATE-----"),
    "Le champ PEM doit contenir un certificat PEM valide."
  ),
  enabled: z.boolean().optional().default(true),
});

/** GET /api/admin/certs — list all custom CA certs (without full PEM) */
export async function GET(req: NextRequest) {
  const guard = await requireRole("admin", req);
  if (guard) return guard;

  const rows = await db.select({
    id:        customCaCerts.id,
    name:      customCaCerts.name,
    enabled:   customCaCerts.enabled,
    createdAt: customCaCerts.createdAt,
    // Return a short excerpt of the PEM so UI can show fingerprint info
    pemExcerpt: customCaCerts.pem,
  }).from(customCaCerts).orderBy(customCaCerts.createdAt);

  return NextResponse.json(rows.map(r => ({
    ...r,
    pemExcerpt: r.pemExcerpt.split("\n").slice(0, 3).join("\n") + "\n...",
  })));
}

/** POST /api/admin/certs — create a new custom CA cert */
export async function POST(req: NextRequest) {
  const guard = await requireAdminMutation(req) ?? await requireRole("admin", req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Corps JSON invalide" }, { status: 422 });

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message }, { status: 422 });

  const [row] = await db.insert(customCaCerts).values({
    name:    parsed.data.name,
    pem:     parsed.data.pem.trim(),
    enabled: parsed.data.enabled,
  }).returning({
    id:        customCaCerts.id,
    name:      customCaCerts.name,
    enabled:   customCaCerts.enabled,
    createdAt: customCaCerts.createdAt,
  });

  // Invalidate cache so next outgoing TLS connection picks up the new cert
  const { invalidateCustomCaCache } = await import("@/lib/security/customCa");
  invalidateCustomCaCache();

  return NextResponse.json(row, { status: 201 });
}
