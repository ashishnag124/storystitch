// Looks on canvas 2D. Not with `ctx.filter`, which iOS Safari doesn't support: the look's matrix runs over the pixels.
import { applyLook, lookMatrix, type LookId } from "@storystitch/client";

/** Anything drawable with its pixel size (as render.web.ts's Drawable). */
interface Drawable {
  image: CanvasImageSource;
  width: number;
  height: number;
}

/**
 * Images up to this size (the preview copies, PREVIEW_LONG_SIDE on their long side, and smaller photos) get a filtered copy
 * of their own, kept for the next frame. Larger ones (originals, at export) are filtered after they're cropped and scaled
 * into their cell, so the work is bounded by the canvas, not the photo.
 */
const COPY_MAX_PIXELS = 1280 * 1280;

/** Filters a canvas's pixels in place. */
function filterCanvas(canvas: HTMLCanvasElement, look: LookId) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyLook(data.data, lookMatrix(look));
  ctx.putImageData(data, 0, 0);
  return canvas;
}

/** Filtered copies by image and look. */
const copies = new WeakMap<object, Map<LookId, Drawable>>();

/** The image with the look applied, kept for next time. */
function lookedCopy(img: Drawable, look: LookId): Drawable {
  const byLook = copies.get(img.image) ?? new Map<LookId, Drawable>();
  copies.set(img.image, byLook);
  let copy = byLook.get(look);
  if (!copy) {
    const canvas = document.createElement("canvas");
    canvas.width = img.width;
    canvas.height = img.height;
    canvas.getContext("2d", { willReadFrequently: true })!.drawImage(img.image, 0, 0);
    copy = { image: filterCanvas(canvas, look), width: img.width, height: img.height };
    byLook.set(look, copy);
  }
  return copy;
}

/**
 * Draws a photo with a look: `draw` paints `img` (or its filtered copy) into a frame centered on the origin. Large images
 * are drawn into a frame-sized canvas first, filtered there and then laid on `ctx`.
 */
export function drawWithLook(ctx: CanvasRenderingContext2D, img: Drawable, frame: { width: number; height: number }, look: LookId, draw: (ctx: CanvasRenderingContext2D, img: Drawable) => void) {
  if (look === "original") return draw(ctx, img);
  if (img.width * img.height <= COPY_MAX_PIXELS) return draw(ctx, lookedCopy(img, look));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(frame.width));
  canvas.height = Math.max(1, Math.ceil(frame.height));
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  g.imageSmoothingQuality = ctx.imageSmoothingQuality;
  g.translate(canvas.width / 2, canvas.height / 2);
  draw(g, img);
  filterCanvas(canvas, look);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
}

/** A small canvas (a blurred copy) with the look applied, as a new canvas. */
export function withLook(canvas: HTMLCanvasElement, look: LookId): HTMLCanvasElement {
  if (look === "original") return canvas;
  const copy = document.createElement("canvas");
  copy.width = canvas.width;
  copy.height = canvas.height;
  copy.getContext("2d", { willReadFrequently: true })!.drawImage(canvas, 0, 0);
  return filterCanvas(copy, look);
}
