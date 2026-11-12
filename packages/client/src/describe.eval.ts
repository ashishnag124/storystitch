// Scoring for the "Describe a layout" evaluation: describe.eval.json holds descriptions and what each one means, and
// apps/app/scripts/eval-describe.mjs runs them through the real model and scores the layouts that come out. Not part
// of the app: nothing imports this but that script and its tests.
import type { Cell, Layout } from "@storystitch/shared";

export interface Expectation {
  direction: "rows" | "columns";
  /** Photos per band, in order. */
  bands: number[];
  /** `largest`: that band is strictly the biggest. `equal`: all bands are the same size. */
  sizeOrder?: { largest: number } | { equal: true };
}

export interface EvalCase {
  id: string;
  set: "tuning" | "heldOut";
  description: string;
  photos: number;
  /** Every acceptable structure. */
  expected: Expectation[];
}

type Box = { x: number; y: number; w: number; h: number };

const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

/** The layout's cells cut into bands of one direction (rows stacked top to bottom, or columns side by side); null when it isn't made that way. */
function bandsOf(cells: Box[], direction: "rows" | "columns"): Box[][] | null {
  const [start, extent, across, acrossExtent] = direction === "rows" ? (["y", "h", "x", "w"] as const) : (["x", "w", "y", "h"] as const);
  const sorted = [...cells].sort((a, b) => a[start] - b[start] || a[across] - b[across]);
  const bands: Box[][] = [];
  for (const cell of sorted) {
    const band = bands.at(-1);
    if (band && near(band[0]![start], cell[start])) band.push(cell);
    else bands.push([cell]);
  }
  const whole = (band: Box[]) => band.every((c) => near(c[extent], band[0]![extent])) && near(band.reduce((sum, c) => sum + c[acrossExtent], 0), 1);
  return bands.every(whole) && near(bands.reduce((sum, band) => sum + band[0]![extent], 0), 1) ? bands : null;
}

/** A name for a structure. Bands of equal counts are one grid, however they were described: 2 rows of 3 is also 3 columns of 2. */
export function topology(direction: "rows" | "columns", bands: number[]): string {
  if (bands.every((n) => n === bands[0])) return direction === "rows" ? `grid ${bands.length}x${bands[0]}` : `grid ${bands[0]}x${bands.length}`;
  return `${direction} ${bands.join("+")}`;
}

const boxes = (layout: Layout) => layout.cells.filter((c): c is Extract<Cell, { shape: "rect" }> => c.shape === "rect");

/** The structure of a finished layout, read from its cells, or null when its cells aren't bands. */
export function layoutTopology(layout: Layout): string | null {
  for (const direction of ["rows", "columns"] as const) {
    const bands = bandsOf(boxes(layout), direction);
    if (bands) return topology(direction, bands.map((b) => b.length));
  }
  return null;
}

/** The acceptable structure the layout matches, if any. */
export function structureMatch(layout: Layout, expected: Expectation[]): Expectation | undefined {
  const actual = layoutTopology(layout);
  return actual === null ? undefined : expected.find((e) => topology(e.direction, e.bands) === actual);
}

/** Whether the layout's band sizes are as the expectation says, or null when it says nothing about sizes. */
export function sizeMatch(layout: Layout, matched: Expectation): boolean | null {
  const order = matched.sizeOrder;
  if (!order) return null;
  const bands = bandsOf(boxes(layout), matched.direction);
  if (!bands) return false;
  const sizes = bands.map((band) => (matched.direction === "rows" ? band[0]!.h : band[0]!.w));
  if ("equal" in order) return Math.max(...sizes) - Math.min(...sizes) < 0.02;
  return sizes.every((size, i) => i === order.largest || sizes[order.largest]! - size > 0.02);
}
