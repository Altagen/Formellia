import { describe, it, expect } from "vitest";
import { sanitizeBroadcastHtml, htmlToPlainText } from "@/lib/email/broadcastSanitize";

describe("sanitizeBroadcastHtml", () => {
  it("strips <script> tags entirely", () => {
    const out = sanitizeBroadcastHtml(`<p>Hi</p><script>alert(1)</script>`);
    expect(out).not.toMatch(/<script/i);
    expect(out).not.toMatch(/alert/);
  });

  it("strips inline event handlers", () => {
    const out = sanitizeBroadcastHtml(`<a href="/x" onclick="alert(1)">link</a>`);
    expect(out).not.toMatch(/onclick/i);
  });

  it("blocks javascript: URLs in href", () => {
    const out = sanitizeBroadcastHtml(`<a href="javascript:alert(1)">x</a>`);
    expect(out).not.toMatch(/javascript:/i);
  });

  it("keeps safe inline styles (juice will fold them later)", () => {
    const out = sanitizeBroadcastHtml(`<p style="color:#333; font-size:14px">Hi</p>`);
    expect(out).toMatch(/style=/);
    expect(out).toMatch(/color/);
  });

  it("keeps the table tags email clients support", () => {
    const out = sanitizeBroadcastHtml(`<table><tr><td>cell</td></tr></table>`);
    expect(out).toMatch(/<table/);
    expect(out).toMatch(/<td/);
  });

  it("keeps a benign <a> with mailto:", () => {
    const out = sanitizeBroadcastHtml(`<a href="mailto:a@b.c">write</a>`);
    expect(out).toMatch(/mailto:/);
  });

  it("strips <iframe> (not in the allow-list)", () => {
    const out = sanitizeBroadcastHtml(`<iframe src="https://evil"></iframe>`);
    expect(out).not.toMatch(/<iframe/i);
  });

  it("strips <object> / <embed>", () => {
    const out = sanitizeBroadcastHtml(`<object data="x"></object><embed src="y">`);
    expect(out).not.toMatch(/<object/i);
    expect(out).not.toMatch(/<embed/i);
  });

  it("strips <form> (no submission allowed from an email body)", () => {
    const out = sanitizeBroadcastHtml(`<form action="x"><input></form>`);
    expect(out).not.toMatch(/<form/i);
    expect(out).not.toMatch(/<input/i);
  });

  it("keeps img with safe https src", () => {
    const out = sanitizeBroadcastHtml(`<img src="https://cdn.example/logo.png" alt="logo" />`);
    expect(out).toMatch(/<img/);
    expect(out).toMatch(/https:\/\/cdn\.example/);
  });

  it("keeps the formatting tags the toolbar inserts (u / s / code / hr / h1)", () => {
    // Sanity check matched to the 0.3.0 composer toolbar — adding a button
    // for a tag that ends up stripped here would silently lose the operator's
    // formatting on send, so this test acts as an integration contract.
    const html = `<u>under</u><s>strike</s><code>inline</code><hr><h1>title</h1>`;
    const out = sanitizeBroadcastHtml(html);
    expect(out).toMatch(/<u>under<\/u>/);
    expect(out).toMatch(/<s>strike<\/s>/);
    expect(out).toMatch(/<code>inline<\/code>/);
    expect(out).toMatch(/<hr/);
    expect(out).toMatch(/<h1>title<\/h1>/);
  });
});

describe("htmlToPlainText", () => {
  it("flattens paragraphs to double newlines", () => {
    const out = htmlToPlainText(`<p>One</p><p>Two</p>`);
    expect(out).toBe("One\n\nTwo");
  });

  it("turns <br> into single newlines", () => {
    const out = htmlToPlainText(`Line 1<br>Line 2`);
    expect(out).toBe("Line 1\nLine 2");
  });

  it("strips tags but keeps text content", () => {
    const out = htmlToPlainText(`<a href="x"><strong>Click</strong> here</a>`);
    expect(out).toBe("Click here");
  });

  it("passes HTML entities through as literal text", () => {
    // Plain-text MIME parts render entities verbatim — readers see "&amp;",
    // not "&". We accept that trade-off so the function never has to surface
    // raw `<` / `>` after a decode pass (CodeQL js/bad-tag-filter).
    expect(htmlToPlainText(`a &amp; b`)).toBe("a &amp; b");
    expect(htmlToPlainText(`&quot;quoted&quot;`)).toBe("&quot;quoted&quot;");
    expect(htmlToPlainText(`a&nbsp;b`)).toBe("a&nbsp;b");
  });

  it("strips unterminated tags too (no <script> escape)", () => {
    // The `<[^>]*>?` pattern catches a bare `<script` without a closing `>`,
    // so a malformed input can't leak the substring into the plain-text out.
    expect(htmlToPlainText(`hello <script alert(1)`)).toBe("hello");
    expect(htmlToPlainText(`pre<post`)).toBe("pre");
  });

  it("collapses 3+ consecutive newlines to 2", () => {
    const out = htmlToPlainText(`<p>A</p><br><br><br><p>B</p>`);
    expect(out.split(/\n+/g).filter(s => s.length > 0)).toEqual(["A", "B"]);
  });
});
