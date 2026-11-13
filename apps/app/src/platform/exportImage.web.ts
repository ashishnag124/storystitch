import { cellShapes, styleScale, type Scene } from "@storystitch/client";
import { STORY_CANVAS, drawOrder } from "@storystitch/shared";
import { decodeFull, type Photo } from "./photos.web";
import { drawBlurredBackground, drawCell, drawMark, fillBackground, hasBlurredBackground, markFont, type Drawable } from "./render.web";

export type ExportFormat = "image/jpeg" | "image/png";

export interface EncodeRequest {
  id: number;
  bitmap: ImageBitmap;
  format: ExportFormat;
  quality: number;
}

export interface EncodeResponse {
  id: number;
  blob: Blob | null;
}
export const JPEG_QUALITY = 0.9;
/** Name of the performance measure covering one export render, from decoding the originals to the encoded file. */
export const EXPORT_MEASURE = "storystitch:export";

let encoder: Worker | undefined;
let nextEncode = 0;

/** Encodes on the main thread. Browsers run this only when idle, which can add a second after a tap. */
const encodeHere = (canvas: HTMLCanvasElement, format: ExportFormat) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Export failed"))), format, JPEG_QUALITY),
  );

/** Encodes in a worker (public/encode-worker.js, built by scripts/prepare-assets.mjs), so the file is ready sooner. */
async function encode(canvas: HTMLCanvasElement, format: ExportFormat): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(canvas);
    encoder ??= new Worker("/encode-worker.js", { type: "module" });
    const worker = encoder;
    const id = nextEncode++;
    return await new Promise<Blob>((resolve, reject) => {
      const done = () => {
        worker.removeEventListener("message", onMessage);
        worker.removeEventListener("error", onError);
      };
      const onMessage = ({ data }: MessageEvent<EncodeResponse>) => {
        if (data.id !== id) return;
        done();
        if (data.blob) resolve(data.blob);
        else reject(new Error("Encoding failed"));
      };
      const onError = () => {
        done();
        reject(new Error("Encoding worker failed"));
      };
      worker.addEventListener("message", onMessage);
      worker.addEventListener("error", onError);
      worker.postMessage({ id, bitmap, format, quality: JPEG_QUALITY } satisfies EncodeRequest, [bitmap]);
    });
  } catch {
    return encodeHere(canvas, format);
  }
}

async function decode(photo: Photo): Promise<Drawable & { image: ImageBitmap }> {
  const image = await decodeFull(photo.source);
  return { image, width: image.width, height: image.height };
}

/** Set `cancelled` to stop a render that's no longer wanted, between photos. */
export interface ExportJob {
  cancelled: boolean;
}

/**
 * Renders the 1080×1920 export from the original photos, decoding one at a time
 * so memory stays at a single full-resolution photo. `mark` adds the "Made with StoryStitch" mark. Returns null if the job was cancelled.
 */
export async function renderExport(scene: Scene, photos: Photo[], format: ExportFormat, mark: boolean, job: ExportJob): Promise<Blob | null> {
  const start = performance.now();
  const size = STORY_CANVAS;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);

  fillBackground(ctx, size, scene);
  if (hasBlurredBackground(scene)) {
    const img = await decode(photos[scene.order[0]!]!);
    drawBlurredBackground(ctx, size, img, scene.style.look);
    img.image.close();
  }
  for (const i of drawOrder(scene.layout.cells)) {
    if (job.cancelled) return null;
    const img = await decode(photos[scene.order[i]!]!);
    drawCell(ctx, shapes[i]!, img, scene.crops[i]!, radius, border, scene.style.borderColor, scene.style.look);
    img.image.close();
  }
  if (mark) {
    await document.fonts.load(markFont(size));
    drawMark(ctx, size);
  }
  const blob = await encode(canvas, format);
  // Recorded for the performance acceptance test (AC-PERF-03) and visible in browser dev tools.
  performance.measure(EXPORT_MEASURE, { start });
  return blob;
}

/** Encoding runs in a worker, so it can start soon after a change. */
export const EXPORT_PAUSE_MS = 400;

/** A browser only opens its share sheet during the tap itself, so the image has to be ready first. */
export const canWaitToShare: boolean = false;

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
 * a tap handler: Safari rejects share() once the tap's user activation has expired. False if the user closed
 * the share sheet.
 */
export async function shareOrDownload(blob: Blob, filename: string): Promise<boolean> {
  const file = new File([blob], filename, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return false; // user closed the sheet
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
