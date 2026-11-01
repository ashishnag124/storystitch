import { z } from "zod";
import layoutsJson from "./layouts.json";

/** Instagram Story canvas in pixels (9:16). Cell coordinates are normalized 0–1 against it. */
export const STORY_CANVAS = { width: 1080, height: 1920 } as const;

const unit = z.number().min(0).max(1);

export const CellSchema = z
  .object({ x: unit, y: unit, w: unit, h: unit })
  .refine((c) => c.x + c.w <= 1 && c.y + c.h <= 1, "cell must stay inside the canvas");

/** A layout holds one photo per cell, so its photo count is `cells.length`. */
export const LayoutSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  cells: z.array(CellSchema).min(1),
});

export type Cell = z.infer<typeof CellSchema>;
export type Layout = z.infer<typeof LayoutSchema>;

export const layouts: Layout[] = z.array(LayoutSchema).parse(layoutsJson);
