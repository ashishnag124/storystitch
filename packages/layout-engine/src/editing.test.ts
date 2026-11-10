import { LayoutSchema, STORY_CANVAS, cellContains, cellPolygon, layoutProblems, layouts, type Cell, type Layout } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import {
  FIT_MAX_SHIFT,
  MIN_CELL,
  bringToFront,
  cornerLines,
  cornerSteps,
  cornersLayout,
  cornersOf,
  duplicateCell,
  editModeOf,
  fitGrid,
  gridDividers,
  gridLayout,
  gridOf,
  moveCell,
  moveCorner,
  moveDivider,
  moveLine,
  removeCell,
  removeGridCell,
  reshapeCell,
  rotateCell,
  scaleCell,
  snapTo,
  splitCell,
} from "./editing";

const byId = (id: string) => layouts.find((l) => l.id === id)!;
const { width: W, height: H } = STORY_CANVAS;
const polygonArea = (c: Cell) => {
  const p = cellPolygon(c as Exclude<Cell, { shape: "circle" }>);
  return Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * a.y, 0)) / 2;
};
const valid = (layout: Layout) => expect(layoutProblems(layout, 20)).toEqual([]);

describe("editModeOf", () => {
  it.each([
    ["four-grid", "grid"],
    ["three-wave", "grid"],
    ["three-arches", "grid"],
    ["six-negative", "grid"],
    ["six-diagonal", "corners"],
    ["four-pinwheel", "corners"],
    ["seven-hexagons", "corners"],
    ["five-circles", "free"],
    ["four-polaroids", "free"],
    ["three-scattered", "free"],
    ["three-heart", "free"],
  ])("AC-CUSTOM-01 edits %s as %s", (id, mode) => {
    expect(editModeOf(byId(id))).toBe(mode);
  });
});

describe("AC-CUSTOM-02 grids", () => {
  const grids = layouts.filter((l) => gridOf(l));

  it.each(grids.map((l) => [l.id, l] as const))("reads %s as a grid and writes it back unchanged", (_, layout) => {
    const { layout: back, origin } = gridLayout(layout, gridOf(layout)!);
    // Within rounding: the data leaves 0.0001 between some cells (0.3333 + 0.3333 next to 0.6667).
    back.cells.forEach((c, i) => {
      const was = layout.cells[i] as Record<string, unknown>;
      for (const [k, v] of Object.entries(c)) expect(v).toEqual(typeof v === "number" ? expect.closeTo(was[k] as number, 3) : was[k]);
    });
    expect(origin).toEqual(layout.cells.map((_, i) => i));
  });

  it("moves a line, resizing only the cells on either side of it", () => {
    const grid = gridOf(byId("two-stack"))!;
    const [line] = gridDividers(grid);
    expect(line).toMatchObject({ dir: "across", at: 0.5, from: 0, to: 1 });
    const { layout } = gridLayout(byId("two-stack"), moveDivider(grid, line!.path, 0.6));
    expect(layout.cells.map((c) => (c as { h: number }).h)).toEqual([0.6, 0.4]);
  });

  it("stops a line before a cell gets smaller than the minimum", () => {
    const grid = gridOf(byId("two-stack"))!;
    const [line] = gridDividers(grid);
    const moved = gridDividers(moveDivider(grid, line!.path, 0.999))[0]!;
    expect(moved.at).toBeCloseTo(1 - (MIN_CELL * W) / H);
  });

  it("moves an inner line without touching the cells it doesn't border", () => {
    const four = byId("four-grid");
    const grid = gridOf(four)!;
    const inner = gridDividers(grid).find((d) => d.path !== "")!;
    const { layout } = gridLayout(four, moveDivider(grid, inner.path, inner.at + 0.1));
    const changed = layout.cells.filter((c, i) => JSON.stringify(c) !== JSON.stringify(four.cells[i]));
    expect(changed).toHaveLength(2);
    valid(layout);
  });

  it("splits a cell across or down, keeping the old cells' order and adding the new one last", () => {
    const across = splitCell(byId("two-stack"), 0, "across")!;
    expect(across.layout.cells).toHaveLength(3);
    expect(across.origin).toEqual([0, 1, null]);
    valid(across.layout);
    const down = splitCell(across.layout, 2, "down")!;
    expect(down.layout.cells).toHaveLength(4);
    valid(down.layout);
  });

  it("won't split a cell into halves smaller than the minimum", () => {
    let layout = byId("single-bleed");
    for (let i = 0; i < 3; i++) layout = splitCell(layout, 0, "down")!.layout;
    expect(splitCell(layout, 0, "down")).toBeNull();
  });

  it("removes a cell and grows its neighbour into the space", () => {
    const { layout, origin } = removeGridCell(byId("three-stack"), 1)!;
    expect(origin).toEqual([0, 2]);
    const total = layout.cells.reduce((s, c) => s + (c as { h: number }).h, 0);
    expect(total).toBeCloseTo(1);
    valid(layout);
    expect(removeGridCell(byId("single-bleed"), 0)).toBeNull();
  });

  it("reshapes a cell into an arch only where it's tall enough", () => {
    expect(reshapeCell(byId("three-arches"), 0, "rect")!.layout.cells[0]!.shape).toBe("rect");
    expect(reshapeCell(byId("two-stack"), 0, "pill")!.layout.cells[0]!.shape).toBe("pill");
    let strips = byId("single-bleed");
    for (let i = 0; i < 3; i++) strips = splitCell(strips, 0, "across")!.layout; // wide, short cells
    expect(reshapeCell(strips, 0, "arch")).toBeNull();
  });

  it("keeps waves paired: a new line inside a wavy stack is straight", () => {
    const split = splitCell(byId("two-wave"), 0, "across")!;
    valid(split.layout);
    const removed = removeGridCell(byId("three-wave"), 1)!;
    valid(removed.layout);
  });
});

describe("AC-CUSTOM-10 steps for VoiceOver", () => {
  it("offers every direction to a free corner and each one moves it", () => {
    const pin = byId("four-pinwheel");
    const corners = cornersOf(pin)!;
    const center = corners.points.findIndex((p) => Math.abs(p.x - W / 2) < 1 && Math.abs(p.y - H / 2) < 1);
    const from = corners.points[center]!;
    const steps = cornerSteps(corners.locks[center]!);
    expect(steps.map((s) => s.name)).toEqual(["Move up", "Move down", "Move left", "Move right"]);
    for (const { by } of steps) {
      const moved = moveCorner(pin, corners, center, { x: from.x + by.x * 40, y: from.y + by.y * 40 })!;
      expect(moved.points[center]).toEqual({ x: from.x + by.x * 40, y: from.y + by.y * 40 });
    }
  });

  it("offers an edge corner only the ways along its edge, and a canvas corner none", () => {
    const six = byId("six-diagonal");
    const corners = cornersOf(six)!;
    const onLeft = corners.points.findIndex((p) => p.x < 1 && p.y > 100 && p.y < H - 100);
    expect(cornerSteps(corners.locks[onLeft]!).map((s) => s.name)).toEqual(["Move up", "Move down"]);
    const topLeft = corners.points.findIndex((p) => p.x < 1 && p.y < 1);
    expect(cornerSteps(corners.locks[topLeft]!)).toEqual([]);
  });
});

describe("AC-CUSTOM-03 corners", () => {
  it("reads slanted bands as shared corners and writes back the same cells", () => {
    const six = byId("six-diagonal");
    const back = cornersLayout(six, cornersOf(six)!);
    valid(back);
    back.cells.forEach((c, i) => expect(polygonArea(c)).toBeCloseTo(polygonArea(six.cells[i]!), 0));
  });

  it("moves a shared corner for every cell that shares it", () => {
    const pin = byId("four-pinwheel");
    const corners = cornersOf(pin)!;
    const center = corners.points.findIndex((p) => Math.abs(p.x - W / 2) < 1 && Math.abs(p.y - H / 2) < 1);
    expect(corners.locks[center]).toEqual({ kind: "free" });
    const moved = moveCorner(pin, corners, center, { x: 600, y: 900 })!;
    const layout = cornersLayout(pin, moved);
    for (const cell of layout.cells) expect(cellPolygon(cell as Exclude<Cell, { shape: "circle" }>)).toContainEqual(expect.objectContaining({ x: expect.closeTo(600, 0), y: expect.closeTo(900, 0) }));
    valid(layout);
  });

  it("keeps canvas corners still and edge corners on their edge", () => {
    const pin = byId("four-pinwheel");
    const corners = cornersOf(pin)!;
    const topLeft = corners.points.findIndex((p) => p.x < 1 && p.y < 1);
    expect(moveCorner(pin, corners, topLeft, { x: 100, y: 100 })).toBeNull();

    const six = byId("six-diagonal");
    const sc = cornersOf(six)!;
    const onLeft = sc.points.findIndex((p) => p.x < 1 && p.y > 100 && p.y < H - 100);
    const moved = moveCorner(six, sc, onLeft, { x: 200, y: sc.points[onLeft]!.y + 40 })!;
    expect(moved.points[onLeft]!.x).toBeCloseTo(0);
    expect(moved.points[onLeft]!.y).toBeCloseTo(sc.points[onLeft]!.y + 40);
  });

  it("refuses a move that would fold a cell inside out", () => {
    const pin = byId("four-pinwheel");
    const corners = cornersOf(pin)!;
    const center = corners.points.findIndex((p) => Math.abs(p.x - W / 2) < 1 && Math.abs(p.y - H / 2) < 1);
    expect(moveCorner(pin, corners, center, { x: 5, y: H / 2 })).toBeNull();
  });

  it("shifts a whole line between bands, keeping the corners on it in line", () => {
    const six = byId("six-diagonal");
    const corners = cornersOf(six)!;
    const lines = cornerLines(corners);
    expect(lines).toHaveLength(2);
    const moved = moveLine(six, corners, lines[0]!, { x: 0, y: 60 })!;
    const layout = cornersLayout(six, moved);
    valid(layout);
    const [a, ...rest] = lines[0]!.members.map((m) => moved.points[m]!);
    const b = rest.at(-1)!;
    for (const p of rest) expect(Math.abs((b.x - a!.x) * (p.y - a!.y) - (b.y - a!.y) * (p.x - a!.x)) / Math.hypot(b.x - a!.x, b.y - a!.y)).toBeLessThan(1);
  });
});

describe("AC-CUSTOM-04 free cells", () => {
  // Fixed copies of library layouts as first drawn, so redrawing the library doesn't move these cases.
  const fixed = {
    fiveCircles: LayoutSchema.parse({ id: "five-circles", name: "Circle with four around", family: "circles", cells: [
      { shape: "circle", cx: 0.5, cy: 0.48, r: 0.3 },
      { shape: "circle", cx: 0.25, cy: 0.21, r: 0.17 },
      { shape: "circle", cx: 0.75, cy: 0.21, r: 0.17 },
      { shape: "circle", cx: 0.25, cy: 0.76, r: 0.17 },
      { shape: "circle", cx: 0.75, cy: 0.76, r: 0.17 },
    ] }),
    twoCircles: LayoutSchema.parse({ id: "two-circles", name: "Two circles", family: "circles", cells: [
      { shape: "circle", cx: 0.4, cy: 0.31, r: 0.34 },
      { shape: "circle", cx: 0.6, cy: 0.67, r: 0.3 },
    ] }),
    fourPolaroids: LayoutSchema.parse({ id: "four-polaroids", name: "Four Polaroids", family: "polaroid", allowOverlap: true, blurBackground: true, cells: [
      { shape: "rect", x: 0.04, y: 0.12, w: 0.46, h: 0.3053, rotate: -5 },
      { shape: "rect", x: 0.5, y: 0.16, w: 0.46, h: 0.3053, rotate: 4, z: 1 },
      { shape: "rect", x: 0.05, y: 0.47, w: 0.46, h: 0.3053, rotate: 3, z: 2 },
      { shape: "rect", x: 0.49, y: 0.5, w: 0.46, h: 0.3053, rotate: -4, z: 3 },
    ] }),
  };

  it("moves a circle, and won't push it out of the canvas or into another circle", () => {
    const five = fixed.fiveCircles;
    const moved = moveCell(five, 1, 0.02, 0.01)!;
    expect(moved.cells[1]).toMatchObject({ cx: expect.closeTo(0.27), cy: expect.closeTo(0.22) });
    expect(moveCell(five, 1, -0.5, 0)).toBeNull();
    expect(moveCell(five, 1, 0.25, 0.27)).toBeNull(); // onto the big circle in the middle
  });

  it("slides along whatever is in the way", () => {
    const two = fixed.twoCircles;
    // Straight down would hit the other circle; across still fits.
    const moved = moveCell(two, 0, -0.04, 0.3)!;
    expect(moved.cells[0]).toMatchObject({ cy: two.cells[0]!.shape === "circle" ? two.cells[0]!.cy : 0 });
  });

  it("resizes a circle within the canvas", () => {
    const five = fixed.fiveCircles;
    expect(scaleCell(five, 0, 0.8)!.cells[0]).toMatchObject({ r: expect.closeTo(0.24) });
    expect(scaleCell(five, 0, 3)).toBeNull();
    expect(scaleCell(five, 0, 0.1)).toBeNull(); // below the minimum size
  });

  it("turns prints, lets overlapping layouts overlap, and brings a moved print to the front", () => {
    const prints = fixed.fourPolaroids;
    expect(rotateCell(prints, 0, -8)!.cells[0]).toMatchObject({ rotate: -8 });
    expect(rotateCell(prints, 0, 40)).toBeNull(); // its corners would leave the canvas
    const onTop = moveCell(prints, 0, 0.3, 0)!;
    expect(onTop).not.toBeNull();
    expect(bringToFront(onTop, 0).cells[0]!.z).toBe(4);
    expect(rotateCell(fixed.fiveCircles, 0, 10)).toBeNull();
  });

  it("adds a copy of a cell where it fits, and removes cells", () => {
    const two = fixed.twoCircles;
    const added = duplicateCell(scaleCell(scaleCell(two, 0, 0.6)!, 1, 0.6)!, 0)!;
    expect(added.layout.cells).toHaveLength(3);
    expect(added.origin).toEqual([0, 1, null]);
    valid(added.layout);
    expect(removeCell(added.layout, 0)!.origin).toEqual([1, 2]);
    expect(removeCell(byId("one-heart"), 0)).toBeNull();
  });

  it("keeps a moved heart's photo inside it", () => {
    const heart = moveCell(byId("one-heart"), 0, 0, 0.05)!;
    expect(cellContains(heart.cells[0]!, { x: W / 2, y: 0.53 * H })).toBe(true);
  });
});

describe("AC-RANK-08 fitGrid", () => {
  const stack = byId("two-stack");
  const line = (layout: Layout) => gridDividers(gridOf(layout)!)[0]!.at;
  const topHeight = (target: number) => (l: Layout) => Math.abs((l.cells[0] as Extract<Cell, { shape: "rect" }>).h - target);

  it("moves a line to lower the cost, at most FIT_MAX_SHIFT from where it was", () => {
    const fitted = fitGrid(stack, topHeight(0.95));
    expect(line(fitted)).toBeCloseTo(line(stack) + FIT_MAX_SHIFT, 3);
    expect(fitted.id).toBe(stack.id);
    valid(fitted);
  });

  it("never pushes a cell under Instagram's bands", () => {
    const fitted = fitGrid(stack, topHeight(0));
    expect(line(fitted)).toBeLessThan(line(stack));
    valid(fitted);
  });

  it("keeps the layout as drawn when moving gains too little, or it isn't a grid", () => {
    expect(fitGrid(stack, () => 1)).toBe(stack);
    expect(fitGrid(stack, (l) => topHeight(0.5)(l) * 0.01)).toBe(stack);
    const circles = layouts.find((l) => l.family === "circles")!;
    expect(fitGrid(circles, () => 0)).toBe(circles);
  });
});

describe("snapTo", () => {
  it("snaps to the nearest target within the threshold", () => {
    expect(snapTo(0.49, [1 / 3, 0.5], 0.02)).toBe(0.5);
    expect(snapTo(0.45, [1 / 3, 0.5], 0.02)).toBe(0.45);
  });
});
