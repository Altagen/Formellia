import { NextRequest, NextResponse } from "next/server";
import { lucia } from "@/lib/auth/lucia";
import { authLogger as log } from "@/lib/logger";
import { validateCsrfOrigin } from "@/lib/security/csrf";

export async function POST(req: NextRequest) {
  if (!validateCsrfOrigin(req)) {
    return NextResponse.json({ error: "Cross-origin request denied" }, { status: 403 });
  }
  try {
    const sessionId = req.cookies.get(lucia.sessionCookieName)?.value;

    if (sessionId) {
      await lucia.invalidateSession(sessionId);
    }

    const blankCookie = lucia.createBlankSessionCookie();
    const response = NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin));
    response.cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
    return response;
  } catch (error) {
    log.error({ err: error }, "Logout error");
    // Even if invalidation fails, redirect and clear the cookie
    const blankCookie = lucia.createBlankSessionCookie();
    const response = NextResponse.redirect(new URL("/admin/login", req.nextUrl.origin));
    response.cookies.set(blankCookie.name, blankCookie.value, blankCookie.attributes);
    return response;
  }
}
