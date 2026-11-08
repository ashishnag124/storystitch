import { STORY_CANVAS } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { MARK_TEXT, markFontSize, markLayout } from "./mark";

describe("AC-EXPORT-09 markLayout", () => {
  const { width: W, height: H } = STORY_CANVAS;
  // A generous width for the name: in Bricolage Grotesque Bold it measures about 0.5 em a letter.
  const layout = markLayout(STORY_CANVAS, markFontSize(STORY_CANVAS) * 0.55 * MARK_TEXT.length);
  const right = layout.text.x + markFontSize(STORY_CANVAS) * 0.55 * MARK_TEXT.length;

  it("is no wider than a quarter of the image", () => {
    expect(right - layout.logo.x).toBeLessThanOrEqual(W / 4);
  });

  it("sits in from the lower right corner, clear of a layout's 28px outer margin and its photo's rounded corner", () => {
    const bottom = layout.text.y + layout.fontSize * 0.25;
    expect(right).toBeLessThan(W - 56);
    expect(right).toBeGreaterThan(W - 90);
    expect(bottom).toBeLessThan(H - 56);
    expect(bottom).toBeGreaterThan(H - 100);
  });
});
