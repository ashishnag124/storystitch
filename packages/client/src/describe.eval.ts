// Scoring for the "Describe a layout" evaluation: describe.eval.json holds descriptions and what each one means, and
// apps/app/scripts/eval-describe.mjs runs them through the real model and scores the layouts that come out. Not part
// of the app: nothing imports this but that script and its tests.
import type { Layout } from "@storystitch/shared";
import { bandsOf, layoutTopology, rectsOf, topology } from "./describe";

export { layoutTopology, topology };

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

/** The acceptable structure the layout matches, if any. */
export function structureMatch(layout: Layout, expected: Expectation[]): Expectation | undefined {
  const actual = layoutTopology(layout);
  return actual === null ? undefined : expected.find((e) => topology(e.direction, e.bands) === actual);
}

/** Whether the layout's band sizes are as the expectation says, or null when it says nothing about sizes. */
export function sizeMatch(layout: Layout, matched: Expectation): boolean | null {
  const order = matched.sizeOrder;
  if (!order) return null;
  const bands = bandsOf(rectsOf(layout), matched.direction);
  if (!bands) return false;
  const sizes = bands.map((band) => (matched.direction === "rows" ? band[0]!.h : band[0]!.w));
  if ("equal" in order) return Math.max(...sizes) - Math.min(...sizes) < 0.02;
  return sizes.every((size, i) => i === order.largest || sizes[order.largest]! - size > 0.02);
}
