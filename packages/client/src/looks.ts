/**
 * Looks: one-tap filters applied to every photo in a collage (never to the background color, borders, cards or the
 * mark). Each is a 4×5 color matrix, row-major, the way Skia takes it: a row per output channel (r, g, b, a), with
 * columns for the input r, g, b, a and an offset. Channels run 0 to 1, so the offset is a fraction of full scale.
 */

export type LookId = "original" | "film" | "fade" | "warm" | "cool" | "vivid" | "mono" | "noir";

/** Rec. 709 luma weights: how bright each channel looks. */
const LUMA = [0.2126, 0.7152, 0.0722] as const;

/**
 * A matrix that sets saturation (0 is grey, 1 unchanged), then scales each channel by `gain` and adds `offset`.
 * Contrast `c` around mid-grey is a gain of `c` with an offset of `(1 - c) / 2`.
 */
function matrixOf(saturation: number, gain: readonly [number, number, number], offset: readonly [number, number, number]): number[] {
  const rows = [0, 1, 2].map((out) => [
    ...[0, 1, 2].map((inp) => gain[out]! * ((1 - saturation) * LUMA[inp]! + (out === inp ? saturation : 0))),
    0,
    offset[out]!,
  ]);
  return [...rows.flat(), 0, 0, 0, 1, 0];
}

const all = (v: number) => [v, v, v] as const;

/** In the order the Style tool shows them. */
export const LOOKS: readonly { id: LookId; name: string; matrix: readonly number[] }[] = [
  { id: "original", name: "Original", matrix: matrixOf(1, all(1), all(0)) },
  // Warm, slightly faded, with lifted blacks.
  { id: "film", name: "Film", matrix: matrixOf(0.85, [0.88, 0.85, 0.78], [0.1, 0.08, 0.06]) },
  { id: "fade", name: "Fade", matrix: matrixOf(0.75, all(0.82), all(0.1)) },
  { id: "warm", name: "Warm", matrix: matrixOf(1.05, [1.06, 1, 0.86], [0.03, 0.01, 0]) },
  { id: "cool", name: "Cool", matrix: matrixOf(1, [0.9, 0.99, 1.06], [0, 0.01, 0.05]) },
  { id: "vivid", name: "Vivid", matrix: matrixOf(1.4, all(1.1), all(-0.05)) },
  { id: "mono", name: "Mono", matrix: matrixOf(0, all(1), all(0)) },
  // Black and white with high contrast.
  { id: "noir", name: "Noir", matrix: matrixOf(0, all(1.45), all(-0.225)) },
];

export const DEFAULT_LOOK: LookId = "original";

export const lookMatrix = (id: LookId): readonly number[] => LOOKS.find((l) => l.id === id)!.matrix;

/**
 * Applies a look's matrix in place to RGBA bytes (0 to 255, not premultiplied: what `getImageData` gives). Values
 * clamp to 0–255; alpha is left as it is (photos are opaque).
 */
export function applyLook(pixels: { [i: number]: number; length: number }, matrix: readonly number[]) {
  // Coefficients in locals: this runs over millions of pixels.
  const [m0, m1, m2, , o0, m5, m6, m7, , o1, m10, m11, m12, , o2] = matrix.map((v, i) => (i % 5 === 4 ? v * 255 : v)) as number[];
  const clamp = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!;
    const g = pixels[i + 1]!;
    const b = pixels[i + 2]!;
    pixels[i] = clamp(m0! * r + m1! * g + m2! * b + o0!);
    pixels[i + 1] = clamp(m5! * r + m6! * g + m7! * b + o1!);
    pixels[i + 2] = clamp(m10! * r + m11! * g + m12! * b + o2!);
  }
}
