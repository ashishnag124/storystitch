import { describe, expect, it } from "vitest";
import { salientRegion } from "./saliency";
import { padFace, subjectBox, type Detection } from "./subject";

describe("subjectBox", () => {
  it("pads faces to cover the whole head", () => {
    const head = padFace({ x: 0.4, y: 0.4, w: 0.1, h: 0.1 });
    expect(head.y).toBeCloseTo(0.36);
    expect(head.x + head.w).toBeCloseTo(0.52);
  });

  it("ignores detections far less important than the main subject", () => {
    const face: Detection = { kind: "face", score: 0.95, box: { x: 0.4, y: 0.2, w: 0.2, h: 0.2 } };
    const speck: Detection = { kind: "object", label: "cup", score: 0.4, box: { x: 0.9, y: 0.9, w: 0.05, h: 0.05 } };
    expect(subjectBox([face, speck])).toEqual(padFace(face.box));
  });

  it("spans a person and their face together", () => {
    const face: Detection = { kind: "face", score: 0.9, box: { x: 0.45, y: 0.2, w: 0.1, h: 0.1 } };
    const person: Detection = { kind: "person", score: 0.9, box: { x: 0.35, y: 0.15, w: 0.3, h: 0.8 } };
    const box = subjectBox([face, person])!;
    expect(box.y + box.h).toBeCloseTo(0.95);
  });
});

/** A gray RGBA image with one coloured rectangle. */
function image(w: number, h: number, rect?: { x: number; y: number; w: number; h: number }) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const inRect = rect && x >= rect.x && x < rect.x + rect.w && y >= rect.y && y < rect.y + rect.h;
      data.set(inRect ? [220, 40, 40, 255] : [120, 120, 120, 255], i);
    }
  }
  return { width: w, height: h, data };
}

describe("salientRegion", () => {
  it("finds a distinct object away from the center", () => {
    const rect = { x: 56 / 96, y: 12 / 64, w: 20 / 96, h: 16 / 64 };
    const region = salientRegion(image(96, 64, { x: 56, y: 12, w: 20, h: 16 }))!;
    expect(region.kind).toBe("salient");
    const b = region.box;
    const overlap =
      Math.max(0, Math.min(b.x + b.w, rect.x + rect.w) - Math.max(b.x, rect.x)) *
      Math.max(0, Math.min(b.y + b.h, rect.y + rect.h) - Math.max(b.y, rect.y));
    expect(overlap / (rect.w * rect.h)).toBeGreaterThan(0.7); // covers most of the object
    expect(b.x + b.w / 2).toBeGreaterThan(0.5); // and sits on its side of the photo
    expect(b.y + b.h / 2).toBeLessThan(0.5);
  });

  it("returns null for a featureless photo", () => {
    expect(salientRegion(image(64, 64))).toBeNull();
  });
});
