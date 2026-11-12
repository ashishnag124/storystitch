import { describe, expect, it } from "vitest";
import { layoutFromSpec } from "./describe";
import data from "./describe.eval.json";
import { layoutTopology, sizeMatch, structureMatch, topology, type EvalCase } from "./describe.eval";

const cases = data.cases as EvalCase[];
const build = (direction: "rows" | "columns", bands: number[], sizes: number[] = bands.map(() => 5)) => {
  const result = layoutFromSpec({ direction, bands: bands.map((photos, i) => ({ photos, size: sizes[i]! })) }, bands.reduce((a, b) => a + b, 0));
  if (!result.ok) throw new Error(result.problem);
  return result.draft.layout;
};

describe("AC-AI-01 the evaluation set", () => {
  it("has 24 tuning and 12 held-out cases over 2 to 8 photos, each with expectations that add up", () => {
    expect(cases).toHaveLength(36);
    expect(cases.filter((c) => c.set === "tuning")).toHaveLength(24);
    expect(cases.filter((c) => c.set === "heldOut")).toHaveLength(12);
    expect(new Set(cases.map((c) => c.id)).size).toBe(36);
    expect(new Set(cases.map((c) => c.description)).size).toBe(36);
    expect(Math.min(...cases.map((c) => c.photos))).toBe(2);
    expect(Math.max(...cases.map((c) => c.photos))).toBe(8);
    for (const c of cases) {
      expect(c.expected.length).toBeGreaterThan(0);
      for (const e of c.expected) {
        expect(e.bands.reduce((a, b) => a + b, 0), c.id).toBe(c.photos);
        expect(e.bands.every((n) => n >= 1 && n <= 4) && e.bands.length <= 8, c.id).toBe(true);
      }
    }
  });

  it("is made only of structures the layout builder accepts, including the thinnest (4 photos side by side)", () => {
    const rejected = cases
      .filter((c) => c.expected.every((e) => !layoutFromSpec({ direction: e.direction, bands: e.bands.map((photos) => ({ photos, size: 5 })) }, c.photos).ok))
      .map((c) => c.id);
    expect(rejected).toEqual([]);
  });
});

describe("AC-AI-01 scoring a layout by its cells", () => {
  it("names grids the same however they were described", () => {
    expect(topology("rows", [3, 3])).toBe(topology("columns", [2, 2, 2]));
    expect(topology("rows", [3])).toBe(topology("columns", [1, 1, 1]));
    expect(topology("rows", [1, 3])).not.toBe(topology("columns", [1, 3]));
    expect(layoutTopology(build("rows", [3, 3]))).toBe("grid 2x3");
    expect(layoutTopology(build("columns", [2, 2, 2]))).toBe("grid 2x3");
    expect(layoutTopology(build("columns", [4]))).toBe("grid 4x1");
    expect(layoutTopology(build("rows", [1, 3]))).toBe("rows 1+3");
    expect(layoutTopology(build("columns", [1, 3]))).toBe("columns 1+3");
    expect(layoutTopology(build("rows", [2, 1, 3]))).toBe("rows 2+1+3");
  });

  it("matches the acceptable structures, and no others", () => {
    const layout = build("rows", [1, 3]);
    expect(structureMatch(layout, [{ direction: "rows", bands: [1, 3] }])).toBeDefined();
    expect(structureMatch(layout, [{ direction: "columns", bands: [1, 3] }])).toBeUndefined();
    expect(structureMatch(build("columns", [2, 2, 2]), [{ direction: "rows", bands: [3, 3] }])).toBeDefined();
    expect(structureMatch(layout, [{ direction: "rows", bands: [2, 2] }, { direction: "rows", bands: [1, 3] }])?.bands).toEqual([1, 3]);
  });

  it("scores sizes on the bands of the matched structure", () => {
    const first = { direction: "rows" as const, bands: [1, 1, 1], sizeOrder: { largest: 0 } };
    expect(sizeMatch(build("rows", [1, 1, 1], [6, 2, 2]), first)).toBe(true);
    expect(sizeMatch(build("rows", [1, 1, 1], [5, 5, 5]), first)).toBe(false);
    expect(sizeMatch(build("rows", [1, 1, 1], [2, 6, 2]), first)).toBe(false);
    const equal = { direction: "rows" as const, bands: [2, 2], sizeOrder: { equal: true as const } };
    expect(sizeMatch(build("rows", [2, 2], [4, 4]), equal)).toBe(true);
    expect(sizeMatch(build("rows", [2, 2], [7, 3]), equal)).toBe(false);
    expect(sizeMatch(build("rows", [2, 2]), { direction: "rows", bands: [2, 2] })).toBeNull();
  });
});
