import type { Size } from "@storystitch/shared";

/**
 * How a photo sits in its cell: the point of the photo at the frame's center (0–1 of the photo's
 * width and height) and a zoom where 1 is the smallest crop that still covers the frame.
 * It's resolution-independent, so preview copies and originals share it. Below 1 the whole photo
 * shrinks inside the frame and the cell background shows around it.
 */
export interface Crop {
  cx: number;
  cy: number;
  zoom: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const CENTER_CROP: Crop = { cx: 0.5, cy: 0.5, zoom: 1 };
export const MAX_ZOOM = 4;
/** Smart crops zoom out this far at most, when that's the only way to keep every face whole. */
export const MIN_ZOOM = 0.5;
/** Above this, the export warns that the photo will look soft. */
export const UPSCALE_WARNING_FACTOR = 1.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Places a region of `size` along an axis of `length`: inside it when it fits, else centered on it. */
function place(center: number, size: number, length: number): number {
  return size <= length ? clamp(center - size / 2, 0, length - size) : (length - size) / 2;
}

/**
 * The region of the photo (in its own pixels) shown in a frame of `frame` size. It stays inside the
 * photo unless zoom < 1, where it's larger than the photo along at least one axis.
 */
export function sourceRect(image: Size, frame: Size, crop: Crop): Rect {
  const aspect = frame.width / frame.height;
  let width = image.width;
  let height = width / aspect;
  if (height > image.height) {
    height = image.height;
    width = height * aspect;
  }
  const zoom = clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM);
  width /= zoom;
  height /= zoom;
  return {
    x: place(crop.cx * image.width, width, image.width),
    y: place(crop.cy * image.height, height, image.height),
    width,
    height,
  };
}

/** Whether the crop shows past the photo's edge, so part of the frame has none of the photo in it (zoom below 1). */
export function leavesUncovered(image: Size, frame: Size, crop: Crop): boolean {
  const r = sourceRect(image, frame, crop);
  const slack = 0.01;
  return r.x < -slack || r.y < -slack || r.x + r.width > image.width + slack || r.y + r.height > image.height + slack;
}

/** The same crop with its center pulled back so the frame never shows past the photo's edge. */
export function clampCrop(image: Size, frame: Size, crop: Crop): Crop {
  const r = sourceRect(image, frame, crop);
  return {
    cx: (r.x + r.width / 2) / image.width,
    cy: (r.y + r.height / 2) / image.height,
    zoom: clamp(crop.zoom, MIN_ZOOM, MAX_ZOOM),
  };
}

/** Follows a drag of (dx, dy) frame pixels: the photo moves with the finger. */
export function panCrop(image: Size, frame: Size, crop: Crop, dx: number, dy: number): Crop {
  const imagePxPerFramePx = sourceRect(image, frame, crop).width / frame.width;
  return clampCrop(image, frame, {
    ...crop,
    cx: crop.cx - (dx * imagePxPerFramePx) / image.width,
    cy: crop.cy - (dy * imagePxPerFramePx) / image.height,
  });
}

/** How much the photo is enlarged to fill the frame; above 1 it's upscaled. */
export function upscaleFactor(image: Size, frame: Size, crop: Crop): number {
  return frame.width / sourceRect(image, frame, crop).width;
}
