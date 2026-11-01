import type { Detection } from "./subject";

/** RGBA pixels of a small working copy of a photo (e.g. 96 px on the long side). */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/**
 * Tuning for the fallback when no detector finds anything. A pixel's saliency mixes how far its
 * colour is from the photo's average, local edge strength and saturation, weighted toward the center
 * (photographers usually frame subjects near it).
 */
export const SALIENCY = {
  colorWeight: 0.5,
  edgeWeight: 0.3,
  saturationWeight: 0.2,
  /** Spread of the center weighting, as a fraction of the photo's size. */
  centerSigma: 0.35,
  /** The most salient share of pixels that forms the region. */
  topShare: 0.15,
  /** Below this peak saliency the photo is too uniform to have a subject. */
  minPeak: 0.12,
  /** Ignore this share of the region's pixels at each end, so stray specks don't stretch the box. */
  trim: 0.05,
  /** Confidence reported for the region. */
  score: 0.6,
} as const;

const percentile = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]!;

/** The photo's most salient region as a "salient" detection, or null for a featureless photo. */
export function salientRegion({ width: w, height: h, data }: Pixels): Detection | null {
  const n = w * h;
  const lum = new Float32Array(n);
  const mean = [0, 0, 0];
  for (let i = 0; i < n; i++) {
    const [r, g, b] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
    lum[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    mean[0]! += r / n;
    mean[1]! += g / n;
    mean[2]! += b / n;
  }

  const edge = new Float32Array(n);
  let maxEdge = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const at = (dx: number, dy: number) => lum[(y + dy) * w + x + dx]!;
      const gx = at(1, -1) + 2 * at(1, 0) + at(1, 1) - at(-1, -1) - 2 * at(-1, 0) - at(-1, 1);
      const gy = at(-1, 1) + 2 * at(0, 1) + at(1, 1) - at(-1, -1) - 2 * at(0, -1) - at(1, -1);
      edge[y * w + x] = Math.hypot(gx, gy);
      maxEdge = Math.max(maxEdge, edge[y * w + x]!);
    }
  }

  const saliency = new Float32Array(n);
  const twoSigma2 = 2 * SALIENCY.centerSigma ** 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const [r, g, b] = [data[i * 4]!, data[i * 4 + 1]!, data[i * 4 + 2]!];
      const color = Math.hypot(r - mean[0]!, g - mean[1]!, b - mean[2]!) / 441.7;
      const max = Math.max(r, g, b);
      const saturation = max ? (max - Math.min(r, g, b)) / max : 0;
      const e = maxEdge ? edge[i]! / maxEdge : 0;
      const dx = (x + 0.5) / w - 0.5;
      const dy = (y + 0.5) / h - 0.5;
      const center = Math.exp(-(dx * dx + dy * dy) / twoSigma2);
      saliency[i] =
        (SALIENCY.colorWeight * color + SALIENCY.edgeWeight * e + SALIENCY.saturationWeight * saturation) * center;
    }
  }

  const sorted = Array.from(saliency).sort((a, b) => b - a);
  if (sorted[0]! < SALIENCY.minPeak) return null;
  const threshold = sorted[Math.floor(n * SALIENCY.topShare)]!;
  const xs: number[] = [];
  const ys: number[] = [];
  saliency.forEach((s, i) => {
    if (s >= threshold) {
      xs.push((i % w) + 0.5);
      ys.push(Math.floor(i / w) + 0.5);
    }
  });
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const [x0, x1] = [percentile(xs, SALIENCY.trim), percentile(xs, 1 - SALIENCY.trim)];
  const [y0, y1] = [percentile(ys, SALIENCY.trim), percentile(ys, 1 - SALIENCY.trim)];
  return { kind: "salient", score: SALIENCY.score, box: { x: x0 / w, y: y0 / h, w: (x1 - x0) / w, h: (y1 - y0) / h } };
}
