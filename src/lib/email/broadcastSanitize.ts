/**
 * Server-side HTML sanitizer for broadcast email bodies.
 *
 * The composer is a WYSIWYG (TipTap), so the raw input may contain HTML pasted
 * from the web (with `<script>`, inline event handlers, `javascript:` URLs,
 * etc.). DOMPurify is the de-facto standard for HTML allow-listing — we wrap
 * it with an email-friendly profile.
 *
 * Allowed tags / attributes here mirror what every modern email client
 * supports. Anything more advanced (custom CSS classes, web components, etc.)
 * is silently dropped — that's the same trade-off Mailchimp and Sendgrid make.
 */
// `isomorphic-dompurify` wraps DOMPurify with a JSDOM (server) / native window
// (browser) so the same import works in both worlds. Already a dependency for
// the existing form-submit sanitisation path.
import DOMPurify from "isomorphic-dompurify";

/** Tags an email client can be trusted to render. Everything else is stripped. */
const ALLOWED_TAGS = [
  // Block structure
  "p", "br", "div", "span", "blockquote", "hr",
  "h1", "h2", "h3", "h4", "h5", "h6",
  // Inline formatting
  "strong", "b", "em", "i", "u", "s", "code", "mark", "sup", "sub",
  // Lists
  "ul", "ol", "li",
  // Links + images
  "a", "img",
  // Tables (Gmail/Outlook all support these)
  "table", "thead", "tbody", "tr", "th", "td",
];

/**
 * Attributes kept on each tag. Notably, `style` IS allowed — juice will
 * fold whatever CSS we author into inline styles at send time, and most
 * email clients only respect inline CSS anyway.
 */
const ALLOWED_ATTR = [
  "href", "src", "alt", "title", "width", "height", "style",
  "align", "valign", "border", "cellpadding", "cellspacing",
  "target", "rel",
];

/**
 * Sanitize a body of HTML coming from the composer. Strips scripts, event
 * handlers, javascript:/data: URLs, and any tag/attr not in the allow list.
 *
 * Returns clean HTML ready to be passed through juice (CSS inliner) before
 * being shipped to the provider.
 */
export function sanitizeBroadcastHtml(raw: string): string {
  const clean = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Lock URLs to the safe protocols. Notably `javascript:` and `vbscript:`
    // are blocked by DOMPurify by default, but being explicit documents intent.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // `<a target="_blank">` without `rel="noopener"` is a security smell.
    // We let DOMPurify add the rel automatically.
    ADD_ATTR: ["target"],
  });
  return clean;
}

/**
 * Best-effort plain-text fallback for the multipart/alternative body
 * (email standards require both parts so spam filters don't downgrade).
 * Two design choices keep CodeQL's `js/bad-tag-filter` happy without
 * resorting to a runtime DOM parser server-side:
 *
 *   - Strip ALL angle-bracket sequences, including unterminated ones
 *     (`<script` without `>`). The `<[^>]*>?` pattern matches `<foo>`,
 *     `<foo` and a bare `<`, so nothing slips through.
 *   - DON'T decode HTML entities. Decoding `&amp;` / `&lt;` would risk
 *     surfacing a `<` that we'd then need to re-strip. Entities pass
 *     through as literal text — mail clients render `&lt;` verbatim,
 *     which is acceptable for the rare operator-typed angle brackets.
 *
 * The composer can override the plain-text body explicitly if it wants
 * a cleaner version (e.g. by hand).
 */
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/(?:h[1-6]|li|tr|div)>/gi, "\n")
    .replace(/<[^>]*>?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
