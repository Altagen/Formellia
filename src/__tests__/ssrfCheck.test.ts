import { describe, it, expect } from "vitest";
import { isSsrfUrl } from "@/lib/security/ssrfCheck";

describe("isSsrfUrl", () => {
  // ── Legitimate URLs ────────────────────────────────────────
  it("autorise une URL HTTPS publique", () => {
    expect(isSsrfUrl("https://example.com/webhook")).toBe(false);
  });

  it("autorise une URL HTTP publique", () => {
    expect(isSsrfUrl("http://api.example.com/data")).toBe(false);
  });

  it("autorise une URL avec port sur domaine public", () => {
    expect(isSsrfUrl("https://example.com:8443/hook")).toBe(false);
  });

  // ── Loopback / localhost ──────────────────────────────────
  it("bloque localhost", () => {
    expect(isSsrfUrl("http://localhost/admin")).toBe(true);
  });

  it("bloque 127.0.0.1", () => {
    expect(isSsrfUrl("http://127.0.0.1")).toBe(true);
  });

  it("bloque 127.x.x.x (toute la plage)", () => {
    expect(isSsrfUrl("http://127.255.255.255")).toBe(true);
  });

  // ── RFC-1918 private ranges ───────────────────────────────
  it("bloque 10.x.x.x", () => {
    expect(isSsrfUrl("http://10.0.0.1")).toBe(true);
  });

  it("bloque 192.168.x.x", () => {
    expect(isSsrfUrl("http://192.168.1.1")).toBe(true);
  });

  it("bloque 172.16.x.x", () => {
    expect(isSsrfUrl("http://172.16.0.1")).toBe(true);
  });

  it("bloque 172.31.x.x (limite haute du range)", () => {
    expect(isSsrfUrl("http://172.31.255.255")).toBe(true);
  });

  it("allows 172.32.x.x (outside private range)", () => {
    expect(isSsrfUrl("http://172.32.0.1")).toBe(false);
  });

  // ── Link-local / metadata endpoints ──────────────────────
  it("bloque 169.254.169.254 (AWS metadata)", () => {
    expect(isSsrfUrl("http://169.254.169.254/latest/meta-data/")).toBe(true);
  });

  it("bloque 169.254.x.x (link-local)", () => {
    expect(isSsrfUrl("http://169.254.0.1")).toBe(true);
  });

  // ── IPv6 ─────────────────────────────────────────────────
  it("bloque ::1 (loopback IPv6)", () => {
    expect(isSsrfUrl("http://[::1]")).toBe(true);
  });

  it("bloque fc00:: (unique local IPv6)", () => {
    expect(isSsrfUrl("http://[fc00::1]")).toBe(true);
  });

  it("bloque fe80:: (link-local IPv6)", () => {
    expect(isSsrfUrl("http://[fe80::1]")).toBe(true);
  });

  // WHATWG normalise ::ffff:a.b.c.d → ::ffff:hex (e.g. ::ffff:7f00:1 pour 127.0.0.1)
  // Le pattern ::ffff: les bloque tous sans avoir besoin de matcher l'IP exacte
  it("blocks ::ffff:127.0.0.1 (IPv4-mapped loopback, WHATWG-normalised)", () => {
    // new URL normalise en [::ffff:7f00:1] — notre check strip les brackets + matche ::ffff:
    expect(isSsrfUrl("http://[::ffff:7f00:1]")).toBe(true);
  });

  it("blocks ::ffff:10.0.0.1 (IPv4-mapped private, WHATWG-normalised)", () => {
    expect(isSsrfUrl("http://[::ffff:a00:1]")).toBe(true);
  });

  it("blocks ::ffff:172.16.0.1 (IPv4-mapped private, WHATWG-normalised)", () => {
    expect(isSsrfUrl("http://[::ffff:ac10:1]")).toBe(true);
  });

  it("blocks ::ffff:169.254.169.254 (IPv4-mapped metadata, WHATWG-normalised)", () => {
    expect(isSsrfUrl("http://[::ffff:a9fe:a9fe]")).toBe(true);
  });

  // ── Disallowed protocols ─────────────────────────────
  it("bloque le protocole file://", () => {
    expect(isSsrfUrl("file:///etc/passwd")).toBe(true);
  });

  it("bloque le protocole ftp://", () => {
    expect(isSsrfUrl("ftp://example.com/file")).toBe(true);
  });

  // ── RFC-1122 reserved addresses ──────────────────────────
  it("blocks 0.0.0.0 (unspecified address)", () => {
    expect(isSsrfUrl("http://0.0.0.0")).toBe(true);
  });

  it("blocks 0.1.2.3 (reserved 0.x.x.x range)", () => {
    expect(isSsrfUrl("http://0.1.2.3")).toBe(true);
  });

  // ── Invalid URLs ────────────────────────────────────────
  it("bloque une URL non parseable", () => {
    expect(isSsrfUrl("not-a-url")).toBe(true);
  });

  it("blocks an empty string", () => {
    expect(isSsrfUrl("")).toBe(true);
  });
});
