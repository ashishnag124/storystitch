import { describe, expect, it } from "vitest";
import { LOOKS, applyLook, lookMatrix } from "./looks";
import { DEFAULT_STYLE } from "./scene";

const look = (id: Parameters<typeof lookMatrix>[0], rgba: number[]) => {
  const px = [...rgba];
  applyLook(px, lookMatrix(id));
  return px;
};

describe("AC-LOOK-01 looks", () => {
  it("are Original and seven filters, each a 4×5 matrix that keeps alpha", () => {
    expect(LOOKS.map((l) => l.name)).toEqual(["Original", "Film", "Fade", "Warm", "Cool", "Vivid", "Mono", "Noir"]);
    for (const { matrix } of LOOKS) {
      expect(matrix).toHaveLength(20);
      expect(matrix.slice(15)).toEqual([0, 0, 0, 1, 0]);
    }
    expect(DEFAULT_STYLE.look).toBe("original");
  });

  it("Original leaves every pixel as it is", () => {
    for (const px of [[0, 0, 0, 255], [255, 255, 255, 255], [12, 200, 77, 128], [255, 0, 128, 255]]) expect(look("original", px)).toEqual(px);
  });

  it("Mono and Noir are black and white", () => {
    for (const id of ["mono", "noir"] as const) {
      for (const px of [[255, 0, 0, 255], [10, 200, 90, 255], [30, 60, 240, 255]]) {
        const [r, g, b] = look(id, px);
        expect(g).toBe(r);
        expect(b).toBe(r);
      }
    }
    // Mono keeps how bright a color looks: pure green is brighter than pure blue.
    expect(look("mono", [0, 255, 0, 255])[0]).toBeGreaterThan(look("mono", [0, 0, 255, 255])[0]!);
  });

  it("clamps to 0–255 and leaves alpha alone", () => {
    expect(look("noir", [255, 255, 255, 200])).toEqual([255, 255, 255, 200]);
    expect(look("noir", [0, 0, 0, 255])).toEqual([0, 0, 0, 255]);
    expect(look("vivid", [255, 255, 0, 255])).toEqual([255, 255, 0, 255]);
    for (const { matrix } of LOOKS) {
      const px = [255, 3, 128, 255, 0, 255, 255, 255];
      applyLook(px, matrix);
      for (const v of px) {
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(255);
      }
    }
  });

  it("Film lifts blacks and warms, Warm and Cool tint the way they say", () => {
    const [r, g, b] = look("film", [0, 0, 0, 255]);
    expect(Math.min(r!, g!, b!)).toBeGreaterThan(10);
    expect(r).toBeGreaterThan(b!);
    const grey = [128, 128, 128, 255];
    expect(look("warm", grey)[0]! - look("warm", grey)[2]!).toBeGreaterThan(10);
    expect(look("cool", grey)[2]! - look("cool", grey)[0]!).toBeGreaterThan(10);
  });
});
