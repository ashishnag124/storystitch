import { smartCrop, type Crop, type Detection, type SafeInsets } from "@storystitch/layout-engine";
import {
  SAFE_ZONE,
  STORY_CANVAS,
  cellFrame,
  cellPolygon,
  insetPolygon,
  type Frame,
  type Layout,
  type Point,
  type Size,
} from "@storystitch/shared";

/** Lengths are pixels on the 1080-wide export and scale with the canvas. */
export interface Style {
  background: string;
  gap: number;
  margin: number;
  radius: number;
}

export const DEFAULT_STYLE: Style = { background: "#f4efe6", gap: 14, margin: 28, radius: 20 };

/** What the user sees: a layout, which photo is in each cell (`order[cell]`) and each cell's crop. */
export interface Scene {
  layout: Layout;
  style: Style;
  order: number[];
  crops: Crop[];
}

/** What cropping needs to know about a photo. */
export interface CropSource extends Size {
  detections: Detection[];
}

/** Fractions of a frame's edges under Instagram's overlays (SAFE_ZONE), ignoring rotation. */
export function safeInsets(frame: Frame, canvas: Size = STORY_CANVAS): SafeInsets {
  const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
  const [left, top] = [frame.cx - frame.width / 2, frame.cy - frame.height / 2];
  const [right, bottom] = [left + frame.width, top + frame.height];
  return {
    top: clamp01((SAFE_ZONE.top * canvas.height - top) / frame.height),
    bottom: clamp01((bottom - (1 - SAFE_ZONE.bottom) * canvas.height) / frame.height),
    left: clamp01((SAFE_ZONE.sides * canvas.width - left) / frame.width),
    right: clamp01((right - (1 - SAFE_ZONE.sides) * canvas.width) / frame.width),
  };
}

/** The automatic crop for the photo in `cell`, framed around its subject and clear of the safe-zone bands. */
export function autoCrop(layout: Layout, style: Style, photo: CropSource, cell: number): Crop {
  const { frame } = cellShapes(layout, style, STORY_CANVAS)[cell]!;
  return smartCrop(photo, frame, photo.detections, safeInsets(frame));
}

function autoCrops(layout: Layout, style: Style, order: number[], photos: CropSource[]): Crop[] {
  const shapes = cellShapes(layout, style, STORY_CANVAS);
  return shapes.map(({ frame }, i) => {
    const photo = photos[order[i]!]!;
    return smartCrop(photo, frame, photo.detections, safeInsets(frame));
  });
}

export function newScene(layout: Layout, photos: CropSource[], style: Style = DEFAULT_STYLE, order?: number[]): Scene {
  const o = order ?? layout.cells.map((_, i) => i);
  return { layout, style, order: o, crops: autoCrops(layout, style, o, photos) };
}

/** Switches layout, keeping which photo goes where. Crops are redone because the cell shapes change. */
export function withLayout(scene: Scene, layout: Layout, photos: CropSource[]): Scene {
  return newScene(layout, photos, scene.style, scene.order);
}

/** Swaps the photos in two cells; both get fresh automatic crops for their new cells. */
export function swapCells(scene: Scene, a: number, b: number, photos: CropSource[]): Scene {
  const order = [...scene.order];
  [order[a], order[b]] = [order[b]!, order[a]!];
  const crops = [...scene.crops];
  crops[a] = autoCrop(scene.layout, scene.style, photos[order[a]!]!, a);
  crops[b] = autoCrop(scene.layout, scene.style, photos[order[b]!]!, b);
  return { ...scene, order, crops };
}

export function withCrop(scene: Scene, cell: number, crop: Crop): Scene {
  const crops = [...scene.crops];
  crops[cell] = crop;
  return { ...scene, crops };
}

export type Outline = { kind: "polygon"; points: Point[] } | { kind: "circle"; cx: number; cy: number; r: number };

/** A styled cell on a canvas of a given size: the area its photo fills and the outline it's clipped to. */
export interface CellShape {
  frame: Frame;
  outline: Outline;
}

/** Gaps are split evenly between neighbours; the outer margin is the same on every side. */
export function styleScale(layout: Layout, style: Style, size: Size) {
  const k = size.width / STORY_CANVAS.width;
  return {
    gap: layout.bleed ? 0 : style.gap * k,
    margin: layout.bleed ? 0 : style.margin * k,
    radius: layout.bleed ? 0 : style.radius * k,
  };
}

export function cellShapes(layout: Layout, style: Style, size: Size): CellShape[] {
  const { gap, margin } = styleScale(layout, style, size);
  // Lay cells out on an area grown by half a gap, then shrink each cell by half a gap:
  // neighbours end up a full gap apart and edge cells exactly `margin` from the canvas edge.
  const offset = margin - gap / 2;
  const area = { width: size.width - 2 * offset, height: size.height - 2 * offset };
  const shift = (p: Point) => ({ x: p.x + offset, y: p.y + offset });

  return layout.cells.map((cell) => {
    if (cell.shape === "circle") {
      const r = cell.r * area.width - gap / 2;
      const cx = offset + cell.cx * area.width;
      const cy = offset + cell.cy * area.height;
      return { frame: { cx, cy, width: 2 * r, height: 2 * r, rotate: 0 }, outline: { kind: "circle", cx, cy, r } };
    }
    const points = insetPolygon(cellPolygon(cell, area), gap / 2).map(shift);
    if (cell.shape === "rect") {
      const f = cellFrame(cell, area);
      return {
        frame: { ...f, cx: f.cx + offset, cy: f.cy + offset, width: f.width - gap, height: f.height - gap },
        outline: { kind: "polygon", points },
      };
    }
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    return {
      frame: { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, width: x1 - x0, height: y1 - y0, rotate: 0 },
      outline: { kind: "polygon", points },
    };
  });
}
