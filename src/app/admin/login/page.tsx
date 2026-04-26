import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { lucia } from "@/lib/auth/lucia";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getFormConfig } from "@/lib/config";
import { LoginForm } from "./LoginForm";
import { FirstSetupForm } from "./FirstSetupForm";

interface Props {
  searchParams: Promise<{ next?: string }>;
}

export default async function LoginPage({ searchParams }: Props) {
  const { next } = await searchParams;
  const destination = next && next.startsWith("/admin") ? next : "/admin";

  // If already authenticated, redirect immediately
  try {
    const cookieStore = await cookies();
    const sessionId = cookieStore.get(lucia.sessionCookieName)?.value;
    if (sessionId) {
      const { user } = await lucia.validateSession(sessionId);
      if (user) redirect(destination);
    }
  } catch {
    // Session invalid — continue to login
  }

  const [existingUsers, config] = await Promise.all([
    db.select({ id: users.id }).from(users).limit(1),
    getFormConfig().catch(() => null),
  ]);
  const locale = config?.locale;
  const branding = config?.admin.branding;

  if (existingUsers.length === 0) {
    return <FirstSetupForm next={destination} locale={locale} />;
  }

  return <LoginForm next={destination} locale={locale} branding={branding} />;
}
