import { z } from "zod";

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
