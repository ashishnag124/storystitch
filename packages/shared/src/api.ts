import { z } from "zod";

/** `GET /health`: whether the API and its database are up. 503 when the database isn't. */
export const HealthSchema = z.object({
  ok: z.boolean(),
  /** The deployed commit (Railway sets it), or "dev" locally. */
  version: z.string(),
  database: z.enum(["up", "down"]),
});

export type Health = z.infer<typeof HealthSchema>;
