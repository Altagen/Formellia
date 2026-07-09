/**
 * Unit tests for the broadcast fan-out engine.
 *
 * Locks in per-provider batch sizes, PII redaction of error bodies, and
 * "continue on mid-loop failure" semantics — regressions here would either
 * over-send (batch size drift) or leak recipient PII into audit log rows.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Bypass real AES-GCM: the sender only needs a "decrypted" key string,
// so we short-circuit `decryptApiKey` to identity.
vi.mock("@/lib/email/crypto", () => ({
  decryptApiKey: (s: string) => s,
}));

import { sendBroadcast as send } from "@/lib/email/broadcastSender";

function makeConfig(provider: "resend" | "sendgrid" | "mailgun") {
  return {
    provider,
    fromAddress:     "org@example.com",
    fromName:        "Org",
    apiKeyEncrypted: "test-key",
    apiKeyExpiresAt: null,
  };
}

const okResponse = () => Promise.resolve(new Response("", { status: 200 }));

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(okResponse));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendBroadcast batch sizing", () => {
  it("splits 120 recipients into 3 Resend calls of ≤50", async () => {
    const recipients = Array.from({ length: 120 }, (_, i) => `r${i}@example.com`);
    const report = await send({
      config: makeConfig("resend"),
      to: recipients, subject: "s", html: "<p>x</p>", text: "x",
    });

    expect(report.sent).toBe(120);
    expect(report.failed).toBe(0);

    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(3);
    for (const [, init] of calls) {
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.bcc.length).toBeLessThanOrEqual(50);
    }
  });

  it("splits 1200 recipients into 2 SendGrid calls of ≤999", async () => {
    const recipients = Array.from({ length: 1200 }, (_, i) => `r${i}@example.com`);
    const report = await send({
      config: makeConfig("sendgrid"),
      to: recipients, subject: "s", html: "<p>x</p>", text: "x",
    });

    expect(report.sent).toBe(1200);
    const calls = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(calls).toHaveLength(2);
    for (const [, init] of calls) {
      const body = JSON.parse((init as RequestInit).body as string);
      expect(body.personalizations[0].bcc.length).toBeLessThanOrEqual(999);
    }
  });
});

describe("sendBroadcast error handling", () => {
  it("continues past a failed batch and reports the count", async () => {
    const recipients = Array.from({ length: 100 }, (_, i) => `r${i}@example.com`);
    let callCount = 0;
    vi.stubGlobal("fetch", vi.fn(() => {
      callCount += 1;
      if (callCount === 1) return Promise.resolve(new Response("boom", { status: 500 }));
      return okResponse();
    }));

    const report = await send({
      config: makeConfig("resend"),
      to: recipients, subject: "s", html: "<p>x</p>", text: "x",
    });

    expect(report.sent).toBe(50);
    expect(report.failed).toBe(50);
    expect(report.error).toMatch(/Resend error 500/);
  });

  it("redacts recipient emails from persisted error text", async () => {
    vi.stubGlobal("fetch", vi.fn(() =>
      Promise.resolve(new Response(
        JSON.stringify({ errors: [{ message: "blocked: victim@example.org" }] }),
        { status: 400 },
      )),
    ));

    const report = await send({
      config: makeConfig("sendgrid"),
      to: ["victim@example.org"], subject: "s", html: "<p>x</p>", text: "x",
    });

    expect(report.error).toBeDefined();
    expect(report.error).not.toContain("victim@example.org");
    expect(report.error).toContain("[email redacted]");
  });
});

describe("sendBroadcast key expiry", () => {
  it("refuses to send with an expired API key", async () => {
    const expired = {
      ...makeConfig("resend"),
      apiKeyExpiresAt: "2020-01-01",
    };
    await expect(send({
      config: expired,
      to: ["a@b.com"], subject: "s", html: "<p>x</p>", text: "x",
    })).rejects.toThrow(/expired on 2020-01-01/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
