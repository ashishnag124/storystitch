import { describe, expect, it } from "vitest";
import { autoColor, type Pixels } from "./autoColor";

/** A photo of solid colors: [r, g, b, pixel count] runs. */
function photo(...runs: [number, number, number, number][]): Pixels {
  const data = runs.flatMap(([r, g, b, n]) => Array.from({ length: n }, () => [r, g, b, 255]).flat());
  return { data, width: data.length / 4, height: 1 };
}
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

describe("AC-STYLE-07 autoColor", () => {
  const green = photo([60, 140, 50, 100]);
  const red = photo([190, 40, 40, 100]);

  it("is a pale tint of the photos' most common hue", () => {
    const [r, g, b] = rgb(autoColor([green]));
    expect(Math.min(r, g, b)).toBeGreaterThan(225);
    expect(g).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b);
  });

  it("counts each photo the same, whatever its size", () => {
    const bigGreen = photo([60, 140, 50, 10_000]);
    const [r, g] = rgb(autoColor([red, red, bigGreen]));
    expect(r).toBeGreaterThan(g);
  });

  it("goes by the most common hue, not the brightest", () => {
    const [r, g] = rgb(autoColor([photo([60, 140, 50, 80], [255, 0, 0, 20])]));
    expect(g).toBeGreaterThan(r);
  });

  it("ignores near-black, near-white and grey", () => {
    expect(autoColor([photo([0, 0, 0, 50], [255, 255, 255, 50], [128, 128, 128, 50])])).toBe("#ffffff");
    const [r, g] = rgb(autoColor([photo([10, 10, 10, 500], [250, 250, 250, 500], [60, 140, 50, 10])]));
    expect(g).toBeGreaterThan(r);
  });

  it("fades toward white when little of the photos has color", () => {
    const spread = (hex: string) => Math.max(...rgb(hex)) - Math.min(...rgb(hex));
    const mostlyGrey = photo([60, 140, 50, 10], [128, 128, 128, 90]);
    expect(spread(autoColor([mostlyGrey]))).toBeLessThan(spread(autoColor([green])));
  });

  it("is white with no photos", () => {
    expect(autoColor([])).toBe("#ffffff");
  });
});
