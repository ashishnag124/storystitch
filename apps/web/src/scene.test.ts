import { CENTER_CROP } from "@storystitch/layout-engine";
import { STORY_CANVAS, layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, cellShapes, newScene, swapCells, withCrop, withLayout } from "./scene";

const byId = (id: string) => layouts.find((l) => l.id === id)!;
const style = { ...DEFAULT_STYLE, gap: 20, margin: 40 };

describe("cellShapes", () => {
  it("keeps the outer margin and a full gap between neighbours", () => {
    const [top, bottom] = cellShapes(byId("two-stack"), style, STORY_CANVAS);
    expect(top!.frame).toMatchObject({ width: 1000, height: 910, cx: 540, cy: 40 + 455 });
    expect(bottom!.frame.cy - bottom!.frame.height / 2 - (top!.frame.cy + top!.frame.height / 2)).toBeCloseTo(20);
    expect(bottom!.frame.cy + bottom!.frame.height / 2).toBeCloseTo(1920 - 40);
  });

  it("ignores margin and gap for bleed layouts", () => {
    const [only] = cellShapes(byId("single-bleed"), style, STORY_CANVAS);
    expect(only!.frame).toMatchObject({ cx: 540, cy: 960, width: 1080, height: 1920 });
  });

  it("scales style with the canvas", () => {
    const [top] = cellShapes(byId("two-stack"), style, { width: 108, height: 192 });
    expect(top!.frame.width).toBeCloseTo(100);
  });
});

describe("scene edits", () => {
  const moved = { cx: 0.2, cy: 0.3, zoom: 2 };

  it("swaps photos and re-centers both crops", () => {
    const scene = swapCells(withCrop(newScene(byId("four-grid")), 0, moved), 0, 3);
    expect(scene.order).toEqual([3, 1, 2, 0]);
    expect(scene.crops[0]).toEqual(CENTER_CROP);
  });

  it("keeps the photo order when switching layout", () => {
    const scene = withLayout(swapCells(newScene(byId("four-grid")), 0, 1), byId("four-feature"));
    expect(scene.layout.id).toBe("four-feature");
    expect(scene.order).toEqual([1, 0, 2, 3]);
  });
});
