import { NextRequest, NextResponse } from "next/server";

// Session cookie name — must match lucia.ts (Lucia v3 default)
const SESSION_COOKIE = "auth_session";

// Admin routes that don't require authentication
// /admin/setup is public: it self-disables once a user exists (handled in the page itself)
const PUBLIC_ADMIN_ROUTES = ["/admin/login", "/admin/setup", "/admin/recovery"];

// Admin API routes — return 401 JSON instead of redirect
const API_PREFIX = "/api/admin";
const AUTH_PREFIX = "/api/auth";

// Optional host-based isolation.
// If ADMIN_HOST is set (e.g. "admin.company.com"), all /admin* and /api/admin*
// requests arriving from a different Host header are silently returned as 404.
// Leave unset for single-domain deployments (internal use, no Caddy, etc.).
const ADMIN_HOST = process.env.ADMIN_HOST?.toLowerCase().trim() || null;

function isAdminHostAllowed(request: NextRequest): boolean {
  if (!ADMIN_HOST) return true; // no restriction configured
  const host = request.headers.get("host")?.toLowerCase().split(":")[0] ?? "";
  return host === ADMIN_HOST;
}

const isDev = process.env.NODE_ENV === "development";

const SECURITY_HEADERS: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  // HSTS — only in production to avoid breaking localhost dev
  ...(!isDev ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" } : {}),
  // CSP: 'unsafe-inline' required for Next.js inline scripts + Tailwind inline styles
  // 'unsafe-eval' required by webpack dev server (React Fast Refresh) — dev only
  "Content-Security-Policy": [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self'",
    "frame-src 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
};

function addSecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Host-based admin isolation (optional — requires ADMIN_HOST env var) ──
  const isAdminPath = pathname.startsWith("/admin") || pathname.startsWith(API_PREFIX) || pathname.startsWith(AUTH_PREFIX);
  if (isAdminPath && !isAdminHostAllowed(request)) {
    return new NextResponse(null, { status: 404 });
  }

  // ── API routes: require session cookie OR Bearer token ──────────────────
  if (pathname.startsWith(API_PREFIX)) {
    // Bootstrap/setup exceptions — route handlers enforce their own auth when users exist
    // GET /api/admin/setup/policy — public: used by setup wizard before any user exists
    // POST /api/admin/users       — bootstrap path: route handler skips auth only when DB is empty
    const isSetupPolicy = pathname === "/api/admin/setup/policy";
    const isBootstrapCreate = pathname === "/api/admin/users" && request.method === "POST";
    if (isSetupPolicy || isBootstrapCreate) {
      return addSecurityHeaders(NextResponse.next());
    }

    const session = request.cookies.get(SESSION_COOKIE)?.value;
    const hasBearer = request.headers.get("authorization")?.startsWith("Bearer ");
    if (!session && !hasBearer) {
      return addSecurityHeaders(
        NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      );
    }
    return addSecurityHeaders(NextResponse.next());
  }

  // ── Admin pages ──────────────────────────────────────────────────────────
  if (pathname.startsWith("/admin")) {
    // Allow public admin routes through
    if (PUBLIC_ADMIN_ROUTES.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
      return addSecurityHeaders(NextResponse.next());
    }

    const session = request.cookies.get(SESSION_COOKIE)?.value;
    if (!session) {
      const loginUrl = new URL("/admin/login", request.url);
      // Preserve the intended destination for post-login redirect
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const response = NextResponse.next({
    request: {
      headers: (() => {
        const h = new Headers(request.headers);
        h.set("x-pathname", pathname);
        h.set("x-request-id", requestId);
        return h;
      })(),
    },
  });
  response.headers.set("x-request-id", requestId);
  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/api/auth/:path*",
  ],
};
