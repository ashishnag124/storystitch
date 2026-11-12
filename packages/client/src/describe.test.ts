import { editModeOf, gridOf } from "@storystitch/layout-engine";
import { LayoutSchema, LayoutSpecSchema, editedLayoutProblems, type LayoutSpec } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { countProblem, describePrompt, layoutFromSpec } from "./describe";

const spec = (direction: LayoutSpec["direction"], ...bands: [photos: number, size?: number][]): LayoutSpec => ({
  direction,
  bands: bands.map(([photos, size = 1]) => ({ photos, size })),
});

function built(s: LayoutSpec, photos: number) {
  const result = layoutFromSpec(s, photos);
  if (!result.ok) throw new Error(result.problem);
  return result;
}

type Box = { x: number; y: number; w: number; h: number };
/** How many photos each row of the layout holds, top to bottom. */
const rowsOf = (cells: unknown[]) => {
  const counts = new Map<number, number>();
  for (const c of cells as Box[]) counts.set(c.y, (counts.get(c.y) ?? 0) + 1);
  return [...counts.entries()].sort(([a], [b]) => a - b).map(([, n]) => n);
};

describe("AC-AI-01 a spec becomes a grid layout", () => {
  it("makes one big photo over three small ones, in rows", () => {
    const { draft, adjusted } = built(spec("rows", [1, 6], [3, 4]), 4);
    const { layout, order } = draft;
    expect(adjusted).toBe(false);
    expect(LayoutSchema.safeParse(layout).success).toBe(true);
    expect(editedLayoutProblems(layout)).toEqual([]);
    expect(editModeOf(layout)).toBe("grid");
    expect(gridOf(layout)).not.toBeNull();
    expect(order).toEqual([0, 1, 2, 3]);
    const [big, ...small] = layout.cells as Box[];
    expect(big).toMatchObject({ x: 0, y: 0, w: 1, h: 0.6 });
    expect(small.map((c) => c.y)).toEqual([0.6, 0.6, 0.6]);
    expect(small.map((c) => c.x)).toEqual([0, 0.3333, 0.6667]);
    expect(small.reduce((sum, c) => sum + c.w, 0)).toBeCloseTo(1, 4);
  });

  it("makes columns as the transpose of rows", () => {
    const { layout } = built(spec("columns", [2], [2]), 4).draft;
    expect(layout.cells.map((c) => (c.shape === "rect" ? [c.x, c.y, c.w, c.h] : []))).toEqual([
      [0, 0, 0.5, 0.5],
      [0, 0.5, 0.5, 0.5],
      [0.5, 0, 0.5, 0.5],
      [0.5, 0.5, 0.5, 0.5],
    ]);
    expect(editModeOf(layout)).toBe("grid");
  });

  it("makes rows of unequal heights", () => {
    const { layout } = built(spec("rows", [1, 4], [1, 1], [1, 1], [1, 1]), 4).draft;
    expect(rowsOf(layout.cells)).toEqual([1, 1, 1, 1]);
    const heights = (layout.cells as Box[]).map((c) => c.h);
    expect(heights[0]).toBeGreaterThan(heights[1]!);
  });

  it("fills the frame with one photo, and with eight", () => {
    expect(built(spec("rows", [1]), 1).draft.layout.cells).toEqual([{ shape: "rect", x: 0, y: 0, w: 1, h: 1, rotate: 0, z: 0 }]);
    for (const direction of ["rows", "columns"] as const) {
      const eight = built(spec(direction, [4], [4]), 8).draft.layout;
      expect(eight.cells).toHaveLength(8);
      expect(editModeOf(eight)).toBe("grid");
    }
  });

  it("raises a band that is too small to the smallest it can be", () => {
    const { layout } = built(spec("rows", [2, 10], [2, 10], [2, 10], [2, 1]), 8).draft;
    expect((layout.cells as Box[]).at(-1)!.h * 1920).toBeGreaterThanOrEqual(108);
  });

  it("rejects what cannot be made, with the reason", () => {
    const tooMany = spec("columns", ...Array.from({ length: 11 }, (): [number] => [1]));
    expect(layoutFromSpec(tooMany, 11)).toEqual({ ok: false, problem: "There are too many columns to fit; use fewer." });
    const six = spec("columns", ...Array.from({ length: 6 }, (): [number] => [1]));
    expect(layoutFromSpec(six, 6)).toEqual({ ok: false, problem: "Photo 1 is too long and thin; use fewer photos in its column." });
    expect(built(spec("columns", [1], [1], [1], [1]), 4).draft.layout.cells).toHaveLength(4); // 4 across at full height is allowed
  });

  it("rejects malformed specs", () => {
    const parse = (s: unknown) => LayoutSpecSchema.safeParse(s).success;
    expect(parse(spec("rows", [1]))).toBe(true);
    expect(parse({ direction: "diagonal", bands: [{ photos: 1, size: 1 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: [] })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ photos: 0, size: 1 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ photos: 5, size: 1 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ photos: 1.5, size: 1 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ photos: 1, size: 0 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ photos: 1, size: 11 }] })).toBe(false);
    expect(parse({ direction: "rows", bands: Array.from({ length: 9 }, () => ({ photos: 1, size: 1 })) })).toBe(false);
    expect(parse({ direction: "rows", bands: [{ size: 1 }] })).toBe(false);
    expect(parse("not a spec")).toBe(false);
  });
});

describe("AC-AI-01 a wrong photo count is put right", () => {
  it("says what is wrong with a count, for the model", () => {
    expect(countProblem(spec("rows", [3], [2]), 4)).toBe("The layout has 5 photos but must have exactly 4.");
    expect(countProblem(spec("rows", [2], [2]), 4)).toBeNull();
  });

  it("adds one photo to the last band when short by 1", () => {
    const result = built(spec("rows", [1], [2]), 4);
    expect(result.adjusted).toBe(true);
    expect(rowsOf(result.draft.layout.cells)).toEqual([1, 3]);
  });

  it("fills the last band to 4 when short by 3", () => {
    const result = built(spec("rows", [1, 6], [1, 4]), 5);
    expect(result.adjusted).toBe(true);
    expect(rowsOf(result.draft.layout.cells)).toEqual([1, 4]);
  });

  it("fills earlier bands once the last is full", () => {
    const result = built(spec("rows", [2], [4]), 8);
    expect(rowsOf(result.draft.layout.cells)).toEqual([4, 4]);
  });

  it("adds a new band when every band is full", () => {
    const result = built(spec("rows", [4]), 8);
    expect(result.adjusted).toBe(true);
    expect(rowsOf(result.draft.layout.cells)).toEqual([4, 4]);
  });

  it("takes photos from the fullest band when over by 2", () => {
    const result = built(spec("rows", [4], [3]), 5);
    expect(result.adjusted).toBe(true);
    expect(rowsOf(result.draft.layout.cells)).toEqual([2, 3]);
  });

  it("drops bands that run out, down to one photo", () => {
    const result = built(spec("rows", [2], [1], [1]), 1);
    expect(result.adjusted).toBe(true);
    expect(result.draft.layout.cells).toEqual([{ shape: "rect", x: 0, y: 0, w: 1, h: 1, rotate: 0, z: 0 }]);
  });

  it("always ends with one cell per photo, for every spec and count", () => {
    for (let n = 1; n <= 8; n++) {
      for (const direction of ["rows", "columns"] as const) {
        for (const bands of [[[1]], [[4], [4]], [[2], [2], [2], [2]], [[1], [1], [1], [1], [1], [1], [1], [1]], [[3], [1]]] as [number][][]) {
          const result = layoutFromSpec(spec(direction, ...bands), n);
          if (result.ok) {
            expect(result.draft.layout.cells).toHaveLength(n);
            expect(editModeOf(result.draft.layout)).toBe("grid");
            expect(result.adjusted).toBe(bands.reduce((sum, [p]) => sum + p, 0) !== n);
          }
        }
      }
    }
  });
});

describe("AC-AI-01 the prompt", () => {
  it("states the photo count, quotes the description and caps it at 200 characters", () => {
    const prompt = describePrompt('two\nbig "ones" ' + "x".repeat(300), 3);
    expect(prompt).toContain("exactly 3 photos");
    expect(prompt).toContain(JSON.stringify(('two big "ones" ' + "x".repeat(300)).slice(0, 200)));
    expect(prompt).not.toContain("x".repeat(201));
    expect(describePrompt("one", 1)).toContain("exactly 1 photo,");
  });

  it("gives two examples that add up to the photo count", () => {
    const four = describePrompt("x", 4);
    expect(four).toContain("That is 1 + 3 = 4.");
    expect(four).toContain("That is 3 + 1 = 4.");
    const six = describePrompt("x", 6);
    expect(six).toContain("That is 2 + 4 = 6.");
    expect(six).toContain("That is 4 + 2 = 6.");
    expect(describePrompt("x", 5)).toContain("That is 2 + 3 = 5.");
    expect(describePrompt("x", 7)).toContain("That is 4 + 3 = 7.");
    expect(describePrompt("x", 8)).toContain("That is 4 + 4 = 8.");
    expect(describePrompt("x", 1)).toContain("That is 1 = 1.");
  });

  it("includes the previous problem only on a retry", () => {
    expect(describePrompt("one", 2)).not.toContain("last answer");
    expect(describePrompt("one", 2, "The layout has 5 photos but must have exactly 2.")).toContain("The layout has 5 photos but must have exactly 2.");
  });
});
