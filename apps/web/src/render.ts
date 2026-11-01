import { CENTER_CROP, sourceRect, type Crop } from "@storystitch/layout-engine";
import { drawOrder, type Size } from "@storystitch/shared";
import type { Photo } from "./photos";
import { cellShapes, styleScale, type CellShape, type Outline, type Scene } from "./scene";

/** Anything drawable with its pixel size: a preview copy or a decoded original. */
export interface Drawable {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const HIGHLIGHT_COLOR = "#2563eb";

/** A photo's downscaled working copy, for previews. */
export const previewOf = (p: Photo): Drawable => ({ image: p.preview, width: p.preview.width, height: p.preview.height });

function outlinePath(outline: Outline, radius: number): Path2D {
  const path = new Path2D();
  if (outline.kind === "circle") {
    path.arc(outline.cx, outline.cy, outline.r, 0, 2 * Math.PI);
    return path;
  }
  const pts = outline.points;
  const n = pts.length;
  const last = pts[n - 1]!;
  const first = pts[0]!;
  path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  pts.forEach((cur, i) => {
    const prev = pts[(i + n - 1) % n]!;
    const next = pts[(i + 1) % n]!;
    const r = Math.min(radius, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2);
    path.arcTo(cur.x, cur.y, next.x, next.y, r);
  });
  path.closePath();
  return path;
}

export function drawCell(ctx: CanvasRenderingContext2D, shape: CellShape, img: Drawable, crop: Crop, radius: number) {
  const { frame } = shape;
  const src = sourceRect(img, frame, crop);
  // A zoomed-out crop reaches past the photo; draw only the part that exists (Safari won't clip for us).
  const x0 = Math.max(src.x, 0);
  const y0 = Math.max(src.y, 0);
  const x1 = Math.min(src.x + src.width, img.width);
  const y1 = Math.min(src.y + src.height, img.height);
  const kx = frame.width / src.width;
  const ky = frame.height / src.height;
  ctx.save();
  ctx.clip(outlinePath(shape.outline, radius));
  ctx.translate(frame.cx, frame.cy);
  ctx.rotate((frame.rotate * Math.PI) / 180);
  ctx.drawImage(
    img.image,
    x0,
    y0,
    x1 - x0,
    y1 - y0,
    -frame.width / 2 + (x0 - src.x) * kx,
    -frame.height / 2 + (y0 - src.y) * ky,
    (x1 - x0) * kx,
    (y1 - y0) * ky,
  );
  ctx.restore();
}

/**
 * Fills the canvas with a heavily blurred copy of the photo. Shrinking to a few pixels and
 * scaling back up blurs the same in every browser (Safari's canvas `filter` support is unreliable).
 */
export function drawBlurredBackground(ctx: CanvasRenderingContext2D, size: Size, img: Drawable) {
  const src = sourceRect(img, size, CENTER_CROP);
  let from: CanvasImageSource = img.image;
  let rect = [src.x, src.y, src.width, src.height] as const;
  for (const width of [18, 72]) {
    const step = document.createElement("canvas");
    step.width = width;
    step.height = Math.round((width * size.height) / size.width);
    const sctx = step.getContext("2d")!;
    sctx.imageSmoothingQuality = "high";
    sctx.drawImage(from, ...rect, 0, 0, step.width, step.height);
    from = step;
    rect = [0, 0, step.width, step.height];
  }
  ctx.save();
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(from, ...rect, 0, 0, size.width, size.height);
  ctx.fillStyle = "rgb(0 0 0 / 0.12)";
  ctx.fillRect(0, 0, size.width, size.height);
  ctx.restore();
}

export function fillBackground(ctx: CanvasRenderingContext2D, size: Size, scene: Scene) {
  ctx.fillStyle = scene.style.background;
  ctx.fillRect(0, 0, size.width, size.height);
}

/** Draws a whole scene synchronously from already-decoded images (the preview copies). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: Size,
  scene: Scene,
  imageFor: (photo: number) => Drawable,
  highlight?: number,
) {
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius } = styleScale(scene.layout, scene.style, size);
  fillBackground(ctx, size, scene);
  if (scene.layout.blurBackground) drawBlurredBackground(ctx, size, imageFor(scene.order[0]!));
  for (const i of drawOrder(scene.layout.cells)) drawCell(ctx, shapes[i]!, imageFor(scene.order[i]!), scene.crops[i]!, radius);
  if (highlight !== undefined && shapes[highlight]) {
    ctx.save();
    ctx.lineWidth = Math.max(3, size.width / 180);
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    ctx.stroke(outlinePath(shapes[highlight].outline, radius));
    ctx.restore();
  }
}
