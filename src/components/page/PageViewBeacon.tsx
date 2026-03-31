"use client";

import { useEffect } from "react";

interface PageViewBeaconProps {
  slug: string;
}

/**
 * Fires a single pageview beacon on mount (fire-and-forget via navigator.sendBeacon).
 * Reads referrer and UTM params from the browser at render time.
 */
export function PageViewBeacon({ slug }: PageViewBeaconProps) {
  useEffect(() => {
    const sessionId =
      (typeof crypto !== "undefined" && crypto.randomUUID?.())
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2, 18);

    const search = window.location.search;
    const params = new URLSearchParams(search);

    const payload = JSON.stringify({
      sessionId,
      referrer: document.referrer || undefined,
      utmSource:   params.get("utm_source")   ?? undefined,
      utmMedium:   params.get("utm_medium")   ?? undefined,
      utmCampaign: params.get("utm_campaign") ?? undefined,
    });

    const url = `/api/forms/${slug}/pageview`;

    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(url, new Blob([payload], { type: "application/json" }));
    } else {
      fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: payload })
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
