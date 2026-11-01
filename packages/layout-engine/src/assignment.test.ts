import { describe, expect, it } from "vitest";
import { assignPhotos, hungarian, placement, rankLayouts, type CellTarget, type PhotoSubjects } from "./assignment";
import { NO_INSETS } from "./smartCrop";
import type { Detection } from "./subject";

/** Deterministic PRNG so failures reproduce. */
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function permutations(n: number): number[][] {
  if (n === 0) return [[]];
  return permutations(n - 1).flatMap((p) => Array.from({ length: n }, (_, i) => [...p.slice(0, i), n - 1, ...p.slice(i)]));
}

const total = (cost: number[][], cols: number[]) => cols.reduce((s, c, r) => s + cost[r]![c]!, 0);

const cell = (width: number, height: number, insets = NO_INSETS, fill = 1): CellTarget => ({ frame: { width, height }, insets, fill });
const photo = (width: number, height: number, detections: Detection[] = []): PhotoSubjects => ({ width, height, detections });
const face = (x: number, y: number): Detection => ({ kind: "face", score: 0.9, box: { x, y, w: 0.1, h: 0.1 } });

const landscape = photo(4000, 3000);
const portrait = photo(3000, 4000);
const wideCell = cell(1000, 500);
const tallCell = cell(500, 1000);

describe("hungarian", () => {
  it("solves a known case", () => {
    const cost = [
      [4, 1, 3],
      [2, 0, 5],
      [3, 2, 2],
    ];
    expect(hungarian(cost)).toEqual([1, 0, 2]);
  });

  it("matches brute force on random matrices up to 6×6", () => {
    const random = mulberry32(42);
    for (let trial = 0; trial < 300; trial++) {
      const n = 1 + (trial % 6);
      const cost = Array.from({ length: n }, () => Array.from({ length: n }, () => Math.round(random() * 100) / 10));
      const best = Math.min(...permutations(n).map((p) => total(cost, p)));
      const cols = hungarian(cost);
      expect([...cols].sort()).toEqual([...Array(n).keys()]);
      expect(total(cost, cols)).toBeCloseTo(best, 9);
    }
  });
});

describe("placement", () => {
  it("costs less when the photo's shape matches the cell", () => {
    expect(placement(landscape, wideCell).cost).toBeLessThan(placement(landscape, tallCell).cost);
    expect(placement(portrait, tallCell).cost).toBeLessThan(placement(portrait, wideCell).cost);
  });

  it("costs more when the subject sits under the safe-zone bands", () => {
    const top = photo(3000, 4000, [face(0.45, 0.02)]);
    const underBand = cell(500, 1000, { top: 0.3, bottom: 0, left: 0, right: 0 });
    expect(placement(top, underBand).cost).toBeGreaterThan(placement(top, tallCell).cost);
  });

  it("counts what a circle hides as cropped", () => {
    const square = photo(3000, 3000);
    expect(placement(square, cell(800, 800, NO_INSETS, Math.PI / 4)).cost).toBeGreaterThan(placement(square, cell(800, 800)).cost);
  });

  it("costs more when a small photo has to be upscaled", () => {
    expect(placement(photo(640, 480), wideCell).cost).toBeGreaterThan(placement(landscape, wideCell).cost);
  });

  it("costs more when faces can't all fit and the photo zooms out", () => {
    // Heads close enough together that no crop edge can pass between them.
    const group = photo(4000, 3000, [face(0.3, 0.4), face(0.4, 0.4), face(0.5, 0.4)]);
    const narrow = cell(300, 1000);
    expect(placement(group, narrow).crop.zoom).toBeLessThan(1);
    expect(placement(group, narrow).cost).toBeGreaterThan(placement(landscape, narrow).cost);
  });
});

describe("assignPhotos", () => {
  it("puts each photo in the cell that fits its shape", () => {
    expect(assignPhotos([portrait, landscape], [wideCell, tallCell]).order).toEqual([1, 0]);
    expect(assignPhotos([landscape, portrait], [wideCell, tallCell]).order).toEqual([0, 1]);
  });

  it("keeps faces out of cells under the bands when another photo can go there", () => {
    const top = { top: 0.4, bottom: 0, left: 0, right: 0 };
    const people = photo(3000, 4000, [face(0.45, 0.1)]);
    const order = assignPhotos([people, portrait], [cell(500, 1000, top), tallCell]).order;
    expect(order).toEqual([1, 0]);
  });

  it("returns the crops and total cost of the chosen placements", () => {
    const photos = [portrait, landscape];
    const cells = [wideCell, tallCell];
    const a = assignPhotos(photos, cells);
    const expected = a.order.map((p, c) => placement(photos[p]!, cells[c]!));
    expect(a.crops).toEqual(expected.map((p) => p.crop));
    expect(a.cost).toBeCloseTo(expected[0]!.cost + expected[1]!.cost, 9);
  });
});

describe("rankLayouts", () => {
  const options = [
    { layout: { id: "rows" }, cells: [wideCell, wideCell] },
    { layout: { id: "columns" }, cells: [tallCell, tallCell] },
    { layout: { id: "columns-copy" }, cells: [tallCell, tallCell] },
  ];

  it("puts the best fit first", () => {
    expect(rankLayouts(options, [landscape, landscape]).map((r) => r.layout.id)[0]).toBe("rows");
    expect(rankLayouts(options, [portrait, portrait]).map((r) => r.layout.id)[0]).toBe("columns");
  });

  it("is deterministic and independent of how the options are listed", () => {
    const photos = [portrait, landscape];
    const ids = rankLayouts(options, photos).map((r) => r.layout.id);
    expect(rankLayouts(options, photos).map((r) => r.layout.id)).toEqual(ids);
    expect(rankLayouts([...options].reverse(), photos).map((r) => r.layout.id)).toEqual(ids);
    expect(ids.indexOf("columns")).toBeLessThan(ids.indexOf("columns-copy")); // a tie goes to the lower id
  });
});
