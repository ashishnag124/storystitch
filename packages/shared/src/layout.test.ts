import { describe, expect, it } from "vitest";
import { LAYOUT_FAMILIES, LayoutSchema, layouts, layoutsFor, type Layout } from "./layout";
import { editedLayoutProblems, layoutProblems } from "./validate";

const parse = (raw: unknown): Layout => LayoutSchema.parse(raw);

describe("layout library", () => {
  it("AC-LAYOUT-04 has unique ids", () => {
    const ids = layouts.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("AC-LAYOUT-02 has at least 2 layouts for 1 photo", () => {
    expect(layoutsFor(1).length).toBeGreaterThanOrEqual(2);
  });

  it.each([2, 3, 4, 5, 6, 7, 8])("AC-LAYOUT-02 has at least 4 layouts for %i photos", (n) => {
    expect(layoutsFor(n).length).toBeGreaterThanOrEqual(4);
  });

  it("AC-LAYOUT-03 covers every family", () => {
    expect(new Set(layouts.map((l) => l.family))).toEqual(new Set(LAYOUT_FAMILIES));
  });

  it.each(layouts.map((l) => [l.id, l] as const))("AC-LAYOUT-01 %s is valid", (_, layout) => {
    expect(layoutProblems(layout)).toEqual([]);
  });
});

describe("AC-LAYOUT-01 layoutProblems", () => {
  it("reports a cell that leaves the canvas", () => {
    const layout = parse({ id: "bad", name: "Bad", family: "grid", cells: [{ shape: "rect", x: 0.5, y: 0, w: 0.6, h: 1 }] });
    expect(layoutProblems(layout)).toContain("bad cell 0 leaves the canvas");
  });

  it("reports a rotated rect whose corners leave the canvas", () => {
    const layout = parse({
      id: "tilt",
      name: "Tilt",
      family: "scattered",
      cells: [{ shape: "rect", x: 0, y: 0.2, w: 1, h: 0.5, rotate: 10 }],
    });
    expect(layoutProblems(layout)).toContain("tilt cell 0 leaves the canvas");
  });

  it("reports undeclared overlap and accepts declared overlap", () => {
    const cells = [
      { shape: "rect", x: 0.1, y: 0.2, w: 0.6, h: 0.4 },
      { shape: "rect", x: 0.3, y: 0.4, w: 0.6, h: 0.4 },
    ];
    expect(layoutProblems(parse({ id: "o", name: "O", family: "scattered", cells }))).toContain(
      "o cells 0, 1 overlap but allowOverlap is not set",
    );
    expect(layoutProblems(parse({ id: "o", name: "O", family: "scattered", cells, allowOverlap: true }))).toEqual([]);
  });

  it("reports a cell that sits inside the safe-zone bands", () => {
    const layout = parse({
      id: "strip",
      name: "Strip",
      family: "filmstrip",
      cells: [
        { shape: "rect", x: 0, y: 0, w: 1, h: 0.1 },
        { shape: "rect", x: 0, y: 0.1, w: 1, h: 0.9 },
      ],
    });
    expect(layoutProblems(layout)).toContain("strip cell 0 has only 0% of its area outside the safe-zone bands");
  });

  it("AC-CUSTOM-06 lets an edited layout put a photo under the bands, and still refuses one past the edge", () => {
    const cells = [
      { shape: "rect", x: 0, y: 0, w: 1, h: 0.1 },
      { shape: "rect", x: 0, y: 0.1, w: 1, h: 0.9 },
    ];
    expect(editedLayoutProblems(parse({ id: "strip", name: "Strip", family: "filmstrip", cells }))).toEqual([]);
    const past = [{ shape: "rect", x: 0.5, y: 0, w: 0.6, h: 1 }];
    expect(editedLayoutProblems(parse({ id: "past", name: "Past", family: "filmstrip", cells: past }))).toContain("past cell 0 leaves the canvas");
  });

  it("reports an arch too short for its curved top", () => {
    const layout = parse({ id: "low", name: "Low", family: "shapes", cells: [{ shape: "arch", x: 0, y: 0.4, w: 1, h: 0.2 }] });
    expect(layoutProblems(layout)).toContain("low cell 0 is shorter than its curved top");
  });

  it("reports a concave polygon", () => {
    const layout = parse({
      id: "dart",
      name: "Dart",
      family: "diagonal",
      cells: [{ shape: "polygon", points: [[0.1, 0.2], [0.9, 0.2], [0.5, 0.4], [0.5, 0.8]] }],
    });
    expect(layoutProblems(layout)).toContain("dart cell 0 is not convex");
  });
});
