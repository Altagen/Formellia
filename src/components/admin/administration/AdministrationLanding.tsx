"use client";

import Link from "next/link";
import { ChevronRight, Lock, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "@/lib/context/LocaleContext";
import { AuditRetentionSection } from "./AuditRetentionSection";

export function AdministrationLanding() {
  const tr = useTranslations();
  const u = tr.admin.config.users;

  const cards = [
    {
      href: "/admin/administration/users",
      icon: Users,
      title: u.landingUsersTitle,
      description: u.landingUsersDesc,
      tint: "bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300",
    },
    {
      href: "/admin/administration/security",
      icon: ShieldCheck,
      title: u.landingSecurityTitle,
      description: u.landingSecurityDesc,
      tint: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
    },
    {
      href: "/admin/administration/pages",
      icon: Lock,
      title: u.landingPagesTitle,
      description: u.landingPagesDesc,
      tint: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map(({ href, icon: Icon, title, description, tint }) => (
          <Link
            key={href}
            href={href}
            className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:bg-muted/30"
          >
            <div className="flex items-start justify-between">
              <span className={`w-11 h-11 rounded-lg inline-flex items-center justify-center ${tint}`}>
                <Icon className="w-5 h-5" />
              </span>
              <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">{title}</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
            </div>
          </Link>
        ))}
      </div>

      <AuditRetentionSection />
    </div>
  );
}
