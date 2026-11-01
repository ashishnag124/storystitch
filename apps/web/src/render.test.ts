import { describe, expect, it } from "vitest";
import { coverCrop } from "./render";

describe("coverCrop", () => {
  it("crops the sides of a wide photo for a tall cell", () => {
    expect(coverCrop({ width: 4000, height: 3000 }, { width: 1080, height: 960 })).toEqual({
      x: 312.5,
      y: 0,
      width: 3375,
      height: 3000,
    });
  });

  it("crops the top and bottom of a tall photo for a wide cell", () => {
    expect(coverCrop({ width: 1000, height: 2000 }, { width: 1000, height: 500 })).toEqual({
      x: 0,
      y: 750,
      width: 1000,
      height: 500,
    });
  });
});
