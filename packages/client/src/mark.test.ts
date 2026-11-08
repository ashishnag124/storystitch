import { SAFE_ZONE, STORY_CANVAS } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { MARK_TEXT, markFontSize, markLayout } from "./mark";

describe("AC-EXPORT-09 markLayout", () => {
  const { width: W, height: H } = STORY_CANVAS;
  // A generous width for the name: bold letters average well under 0.6 em.
  const layout = markLayout(STORY_CANVAS, markFontSize(STORY_CANVAS) * 0.6 * MARK_TEXT.length);
  const right = layout.text.x + markFontSize(STORY_CANVAS) * 0.6 * MARK_TEXT.length;

  it("is no wider than a quarter of the image", () => {
    expect(right - layout.logo.x).toBeLessThanOrEqual(W / 4);
  });

  it("sits in the lower right, clear of Instagram's overlays", () => {
    expect(right).toBeCloseTo(W * (1 - SAFE_ZONE.sides));
    expect(layout.logo.x).toBeGreaterThan(W / 2);
    expect(layout.logo.y).toBeGreaterThan(H / 2);
    expect(layout.text.y + layout.fontSize * 0.25).toBeCloseTo(H * (1 - SAFE_ZONE.bottom));
  });
});
