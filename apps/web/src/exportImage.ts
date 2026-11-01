import { UPSCALE_WARNING_FACTOR, upscaleFactor } from "@storystitch/layout-engine";
import { STORY_CANVAS, drawOrder } from "@storystitch/shared";
import { decodeFull, type Photo } from "./photos";
import { drawBlurredBackground, drawCell, fillBackground, type Drawable } from "./render";
import { cellShapes, styleScale, type Scene } from "./scene";

export type ExportFormat = "image/jpeg" | "image/png";
export const JPEG_QUALITY = 0.9;

async function decode(photo: Photo): Promise<Drawable & { image: ImageBitmap }> {
  const image = await decodeFull(photo.source);
  return { image, width: image.width, height: image.height };
}

/**
 * Renders the 1080×1920 export from the original photos, decoding one at a time
 * so memory stays at a single full-resolution photo.
 */
export async function renderExport(scene: Scene, photos: Photo[], format: ExportFormat): Promise<Blob> {
  const size = STORY_CANVAS;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius } = styleScale(scene.layout, scene.style, size);

  fillBackground(ctx, size, scene);
  if (scene.layout.blurBackground) {
    const img = await decode(photos[scene.order[0]!]!);
    drawBlurredBackground(ctx, size, img);
    img.image.close();
  }
  for (const i of drawOrder(scene.layout.cells)) {
    const img = await decode(photos[scene.order[i]!]!);
    drawCell(ctx, shapes[i]!, img, scene.crops[i]!, radius);
    img.image.close();
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Export failed"))), format, JPEG_QUALITY),
  );
}

export interface UpscaleWarning {
  photo: number;
  name: string;
  factor: number;
}

/** Photos that must be enlarged more than UPSCALE_WARNING_FACTOR to fill their cell in the export. */
export function upscaleWarnings(scene: Scene, photos: Photo[]): UpscaleWarning[] {
  const shapes = cellShapes(scene.layout, scene.style, STORY_CANVAS);
  return shapes.flatMap((shape, i) => {
    const photo = scene.order[i]!;
    const p = photos[photo]!;
    const factor = upscaleFactor(p, shape.frame, scene.crops[i]!);
    return factor > UPSCALE_WARNING_FACTOR ? [{ photo, name: p.name, factor }] : [];
  });
}

/** Whether this browser can hand image files to the native share sheet. */
export function canShareFiles(): boolean {
  try {
    return !!navigator.canShare?.({ files: [new File([""], "story.jpg", { type: "image/jpeg" })] });
  } catch {
    return false;
  }
}

/**
 * Opens the share sheet (where the user picks Instagram → Story) or downloads. Call it first thing in
 * a tap handler: Safari rejects share() once the tap's user activation has expired.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<void> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
