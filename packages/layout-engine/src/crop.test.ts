import { describe, expect, it } from "vitest";
import { CENTER_CROP, MAX_ZOOM, clampCrop, leavesUncovered, panCrop, sourceRect, upscaleFactor } from "./crop";

const wide = { width: 4000, height: 3000 };
const tallFrame = { width: 1080, height: 960 };

describe("crop", () => {
  it("AC-CROP-06 center crop covers the frame with the largest region of the photo", () => {
    expect(sourceRect(wide, tallFrame, CENTER_CROP)).toEqual({ x: 312.5, y: 0, width: 3375, height: 3000 });
    expect(sourceRect({ width: 1000, height: 2000 }, { width: 1000, height: 500 }, CENTER_CROP)).toEqual({
      x: 0,
      y: 750,
      width: 1000,
      height: 500,
    });
  });

  it("AC-CROP-06 zoom shrinks the region around the center and is capped", () => {
    expect(sourceRect(wide, tallFrame, { ...CENTER_CROP, zoom: 2 })).toEqual({
      x: 1156.25,
      y: 750,
      width: 1687.5,
      height: 1500,
    });
    expect(sourceRect(wide, tallFrame, { ...CENTER_CROP, zoom: 99 })).toEqual(
      sourceRect(wide, tallFrame, { ...CENTER_CROP, zoom: MAX_ZOOM }),
    );
  });

  it("AC-CROP-06 never shows past the photo's edge", () => {
    expect(sourceRect(wide, tallFrame, { cx: 0, cy: 0, zoom: 1 }).x).toBe(0);
    expect(clampCrop(wide, tallFrame, { cx: 1, cy: 0.5, zoom: 1 }).cx).toBeCloseTo(1 - 3375 / 2 / 4000);
  });

  it("AC-CROP-06 pans with the finger", () => {
    const panned = panCrop(wide, tallFrame, CENTER_CROP, 54, 0); // drag right by 5% of the frame
    expect(sourceRect(wide, tallFrame, panned).x).toBeCloseTo(312.5 - 168.75);
    expect(sourceRect(wide, tallFrame, panCrop(wide, tallFrame, CENTER_CROP, 500, 0)).x).toBe(0);
  });

  it("AC-CROP-07 a photo leaves part of its cell uncovered only when zoomed out", () => {
    expect(leavesUncovered(wide, tallFrame, CENTER_CROP)).toBe(false);
    expect(leavesUncovered(wide, tallFrame, { cx: 0.2, cy: 0.9, zoom: 2 })).toBe(false);
    expect(leavesUncovered(wide, tallFrame, { cx: 0.5, cy: 0.5, zoom: 0.999999 })).toBe(false); // under a hundredth of a pixel short
    expect(leavesUncovered(wide, tallFrame, { cx: 0.5, cy: 0.5, zoom: 0.8 })).toBe(true);
    expect(leavesUncovered(wide, tallFrame, { cx: 0.5, cy: 0.5, zoom: 0 })).toBe(true); // clamped to the 0.5 minimum
  });

  it("AC-CROP-07 the cover rectangle for the blurred fill is the center crop at zoom 1", () => {
    const thin = { width: 200, height: 1000 };
    const cover = sourceRect(wide, thin, CENTER_CROP);
    expect(cover.height).toBe(3000);
    expect(cover.width / cover.height).toBeCloseTo(thin.width / thin.height);
    expect(leavesUncovered(wide, thin, CENTER_CROP)).toBe(false);
  });

  it("AC-EXPORT-04 measures upscaling", () => {
    expect(upscaleFactor({ width: 540, height: 960 }, { width: 1080, height: 1920 }, CENTER_CROP)).toBe(2);
    expect(upscaleFactor(wide, tallFrame, CENTER_CROP)).toBeLessThan(1);
  });
});
