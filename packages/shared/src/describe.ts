import { z } from "zod";

/**
 * What the on-device model fills in for "Describe a layout": a grid as bands, with a photo count and a size for each,
 * not coordinates. With direction "rows" the bands are stacked top to bottom and each band's photos sit side by side in
 * equal widths; "columns" is the transpose. A band's size is its weight (1 small to 10 large) against the other bands.
 */
export const LayoutSpecSchema = z.object({
  direction: z.enum(["rows", "columns"]),
  bands: z
    .array(
      z.object({
        photos: z.number().int().min(1).max(4),
        size: z.number().min(1).max(10),
      }),
    )
    .min(1)
    .max(8),
});

export type LayoutSpec = z.infer<typeof LayoutSpecSchema>;
