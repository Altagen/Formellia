/**
 * Integration test for the buildBroadcastPreview pipeline.
 *
 * Locks in the juice-then-sanitize order so a future refactor can't
 * silently reintroduce the bug where DOMPurify stripped the <style>
 * block before juice had a chance to inline it.
 *
 * We don't actually hit the DataPool layer here — the test stubs the
 * recipient resolver and just checks the sanitize + juice composition.
 */
import { describe, it, expect, vi } from "vitest";

// Stub the DataPool aggregation so the test stays pure.
vi.mock("@/lib/datapools/compute", () => ({
  getMergedDataPoolKeys: async () => [],
}));

import { buildBroadcastPreview } from "@/lib/email/broadcastService";
import type { EmailBroadcast } from "@/lib/db/schema";

function makeBroadcast(bodyHtml: string): EmailBroadcast {
  return {
    id:              "00000000-0000-0000-0000-000000000001",
    name:            "test",
    subject:         "Hello",
    bodyHtml,
    bodyText:        "",
    status:          "draft",
    dataPoolIds:          [],
    additionalRecipients: [],
    recipientCount:  0,
    sentCount:       0,
    failedCount:     0,
    lastError:       null,
    sentAt:          null,
    createdByUserId: null,
    createdAt:       new Date(),
    updatedAt:       new Date(),
  };
}

describe("buildBroadcastPreview — CSS inline pipeline", () => {
  it("folds <style> blocks into inline style=\"\" attrs (the bug we just fixed)", async () => {
    const html = `
      <style>.box { background: rgb(99, 102, 241); padding: 12px; }</style>
      <div class="box">Hello</div>
    `;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    // The class can stay or go (cosmetic); what MUST happen is the rule
    // becomes an inline style on the matching element.
    expect(preview.html).toMatch(/style=["'][^"']*background:\s*rgb\(99, ?102, ?241\)/);
    expect(preview.html).toMatch(/style=["'][^"']*padding:\s*12px/);
    // <style> tag itself is stripped (removeStyleTags + DOMPurify allow-list).
    expect(preview.html).not.toMatch(/<style/i);
  });

  it("strips <script> even when wrapped inside a styled block", async () => {
    const html = `
      <style>.outer { color: red; }</style>
      <div class="outer">Hi<script>alert(1)</script></div>
    `;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    expect(preview.html).not.toMatch(/<script/i);
    expect(preview.html).not.toMatch(/alert/);
    expect(preview.html).toMatch(/color:\s*red/);
  });

  it("blocks javascript: hrefs even when they have inline styles", async () => {
    const html = `<a href="javascript:alert(1)" style="color: red;">x</a>`;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    expect(preview.html).not.toMatch(/javascript:/i);
    // The <a> may stay (without href), the inline color: red may also stay
    expect(preview.html).toMatch(/<a[^>]*>x<\/a>/);
  });

  it("preserves nested CSS selectors when applicable", async () => {
    // juice handles descendant selectors by inlining them on the matching
    // descendant. `.container .btn` → inline on .btn.
    const html = `
      <style>.container .btn { background: #6366f1; color: white; }</style>
      <div class="container"><a class="btn" href="https://x.org">Click</a></div>
    `;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    expect(preview.html).toMatch(/<a[^>]*style=["'][^"']*background:\s*(?:rgb|#6366f1)/i);
  });

  it("removes the <style> block entirely (Gmail strips them anyway)", async () => {
    const html = `<style>.a { color: red; }</style><p class="a">Hi</p>`;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    expect(preview.html).not.toMatch(/<style/i);
    expect(preview.html).toMatch(/style=["'][^"']*color:\s*red/);
  });

  it("falls back to htmlToPlainText when bodyText is empty", async () => {
    const html = `<p>Hello <strong>world</strong></p>`;
    const preview = await buildBroadcastPreview(makeBroadcast(html));
    expect(preview.text).toBe("Hello world");
  });

  it("keeps the explicit bodyText override when present", async () => {
    const b = makeBroadcast(`<p>HTML body</p>`);
    b.bodyText = "Custom plain text";
    const preview = await buildBroadcastPreview(b);
    expect(preview.text).toBe("Custom plain text");
  });
});

// Verifies the SQL WHERE clause of `claimForSend` filters by status — the
// fix for a TOCTOU race that could cause double-send under concurrent
// /send calls. We can't easily simulate two concurrent transactions here
// without a live DB, but we can at least lock in the SQL shape.
describe("claimForSend SQL contract", () => {
  it("uses both id AND status in the WHERE clause", async () => {
    const src = await import("node:fs/promises").then(fs =>
      fs.readFile(new URL("../lib/email/broadcastCrud.ts", import.meta.url), "utf8"),
    );
    expect(src).toMatch(/claimForSend/);
    // The fix is meaningful only if both predicates are present, so assert
    // explicitly that the update is gated on status='draft'.
    expect(src).toMatch(/eq\(emailBroadcasts\.status,\s*"draft"\)/);
  });
});
