"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

interface AutoRefreshProps {
  /** Interval in seconds. 0 or undefined = disabled. */
  intervalSeconds: number;
}

/**
 * Invisible client component that calls router.refresh() at a configured interval.
 * Triggers the server component to re-fetch data without a full page reload.
 */
export function AutoRefresh({ intervalSeconds }: AutoRefreshProps) {
  const router = useRouter();

  useEffect(() => {
    if (!intervalSeconds || intervalSeconds <= 0) return;
    const id = setInterval(() => router.refresh(), intervalSeconds * 1000);
    return () => clearInterval(id);
  }, [intervalSeconds, router]);

  return null;
}
