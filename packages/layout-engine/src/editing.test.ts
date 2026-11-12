import { LayoutSchema, STORY_CANVAS, cellBounds, cellContains, editedLayoutProblems, cellPolygon, layoutProblems, layouts, type Cell, type Layout } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import {
  ADD_SHAPES,
  PALETTE_SHAPES,
  REMOVE_OFF_CANVAS,
  moveCellInside,
  moveCellLoose,
  offCanvas,
  pinchCell,
  snapRotation,
  snapSize,
  addCell,
  addCellAt,
  addPhotoCell,
  cellNear,
  cellsFit,
  drawCell,
  reshapeFreeCell,
  tidyCells,
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

describe("AC-CUSTOM-13 adding a shape", () => {
  const fine = (layout: Layout) => expect(editedLayoutProblems(layout, 20)).toEqual([]);
  const one = (): Layout => ({
    id: "t",
    name: "T",
    family: "shapes",
    allowOverlap: true,
    bleed: false,
    blurBackground: false,
    cells: [{ shape: "rect", x: 0.25, y: 0.36, w: 0.5, h: 0.28, rotate: 0, z: 0 }],
  });
  const corner = (): Layout => ({ ...one(), cells: [{ shape: "rect", x: 0.1, y: 0.02, w: 0.2, h: 0.1, rotate: 0, z: 0 }] });

  it("adds each shape in the middle when it's clear, as a new cell on top", () => {
    for (const shape of ADD_SHAPES) {
      const added = addCell(corner(), shape)!;
      expect(added.origin).toEqual([0, null]);
      expect(added.layout.cells).toHaveLength(2);
      expect(added.layout.cells[1]!.shape).toBe(shape);
      expect(added.layout.cells[1]!.z).toBe(1);
      expect(LayoutSchema.safeParse(added.layout).success).toBe(true);
      fine(added.layout);
      const b = cellBounds(added.layout.cells[1]!);
      expect(Math.abs(b.x + b.w / 2 - W / 2)).toBeLessThan(2);
      expect(Math.abs(b.y + b.h / 2 - H / 2)).toBeLessThan(2);
    }
  });

  it("finds another spot, without overlapping, when the middle is taken", () => {
    const added = addCell(one(), "circle")!;
    const b = cellBounds(added.layout.cells[1]!);
    expect(Math.abs(b.y + b.h / 2 - H / 2)).toBeGreaterThan(100);
    expect(editModeOf(added.layout)).toBe("free");
    fine(added.layout);
    let layout = added.layout;
    for (const shape of ["heart", "star", "rect"] as const) layout = addCell(layout, shape)!.layout;
    expect(layout.cells).toHaveLength(5);
    fine(layout);
  });

  it("returns null at 8 cells and when nothing fits", () => {
    const cells = Array.from({ length: 7 }, (_, i) => ({ shape: "circle" as const, cx: 0.5, cy: 0.1 + i * 0.12, r: 0.1, z: i + 1 }));
    const eight = { ...corner(), cells: [corner().cells[0]!, ...cells] };
    expect(eight.cells).toHaveLength(8);
    expect(addCell(eight, "rect")).toBeNull();
    const full = { ...one(), cells: [{ shape: "rect" as const, x: 0, y: 0, w: 1, h: 1, rotate: 0, z: 0 }] };
    expect(addCell(full, "star")).toBeNull();
  });
});

describe("AC-CUSTOM-14 drawing a cell", () => {
  const base = (): Layout => ({
    id: "t",
    name: "T",
    family: "shapes",
    allowOverlap: true,
    bleed: false,
    blurBackground: false,
    cells: [{ shape: "rect", x: 0.25, y: 0.36, w: 0.5, h: 0.28, rotate: 0, z: 0 }],
  });
  const rect = (l: Layout, i: number) => l.cells[i] as Extract<Cell, { shape: "rect" }>;

  it("adds a rectangle spanning the drag, on top, with the next photo", () => {
    const added = drawCell(base(), { x: 0.1, y: 0.1 }, { x: 0.45, y: 0.22 })!;
    expect(added.origin).toEqual([0, null]);
    expect(rect(added.layout, 1)).toMatchObject({ shape: "rect", x: 0.1, y: 0.1, w: 0.35, h: 0.12, rotate: 0, z: 1 });
    expect(LayoutSchema.safeParse(added.layout).success).toBe(true);
    expect(editedLayoutProblems(added.layout, 20)).toEqual([]);
  });

  it("gives the same cell for a drag in any direction", () => {
    const [a, b] = [{ x: 0.1, y: 0.1 }, { x: 0.45, y: 0.22 }];
    const forward = drawCell(base(), a, b)!.layout.cells[1];
    expect(drawCell(base(), b, a)!.layout.cells[1]).toEqual(forward);
    expect(drawCell(base(), { x: a.x, y: b.y }, { x: b.x, y: a.y })!.layout.cells[1]).toEqual(forward);
  });

  it("snaps edges to the canvas edges, thirds and other cells, but not when far from them", () => {
    const edge = rect(drawCell(base(), { x: 0.015, y: 0.04 }, { x: 0.34, y: 0.23 })!.layout, 1);
    expect([edge.x, edge.y, edge.w]).toEqual([0, 0.04, 0.3333]);
    const next = rect(drawCell(base(), { x: 0.05, y: 0.7 }, { x: 0.24, y: 0.9 })!.layout, 1); // right edge near the cell's left edge
    expect(next.x + next.w).toBeCloseTo(0.25, 4);
    expect(rect(drawCell(base(), { x: 0.05, y: 0.7 }, { x: 0.2, y: 0.9 }, 0.01)!.layout, 1).w).toBeCloseTo(0.15, 4);
  });

  it("clamps to the canvas", () => {
    const c = rect(drawCell(base(), { x: -0.2, y: 0.7 }, { x: 0.3, y: 1.4 }, 0)!.layout, 1);
    expect([c.x, c.y, c.h]).toEqual([0, 0.7, 0.3]);
  });

  it("returns null for a side under the minimum, at 8 cells, and when it doesn't fit", () => {
    expect(drawCell(base(), { x: 0.1, y: 0.1 }, { x: 0.15, y: 0.4 }, 0)).toBeNull(); // too narrow
    expect(drawCell(base(), { x: 0.1, y: 0.1 }, { x: 0.6, y: 0.14 }, 0)).toBeNull(); // too short
    expect(drawCell(base(), { x: 0.3, y: 0.3 }, { x: 0.3, y: 0.3 })).toBeNull(); // a tap
    const eight = { ...base(), cells: Array.from({ length: 8 }, (_, i) => ({ shape: "rect" as const, x: 0.1, y: i * 0.1, w: 0.1, h: 0.06, rotate: 0, z: i })) };
    expect(drawCell(eight, { x: 0.5, y: 0.1 }, { x: 0.9, y: 0.3 })).toBeNull();
    const tight = { ...base(), allowOverlap: false };
    expect(drawCell(tight, { x: 0.4, y: 0.4 }, { x: 0.9, y: 0.6 })).toBeNull(); // overlaps the cell where cells mustn't
    expect(drawCell(tight, { x: 0.1, y: 0.1 }, { x: 0.9, y: 0.3 })).not.toBeNull();
  });
});

const blankLayout = (cells: Cell[]): Layout => ({ id: "t", name: "T", family: "shapes", allowOverlap: true, bleed: false, blurBackground: false, cells });
const rectCell = (x: number, y: number, w: number, h: number, z = 0): Cell => ({ shape: "rect", x, y, w, h, rotate: 0, z });
const circleCell = (cx: number, cy: number, r: number, z = 0): Cell => ({ shape: "circle", cx, cy, r, z });

describe("AC-CUSTOM-13 the shape palette", () => {
  it("adds every palette shape in the middle, empty-handed and valid", () => {
    for (const shape of PALETTE_SHAPES) {
      const added = addCell(blankLayout([]), shape)!;
      expect(added.origin).toEqual([null]);
      expect(editedLayoutProblems(added.layout, 20)).toEqual([]);
      expect(LayoutSchema.safeParse(added.layout).success).toBe(true);
      const b = cellBounds(added.layout.cells[0]!);
      expect(Math.abs(b.x + b.w / 2 - W / 2)).toBeLessThan(2);
      // Each one moves and resizes like any free cell.
      expect(moveCell(added.layout, 0, 0.05, 0.05)).not.toBeNull();
      expect(scaleCell(added.layout, 0, 1.1)).not.toBeNull();
    }
    const square = addCell(blankLayout([]), "square")!.layout.cells[0] as Extract<Cell, { shape: "rect" }>;
    expect(Math.round(square.w * W)).toBe(Math.round(square.h * H));
  });

  it("adds a shape centered on a drop point, moved in to stay inside the canvas", () => {
    const at = addCellAt(blankLayout([]), "circle", { x: 0.3, y: 0.4 })!;
    expect(at.layout.cells[0]).toMatchObject({ shape: "circle", cx: 0.3, cy: 0.4 });
    const b = cellBounds(addCellAt(blankLayout([]), "heart", { x: 0.99, y: 0.01 })!.layout.cells[0]!);
    expect(b.x + b.w).toBeLessThanOrEqual(W + 0.5);
    expect(b.y).toBeGreaterThanOrEqual(-0.5);
    for (const shape of PALETTE_SHAPES) expect(editedLayoutProblems(addCellAt(blankLayout([]), shape, { x: 0, y: 1 })!.layout, 20)).toEqual([]);
    const eight = blankLayout(Array.from({ length: 8 }, (_, i) => circleCell(0.5, 0.1 + i * 0.1, 0.05, i)));
    expect(addCellAt(eight, "star", { x: 0.5, y: 0.5 })).toBeNull();
  });

  it("changes a shape, keeping its center, size, z and place in the order", () => {
    const base = blankLayout([rectCell(0.1, 0.1, 0.3, 0.2, 3), circleCell(0.7, 0.6, 0.15, 1)]);
    const round = reshapeFreeCell(base, 0, "circle")!;
    // The shorter side is the 0.3-wide one (324 px), so the circle's diameter is 324 px.
    expect(round.cells[0]).toMatchObject({ shape: "circle", cx: 0.25, cy: 0.2, z: 3 });
    expect(Math.round((round.cells[0] as Extract<Cell, { shape: "circle" }>).r * W * 2)).toBe(324);
    const back = reshapeFreeCell(base, 1, "rect")!.cells[1] as Extract<Cell, { shape: "rect" }>;
    expect(Math.round(back.w * W)).toBe(Math.round(0.3 * W)); // a square of the diameter
    expect(Math.round(back.h * H)).toBe(Math.round(0.3 * W));
    expect(back.x + back.w / 2).toBeCloseTo(0.7, 3);
    expect(back.y + back.h / 2).toBeCloseTo(0.6, 3);
    expect(base.cells[0]!.shape).toBe("rect"); // not changed in place
    expect(reshapeFreeCell(base, 0, "pill")!.cells[0]).toMatchObject({ shape: "pill", x: 0.1, y: 0.1, w: 0.3, h: 0.2 });
    // Too short for an arch's curve, or out of the canvas: null.
    expect(reshapeFreeCell(blankLayout([rectCell(0.1, 0.1, 0.8, 0.1)]), 0, "arch")).toBeNull();
    expect(reshapeFreeCell(blankLayout([circleCell(0.5, 0.05, 0.1)]), 0, "square")).toBeNull();
  });
});

describe("AC-CUSTOM-16 a dropped photo makes a shape", () => {
  it("is a rectangle in the photo's proportions, its longer side 0.4 of the width, centered on the drop", () => {
    const wide = addPhotoCell(blankLayout([]), 1.5, { x: 0.5, y: 0.5 })!;
    expect(wide.origin).toEqual([null]);
    const w = wide.layout.cells[0] as Extract<Cell, { shape: "rect" }>;
    expect(w.w * W).toBeCloseTo(0.4 * W, 0);
    expect((w.w * W) / (w.h * H)).toBeCloseTo(1.5, 1);
    expect(w.x + w.w / 2).toBeCloseTo(0.5, 3);
    const tall = addPhotoCell(blankLayout([]), 0.75, { x: 0.5, y: 0.5 })!.layout.cells[0] as Extract<Cell, { shape: "rect" }>;
    expect(tall.h * H).toBeCloseTo(0.4 * W, 0); // the longer side, here the height, is 0.4 of the canvas width
    expect((tall.w * W) / (tall.h * H)).toBeCloseTo(0.75, 1);
    expect(editedLayoutProblems(wide.layout, 20)).toEqual([]);
  });

  it("clamps proportions to 1:2 and 2:1, and the shape to the canvas", () => {
    const ratio = (aspect: number) => {
      const c = addPhotoCell(blankLayout([]), aspect, { x: 0.5, y: 0.5 })!.layout.cells[0] as Extract<Cell, { shape: "rect" }>;
      return (c.w * W) / (c.h * H);
    };
    expect(ratio(5)).toBeCloseTo(2, 1);
    expect(ratio(0.1)).toBeCloseTo(0.5, 1);
    expect(ratio(1)).toBeCloseTo(1, 1);
    const corner = addPhotoCell(blankLayout([]), 1, { x: 1, y: 1 })!.layout.cells[0] as Extract<Cell, { shape: "rect" }>;
    expect(corner.x + corner.w).toBeLessThanOrEqual(1);
    expect(corner.y + corner.h).toBeLessThanOrEqual(1);
    const eight = blankLayout(Array.from({ length: 8 }, (_, i) => circleCell(0.5, 0.1 + i * 0.1, 0.05, i)));
    expect(addPhotoCell(eight, 1, { x: 0.5, y: 0.5 })).toBeNull();
  });

  it("counts a drop within a tolerance of a shape's edge as on that shape", () => {
    const base = blankLayout([rectCell(0.3, 0.4, 0.4, 0.2), circleCell(0.5, 0.8, 0.1, 1)]);
    const at = (x: number, y: number, tol = 60) => cellNear(base, { x: x * W, y: y * H }, tol);
    expect(at(0.5, 0.5)).toBe(0); // inside
    expect(at(0.5, 0.4 - 40 / H)).toBe(0); // 40 px above the rectangle
    expect(at(0.5, 0.4 - 70 / H)).toBe(-1); // too far
    expect(at(0.5, 0.8 + 0.1 * (W / H) + 30 / H)).toBe(1); // below the circle
    expect(at(0.9, 0.1)).toBe(-1);
    // Between two: the nearer one.
    expect(cellNear(blankLayout([rectCell(0.1, 0.1, 0.3, 0.2), rectCell(0.5, 0.1, 0.3, 0.2)]), { x: 0.47 * W, y: 0.2 * H }, 100)).toBe(1);
  });
});

describe("AC-CUSTOM-17 tidy", () => {
  const cellsOf = (l: Layout) => l.cells as Extract<Cell, { shape: "rect" }>[];
  const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 3);

  it("gives nearly equal sizes of one kind their average, and leaves different kinds and sizes", () => {
    const out = tidyCells(blankLayout([circleCell(0.25, 0.2, 0.18), circleCell(0.75, 0.6, 0.2), circleCell(0.3, 0.9, 0.3), rectCell(0.4, 0.3, 0.19, 0.1)]));
    const [a, b, c] = out.cells as Extract<Cell, { shape: "circle" }>[];
    near(a!.r, 0.19);
    near(b!.r, 0.19);
    near(c!.r, 0.3);
  });

  it("lines up centers and edges that are nearly the same", () => {
    const centers = cellsOf(tidyCells(blankLayout([rectCell(0.1, 0.1, 0.3, 0.2), rectCell(0.145, 0.5, 0.3, 0.2)])));
    near(centers[0]!.x, centers[1]!.x); // two close columns share one
    near(centers[0]!.x, 0.1225);
    const edges = cellsOf(tidyCells(blankLayout([rectCell(0.1, 0.1, 0.3, 0.2), rectCell(0.12, 0.5, 0.5, 0.2)])));
    near(edges[0]!.x, 0.11);
    near(edges[1]!.x, 0.11);
    const far = cellsOf(tidyCells(blankLayout([rectCell(0.1, 0.1, 0.3, 0.2), rectCell(0.2, 0.5, 0.5, 0.2)])));
    near(far[0]!.x, 0.1); // 0.1 apart: not nearly the same
    near(far[1]!.x, 0.2);
  });

  it("sets small gaps between aligned neighbors to the spacing, side by side or stacked", () => {
    const side = cellsOf(tidyCells(blankLayout([rectCell(0.1, 0.4, 0.3, 0.2), rectCell(0.45, 0.4, 0.3, 0.2)])));
    near(side[1]!.x, 0.4); // flush: the style's gap shows between
    const spaced = cellsOf(tidyCells(blankLayout([rectCell(0.1, 0.4, 0.3, 0.2), rectCell(0.45, 0.4, 0.3, 0.2)]), { gap: 0.02 }));
    near(spaced[1]!.x, 0.42);
    const stacked = cellsOf(tidyCells(blankLayout([rectCell(0.3, 0.1, 0.3, 0.2), rectCell(0.3, 0.33, 0.3, 0.2)])));
    near(stacked[1]!.y, 0.3);
    const wide = cellsOf(tidyCells(blankLayout([rectCell(0.05, 0.4, 0.3, 0.2), rectCell(0.55, 0.4, 0.3, 0.2)])));
    near(wide[1]!.x, 0.55); // a gap of 0.2 is left as it is
  });

  it("keeps shapes in from the canvas edge by the margin", () => {
    const out = cellsOf(tidyCells(blankLayout([rectCell(0.02, 0.5, 0.3, 0.2), rectCell(0.7, 0.01, 0.3, 0.2)]), { margin: 0.05 }));
    near(out[0]!.x, 0.05);
    near(out[1]!.x, 0.65);
    near(out[1]!.y, 0.05);
  });

  it("leaves overlapping shapes alone, and never moves anything into an overlap", () => {
    const overlapping = blankLayout([rectCell(0.1, 0.1, 0.4, 0.3), rectCell(0.3, 0.2, 0.4, 0.3, 1)]);
    expect(tidyCells(overlapping)).toBe(overlapping);
    // Lining the third up with the first would put it on the second's toes.
    const crowded = blankLayout([rectCell(0.1, 0.1, 0.2, 0.2), rectCell(0.3, 0.5, 0.2, 0.2), rectCell(0.12, 0.45, 0.2, 0.2)]);
    expect(editedLayoutProblems(tidyCells(crowded), 20)).toEqual([]);
  });

  it("says nothing changed when it's already tidy, and keeps the cells in order with their shapes", () => {
    const tidy = blankLayout([rectCell(0.1, 0.1, 0.3, 0.2), circleCell(0.7, 0.6, 0.15, 1)]);
    expect(tidyCells(tidy)).toBe(tidy);
    const messy = tidyCells(blankLayout([circleCell(0.3, 0.2, 0.18), rectCell(0.12, 0.5, 0.3, 0.2, 1), circleCell(0.72, 0.21, 0.19, 2), rectCell(0.6, 0.5, 0.3, 0.2, 3)]));
    expect(messy.cells.map((c) => c.shape)).toEqual(["circle", "rect", "circle", "rect"]);
    expect(messy.cells.map((c) => c.z)).toEqual([0, 1, 2, 3]);
  });

  it("is idempotent, and never leaves the canvas or gets under the minimum, on many layouts", () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    for (let n = 0; n < 150; n++) {
      const cells: Cell[] = [];
      for (let k = 0; k < 2 + Math.floor(rnd() * 5); k++) {
        const candidate = k % 2 ? circleCell(0.2 + rnd() * 0.6, 0.2 + rnd() * 0.6, 0.12 + rnd() * 0.08, k) : rectCell(rnd() * 0.5, rnd() * 0.7, 0.2 + rnd() * 0.3, 0.12 + rnd() * 0.12, k);
        cells.push(candidate);
      }
      const layout = blankLayout(cells);
      if (!cellsFit(layout, cells.map((_, i) => i))) continue;
      const once = tidyCells(layout, { margin: 0.02 });
      const twice = tidyCells(once, { margin: 0.02 });
      expect(twice.cells).toEqual(once.cells);
      expect(cellsFit(once, cells.map((_, i) => i))).toBe(true);
      expect(once.cells.map((c) => c.shape)).toEqual(cells.map((c) => c.shape));
    }
  });
});

describe("AC-CUSTOM-18 pinch, twist and dragging off the edge", () => {
  const cellsOf = (l: Layout) => l.cells as Extract<Cell, { shape: "rect" }>[];

  it("sticks a turn to 0° and 90°s within about 5°, and to 15° steps within about 2°", () => {
    expect(snapRotation(4)).toEqual({ value: 0, snapped: true });
    expect(snapRotation(-4.9)).toEqual({ value: 0, snapped: true });
    expect(snapRotation(6)).toEqual({ value: 6, snapped: false });
    expect(snapRotation(14)).toEqual({ value: 15, snapped: true });
    expect(snapRotation(32.5)).toEqual({ value: 32.5, snapped: false });
    expect(snapRotation(-29)).toEqual({ value: -30, snapped: true });
    expect(snapRotation(88)).toEqual({ value: 90, snapped: true });
    expect(snapRotation(40)).toEqual({ value: 40, snapped: false });
  });

  it("gives a shape exactly the size of another of its kind when it's within 4% of it", () => {
    const base = blankLayout([circleCell(0.3, 0.2, 0.18), circleCell(0.7, 0.6, 0.185, 1), rectCell(0.1, 0.8, 0.18, 0.1, 2)]);
    const near = snapSize(base, 1);
    expect(near.snapped).toBe(true);
    expect((near.layout.cells[1] as Extract<Cell, { shape: "circle" }>).r).toBe(0.18);
    const far = snapSize(blankLayout([circleCell(0.3, 0.2, 0.18), circleCell(0.7, 0.6, 0.2, 1)]), 1);
    expect(far.snapped).toBe(false);
    expect(snapSize(base, 2).snapped).toBe(false); // nothing else of its kind
    expect(snapSize(near.layout, 1).snapped).toBe(false); // already that size
  });

  it("sizes and turns a shape in one go, with snapping, and only turns rectangles", () => {
    const base = blankLayout([rectCell(0.3, 0.4, 0.3, 0.15), circleCell(0.7, 0.2, 0.15, 1)]);
    const both = pinchCell(base, 0, 1.2, 14, 0)!;
    const r = cellsOf(both.layout)[0]!;
    expect(r.rotate).toBe(15); // snapped
    expect(both.angle).toBe(true);
    expect(r.w).toBeCloseTo(0.36, 3);
    expect((cellsOf(both.layout)[0]!.x + r.w / 2)).toBeCloseTo(0.45, 3); // about its center
    const round = pinchCell(base, 1, 1.3, 40, 0)!;
    expect(round.angle).toBe(false);
    expect((round.layout.cells[1] as Extract<Cell, { shape: "circle" }>).r).toBeCloseTo(0.195, 3);
    const matched = pinchCell(blankLayout([rectCell(0.1, 0.1, 0.3, 0.15), rectCell(0.5, 0.5, 0.28, 0.14, 1)]), 1, 1.05, 0, 0)!;
    expect(matched.size).toBe(true);
    expect(cellsOf(matched.layout)[1]!.w).toBe(0.3);
    expect(pinchCell(base, 0, 20, 0, 0)).toBeNull(); // too big for the canvas
  });

  it("lets a shape slide off the canvas while dragged, and settles it back inside when it isn't taken off", () => {
    const base = blankLayout([rectCell(0.3, 0.4, 0.3, 0.15)]);
    const loose = moveCellLoose(base, 0, 0.6, 0);
    expect(cellsOf(loose)[0]!.x).toBeCloseTo(0.9, 3);
    expect(offCanvas(loose.cells[0]!)).toBeCloseTo(0.667, 2);
    expect(offCanvas(base.cells[0]!)).toBe(0);
    const settled = cellsOf(moveCellInside(base, 0, 0.6, 0))[0]!;
    expect(settled.x + settled.w).toBeCloseTo(1, 3);
    expect(cellsFit(moveCellInside(base, 0, 0.6, 0.9), [0])).toBe(true);
  });

  it("takes a shape off only when most of it is past the edge", () => {
    const base = blankLayout([rectCell(0.3, 0.4, 0.3, 0.15)]);
    expect(offCanvas(moveCellLoose(base, 0, 0.5, 0).cells[0]!)).toBeLessThan(REMOVE_OFF_CANVAS); // half: stays
    expect(offCanvas(moveCellLoose(base, 0, 0.6, 0).cells[0]!)).toBeGreaterThan(REMOVE_OFF_CANVAS);
    expect(offCanvas(moveCellLoose(blankLayout([circleCell(0.5, 0.5, 0.15)]), 0, -0.55, 0).cells[0]!)).toBeGreaterThan(REMOVE_OFF_CANVAS);
  });
});
