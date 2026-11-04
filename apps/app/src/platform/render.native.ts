// The same drawing as render.web.ts, on Skia. Keep the two in step: both draw the same layouts and styles.
import { DEFAULT_BACKGROUND, backgroundOf, cellShapes, styleScale, type CellShape, type Outline, type Scene } from "@storystitch/client";
import { CENTER_CROP, sourceRect, type Crop } from "@storystitch/layout-engine";
import { drawOrder, type Size } from "@storystitch/shared";
import { ClipOp, FilterMode, MipmapMode, PaintStyle, Skia, StrokeJoin, type SkCanvas, type SkImage, type SkPaint, type SkPath } from "@shopify/react-native-skia";
import type { Photo } from "./photos.native";

/** Anything drawable with its pixel size: a preview copy or a decoded original. */
export interface Drawable {
  image: SkImage;
  width: number;
  height: number;
}

const HIGHLIGHT_COLOR = "#2563eb";

/** A photo's downscaled working copy, for previews. */
export const previewOf = (p: Photo): Drawable => ({ image: p.preview, width: p.preview.width(), height: p.preview.height() });

function paintOf(color: string, style = PaintStyle.Fill, width = 0): SkPaint {
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  paint.setColor(Skia.Color(color));
  paint.setStyle(style);
  if (width) {
    paint.setStrokeWidth(width);
    paint.setStrokeJoin(StrokeJoin.Round);
  }
  return paint;
}

/** A cell outline as a path, with its corners rounded by `radius`. */
export function outlinePath(outline: Outline, radius: number): SkPath {
  const path = Skia.PathBuilder.Make();
  if (outline.kind === "circle") return path.addCircle(outline.cx, outline.cy, outline.r).build();
  const pts = outline.points;
  const n = pts.length;
  const last = pts[n - 1]!;
  const first = pts[0]!;
  path.moveTo((last.x + first.x) / 2, (last.y + first.y) / 2);
  pts.forEach((cur, i) => {
    const prev = pts[(i + n - 1) % n]!;
    const next = pts[(i + 1) % n]!;
    const r = Math.min(radius, Math.hypot(cur.x - prev.x, cur.y - prev.y) / 2, Math.hypot(next.x - cur.x, next.y - cur.y) / 2);
    path.arcToTangent(cur.x, cur.y, next.x, next.y, r);
  });
  return path.close().build();
}

export function drawCell(canvas: SkCanvas, shape: CellShape, img: Drawable, crop: Crop, radius: number, border = 0, borderColor = "#fff") {
  const { frame } = shape;
  const src = sourceRect(img, frame, crop);
  // A zoomed-out crop reaches past the photo; draw only the part that exists.
  const x0 = Math.max(src.x, 0);
  const y0 = Math.max(src.y, 0);
  const x1 = Math.min(src.x + src.width, img.width);
  const y1 = Math.min(src.y + src.height, img.height);
  const kx = frame.width / src.width;
  const ky = frame.height / src.height;
  const outline = outlinePath(shape.outline, radius);
  // A Polaroid's card is filled with the border color and its photo clipped to the window, with square corners.
  const clip = shape.photo ? outlinePath(shape.photo, 0) : outline;
  canvas.save();
  if (shape.photo) canvas.drawPath(outline, paintOf(borderColor));
  canvas.clipPath(clip, ClipOp.Intersect, true);
  canvas.save();
  canvas.translate(frame.cx, frame.cy);
  canvas.rotate(frame.rotate, 0, 0);
  canvas.drawImageRectOptions(
    img.image,
    Skia.XYWHRect(x0, y0, x1 - x0, y1 - y0),
    Skia.XYWHRect(-frame.width / 2 + (x0 - src.x) * kx, -frame.height / 2 + (y0 - src.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky),
    FilterMode.Linear,
    MipmapMode.Linear,
  );
  canvas.restore();
  // Stroke twice the width centered on the outline; the clip keeps the inner half, so the border sits inside the cell.
  if (border > 0) canvas.drawPath(clip, paintOf(borderColor, PaintStyle.Stroke, 2 * border));
  canvas.restore();
}

/** Redraws `image` into a small surface, the step the blur is made of. */
function shrink(image: SkImage, src: { x: number; y: number; width: number; height: number }, width: number, height: number) {
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error("Couldn't make a surface");
  surface
    .getCanvas()
    .drawImageRectOptions(image, Skia.XYWHRect(src.x, src.y, src.width, src.height), Skia.XYWHRect(0, 0, width, height), FilterMode.Linear, MipmapMode.Linear);
  surface.flush();
  return surface.makeImageSnapshot();
}

/** A heavily blurred copy of the photo: shrunk to a few pixels, as on web, so both platforms blur the same. */
export function blurredImage(size: Size, img: Drawable): SkImage {
  const src = sourceRect(img, size, CENTER_CROP);
  const tiny = shrink(img.image, src, 18, Math.round((18 * size.height) / size.width));
  const h = Math.round((72 * size.height) / size.width);
  return shrink(tiny, { x: 0, y: 0, width: tiny.width(), height: tiny.height() }, 72, h);
}

export function drawBlurredBackground(canvas: SkCanvas, size: Size, blurred: SkImage) {
  canvas.drawImageRectOptions(
    blurred,
    Skia.XYWHRect(0, 0, blurred.width(), blurred.height()),
    Skia.XYWHRect(0, 0, size.width, size.height),
    FilterMode.Linear,
    MipmapMode.None,
  );
  canvas.drawRect(Skia.XYWHRect(0, 0, size.width, size.height), paintOf("rgba(0, 0, 0, 0.12)"));
}

/** Fills the canvas with the scene's background color, or the default one under a blurred photo. */
export function fillBackground(canvas: SkCanvas, size: Size, scene: Scene) {
  const background = backgroundOf(scene.layout, scene.style);
  canvas.drawRect(Skia.XYWHRect(0, 0, size.width, size.height), paintOf(background.kind === "color" ? background.color : DEFAULT_BACKGROUND.color));
}

export const hasBlurredBackground = (scene: Scene) => backgroundOf(scene.layout, scene.style).kind === "blur";

/** Editing feedback drawn over the preview. */
export interface Marks {
  /** The tapped cell. */
  selected?: number;
}

/** Draws a whole scene from already-decoded images (the preview copies). */
export function drawScene(canvas: SkCanvas, size: Size, scene: Scene, imageFor: (photo: number) => Drawable, blurred: SkImage | null, marks: Marks = {}) {
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  fillBackground(canvas, size, scene);
  if (blurred) drawBlurredBackground(canvas, size, blurred);
  for (const i of drawOrder(scene.layout.cells)) {
    drawCell(canvas, shapes[i]!, imageFor(scene.order[i]!), scene.crops[i]!, radius, border, scene.style.borderColor);
  }
  const selected = marks.selected === undefined ? undefined : shapes[marks.selected];
  if (selected) canvas.drawPath(outlinePath(selected.outline, radius), paintOf(HIGHLIGHT_COLOR, PaintStyle.Stroke, Math.max(3, size.width / 180)));
}
