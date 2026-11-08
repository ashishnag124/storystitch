import type { Size } from "@storystitch/shared";
import type { Box } from "./motion";

/** The "Made with StoryStitch" mark drawn into the export: the logo and the name, small and see-through. */
export const MARK_TEXT = "storystitch";
export const MARK_OPACITY = 0.78;

/** The name's font size: small enough that the whole mark stays within about a quarter of the image's width. */
export const markFontSize = (size: Size) => size.width * 0.035;

export interface MarkLayout {
  /** The logo, a 9:16 frame like the app's icon. */
  logo: Box;
  /** Where the name's baseline starts. */
  text: { x: number; y: number };
  fontSize: number;
}

/**
 * Lays out the mark in the lower right corner, far enough in to sit on the photo rather than on a layout's
 * outer margin (28px by default) and clear of the photo's rounded corner.
 * `textWidth` is the name's width at `markFontSize(size)`, measured by the renderer.
 */
export function markLayout(size: Size, textWidth: number): MarkLayout {
  const fontSize = markFontSize(size);
  const right = size.width - fontSize * 1.9;
  const baseline = size.height - fontSize * 2.1 - fontSize * 0.25; // room for the "y"'s tail
  const h = fontSize * 0.8;
  const w = (h * 16) / 28;
  const x = right - textWidth - w - fontSize * 0.3;
  return { logo: { x, y: baseline - h, w, h }, text: { x: right - textWidth, y: baseline }, fontSize };
}

/** The logo's three blocks in its own box, from the app's Logo component: coral, marigold on top, pink in the corner. */
export function markLogoParts(b: Box): { box: Box; color: string; radius: number }[] {
  const k = b.w / 16;
  return [
    { box: b, color: "#ff7a59", radius: 3 * k },
    { box: { x: b.x, y: b.y, w: b.w, h: 13 * k }, color: "#ffc24b", radius: 3 * k },
    { box: { x: b.x + b.w - 7.5 * k, y: b.y + b.h - 13.5 * k, w: 6.5 * k, h: 12.5 * k }, color: "#ff4f8b", radius: 2 * k },
  ];
}
