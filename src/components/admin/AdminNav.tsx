"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

interface NavItem {
  href: string;
  label: string;
}

interface AdminNavProps {
  items: NavItem[];
}

export function AdminNav({ items }: AdminNavProps) {
  const pathname = usePathname();

  return (
    <nav className="flex items-center gap-1">
      {items.map((item) => {
        const isActive =
          pathname === item.href ||
          (item.href !== "/admin" && pathname.startsWith(item.href));

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "text-sm px-3 py-1.5 rounded-md transition-colors",
              isActive
                ? "text-foreground font-medium bg-accent"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
