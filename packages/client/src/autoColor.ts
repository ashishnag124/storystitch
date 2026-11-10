/** RGBA pixels of a small copy of a photo (see AUTO_SAMPLE_SIDE). */
export interface Pixels {
  data: ArrayLike<number>;
  width: number;
  height: number;
}

/** Long side of the copies the auto color is measured on. More detail doesn't change the result. */
export const AUTO_SAMPLE_SIDE = 48;

/** How pale "Auto" is, in OKLCH: high lightness, little chroma, so it never competes with the photos. */
export const AUTO_LIGHTNESS = 0.965;
export const AUTO_CHROMA = 0.022;

const BINS = 36;
/** Pixels darker or lighter than this (OKLab lightness) say little about the photo's color. */
const DARK = 0.25;
const LIGHT = 0.96;
/** Chroma below this counts as grey. */
const GREY = 0.03;
/** When at least this share of the pixels has color, the tint is at full strength; below it, it fades toward white. */
const FULL_SHARE = 0.4;
const MIN_STRENGTH = 0.15;

const linear = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const encode = (c: number) => 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklab(r: number, g: number, b: number): [number, number, number] {
  [r, g, b] = [linear(r), linear(g), linear(b)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** An OKLCH color (hue in radians) as #rrggbb, clipped to sRGB. */
function oklchToHex(L: number, C: number, h: number): string {
  const a = C * Math.cos(h);
  const b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return "#" + rgb.map((v) => Math.round(encode(Math.min(1, Math.max(0, v)))).toString(16).padStart(2, "0")).join("");
}

/**
 * The "Auto" background: a pale tint of the most common hue across the photos. Each photo counts the same.
 * Near-black, near-white and grey pixels are skipped, the rest go into hue buckets, and the fullest bucket
 * (with its neighbours) wins. When few pixels have any color, the tint fades toward white.
 */
export function autoColor(photos: Pixels[]): string {
  const weight = new Float64Array(BINS);
  const sumA = new Float64Array(BINS);
  const sumB = new Float64Array(BINS);
  let counted = 0;
  let colored = 0;
  for (const { data } of photos) {
    const unit = 4 / data.length;
    for (let i = 0; i < data.length; i += 4) {
      const [L, a, b] = oklab(data[i]!, data[i + 1]!, data[i + 2]!);
      if (L < DARK || L > LIGHT) continue;
      counted += unit;
      if (Math.hypot(a, b) < GREY) continue;
      colored += unit;
      const bin = Math.floor(((Math.atan2(b, a) + 2 * Math.PI) % (2 * Math.PI)) / ((2 * Math.PI) / BINS)) % BINS;
      weight[bin]! += unit;
      sumA[bin]! += a * unit;
      sumB[bin]! += b * unit;
    }
  }
  if (colored === 0) return "#ffffff";
  const at = (i: number) => (i + BINS) % BINS;
  const near = (arr: Float64Array, i: number) => arr[at(i - 1)]! + arr[i]! + arr[at(i + 1)]!;
  let best = 0;
  for (let i = 1; i < BINS; i++) if (near(weight, i) + weight[i]! > near(weight, best) + weight[best]!) best = i;
  const hue = Math.atan2(near(sumB, best), near(sumA, best));
  const strength = Math.min(1, Math.max(MIN_STRENGTH, colored / counted / FULL_SHARE));
  return oklchToHex(AUTO_LIGHTNESS, AUTO_CHROMA * strength, hue);
}
