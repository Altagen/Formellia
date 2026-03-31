import { NextRequest, NextResponse } from "next/server";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { handleFormSubmit } from "@/lib/api/handleFormSubmit";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const instance = await getFormInstance(slug);
  if (!instance) {
    return NextResponse.json({ error: "Formulaire introuvable" }, { status: 404 });
  }
  if (!instance.config.features.form) {
    return NextResponse.json({ error: "Ce formulaire is disabled" }, { status: 403 });
  }
  return handleFormSubmit(req, instance);
}
