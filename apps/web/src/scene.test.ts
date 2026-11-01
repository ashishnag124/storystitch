import { CENTER_CROP, type Detection } from "@storystitch/layout-engine";
import { STORY_CANVAS, layouts, layoutsFor } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, cellShapes, newScene, rankedScenes, safeInsets, swapCells, withCrop, type CropSource } from "./scene";

const byId = (id: string) => layouts.find((l) => l.id === id)!;
const style = { ...DEFAULT_STYLE, gap: 20, margin: 40 };
const plain = (n: number): CropSource[] => Array.from({ length: n }, () => ({ width: 4000, height: 3000, detections: [] }));

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

describe("safeInsets", () => {
  it("measures how much of a full-bleed frame sits under each band", () => {
    expect(safeInsets({ cx: 540, cy: 960, width: 1080, height: 1920, rotate: 0 })).toEqual({
      top: 0.14,
      bottom: expect.closeTo(0.18) as number,
      left: expect.closeTo(0.06) as number,
      right: expect.closeTo(0.06) as number,
    });
  });

  it("is zero for a frame clear of every band", () => {
    expect(safeInsets({ cx: 540, cy: 960, width: 400, height: 400, rotate: 0 })).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});

describe("scene edits", () => {
  const moved = { cx: 0.2, cy: 0.3, zoom: 2 };
  // A face near the right edge of photo 3.
  const face: Detection = { kind: "face", score: 0.9, box: { x: 0.85, y: 0.3, w: 0.08, h: 0.1 } };
  const photos = plain(4).map((p, i) => (i === 3 ? { ...p, detections: [face] } : p));

  it("starts from smart crops", () => {
    const scene = newScene(byId("four-grid"), photos);
    expect(scene.crops[0]).toEqual(CENTER_CROP);
    expect(scene.crops[3]!.cx).toBeGreaterThan(0.6);
  });

  it("swaps photos and recomputes both crops for their new cells", () => {
    const scene = swapCells(withCrop(newScene(byId("four-grid"), photos), 0, moved), 0, 3, photos);
    expect(scene.order).toEqual([3, 1, 2, 0]);
    expect(scene.crops[0]!.cx).toBeGreaterThan(0.6); // photo 3's face, now in cell 0
    expect(scene.crops[3]).toEqual(CENTER_CROP);
  });

});

describe("rankedScenes", () => {
  it("offers every layout for the photo count, each with every photo placed once", () => {
    const scenes = rankedScenes(plain(5));
    expect(scenes.map((s) => s.layout.id).sort()).toEqual(layoutsFor(5).map((l) => l.id).sort());
    for (const s of scenes) expect([...s.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("puts a portrait photo full bleed and frames a landscape one", () => {
    const portrait = [{ width: 1080, height: 1920, detections: [] }];
    expect(rankedScenes(portrait)[0]!.layout.id).toBe("single-bleed");
    expect(rankedScenes(plain(1))[0]!.layout.id).toBe("single-framed");
  });
});
