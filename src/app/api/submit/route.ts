import { NextRequest, NextResponse } from "next/server";
import { getFormInstance } from "@/lib/db/formInstanceLoader";
import { handleFormSubmit } from "@/lib/api/handleFormSubmit";

// Backward-compatible submit endpoint — delegates to the root form instance ("/")
export async function POST(req: NextRequest) {
  const instance = await getFormInstance("/");
  if (!instance) {
    return NextResponse.json({ error: "Formulaire introuvable" }, { status: 404 });
  }
  return handleFormSubmit(req, instance);
}
