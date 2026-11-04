import { describe, expect, it } from "vitest";
import { detectPlatform } from "./device.web";

describe("AC-PICK-09 detectPlatform", () => {
  it("recognises Android phones, iPhones and iPads (which claim to be Macs), and treats the rest as desktop", () => {
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/130 Mobile Safari/537.36" })).toBe("android");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148 Safari/604.1" })).toBe("ios");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 5 })).toBe("ios");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", maxTouchPoints: 0 })).toBe("desktop");
    expect(detectPlatform({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130 Safari/537.36" })).toBe("desktop");
  });
});
