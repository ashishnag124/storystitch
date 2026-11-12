import { ADD_SHAPES, addCell, editModeOf, splitCell, removeCell } from "@storystitch/layout-engine";
import { LayoutSchema, editedLayoutProblems, layoutProblems, layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { blankDraft, blankShapesDraft, explain, withOrigin } from "./draft";

const byId = (id: string) => layouts.find((l) => l.id === id)!;

describe("AC-CUSTOM-06 layout editor checks", () => {
  it("says plainly which photo sits under Instagram's buttons", () => {
    const low = { ...byId("single-bleed"), bleed: false, cells: [{ shape: "rect" as const, x: 0, y: 0.85, w: 1, h: 0.15, rotate: 0, z: 0 }] };
    expect(explain(layoutProblems(low))).toEqual([
      { text: "Photo 1 sits mostly under Instagram's buttons. Move it toward the middle.", cells: [0] },
    ]);
  });

  it("names the photos that overlap", () => {
    const [text] = explain(["x cells 0, 2 overlap but allowOverlap is not set"]);
    expect(text).toEqual({ text: "Photos 1 and 3 overlap. Move them apart.", cells: [0, 2] });
  });
});

describe("AC-CUSTOM-02 photos follow their cells", () => {
  it("keeps each photo in its cell and gives a new cell a photo that isn't placed yet", () => {
    const draft = { layout: byId("two-stack"), order: [1, 0] };
    const split = withOrigin(draft, splitCell(draft.layout, 0, "down")!, 3);
    expect(split.order).toEqual([1, 0, 2]);
    const more = withOrigin(split, splitCell(split.layout, 2, "across")!, 3);
    expect(more.order).toEqual([1, 0, 2, -1]); // more cells than photos: one waits for a photo
  });

  it("frees a removed cell's photo for the next new cell", () => {
    const draft = { layout: byId("three-stack"), order: [2, 0, 1] };
    const removed = withOrigin(draft, removeCell(draft.layout, 0)!, 3);
    expect(removed.order).toEqual([0, 1]);
  });
});

describe("AC-CUSTOM-12 a blank frame", () => {
  it("is one full-canvas cell that validates and opens as a grid", () => {
    const { layout, order } = blankDraft();
    expect(LayoutSchema.safeParse(layout).success).toBe(true);
    expect(layoutProblems(layout)).toEqual([]);
    expect(editModeOf(layout)).toBe("grid");
    expect(layout.cells).toEqual([{ shape: "rect", x: 0, y: 0, w: 1, h: 1, rotate: 0, z: 0 }]);
    expect(order).toEqual([0]);
  });

  it("validates after splitting to N cells, each with its own photo", () => {
    let draft = blankDraft();
    for (let n = 2; n <= 4; n++) {
      draft = withOrigin(draft, splitCell(draft.layout, draft.layout.cells.length - 1, n % 2 ? "down" : "across")!, n);
      expect(draft.layout.cells).toHaveLength(n);
      expect(editedLayoutProblems(draft.layout)).toEqual([]);
      expect(editModeOf(draft.layout)).toBe("grid");
      expect(draft.order).toEqual(Array.from({ length: n }, (_, i) => i));
    }
  });
});

describe("AC-CUSTOM-13 a blank frame of shapes", () => {
  it("is one centered cell that validates, opens as a free layout and takes added shapes", () => {
    let draft = blankShapesDraft();
    expect(LayoutSchema.safeParse(draft.layout).success).toBe(true);
    expect(layoutProblems(draft.layout)).toEqual([]);
    expect(editModeOf(draft.layout)).toBe("free");
    expect(draft.order).toEqual([0]);
    for (const shape of ADD_SHAPES.slice(0, 3)) draft = withOrigin(draft, addCell(draft.layout, shape)!, 4);
    expect(draft.order).toEqual([0, 1, 2, 3]);
    expect(editModeOf(draft.layout)).toBe("free");
    expect(editedLayoutProblems(draft.layout)).toEqual([]);
  });
});
