import type { Box } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { CENTER_CROP, MIN_ZOOM, sourceRect, type Rect } from "./crop";
import { SUBJECT_MARGIN, smartCrop } from "./smartCrop";
import { padFace, subjectBox, type Detection } from "./subject";

const face = (x: number, y: number, w: number, h: number, score = 0.9): Detection => ({ kind: "face", score, box: { x, y, w, h } });
const object = (x: number, y: number, w: number, h: number, score = 0.8): Detection => ({ kind: "object", score, box: { x, y, w, h } });

const wide = { width: 4000, height: 3000 };
const tallFrame = { width: 400, height: 800 }; // crop slides along x
const tol = 1;

/** A 0–1 box in photo pixels. */
const px = (b: Box, image: { width: number; height: number }): Rect => ({
  x: b.x * image.width,
  y: b.y * image.height,
  width: b.w * image.width,
  height: b.h * image.height,
});
const contains = (outer: Rect, inner: Rect) =>
  inner.x >= outer.x - tol &&
  inner.y >= outer.y - tol &&
  inner.x + inner.width <= outer.x + outer.width + tol &&
  inner.y + inner.height <= outer.y + outer.height + tol;
const disjoint = (a: Rect, b: Rect) =>
  a.x + a.width <= b.x + tol || b.x + b.width <= a.x + tol || a.y + a.height <= b.y + tol || b.y + b.height <= a.y + tol;

describe("smartCrop", () => {
  it("AC-CROP-04 uses the center crop when nothing was detected", () => {
    expect(smartCrop(wide, tallFrame, [])).toEqual(CENTER_CROP);
  });

  it("AC-CROP-01 slides to keep an off-center face in frame, centered", () => {
    const f = face(0.6, 0.3, 0.08, 0.1);
    const crop = sourceRect(wide, tallFrame, smartCrop(wide, tallFrame, [f]));
    const head = px(padFace(f.box), wide);
    expect(contains(crop, head)).toBe(true);
    expect(crop.x + crop.width / 2).toBeCloseTo(head.x + head.width / 2, 0);
  });

  it("AC-CROP-02 drops whole faces it can't fit, never slicing one, and keeps the most important", () => {
    const faces = [face(0.05, 0.3, 0.1, 0.13, 0.7), face(0.45, 0.3, 0.12, 0.16), face(0.85, 0.3, 0.1, 0.13, 0.7)];
    const crop = sourceRect(wide, tallFrame, smartCrop(wide, tallFrame, faces));
    for (const f of faces) {
      const head = px(padFace(f.box), wide);
      expect(contains(crop, head) || disjoint(crop, head)).toBe(true);
    }
    expect(contains(crop, px(padFace(faces[1]!.box), wide))).toBe(true);
  });

  it("AC-CROP-05 zooms out when no position avoids cutting a face", () => {
    // Two heads side by side, together wider than the crop (37.5% of the photo), with no gap between them.
    const faces = [face(0.28, 0.3, 0.16, 0.2), face(0.46, 0.3, 0.16, 0.2)];
    const result = smartCrop(wide, tallFrame, faces);
    expect(result.zoom).toBeLessThan(1);
    const crop = sourceRect(wide, tallFrame, result);
    for (const f of faces) expect(contains(crop, px(padFace(f.box), wide))).toBe(true);
  });

  it("AC-CROP-05 zooms out only as far as the faces it keeps need, leaving a far face out", () => {
    // Two heads overlapping and a bit wider than the crop (37.5% of the photo), and a third head far away.
    const faces = [face(0.1, 0.3, 0.16, 0.2, 0.9), face(0.27, 0.3, 0.16, 0.2, 0.85), face(0.8, 0.3, 0.1, 0.13, 0.7)];
    const result = smartCrop(wide, tallFrame, faces);
    expect(result.zoom).toBeLessThan(1);
    expect(result.zoom).toBeGreaterThan(0.8); // fitting all three heads would need MIN_ZOOM
    const crop = sourceRect(wide, tallFrame, result);
    expect(contains(crop, px(padFace(faces[0]!.box), wide))).toBe(true);
    expect(contains(crop, px(padFace(faces[1]!.box), wide))).toBe(true);
    expect(disjoint(crop, px(padFace(faces[2]!.box), wide))).toBe(true);
  });

  it("AC-CROP-05 at MIN_ZOOM, when no run of faces fits, centers on all the faces and keeps the top face", () => {
    // Four heads in a row, each overlapping the next, together too wide even for MIN_ZOOM (crop 37.5% of the photo).
    const faces = [face(0.1, 0.3, 0.2, 0.27, 0.8), face(0.3, 0.3, 0.2, 0.27, 0.9), face(0.5, 0.3, 0.2, 0.27, 0.8), face(0.7, 0.3, 0.2, 0.27, 0.8)];
    const result = smartCrop(wide, tallFrame, faces);
    expect(result.zoom).toBe(MIN_ZOOM);
    expect(result.cx).toBeCloseTo(0.5, 2); // the heads span 6% to 94% of the photo
    expect(contains(sourceRect(wide, tallFrame, result), px(padFace(faces[1]!.box), wide))).toBe(true);
  });

  it("AC-CROP-02 keeps every face whole when the zoomed-out crop is longer than the photo", () => {
    const image = { width: 3000, height: 4000 };
    const frame = { width: 400, height: 800 }; // the crop is 2/3 of the photo's width
    const faces = [face(0.02, 0.2, 0.4, 0.3, 0.9), face(0.5, 0.2, 0.4, 0.3, 0.8)];
    const result = smartCrop(image, frame, faces);
    expect(result.zoom).toBeLessThan(1);
    expect(result.zoom).toBeGreaterThanOrEqual(MIN_ZOOM);
    expect(result.cx).toBe(0.5);
    const crop = sourceRect(image, frame, result);
    expect(crop.width).toBeGreaterThanOrEqual(image.width);
    for (const f of faces) expect(contains(crop, px(padFace(f.box), image))).toBe(true);
  });

  it("AC-CROP-03 moves the subject out of a safe-zone band", () => {
    const tall = { width: 3000, height: 4000 };
    const wideFrame = { width: 1000, height: 500 }; // crop slides along y
    const subject = [object(0.4, 0.45, 0.2, 0.1)];
    const plain = sourceRect(tall, wideFrame, smartCrop(tall, wideFrame, subject));
    const banded = sourceRect(tall, wideFrame, smartCrop(tall, wideFrame, subject, { top: 0.4, bottom: 0, left: 0, right: 0 }));
    const objTop = 0.45 * tall.height;
    expect((objTop - banded.y) / banded.height).toBeGreaterThan(0.4); // below the band
    expect(banded.y).toBeLessThan(plain.y);
  });

  it("AC-CROP-01 is deterministic", () => {
    const d = [face(0.2, 0.2, 0.1, 0.1), object(0.6, 0.5, 0.3, 0.3)];
    expect(smartCrop(wide, tallFrame, d)).toEqual(smartCrop(wide, tallFrame, d));
  });
});

describe("smartCrop properties", () => {
  // Small deterministic PRNG (mulberry32) so failures reproduce.
  function rng(seed: number) {
    return () => {
      seed |= 0;
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const rand = rng(42);
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);

  const cases = Array.from({ length: 500 }, () => {
    const image = { width: Math.round(between(800, 5000)), height: Math.round(between(800, 5000)) };
    const frame = { width: between(200, 1080), height: between(200, 1920) };
    const detections: Detection[] = Array.from({ length: Math.floor(between(0, 4)) }, () => {
      // Faces are a little taller than wide, measured in pixels.
      const wPx = between(0.03, 0.2) * Math.min(image.width, image.height);
      const w = wPx / image.width;
      const h = (wPx * between(1.1, 1.4)) / image.height;
      return face(between(0, 1 - w), between(0, 1 - h), w, h, between(0.5, 1));
    });
    if (rand() < 0.5) {
      const w = between(0.1, 0.6);
      const h = between(0.1, 0.6);
      detections.push(object(between(0, 1 - w), between(0, 1 - h), w, h));
    }
    return { image, frame, detections };
  });

  /** Whether every face fits in the crop at MIN_ZOOM; when not, some cut is unavoidable. */
  function facesCanFit(image: { width: number; height: number }, frame: { width: number; height: number }, detections: Detection[]) {
    const heads = detections.filter((d) => d.kind === "face").map((d) => px(padFace(d.box), image));
    if (!heads.length) return true;
    const widest = sourceRect(image, frame, { cx: 0.5, cy: 0.5, zoom: MIN_ZOOM });
    const x0 = Math.min(...heads.map((h) => h.x));
    const x1 = Math.max(...heads.map((h) => h.x + h.width));
    const y0 = Math.min(...heads.map((h) => h.y));
    const y1 = Math.max(...heads.map((h) => h.y + h.height));
    return x1 - x0 <= widest.width * (1 - 2 * SUBJECT_MARGIN) && y1 - y0 <= widest.height * (1 - 2 * SUBJECT_MARGIN);
  }

  it("AC-CROP-02 never cuts through a face", () => {
    let checked = 0;
    for (const { image, frame, detections } of cases) {
      if (!facesCanFit(image, frame, detections)) continue;
      checked++;
      const result = smartCrop(image, frame, detections);
      const crop = sourceRect(image, frame, result);
      for (const d of detections.filter((d) => d.kind === "face")) {
        const head = px(padFace(d.box), image);
        const ok = result.zoom < 1 ? contains(crop, head) : contains(crop, head) || disjoint(crop, head);
        expect(ok, JSON.stringify({ image, frame, detections })).toBe(true);
      }
    }
    expect(checked).toBeGreaterThan(400);
  });

  it("AC-CROP-01 keeps the whole subject when it fits and no other face is in the way", () => {
    let checked = 0;
    for (const { image, frame, detections } of cases) {
      const subject = subjectBox(detections);
      if (!subject) continue;
      const zoom1 = sourceRect(image, frame, CENTER_CROP);
      const s = px(subject, image);
      const fits = s.width <= zoom1.width * (1 - 2 * SUBJECT_MARGIN) && s.height <= zoom1.height * (1 - 2 * SUBJECT_MARGIN);
      const outsideFaces = detections.filter((d) => d.kind === "face" && !contains(s, px(padFace(d.box), image)));
      if (!fits || outsideFaces.length) continue;
      checked++;
      expect(contains(sourceRect(image, frame, smartCrop(image, frame, detections)), s)).toBe(true);
    }
    expect(checked).toBeGreaterThan(100);
  });
});
