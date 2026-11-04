/**
 * Which photo-source buttons a device can offer. Android opens its photo picker and file browser directly, but
 * iPhone Safari routes every file input through Apple's own menu (Photo Library / Take Photo / Choose File), so it
 * gets one "Choose photos" button instead of two.
 */
export type Platform = "ios" | "android" | "desktop";

export function detectPlatform(nav: { userAgent: string; maxTouchPoints?: number }): Platform {
  if (/Android/i.test(nav.userAgent)) return "android";
  // iPadOS reports itself as a Mac; touch support gives it away.
  if (/iPhone|iPad|iPod/i.test(nav.userAgent) || (/Macintosh/.test(nav.userAgent) && (nav.maxTouchPoints ?? 0) > 1)) {
    return "ios";
  }
  return "desktop";
}
