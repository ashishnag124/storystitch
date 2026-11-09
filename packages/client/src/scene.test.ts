import { CENTER_CROP, type Detection } from "@storystitch/layout-engine";
import { STORY_CANVAS, layouts, layoutsFor, type Layout } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BACKGROUND,
  DEFAULT_STYLE,
  POLAROID,
  PRINT_BORDER,
  backgroundOf,
  borderOf,
  cellShapes,
  newScene,
  rankedScenes,
  safeInsets,
  styleScale,
  swapCells,
  withCrop,
  withStyle,
  type CropSource,
} from "./scene";

const byId = (id: string) => layouts.find((l) => l.id === id)!;
const style = { ...DEFAULT_STYLE, gap: 20, margin: 40 };
const plain = (n: number): CropSource[] => Array.from({ length: n }, () => ({ width: 4000, height: 3000, detections: [] }));

describe("AC-STYLE-06 cellShapes", () => {
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

  it("AC-LAYOUT-05 puts a Polaroid's photo in a window with a deeper margin below", () => {
    const [shape] = cellShapes(byId("two-polaroids"), style, STORY_CANVAS);
    const card = shape!.outline.kind === "polygon" ? shape!.outline.points : [];
    const cardWidth = Math.hypot(card[1]!.x - card[0]!.x, card[1]!.y - card[0]!.y);
    const cardHeight = Math.hypot(card[3]!.x - card[0]!.x, card[3]!.y - card[0]!.y);
    expect(shape!.photo).toBeDefined();
    expect(shape!.frame.width).toBeCloseTo(cardWidth * (1 - 2 * POLAROID.side));
    expect(shape!.frame.height).toBeCloseTo(cardHeight - cardWidth * (POLAROID.side + POLAROID.bottom));
    // The window sits above the card's center (the card is tilted, so measure along its own up direction).
    const center = { x: card.reduce((s, p) => s + p.x, 0) / 4, y: card.reduce((s, p) => s + p.y, 0) / 4 };
    const a = (shape!.frame.rotate * Math.PI) / 180;
    const up = (center.x - shape!.frame.cx) * -Math.sin(a) + (center.y - shape!.frame.cy) * Math.cos(a);
    expect(up).toBeCloseTo((cardWidth * (POLAROID.bottom - POLAROID.side)) / 2);
  });

  it("scales style with the canvas", () => {
    const [top] = cellShapes(byId("two-stack"), style, { width: 108, height: 192 });
    expect(top!.frame.width).toBeCloseTo(100);
  });
});

describe("AC-CROP-03 safeInsets", () => {
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

describe("AC-EDIT-08 scene edits", () => {
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
  it("AC-RANK-03 offers every layout for the photo count, each with every photo placed once", () => {
    const scenes = rankedScenes(plain(5));
    expect(scenes.map((s) => s.layout.id).sort()).toEqual(layoutsFor(5).map((l) => l.id).sort());
    for (const s of scenes) expect([...s.order].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it("AC-RANK-01 puts a portrait photo full bleed and frames a landscape one", () => {
    const portrait = [{ width: 1080, height: 1920, detections: [] }];
    expect(rankedScenes(portrait)[0]!.layout.id).toBe("single-bleed");
    expect(rankedScenes(plain(1))[0]!.layout.id).toBe("single-framed");
  });

  it("AC-RANK-06 puts a layout the photos fill first for odd photo counts", () => {
    const person = { kind: "person", score: 0.9, box: { x: 0.35, y: 0.25, w: 0.3, h: 0.4 } } as const;
    const portrait = { width: 3024, height: 4032, detections: [person] };
    const landscape = { width: 4032, height: 3024, detections: [person] };
    const filled = (l: Layout) => ["grid", "feature", "mosaic", "diagonal"].includes(l.family) || l.id.endsWith("-wave");
    for (const n of [3, 5, 7]) {
      for (const photos of [Array(n).fill(portrait), Array(n).fill(landscape)]) {
        const top = rankedScenes(photos)[0]!.layout;
        expect(filled(top), top.id).toBe(true);
      }
    }
  });
});

describe("style", () => {
  it("AC-STYLE-02 defaults to each layout's own background and border", () => {
    expect(backgroundOf(byId("single-framed"), DEFAULT_STYLE)).toEqual({ kind: "blur" });
    expect(backgroundOf(byId("two-stack"), DEFAULT_STYLE)).toEqual(DEFAULT_BACKGROUND);
    expect(borderOf(byId("three-scattered"), DEFAULT_STYLE)).toBe(PRINT_BORDER);
    expect(borderOf(byId("three-stack"), DEFAULT_STYLE)).toBe(0);
    expect(borderOf(byId("three-inset"), DEFAULT_STYLE)).toBe(PRINT_BORDER);
    expect(borderOf(byId("four-polaroids"), DEFAULT_STYLE)).toBe(0);
    expect(backgroundOf(byId("four-polaroids"), DEFAULT_STYLE)).toEqual({ kind: "blur" });
  });

  it("AC-STYLE-02 uses the user's picks over the layout's defaults", () => {
    const picked = { ...DEFAULT_STYLE, background: { kind: "color", color: "#111111" } as const, border: 0 };
    expect(backgroundOf(byId("single-framed"), picked)).toEqual({ kind: "color", color: "#111111" });
    expect(borderOf(byId("three-scattered"), picked)).toBe(0);
  });

  it("AC-STYLE-05 has no spacing, corners or border on bleed layouts", () => {
    expect(styleScale(byId("single-bleed"), { ...DEFAULT_STYLE, border: 20 }, STORY_CANVAS)).toEqual({
      gap: 0,
      margin: 0,
      radius: 0,
      border: 0,
    });
  });

  it("AC-STYLE-04 keeps manual crops when restyling, fitted to the resized cells", () => {
    const photos = plain(2);
    const scene = withCrop(newScene(byId("two-stack"), photos), 0, { cx: 0.3, cy: 0.5, zoom: 2 });
    const restyled = withStyle(scene, { ...DEFAULT_STYLE, margin: 90 }, photos);
    expect(restyled.style.margin).toBe(90);
    expect(restyled.crops[0]).toEqual({ cx: 0.3, cy: 0.5, zoom: 2 });
    expect(restyled.order).toEqual(scene.order);
  });
});
