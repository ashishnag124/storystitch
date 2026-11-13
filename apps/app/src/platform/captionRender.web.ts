// Captions on a canvas. captionRender.native.ts draws them the same way on Skia, from the same font files.
import { CAPTION_SHADOW, SELECTION_COLOR, captionAt, captionLayout, captionShadow, isBlank, selectionOutline, type Caption, type CaptionFont, type CaptionLayout } from "@storystitch/client";
import type { Point, Size } from "@storystitch/shared";

/** The family each caption font is loaded under (captionFonts.web.ts). */
export const CAPTION_FAMILIES: Record<CaptionFont, string> = {
  clean: "StoryStitch Clean",
  serif: "StoryStitch Serif",
  hand: "StoryStitch Hand",
  type: "StoryStitch Type",
};

const fontOf = (font: CaptionFont, fontSize: number) => `${fontSize}px "${CAPTION_FAMILIES[font]}"`;

/** Lays a caption out with this canvas's text measurements. */
export function layoutCaption(ctx: CanvasRenderingContext2D, c: Caption, size: Size): CaptionLayout {
  return captionLayout(c, size, (line, fontSize) => {
    ctx.font = fontOf(c.font, fontSize);
    return ctx.measureText(line).width;
  });
}

/** Each caption's box (null for a blank one), for finding the caption under a finger. */
export const captionBoxes = (ctx: CanvasRenderingContext2D, size: Size, captions: readonly Caption[]) =>
  captions.map((c) => (isBlank(c) ? null : layoutCaption(ctx, c, size).box));

/** The caption under `at` (canvas pixels), or -1. */
export const hitCaption = (ctx: CanvasRenderingContext2D, size: Size, captions: readonly Caption[], at: Point) => captionAt(captionBoxes(ctx, size, captions), at);

/** Draws the captions over the collage, the selected one (preview only) outlined. */
export function drawCaptions(ctx: CanvasRenderingContext2D, size: Size, captions: readonly Caption[], selected: number | null = null) {
  captions.forEach((c, i) => {
    if (isBlank(c)) return;
    const layout = layoutCaption(ctx, c, size);
    ctx.save();
    ctx.font = fontOf(c.font, layout.fontSize);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = c.color;
    const shadow = captionShadow(c.color);
    if (shadow) {
      ctx.shadowColor = shadow;
      ctx.shadowBlur = 2 * CAPTION_SHADOW.sigma * layout.fontSize;
      ctx.shadowOffsetY = CAPTION_SHADOW.dy * layout.fontSize;
    }
    for (const line of layout.lines) ctx.fillText(line.text, line.x, line.y);
    ctx.restore();
    if (i === selected) {
      const o = selectionOutline(size, layout.box);
      ctx.save();
      ctx.lineWidth = o.line;
      ctx.setLineDash(o.dash);
      ctx.strokeStyle = SELECTION_COLOR;
      ctx.beginPath();
      ctx.roundRect(o.x, o.y, o.w, o.h, o.radius);
      ctx.stroke();
      ctx.restore();
    }
  });
}
