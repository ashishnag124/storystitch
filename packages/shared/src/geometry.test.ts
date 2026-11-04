import { describe, expect, it } from "vitest";
import { cellContains, cellFrame, cellPolygon, drawOrder, hitTest, insetPolygon } from "./geometry";
import { CellSchema, STORY_CANVAS, type Cell } from "./layout";

const size = { width: 100, height: 100 };
const cell = (raw: unknown) => CellSchema.parse(raw);

describe("AC-LAYOUT-05 geometry", () => {
  it("insets a square by d on every side", () => {
    const square = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inset = insetPolygon(square, 2).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    expect(inset).toEqual([
      { x: 2, y: 2 },
      { x: 8, y: 2 },
      { x: 8, y: 8 },
      { x: 2, y: 8 },
    ]);
  });

  it("tests containment of a rotated rect", () => {
    const tilted = cell({ shape: "rect", x: 0.25, y: 0.45, w: 0.5, h: 0.1, rotate: 45 });
    expect(cellContains(tilted, { x: 50, y: 50 }, size)).toBe(true);
    expect(cellContains(tilted, { x: 70, y: 50 }, size)).toBe(false); // on the unrotated rect, off the rotated one
    expect(cellContains(tilted, { x: 65, y: 65 }, size)).toBe(true);
  });

  it("keeps a circle round on a non-square canvas", () => {
    const circle = cell({ shape: "circle", cx: 0.5, cy: 0.5, r: 0.25 });
    expect(cellFrame(circle, { width: 1080, height: 1920 })).toMatchObject({ width: 540, height: 540 });
  });

  it("hit-tests the topmost cell", () => {
    const cells = [
      cell({ shape: "rect", x: 0, y: 0, w: 1, h: 1, z: 1 }),
      cell({ shape: "rect", x: 0.4, y: 0.4, w: 0.2, h: 0.2 }),
    ];
    expect(hitTest(cells, { x: 50, y: 50 }, size)).toBe(0);
    expect(drawOrder(cells)).toEqual([1, 0]);
  });

  it("insets a concave polygon by d on every side", () => {
    // An L: the inner corner moves inward too.
    const ell = [
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 4, y: 6 },
      { x: 10, y: 6 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ];
    const inset = insetPolygon(ell, 1).map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
    expect(inset).toEqual([
      { x: 1, y: 1 },
      { x: 3, y: 1 },
      { x: 3, y: 7 },
      { x: 9, y: 7 },
      { x: 9, y: 9 },
      { x: 1, y: 9 },
    ]);
  });

  it("hit-tests arches, capsules, hearts and stars by their curved outlines", () => {
    const arch = cell({ shape: "arch", x: 0.2, y: 0.2, w: 0.6, h: 0.6 });
    expect(cellContains(arch, { x: 50, y: 25 }, size)).toBe(true); // top of the curve
    expect(cellContains(arch, { x: 22, y: 22 }, size)).toBe(false); // the corner the curve cuts off
    expect(cellContains(arch, { x: 22, y: 78 }, size)).toBe(true); // square bottom corner

    const pill = cell({ shape: "pill", x: 0.1, y: 0.4, w: 0.8, h: 0.2 });
    expect(cellContains(pill, { x: 11, y: 41 }, size)).toBe(false);
    expect(cellContains(pill, { x: 50, y: 41 }, size)).toBe(true);

    const heart = cell({ shape: "heart", cx: 0.5, cy: 0.5, r: 0.4 });
    expect(cellContains(heart, { x: 30, y: 40 }, size)).toBe(true); // a lobe
    expect(cellContains(heart, { x: 50, y: 17 }, size)).toBe(false); // the notch between the lobes
    expect(cellContains(heart, { x: 15, y: 75 }, size)).toBe(false);

    const star = cell({ shape: "star", cx: 0.5, cy: 0.5, r: 0.4 });
    expect(cellContains(star, { x: 50, y: 50 }, size)).toBe(true);
    expect(cellContains(star, { x: 50, y: 16 }, size)).toBe(true); // the top point
    expect(cellContains(star, { x: 30, y: 25 }, size)).toBe(false); // between two points
    expect(cellFrame(star, size).width).toBeCloseTo(2 * 0.4 * 100 * Math.cos(Math.PI / 10));
  });

  it("keeps a wavy edge and the wavy edge below it parallel, so the gap between them is even", () => {
    const wave = (raw: unknown) => cell(raw) as Extract<Cell, { shape: "wave" }>;
    const top = wave({ shape: "wave", x: 0, y: 0, w: 1, h: 0.5, waves: ["bottom"] });
    const bottom = wave({ shape: "wave", x: 0, y: 0.5, w: 1, h: 0.5, waves: ["top"] });
    const gap = 20;
    const a = insetPolygon(cellPolygon(top, STORY_CANVAS), gap / 2);
    const b = insetPolygon(cellPolygon(bottom, STORY_CANVAS), gap / 2);
    // Every point on the lower cell's wavy top is a full gap from the upper cell's outline.
    const waveTop = b.slice(1, b.length / 2);
    for (const p of waveTop) {
      const nearest = Math.min(...a.map((q) => Math.hypot(p.x - q.x, p.y - q.y)));
      expect(nearest).toBeGreaterThan(gap * 0.9);
      expect(nearest).toBeLessThan(gap * 1.5);
    }
  });
});
