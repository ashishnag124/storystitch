import { describe, expect, it } from "vitest";
import { cellContains, cellFrame, drawOrder, hitTest, insetPolygon } from "./geometry";
import { CellSchema } from "./layout";

const size = { width: 100, height: 100 };
const cell = (raw: unknown) => CellSchema.parse(raw);

describe("geometry", () => {
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
});
