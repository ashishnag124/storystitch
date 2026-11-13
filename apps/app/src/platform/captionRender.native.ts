// The same caption drawing as captionRender.web.ts, on Skia, from the same font files (captionFonts.native.ts loads them).
import { CAPTION_SHADOW, SELECTION_COLOR, captionAt, captionLayout, captionShadow, isBlank, selectionOutline, type Caption, type CaptionFont, type CaptionLayout } from "@storystitch/client";
import type { Point, Size } from "@storystitch/shared";
import { FontHinting, PaintStyle, Skia, type SkCanvas, type SkFont, type SkTypeface } from "@shopify/react-native-skia";

const typefaces: Partial<Record<CaptionFont, SkTypeface>> = {};

/** Makes a font available to captions. Until a caption's font is set, the caption isn't drawn. */
export function setCaptionTypeface(font: CaptionFont, typeface: SkTypeface) {
  typefaces[font] = typeface;
}

export const hasCaptionTypefaces = (captions: readonly Caption[]) => captions.every((c) => typefaces[c.font]);

const fontOf = (font: CaptionFont, fontSize: number): SkFont | null => {
  const typeface = typefaces[font];
  if (!typeface) return null;
  const skFont = Skia.Font(typeface, fontSize);
  // Unrounded advances and no hinting, as a browser's canvas measures text: otherwise widths drift by pixels per line.
  skFont.setSubpixel(true);
  skFont.setLinearMetrics(true);
  skFont.setHinting(FontHinting.None);
  return skFont;
};

/** Lays a caption out with Skia's text measurements, or null while its font is loading. */
export function layoutCaption(c: Caption, size: Size): CaptionLayout | null {
  if (!typefaces[c.font]) return null;
  return captionLayout(c, size, (line, fontSize) => fontOf(c.font, fontSize)!.measureText(line).width);
}

/** Each caption's box (null for a blank one), for finding the caption under a finger. */
export const captionBoxes = (size: Size, captions: readonly Caption[]) => captions.map((c) => (isBlank(c) ? null : (layoutCaption(c, size)?.box ?? null)));

/** The caption under `at` (canvas pixels), or -1. */
export const hitCaption = (size: Size, captions: readonly Caption[], at: Point) => captionAt(captionBoxes(size, captions), at);

/** Draws the captions over the collage, the selected one (preview only) outlined. */
export function drawCaptions(canvas: SkCanvas, size: Size, captions: readonly Caption[], selected: number | null = null) {
  captions.forEach((c, i) => {
    if (isBlank(c)) return;
    const layout = layoutCaption(c, size);
    if (!layout) return;
    const font = fontOf(c.font, layout.fontSize)!;
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(c.color));
    const shadow = captionShadow(c.color);
    if (shadow) {
      const layer = Skia.Paint();
      const sigma = CAPTION_SHADOW.sigma * layout.fontSize;
      layer.setImageFilter(Skia.ImageFilter.MakeDropShadow(0, CAPTION_SHADOW.dy * layout.fontSize, sigma, sigma, Skia.Color(shadow), null));
      canvas.saveLayer(layer);
    }
    for (const line of layout.lines) canvas.drawText(line.text, line.x, line.y, paint, font);
    if (shadow) canvas.restore();
    if (i === selected) {
      const o = selectionOutline(size, layout.box);
      const outline = Skia.Paint();
      outline.setAntiAlias(true);
      outline.setColor(Skia.Color(SELECTION_COLOR));
      outline.setStyle(PaintStyle.Stroke);
      outline.setStrokeWidth(o.line);
      outline.setPathEffect(Skia.PathEffect.MakeDash(o.dash, 0));
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(o.x, o.y, o.w, o.h), o.radius, o.radius), outline);
    }
  });
}
