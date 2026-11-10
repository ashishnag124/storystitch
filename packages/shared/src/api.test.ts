import { describe, expect, it } from "vitest";
import { EntitlementCheckSchema } from "./api";

describe("EntitlementCheckSchema", () => {
  it("accepts only RevenueCat's anonymous IDs, so an account's ID can't be checked without its session", () => {
    expect(EntitlementCheckSchema.safeParse({ appUserId: "$RCAnonymousID:0123456789abcdef0123456789abcdef" }).success).toBe(true);
    for (const appUserId of [
      "user_123",
      "$RCAnonymousID:",
      "$RCAnonymousID:0123456789ABCDEF0123456789ABCDEF",
      "$RCAnonymousID:0123456789abcdef0123456789abcdef0",
    ]) {
      expect(EntitlementCheckSchema.safeParse({ appUserId }).success).toBe(false);
    }
  });
});
