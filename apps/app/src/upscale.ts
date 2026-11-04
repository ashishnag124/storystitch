import { cellShapes, type Scene } from "@storystitch/client";
import { UPSCALE_WARNING_FACTOR, upscaleFactor } from "@storystitch/layout-engine";
import { STORY_CANVAS, type Size } from "@storystitch/shared";

export interface UpscaleWarning {
  photo: number;
  name: string;
  factor: number;
}

/** Photos that must be enlarged more than UPSCALE_WARNING_FACTOR to fill their cell in the export. */
export function upscaleWarnings(scene: Scene, photos: (Size & { name: string })[]): UpscaleWarning[] {
  const shapes = cellShapes(scene.layout, scene.style, STORY_CANVAS);
  return shapes.flatMap((shape, i) => {
    const photo = scene.order[i]!;
    const p = photos[photo]!;
    const factor = upscaleFactor(p, shape.frame, scene.crops[i]!);
    return factor > UPSCALE_WARNING_FACTOR ? [{ photo, name: p.name, factor }] : [];
  });
}
