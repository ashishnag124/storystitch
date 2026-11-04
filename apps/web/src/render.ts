import { CENTER_CROP, sourceRect, type Crop } from "@storystitch/layout-engine";
import { drawOrder, type Size } from "@storystitch/shared";
import type { Photo } from "./photos";
import { DEFAULT_BACKGROUND, backgroundOf, cellShapes, styleScale, type CellShape, type Outline, type Scene } from "./scene";

/** Anything drawable with its pixel size: a preview copy or a decoded original. */
export interface Drawable {
  image: CanvasImageSource;
  width: number;
  height: number;
}

const HIGHLIGHT_COLOR = "#2563eb";

/** A photo's downscaled working copy, for previews. */
export const previewOf = (p: Photo): Drawable => ({ image: p.preview, width: p.preview.width, height: p.preview.height });

/** A cell outline as a path, with its corners rounded by `radius`. */
export function outlinePath(outline: Outline, radius: number): Path2D {
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

export function drawCell(ctx: CanvasRenderingContext2D, shape: CellShape, img: Drawable, crop: Crop, radius: number, border = 0, borderColor = "#fff") {
  const { frame } = shape;
  const src = sourceRect(img, frame, crop);
  // A zoomed-out crop reaches past the photo; draw only the part that exists (Safari won't clip for us).
  const x0 = Math.max(src.x, 0);
  const y0 = Math.max(src.y, 0);
  const x1 = Math.min(src.x + src.width, img.width);
  const y1 = Math.min(src.y + src.height, img.height);
  const kx = frame.width / src.width;
  const ky = frame.height / src.height;
  const outline = outlinePath(shape.outline, radius);
  // A Polaroid's card is filled with the border color and its photo clipped to the window, with square corners.
  const clip = shape.photo ? outlinePath(shape.photo, 0) : outline;
  ctx.save();
  if (shape.photo) {
    ctx.fillStyle = borderColor;
    ctx.fill(outline);
  }
  ctx.clip(clip);
  ctx.save();
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
  if (border > 0) {
    // Stroke twice the width centered on the outline; the clip keeps the inner half, so the border sits inside the cell.
    ctx.lineWidth = 2 * border;
    ctx.strokeStyle = borderColor;
    ctx.stroke(clip);
  }
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

/** Fills the canvas with the scene's background color, or the default one under a blurred photo. */
export function fillBackground(ctx: CanvasRenderingContext2D, size: Size, scene: Scene) {
  const background = backgroundOf(scene.layout, scene.style);
  ctx.fillStyle = background.kind === "color" ? background.color : DEFAULT_BACKGROUND.color;
  ctx.fillRect(0, 0, size.width, size.height);
}

export const hasBlurredBackground = (scene: Scene) => backgroundOf(scene.layout, scene.style).kind === "blur";

/** Editing feedback drawn over the preview. */
export interface Marks {
  /** The tapped (or lifted) cell. */
  selected?: number;
  /** Where a lifted photo would be dropped. */
  target?: number;
  /** Number every cell, for picking cells from the keyboard. */
  numbers?: boolean;
  /** Cells left empty because their photo is being animated on top (lift, swap). */
  hidden?: number[];
  /** A cell shown as an empty slot while its photo is lifted. */
  dim?: number;
}

/** Axis-aligned bounds of a cell's outline, in canvas pixels. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function outlineBounds(outline: Outline): Box {
  if (outline.kind === "circle") return { x: outline.cx - outline.r, y: outline.cy - outline.r, w: 2 * outline.r, h: 2 * outline.r };
  const xs = outline.points.map((p) => p.x);
  const ys = outline.points.map((p) => p.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** One cell rendered on its own (photo clipped to its outline), for animating it over the scene. */
export function snapshotCell(scene: Scene, size: Size, cell: number, imageFor: (photo: number) => Drawable) {
  const shape = cellShapes(scene.layout, scene.style, size)[cell]!;
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  const box = outlineBounds(shape.outline);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(box.w));
  canvas.height = Math.max(1, Math.ceil(box.h));
  const ctx = canvas.getContext("2d")!;
  ctx.translate(-box.x, -box.y);
  drawCell(ctx, shape, imageFor(scene.order[cell]!), scene.crops[cell]!, radius, border, scene.style.borderColor);
  return { canvas, box };
}

/** Draws a whole scene synchronously from already-decoded images (the preview copies). */
export function drawScene(
  ctx: CanvasRenderingContext2D,
  size: Size,
  scene: Scene,
  imageFor: (photo: number) => Drawable,
  marks: Marks = {},
) {
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  fillBackground(ctx, size, scene);
  if (hasBlurredBackground(scene)) drawBlurredBackground(ctx, size, imageFor(scene.order[0]!));
  for (const i of drawOrder(scene.layout.cells)) {
    if (marks.hidden?.includes(i)) continue;
    drawCell(ctx, shapes[i]!, imageFor(scene.order[i]!), scene.crops[i]!, radius, border, scene.style.borderColor);
  }
  const dimmed = marks.dim === undefined ? undefined : shapes[marks.dim];
  if (dimmed) {
    ctx.save();
    ctx.fillStyle = "rgb(28 25 23 / 0.45)";
    ctx.fill(outlinePath(dimmed.outline, radius));
    ctx.restore();
  }

  const line = Math.max(3, size.width / 180);
  const stroke = (cell: number | undefined, dash: number[]) => {
    if (cell === undefined || !shapes[cell]) return;
    ctx.save();
    ctx.lineWidth = line;
    ctx.setLineDash(dash);
    ctx.strokeStyle = HIGHLIGHT_COLOR;
    ctx.stroke(outlinePath(shapes[cell].outline, radius));
    ctx.restore();
  };
  stroke(marks.selected, []);
  if (marks.target !== marks.selected) stroke(marks.target, [line * 4, line * 3]);

  if (marks.numbers) {
    const r = size.width / 28;
    ctx.save();
    ctx.font = `600 ${r * 1.1}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    shapes.forEach(({ frame }, i) => {
      ctx.fillStyle = HIGHLIGHT_COLOR;
      ctx.beginPath();
      ctx.arc(frame.cx, frame.cy, r, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = "#fff";
      ctx.fillText(String(i + 1), frame.cx, frame.cy);
    });
    ctx.restore();
  }
}
