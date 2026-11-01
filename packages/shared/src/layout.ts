import { z } from "zod";
import layoutsJson from "./layouts.json";

/** Instagram Story canvas in pixels (9:16). Cell coordinates are normalized 0–1 against it. */
export const STORY_CANVAS = { width: 1080, height: 1920 } as const;

/**
 * Bands of the Story covered by Instagram's interface, as fractions of the canvas.
 * No subject or face should sit inside them.
 */
export const SAFE_ZONE = { top: 0.14, bottom: 0.18, sides: 0.06 } as const;

/** Minimum share of each cell's area that must lie outside the safe-zone bands, so a subject can fit. */
export const MIN_CELL_SAFE_FRACTION = 0.3;

export const LAYOUT_FAMILIES = [
  "single",
  "grid",
  "feature",
  "mosaic",
  "diagonal",
  "scattered",
  "filmstrip",
  "circles",
  "negative-space",
] as const;

const unit = z.number().min(0).max(1);
const z_order = z.number().int().default(0);

/** Axis-aligned rectangle, optionally rotated (degrees, clockwise) around its center. */
const RectCellSchema = z.object({
  shape: z.literal("rect"),
  x: unit,
  y: unit,
  w: unit,
  h: unit,
  rotate: z.number().min(-45).max(45).default(0),
  z: z_order,
});

/** Convex polygon, for diagonal splits. Points are [x, y]. */
const PolygonCellSchema = z.object({
  shape: z.literal("polygon"),
  points: z.array(z.tuple([unit, unit])).min(3),
  z: z_order,
});

/** Circle centered at (cx, cy). `r` is a fraction of the canvas width so the circle stays round. */
const CircleCellSchema = z.object({
  shape: z.literal("circle"),
  cx: unit,
  cy: unit,
  r: unit,
  z: z_order,
});

export const CellSchema = z.discriminatedUnion("shape", [RectCellSchema, PolygonCellSchema, CircleCellSchema]);

/** A layout holds one photo per cell, so its photo count is `cells.length`. */
export const LayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.enum(LAYOUT_FAMILIES),
  cells: z.array(CellSchema).min(1).max(8),
  /** Cells may overlap only when this is set (e.g. scattered prints). */
  allowOverlap: z.boolean().default(false),
  /** Photos run to the canvas edge: no outer margin, gaps or rounded corners. */
  bleed: z.boolean().default(false),
  /** Fill the background with a blurred copy of the photo in cell 0 instead of the style color. */
  blurBackground: z.boolean().default(false),
});

export type Cell = z.infer<typeof CellSchema>;
export type RectCell = z.infer<typeof RectCellSchema>;
export type PolygonCell = z.infer<typeof PolygonCellSchema>;
export type CircleCell = z.infer<typeof CircleCellSchema>;
export type Layout = z.infer<typeof LayoutSchema>;
export type LayoutFamily = (typeof LAYOUT_FAMILIES)[number];

export const layouts: Layout[] = z.array(LayoutSchema).parse(layoutsJson);

export function layoutsFor(photoCount: number): Layout[] {
  return layouts.filter((l) => l.cells.length === photoCount);
}
