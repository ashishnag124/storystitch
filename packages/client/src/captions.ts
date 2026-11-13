import { SAFE_ZONE, type Point, type Size } from "@storystitch/shared";
import type { Box } from "./motion";

/** Text on the collage. Positions and sizes are fractions of the canvas, like everything else, so they scale with it. */
export interface Caption {
  /** 1 to MAX_CAPTION_CHARS characters, in up to MAX_CAPTION_LINES lines. */
  text: string;
  font: CaptionFont;
  color: string;
  /** Font size, as a share of the canvas's width (see CAPTION_SIZE). */
  size: number;
  /** The center of the caption's box, as shares of the canvas's width and height. */
  x: number;
  y: number;
}

export const CAPTION_FONTS = ["clean", "serif", "hand", "type"] as const;
export type CaptionFont = (typeof CAPTION_FONTS)[number];
export const CAPTION_FONT_NAMES: Record<CaptionFont, string> = { clean: "Clean", serif: "Serif", hand: "Hand", type: "Type" };

/** White and black, the app's marigold and coral, then as much of the Style tool's palette as fits across a phone. */
export const CAPTION_COLORS = [
  { name: "White", color: "#ffffff" },
  { name: "Black", color: "#111111" },
  { name: "Marigold", color: "#ffc24b" },
  { name: "Coral", color: "#ff7a59" },
  { name: "Cream", color: "#f4efe6" },
  { name: "Sage", color: "#d9e4d3" },
  { name: "Blush", color: "#f6d9d5" },
] as const;

export const MAX_CAPTIONS = 3;
export const MAX_CAPTION_CHARS = 80;
export const MAX_CAPTION_LINES = 3;
/** Font sizes, as shares of the canvas's width. */
export const CAPTION_SIZE = { min: 0.04, max: 0.14, default: 0.07 } as const;
/** Line spacing, in font sizes. */
export const CAPTION_LINE_HEIGHT = 1.2;
/** Room around the text that still counts as the caption (for tapping it and its outline), in font sizes. */
export const CAPTION_PAD = 0.25;
/** The widest a line can be, as a share of the canvas's width; longer lines make the whole caption smaller. */
export const CAPTION_MAX_WIDTH = 0.92;
/** A caption dragged this close to the middle (share of the canvas's width) lines up with it. */
export const CAPTION_SNAP = 0.02;
export const DEFAULT_CAPTION_TEXT = "Your text";
/** Where new captions go, in turn: near the top and bottom of the area Instagram leaves clear, then the middle. */
const SLOTS = [SAFE_ZONE.top + 0.08, 1 - SAFE_ZONE.bottom - 0.08, 0.5] as const;

/** White and black text get a soft shadow (black and white) so they read on any photo; palette colors don't. */
export function captionShadow(color: string): string | null {
  if (color === "#ffffff") return "rgba(0, 0, 0, 0.5)";
  if (color === "#111111") return "rgba(255, 255, 255, 0.6)";
  return null;
}
/** The shadow's blur (Skia's sigma; a canvas's `shadowBlur` is twice this) and drop, in font sizes. */
export const CAPTION_SHADOW = { sigma: 0.08, dy: 0.03 } as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** Text cut to the limits: at most MAX_CAPTION_LINES lines and MAX_CAPTION_CHARS characters. */
export function captionText(text: string): string {
  return [...text.replace(/\r\n?/g, "\n").split("\n").slice(0, MAX_CAPTION_LINES).join("\n")].slice(0, MAX_CAPTION_CHARS).join("");
}

/** A caption with nothing to draw (the user cleared its text). */
export const isBlank = (c: Caption) => c.text.trim() === "";

/** A new caption: white Clean text, centered across, in the next free slot inside the safe zone. */
export function newCaption(existing: readonly Caption[]): Caption {
  const y = SLOTS.find((slot) => !existing.some((c) => Math.abs(c.y - slot) < 0.05)) ?? SLOTS[existing.length % SLOTS.length]!;
  return { text: DEFAULT_CAPTION_TEXT, font: "clean", color: CAPTION_COLORS[0].color, size: CAPTION_SIZE.default, x: 0.5, y };
}

/** Adds a caption, unless there are MAX_CAPTIONS already. */
export function addCaption(captions: readonly Caption[]): Caption[] {
  return captions.length >= MAX_CAPTIONS ? [...captions] : [...captions, newCaption(captions)];
}

/** Changes one caption, keeping its text, size and position within the limits. */
export function updateCaption(captions: readonly Caption[], index: number, patch: Partial<Caption>): Caption[] {
  return captions.map((c, i) => {
    if (i !== index) return c;
    const next = { ...c, ...patch };
    return {
      ...next,
      text: captionText(next.text),
      size: clamp(next.size, CAPTION_SIZE.min, CAPTION_SIZE.max),
      x: clamp(next.x, 0, 1),
      y: clamp(next.y, 0, 1),
    };
  });
}

export function removeCaption(captions: readonly Caption[], index: number): Caption[] {
  return captions.filter((_, i) => i !== index);
}

/** Where a caption's text goes on a canvas, worked out the same way on every platform. */
export interface CaptionLayout {
  fontSize: number;
  /** Each line, from the left end of its baseline. */
  lines: { text: string; x: number; y: number }[];
  /** The text with CAPTION_PAD around it. Always fully on the canvas. */
  box: Box;
}

/**
 * Lays a caption out on a canvas of `size`. `measure` is the renderer's width of a line at a font size. Lines are
 * centered on each other; a caption too wide for the canvas gets smaller, and its box is moved fully onto the canvas.
 */
export function captionLayout(c: Caption, size: Size, measure: (line: string, fontSize: number) => number): CaptionLayout {
  const texts = c.text.split("\n");
  let fontSize = c.size * size.width;
  let widths = texts.map((t) => measure(t, fontSize));
  const widest = Math.max(0, ...widths);
  const limit = CAPTION_MAX_WIDTH * size.width - 2 * CAPTION_PAD * fontSize;
  if (widest > limit) {
    // Text width scales with the font size, and so does the padding.
    const k = (CAPTION_MAX_WIDTH * size.width) / (widest + 2 * CAPTION_PAD * fontSize);
    fontSize *= k;
    widths = widths.map((w) => w * k);
  }
  const pad = CAPTION_PAD * fontSize;
  const lineHeight = CAPTION_LINE_HEIGHT * fontSize;
  const w = Math.max(0, ...widths) + 2 * pad;
  const h = texts.length * lineHeight + 2 * pad;
  const cx = clamp(c.x * size.width, w / 2, size.width - w / 2);
  const cy = clamp(c.y * size.height, h / 2, size.height - h / 2);
  const top = cy - h / 2 + pad;
  return {
    fontSize,
    // The baseline sits a little below the middle of its line, so capitals look centered in it.
    lines: texts.map((text, i) => ({ text, x: cx - widths[i]! / 2, y: top + (i + 0.5) * lineHeight + 0.35 * fontSize })),
    box: { x: cx - w / 2, y: cy - h / 2, w, h },
  };
}

export const SELECTION_COLOR = "#ffffff";

/**
 * The preview's outline around the chosen caption: a dashed line about 1 screen pixel wide (the preview shows the
 * canvas at roughly a third of its size), with slightly rounded corners, just inside the caption's box.
 */
export function selectionOutline(size: Size, box: Box) {
  const line = size.width / 360;
  return { x: box.x + line / 2, y: box.y + line / 2, w: box.w - line, h: box.h - line, line, dash: [line * 4, line * 3], radius: line * 4 };
}

/** The caption whose box holds `at` (canvas pixels), the topmost (last) first, or -1. */
export function captionAt(boxes: readonly (Box | null)[], at: Point): number {
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i];
    if (b && at.x >= b.x && at.x <= b.x + b.w && at.y >= b.y && at.y <= b.y + b.h) return i;
  }
  return -1;
}

/**
 * Moves a caption so its box's center is at `to` (canvas pixels), keeping the box (`box`, its laid-out size) on the
 * canvas and, with `snap` (for dragging, not for small steps from the keyboard), lining it up with the middle when it's close.
 */
export function moveCaption(captions: readonly Caption[], index: number, to: Point, box: Pick<Box, "w" | "h">, size: Size, snap = true): Caption[] {
  let x = clamp(to.x, box.w / 2, size.width - box.w / 2) / size.width;
  const y = clamp(to.y, box.h / 2, size.height - box.h / 2) / size.height;
  if (snap && Math.abs(x - 0.5) < CAPTION_SNAP) x = 0.5;
  return updateCaption(captions, index, { x, y });
}
