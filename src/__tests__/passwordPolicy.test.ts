import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validatePassword, POLICY_RULES, _resetPolicyCache } from "@/lib/security/passwordPolicy";

describe("validatePassword — policy NOT enforced (default)", () => {
  beforeEach(() => {
    delete process.env.ENFORCE_PASSWORD_POLICY;
    _resetPolicyCache();
  });

  it("accepts any password when policy is off", async () => {
    process.env.ENFORCE_PASSWORD_POLICY = "false";
    const res = await validatePassword("weak");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});

describe("validatePassword — policy ENFORCED", () => {
  beforeEach(() => {
    process.env.ENFORCE_PASSWORD_POLICY = "true";
    _resetPolicyCache();
  });

  afterEach(() => {
    delete process.env.ENFORCE_PASSWORD_POLICY;
    _resetPolicyCache();
  });

  it("accepts a strong password", async () => {
    const res = await validatePassword("Passw0rd!");
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it("rejects a password that is too short", async () => {
    const res = await validatePassword("Ab1!");
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(POLICY_RULES[0]);
  });

  it("rejects a password with no uppercase", async () => {
    const res = await validatePassword("password1!");
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(POLICY_RULES[1]);
  });

  it("rejects a password with no digit", async () => {
    const res = await validatePassword("Password!");
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(POLICY_RULES[2]);
  });

  it("rejects a password with no special character", async () => {
    const res = await validatePassword("Password1");
    expect(res.valid).toBe(false);
    expect(res.errors).toContain(POLICY_RULES[3]);
  });

  it("reports all violations at once", async () => {
    const res = await validatePassword("weak");
    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });

  it("accepts special chars from the allowed set", async () => {
    for (const ch of "!@#$%^&*()") {
      const pw = `Passw0rd${ch}`;
      const res = await validatePassword(pw);
      expect(res.valid).toBe(true);
    }
  });
});
