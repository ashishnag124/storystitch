import { STORY_CANVAS, type Layout } from "@storystitch/shared";

export interface Size {
  width: number;
  height: number;
}

export interface Rect extends Size {
  x: number;
  y: number;
}

/** Largest centered region of `source` with the aspect ratio of `target` (like CSS object-fit: cover). */
export function coverCrop(source: Size, target: Size): Rect {
  const scale = Math.max(target.width / source.width, target.height / source.height);
  const width = target.width / scale;
  const height = target.height / scale;
  return { x: (source.width - width) / 2, y: (source.height - height) / 2, width, height };
}

/** Draws images[i] into layout.cells[i], center-cropped, on a 1080×1920 canvas. */
export function renderLayout(canvas: HTMLCanvasElement, layout: Layout, images: ImageBitmap[]): void {
  const { width: W, height: H } = STORY_CANVAS;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not supported");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  layout.cells.forEach((cell, i) => {
    const image = images[i];
    if (!image) return;
    const dest = {
      x: Math.round(cell.x * W),
      y: Math.round(cell.y * H),
      width: Math.round(cell.w * W),
      height: Math.round(cell.h * H),
    };
    const src = coverCrop(image, dest);
    ctx.drawImage(image, src.x, src.y, src.width, src.height, dest.x, dest.y, dest.width, dest.height);
  });
}
