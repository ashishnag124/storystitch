import { ADD_SHAPES, addCell, drawCell, editModeOf, removeCell, splitCell } from "@storystitch/layout-engine";
import { LayoutSchema, editedLayoutProblems, layoutProblems, layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { blankDraft, blankOrder, blankProblem, explain, placePhoto, takePhotoOut, unplacedPhotos, withOrigin } from "./draft";

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

describe("AC-CUSTOM-12 a blank canvas", () => {
  it("starts with no shapes, as a free layout, and fills with empty shapes", () => {
    let draft = blankDraft();
    expect(draft.layout.cells).toEqual([]);
    expect(draft.order).toEqual([]);
    expect(editModeOf(draft.layout)).toBe("free");
    for (const shape of ADD_SHAPES) draft = withOrigin(draft, addCell(draft.layout, shape)!, 0);
    draft = withOrigin(draft, drawCell(draft.layout, { x: 0.05, y: 0.8 }, { x: 0.5, y: 0.95 })!, 0);
    expect(draft.layout.cells).toHaveLength(5);
    expect(draft.order).toEqual([-1, -1, -1, -1, -1]); // new shapes wait for a photo
    expect(LayoutSchema.safeParse(draft.layout).success).toBe(true);
    expect(editedLayoutProblems(draft.layout)).toEqual([]);
  });

  it("can have its last shape removed", () => {
    const draft = withOrigin(blankDraft(), addCell(blankDraft().layout, "circle")!, 0);
    expect(removeCell(draft.layout, 0)).toBeNull();
    expect(removeCell(draft.layout, 0, true)!.layout.cells).toEqual([]);
  });
});

describe("AC-CUSTOM-15 placing photos in shapes", () => {
  it("places a photo, replaces one, moves one and takes one out", () => {
    expect(placePhoto([-1, -1, -1], 1, 2)).toEqual([-1, 2, -1]);
    expect(placePhoto([0, 2, -1], 1, 3)).toEqual([0, 3, -1]); // 2 is unplaced again
    expect(unplacedPhotos([0, 3, -1], 4)).toEqual([1, 2]);
    expect(placePhoto([0, 2, -1], 2, 0)).toEqual([-1, 2, 0]); // moved: its old shape is empty
    expect(placePhoto([0, 2], 0, 0)).toEqual([0, 2]);
    expect(takePhotoOut([0, 2, -1], 1)).toEqual([0, -1, -1]);
  });

  it("says what's missing, in plain words", () => {
    expect(blankProblem([], 3)).toBe("Add a shape or drag on the canvas to draw one.");
    expect(blankProblem([0, -1, -1], 3)).toBe("Drag 2 more photos into shapes.");
    expect(blankProblem([0, -1], 2)).toBe("Drag 1 more photo into shapes.");
    expect(blankProblem([0], 3)).toBe("Add 2 more shapes, then drag photos into them.");
    expect(blankProblem([0, 1, -1], 2)).toBe("1 shape is empty. Add a photo or remove it.");
    expect(blankProblem([0, 1, -1, -1], 2)).toBe("2 shapes are empty. Add a photo or remove them.");
  });

  it("builds the order only once every photo is in a shape and no shape is empty", () => {
    expect(blankOrder([2, 0, -1], 3)).toBeNull();
    expect(blankOrder([2, 0], 3)).toBeNull();
    expect(blankOrder([2, 0, 1], 3)).toEqual([2, 0, 1]);
  });
});
