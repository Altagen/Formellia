import { describe, it, expect } from "vitest";
import { isDisposableEmail } from "@/lib/utils/disposableEmails";

describe("isDisposableEmail", () => {
  it("returns true for known disposable domains", () => {
    expect(isDisposableEmail("user@yopmail.com")).toBe(true);
    expect(isDisposableEmail("user@mailinator.com")).toBe(true);
    expect(isDisposableEmail("user@guerrillamail.com")).toBe(true);
    expect(isDisposableEmail("user@trashmail.net")).toBe(true);
    expect(isDisposableEmail("user@temp-mail.org")).toBe(true);
    expect(isDisposableEmail("user@10minutemail.com")).toBe(true);
  });

  it("returns false for legitimate email providers", () => {
    expect(isDisposableEmail("user@gmail.com")).toBe(false);
    expect(isDisposableEmail("user@outlook.com")).toBe(false);
    expect(isDisposableEmail("user@company.fr")).toBe(false);
    expect(isDisposableEmail("user@example.org")).toBe(false);
  });

  it("is case-insensitive on domain", () => {
    expect(isDisposableEmail("user@YopMail.COM")).toBe(true);
    expect(isDisposableEmail("user@MAILINATOR.COM")).toBe(true);
  });

  it("returns false when no @ sign", () => {
    expect(isDisposableEmail("notanemail")).toBe(false);
  });

  it("handles leading/trailing whitespace in domain", () => {
    // The function trims the domain part
    expect(isDisposableEmail("user@yopmail.com ")).toBe(true);
  });

  it("uses last @ for domain extraction", () => {
    // Multiple @ signs — uses the last one
    expect(isDisposableEmail("user@tag@yopmail.com")).toBe(true);
    expect(isDisposableEmail("user@tag@gmail.com")).toBe(false);
  });
});
