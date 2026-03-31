export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "_next",
  "favicon.ico",
  "robots.txt",
]);

export function isReservedSlug(s: string): boolean {
  return RESERVED_SLUGS.has(s.toLowerCase());
}
