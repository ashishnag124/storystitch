import { describe, expect, it } from "vitest";
import { LayoutSchema, layouts } from "./layout";

describe("layouts", () => {
  it("have unique ids", () => {
    const ids = layouts.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("include a 2-photo layout", () => {
    expect(layouts.some((l) => l.cells.length === 2)).toBe(true);
  });

  it("reject a cell that leaves the canvas", () => {
    const layout = { id: "bad", name: "Bad", cells: [{ x: 0.5, y: 0, w: 0.6, h: 1 }] };
    expect(LayoutSchema.safeParse(layout).success).toBe(false);
  });
});
