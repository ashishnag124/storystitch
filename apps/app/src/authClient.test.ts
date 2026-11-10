import { describe, expect, it, vi } from "vitest";
import { errorMessage } from "./authClient";

vi.mock("./platform/auth", () => ({ authClient: {} }));

// The bodies are what the API sends, from apps/api with Better Auth's captcha plugin.
describe("AC-AUTH-14 account errors name the problem", () => {
  it("says the bot check didn't go through only when it didn't", () => {
    expect(errorMessage({ status: 403, code: "VERIFICATION_FAILED", message: "Captcha verification failed" })).toMatch(/bot check didn't go through/);
    expect(errorMessage({ status: 400, code: "MISSING_RESPONSE", message: "Missing CAPTCHA response" })).toMatch(/bot check didn't go through/);
  });

  it("asks for a valid email when it's empty or malformed, not for another bot check", () => {
    for (const error of [
      { status: 400, code: "VALIDATION_ERROR", message: "[body.email] Invalid email address" },
      { status: 400, code: "INVALID_EMAIL", message: "Invalid email" },
    ]) {
      expect(errorMessage(error)).toBe("Enter a valid email address.");
    }
  });

  it("says the bot check took too long when the API couldn't check it, so trying again makes sense", () => {
    expect(errorMessage({ status: 500, code: "UNKNOWN_ERROR", message: "Something went wrong" })).toBe("The bot check took too long. Please try again.");
  });

  it("never shows the API's raw message", () => {
    expect(errorMessage({ status: 400, code: "VALIDATION_ERROR", message: "[body.password] Too small" })).toBe("Something went wrong. Please try again.");
  });
});
