import { describe, expect, it } from "vitest";
import { parseEmailLink } from "./emailLink";

const API = "https://api-staging.storystitch.ashishnag.com";
const callback = "callbackURL=https%3A%2F%2Fstaging.storystitch.ashishnag.com%2Faccount%3Fwelcome%3D1";

describe("AC-AUTH-13 links from emails", () => {
  it("reads the token from a confirmation link", () => {
    expect(parseEmailLink(`${API}/api/auth/verify-email?token=abc.def&${callback}`)).toEqual({ kind: "verify-email", token: "abc.def" });
  });

  it("reads the token from a password reset link", () => {
    expect(parseEmailLink(`${API}/api/auth/reset-password/tok123?${callback}`)).toEqual({ kind: "reset-password", token: "tok123" });
  });

  it("ignores every other link", () => {
    expect(parseEmailLink(`${API}/api/auth/verify-email`)).toBeNull();
    expect(parseEmailLink(`${API}/api/auth/reset-password`)).toBeNull();
    expect(parseEmailLink(`${API}/health`)).toBeNull();
    expect(parseEmailLink("storystitch-staging://bot-check")).toBeNull();
  });
});
