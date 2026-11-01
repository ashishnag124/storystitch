import { CENTER_CROP, type Crop } from "@storystitch/layout-engine";
import {
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

export function newScene(layout: Layout, style: Style = DEFAULT_STYLE): Scene {
  return { layout, style, order: layout.cells.map((_, i) => i), crops: layout.cells.map(() => CENTER_CROP) };
}

/** Switches layout, keeping which photo goes where. Crops reset because the cell shapes change. */
export function withLayout(scene: Scene, layout: Layout): Scene {
  return { ...newScene(layout, scene.style), order: scene.order };
}

export function swapCells(scene: Scene, a: number, b: number): Scene {
  const order = [...scene.order];
  [order[a], order[b]] = [order[b]!, order[a]!];
  const crops = [...scene.crops];
  crops[a] = CENTER_CROP;
  crops[b] = CENTER_CROP;
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
