import { z } from "zod";
import { LayoutSchema } from "./layout";

/** `GET /health`: whether the API and its database are up. 503 when the database isn't. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  /** The deployed commit (Railway sets it), or "dev" locally. */
  version: z.string(),
  database: z.enum(["up", "down"]),
});

export type Health = z.infer<typeof HealthSchema>;

/** `GET /layouts/popularity`: how many times each layout has been exported (layouts never exported are left out). */
export const LayoutPopularitySchema = z.object({
  exports: z.record(z.string(), z.number().int().nonnegative()),
});

export type LayoutPopularity = z.infer<typeof LayoutPopularitySchema>;

/** Most layouts one account can save. */
export const SAVED_LAYOUT_LIMIT = 20;

/** `POST /layouts/mine` and `PUT /layouts/mine/:id`: a layout the user made, with the name they gave it. */
export const SaveLayoutSchema = z.object({
  name: z.string().trim().min(1).max(40),
  layout: LayoutSchema.omit({ id: true, name: true }),
});

/** A layout saved in the user's account. Its `layout.id` and `layout.name` are the saved id and name. */
export const SavedLayoutSchema = z.object({
  id: z.string(),
  name: z.string(),
  layout: LayoutSchema,
  updatedAt: z.string(),
});

/** `GET /layouts/mine`: the signed-in user's saved layouts, newest first. 401 when signed out. */
export const SavedLayoutsSchema = z.object({
  layouts: z.array(SavedLayoutSchema),
  limit: z.number().int(),
});

export type SaveLayout = z.infer<typeof SaveLayoutSchema>;
export type SavedLayout = z.infer<typeof SavedLayoutSchema>;
export type SavedLayouts = z.infer<typeof SavedLayoutsSchema>;
