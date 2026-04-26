const SOCIAL_DOMAINS = [
  "facebook.com", "twitter.com", "x.com", "instagram.com",
  "linkedin.com", "youtube.com", "tiktok.com", "pinterest.com", "reddit.com",
  "snapchat.com", "whatsapp.com", "t.me", "telegram.org",
];

const SEARCH_DOMAINS = [
  "google.", "bing.com", "duckduckgo.com", "yahoo.com",
  "qwant.com", "ecosia.org", "yandex.",
];

export type TrafficSource = "direct" | "social" | "search" | "referral";

export function categorizeReferrer(
  referrer: string | null | undefined
): { domain: string | null; source: TrafficSource } {
  if (!referrer) return { domain: null, source: "direct" };

  let hostname: string;
  try {
    hostname = new URL(referrer).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return { domain: null, source: "direct" };
  }

  if (SOCIAL_DOMAINS.some(d => hostname === d || hostname.endsWith("." + d))) {
    return { domain: hostname, source: "social" };
  }
  if (SEARCH_DOMAINS.some(d => hostname.startsWith(d) || hostname.includes(d))) {
    return { domain: hostname, source: "search" };
  }
  return { domain: hostname, source: "referral" };
}
