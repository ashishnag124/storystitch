// The same drawing as render.web.ts, on Skia. Keep the two in step: both draw the same layouts and styles.
import {
  DEFAULT_BACKGROUND,
  MARK_OPACITY,
  MARK_TEXT,
  backgroundOf,
  cellShapes,
  markFontSize,
  markLayout,
  markLogoParts,
  styleScale,
  type Box,
  type CellShape,
  type Outline,
  type Scene,
} from "@storystitch/client";
import { CENTER_CROP, sourceRect, type Crop } from "@storystitch/layout-engine";
import { drawOrder, type Size } from "@storystitch/shared";
import { ClipOp, FilterMode, MipmapMode, PaintStyle, Skia, StrokeJoin, matchFont, type SkCanvas, type SkFont, type SkImage, type SkPaint, type SkPath } from "@shopify/react-native-skia";
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

/** Cubic scaling, the softest kind: linear leaves square steps when a few pixels are stretched across the screen. */
const SMOOTH = [1, 0] as const;

/** A heavily blurred copy of the photo: shrunk to a few pixels, as on web, so both platforms blur the same. */
export function blurredImage(size: Size, img: Drawable): SkImage {
  const src = sourceRect(img, size, CENTER_CROP);
  const tiny = shrink(img.image, src, 18, Math.round((18 * size.height) / size.width));
  const [width, height] = [72, Math.round((72 * size.height) / size.width)];
  const surface = Skia.Surface.Make(width, height);
  if (!surface) throw new Error("Couldn't make a surface");
  surface.getCanvas().drawImageRectCubic(tiny, Skia.XYWHRect(0, 0, tiny.width(), tiny.height()), Skia.XYWHRect(0, 0, width, height), ...SMOOTH);
  surface.flush();
  return surface.makeImageSnapshot();
}

export function drawBlurredBackground(canvas: SkCanvas, size: Size, blurred: SkImage) {
  canvas.drawImageRectCubic(blurred, Skia.XYWHRect(0, 0, blurred.width(), blurred.height()), Skia.XYWHRect(0, 0, size.width, size.height), ...SMOOTH);
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
  /** The tapped (or lifted) cell. */
  selected?: number;
  /** Where a lifted photo would be dropped. */
  target?: number;
  /** Cells left empty because their photo is being animated on top (lift, swap). */
  hidden?: number[];
  /** A cell shown as an empty slot while its photo is lifted. */
  dim?: number;
}

export function outlineBounds(outline: Outline): Box {
  if (outline.kind === "circle") return { x: outline.cx - outline.r, y: outline.cy - outline.r, w: 2 * outline.r, h: 2 * outline.r };
  const xs = outline.points.map((p) => p.x);
  const ys = outline.points.map((p) => p.y);
  const [x, y] = [Math.min(...xs), Math.min(...ys)];
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Draws a whole scene from already-decoded images (the preview copies). */
export function drawScene(canvas: SkCanvas, size: Size, scene: Scene, imageFor: (photo: number) => Drawable, blurred: SkImage | null, marks: Marks = {}) {
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  fillBackground(canvas, size, scene);
  if (blurred) drawBlurredBackground(canvas, size, blurred);
  for (const i of drawOrder(scene.layout.cells)) {
    if (marks.hidden?.includes(i)) continue;
    drawCell(canvas, shapes[i]!, imageFor(scene.order[i]!), scene.crops[i]!, radius, border, scene.style.borderColor);
  }
  const dimmed = marks.dim === undefined ? undefined : shapes[marks.dim];
  if (dimmed) canvas.drawPath(outlinePath(dimmed.outline, radius), paintOf("rgba(28, 25, 23, 0.45)"));

  const line = Math.max(3, size.width / 180);
  const stroke = (cell: number | undefined, dash: number[]) => {
    if (cell === undefined || !shapes[cell]) return;
    const paint = paintOf(HIGHLIGHT_COLOR, PaintStyle.Stroke, line);
    if (dash.length) paint.setPathEffect(Skia.PathEffect.MakeDash(dash, 0));
    canvas.drawPath(outlinePath(shapes[cell].outline, radius), paint);
  };
  stroke(marks.selected, []);
  if (marks.target !== marks.selected) stroke(marks.target, [line * 4, line * 3]);
}

/** Draws a layout being edited: cells without a photo as empty slots, cells with a problem dashed, the selected one outlined. */
export function drawDraft(
  canvas: SkCanvas,
  size: Size,
  scene: Scene,
  crops: (Crop | null)[],
  order: number[],
  imageFor: (photo: number) => Drawable,
  blurred: SkImage | null,
  selected: number | null,
  problems: number[],
  target: number | null = null,
  fade: { cell: number; alpha: number } | null = null,
) {
  const shapes = cellShapes(scene.layout, scene.style, size);
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  fillBackground(canvas, size, scene);
  if (blurred) drawBlurredBackground(canvas, size, blurred);
  for (const i of drawOrder(scene.layout.cells)) {
    const crop = crops[i];
    // A shape dragged toward the edge fades to say it will go.
    const faded = fade?.cell === i;
    if (faded) {
      const paint = Skia.Paint();
      paint.setAlphaf(fade.alpha);
      canvas.saveLayer(paint);
    }
    if (crop) drawCell(canvas, shapes[i]!, imageFor(order[i]!), crop, radius, border, scene.style.borderColor);
    else {
      canvas.drawPath(outlinePath(shapes[i]!.photo ?? shapes[i]!.outline, radius), paintOf("rgba(43, 19, 64, 0.5)"));
      // A plus, to say a photo goes here.
      const { cx, cy, width, height } = shapes[i]!.frame;
      const arm = Math.min(width, height) * 0.18;
      const paint = paintOf("rgba(255, 244, 232, 0.85)", PaintStyle.Stroke, 10);
      canvas.drawLine(cx - arm, cy, cx + arm, cy, paint);
      canvas.drawLine(cx, cy - arm, cx, cy + arm, paint);
    }
    if (faded) canvas.restore();
  }
  const outline = (cell: number, color: string, dash: number[]) => {
    if (!shapes[cell]) return;
    const paint = paintOf(color, PaintStyle.Stroke, 10);
    if (dash.length) paint.setPathEffect(Skia.PathEffect.MakeDash(dash, 0));
    canvas.drawPath(outlinePath(shapes[cell].outline, radius), paint);
  };
  for (const cell of problems) outline(cell, "#ff8f8f", [28, 18]);
  if (selected !== null) outline(selected, "#ffc24b", []);
  if (target !== null) outline(target, "#7dffb0", []);
}

/** Draws one cell of `scene` moved from its own place into `to`, for animating it over the scene. */
export function drawCellAt(canvas: SkCanvas, size: Size, scene: Scene, cell: number, imageFor: (photo: number) => Drawable, to: Box, opts: { turn?: number; shadow?: number } = {}) {
  const shape = cellShapes(scene.layout, scene.style, size)[cell]!;
  const { radius, border } = styleScale(scene.layout, scene.style, size);
  const box = outlineBounds(shape.outline);
  canvas.save();
  if (opts.shadow) {
    const paint = Skia.Paint();
    paint.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, opts.shadow / 3, opts.shadow / 2, opts.shadow / 2, Skia.Color("rgba(0, 0, 0, 0.4)"), null));
    canvas.saveLayer(paint);
  }
  canvas.translate(to.x + to.w / 2, to.y + to.h / 2);
  if (opts.turn) canvas.rotate(opts.turn, 0, 0);
  canvas.scale(to.w / box.w, to.h / box.h);
  canvas.translate(-box.x - box.w / 2, -box.y - box.h / 2);
  drawCell(canvas, shape, imageFor(scene.order[cell]!), scene.crops[cell]!, radius, border, scene.style.borderColor);
  if (opts.shadow) canvas.restore();
  canvas.restore();
}

/** Draws a scene faded over what's already on the canvas, for crossfading between layouts. */
export function drawFaded(canvas: SkCanvas, size: Size, scene: Scene, imageFor: (photo: number) => Drawable, blurred: SkImage | null, alpha: number, scale: number) {
  const paint = Skia.Paint();
  paint.setAlphaf(alpha);
  canvas.saveLayer(paint);
  canvas.translate((size.width * (1 - scale)) / 2, (size.height * (1 - scale)) / 2);
  canvas.scale(scale, scale);
  drawScene(canvas, size, scene, imageFor, blurred);
  canvas.restore();
}

let markFont: { size: number; font: SkFont } | undefined;

/** Draws the "Made with StoryStitch" mark over the collage, drawn solid on its own layer and then laid on see-through. */
export function drawMark(canvas: SkCanvas, size: Size) {
  const fontSize = markFontSize(size);
  if (markFont?.size !== fontSize) markFont = { size: fontSize, font: matchFont({ fontFamily: "Bricolage Grotesque", fontSize, fontWeight: "bold" }) };
  const { font } = markFont;
  const m = markLayout(size, font.measureText(MARK_TEXT).width);
  const layer = Skia.Paint();
  layer.setAlphaf(MARK_OPACITY);
  // A faint shadow keeps it readable on light photos.
  layer.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, 0, m.fontSize * 0.15, m.fontSize * 0.15, Skia.Color("rgba(0, 0, 0, 0.35)"), null));
  canvas.saveLayer(layer);
  for (const part of markLogoParts(m.logo)) {
    canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(part.box.x, part.box.y, part.box.w, part.box.h), part.radius, part.radius), paintOf(part.color));
  }
  canvas.drawText(MARK_TEXT, m.text.x, m.text.y, paintOf("#fff"), font);
  canvas.restore();
}
