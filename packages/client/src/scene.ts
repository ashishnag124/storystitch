import {
  assignPhotos,
  clampCrop,
  fitGrid,
  gridOf,
  placement,
  rankLayouts,
  smartCrop,
  type CellTarget, type Crop, type Detection, type SafeInsets } from "@storystitch/layout-engine";
import {
  SAFE_ZONE,
  STORY_CANVAS,
  cellContains,
  cellFrame,
  cellPolygon,
  frameCorners,
  cellAngle,
  insetPolygon,
  rotatePoints,
  layoutsFor,
  type Frame,
  type Layout,
  type Point,
  type Size,
} from "@storystitch/shared";
import { DEFAULT_LOOK, type LookId } from "./looks";

/** A solid color, a heavily blurred copy of the photo in the first cell, or Auto: a pale tint from the photos (`Style.auto`). */
export type Background = { kind: "color"; color: string } | { kind: "blur" } | { kind: "auto" };

/** Lengths are pixels on the 1080-wide export and scale with the canvas. */
export interface Style {
  /** Null until the user picks one: each layout then uses its own (see `backgroundOf`). */
  background: Background | null;
  /** The color Auto stands for, measured from the photos (see `autoColor`). */
  auto: string;
  gap: number;
  margin: number;
  radius: number;
  /** Null until the user picks one: each layout then uses its own (see `borderOf`). */
  border: number | null;
  borderColor: string;
  /** The filter on every photo (see `LOOKS`). */
  look: LookId;
}

export const DEFAULT_BACKGROUND = { kind: "color", color: "#ffffff" } as const satisfies Background;
/** Border overlapping photos (scattered prints, insets) get by default, so they read as separate prints. */
export const PRINT_BORDER = 14;

/** A Polaroid card's margins around its photo, as fractions of the card's width. */
export const POLAROID = { side: 0.06, bottom: 0.24 } as const;

export const DEFAULT_STYLE: Style = { background: null, auto: "#ffffff", gap: 8, margin: 12, radius: 20, border: null, borderColor: "#ffffff", look: DEFAULT_LOOK };

/** The background the user picked, else blur for "framed on blur" layouts, else Auto. */
export function pickedBackground(layout: Layout, style: Style): Background {
  return style.background ?? (layout.blurBackground ? { kind: "blur" } : { kind: "auto" });
}

/** The background a scene shows, with Auto as its color. */
export function backgroundOf(layout: Layout, style: Style): Exclude<Background, { kind: "auto" }> {
  const background = pickedBackground(layout, style);
  return background.kind === "auto" ? { kind: "color", color: style.auto } : background;
}

/**
 * The border width a scene shows (export pixels): the user's pick, else PRINT_BORDER where photos overlap
 * (Polaroids have their card instead).
 */
export function borderOf(layout: Layout, style: Style): number {
  return style.border ?? (layout.allowOverlap && layout.family !== "polaroid" ? PRINT_BORDER : 0);
}

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

function outlineArea(outline: Outline): number {
  if (outline.kind === "circle") return Math.PI * outline.r ** 2;
  const p = outline.points;
  return Math.abs(p.reduce((s, a, i) => s + a.x * p[(i + 1) % p.length]!.y - p[(i + 1) % p.length]!.x * a.y, 0)) / 2;
}

/** Sampling step (canvas pixels) for measuring how much of each overlapping cell stays uncovered. */
const UNCOVERED_STEP_PX = 12;

const uncoveredCache = new WeakMap<Layout, number[]>();

/** Share of each cell not covered by cells drawn above it; all 1 unless the layout allows overlap. Depends only on the layout, so it's measured once per layout object. */
function uncovered(layout: Layout): number[] {
  if (!layout.allowOverlap) return layout.cells.map(() => 1);
  const cached = uncoveredCache.get(layout);
  if (cached) return cached;
  const inside = layout.cells.map(() => 0);
  const shown = layout.cells.map(() => 0);
  for (let y = UNCOVERED_STEP_PX / 2; y < STORY_CANVAS.height; y += UNCOVERED_STEP_PX) {
    for (let x = UNCOVERED_STEP_PX / 2; x < STORY_CANVAS.width; x += UNCOVERED_STEP_PX) {
      let top = -1; // as `hitTest`: highest z, then latest
      layout.cells.forEach((cell, i) => {
        if (!cellContains(cell, { x, y })) return;
        inside[i]!++;
        if (top === -1 || cell.z >= layout.cells[top]!.z) top = i;
      });
      if (top >= 0) shown[top]!++;
    }
  }
  const shares = inside.map((n, i) => (n ? shown[i]! / n : 1));
  uncoveredCache.set(layout, shares);
  return shares;
}

/**
 * What ranking needs to know about a styled layout: its cells, and the share of the canvas that shows plain
 * fill rather than a photo: the background outside the cells, and Polaroid cards around their photos. A
 * blurred photo background isn't plain, so on those layouts only the cards count (a lone landscape photo is
 * still framed on blur rather than cropped hard to fill the canvas).
 */
export function rankOption(layout: Layout, style: Style): { layout: Layout; cells: CellTarget[]; background: number } {
  const visible = uncovered(layout);
  const shapes = cellShapes(layout, style, STORY_CANVAS);
  const canvas = STORY_CANVAS.width * STORY_CANVAS.height;
  const cellArea = shapes.reduce((s, { outline }, i) => s + outlineArea(outline) * visible[i]!, 0);
  const photoArea = shapes.reduce((s, { outline, photo }, i) => s + outlineArea(photo ?? outline) * visible[i]!, 0);
  const outside = layout.blurBackground ? 0 : Math.max(0, canvas - cellArea);
  return {
    layout,
    cells: shapes.map(({ frame, outline, photo }, i) => ({
      frame,
      insets: safeInsets(frame),
      fill: (outlineArea(photo ?? outline) / (frame.width * frame.height)) * visible[i]!,
    })),
    background: (outside + Math.max(0, cellArea - photoArea)) / canvas,
  };
}

/**
 * Ranked layouts with the one the editor opens on first: the best that isn't negative-space, since leaving an
 * empty band is the user's choice. The rest keep their order.
 */
export function openingFirst<T extends { layout: Pick<Layout, "family"> }>(ranked: T[]): T[] {
  const first = ranked.findIndex((s) => s.layout.family !== "negative-space");
  return first > 0 ? [ranked[first]!, ...ranked.slice(0, first), ...ranked.slice(first + 1)] : ranked;
}

/**
 * A grid layout with its lines between cells moved so each cell's shape suits the photo it gets with its best
 * assignment (see `fitGrid`). Other layouts come back as they are.
 */
export function fittedLayout(layout: Layout, style: Style, photos: CropSource[]): Layout {
  if (!gridOf(layout)) return layout;
  const { order } = assignPhotos(photos, rankOption(layout, style).cells);
  return fitGrid(layout, (l) => rankOption(l, style).cells.reduce((sum, cell, i) => sum + placement(photos[order[i]!]!, cell).cost, 0));
}

/**
 * A scene for every layout that fits this many photos, best fit first (layouts the photos fill before ones
 * that leave much of the canvas plain, and more often exported layouts first among near-equal fits), with
 * photos assigned to cells. See `openingFirst` for the first one. With `fit`, grid layouts first move their lines
 * to suit the photos (`fittedLayout`).
 */
export function rankedScenes(photos: CropSource[], style: Style = DEFAULT_STYLE, popularity: Record<string, number> = {}, fit = false): Scene[] {
  const options = layoutsFor(photos.length).map((layout) => rankOption(fit ? fittedLayout(layout, style, photos) : layout, style));
  return openingFirst(rankLayouts(options, photos, popularity).map(({ layout, assignment: { order, crops } }) => ({ layout, style, order, crops })));
}

/** A scene for one layout (a saved one, say), with the photos assigned to its cells the best way. */
export function assignedScene(layout: Layout, photos: CropSource[], style: Style = DEFAULT_STYLE): Scene {
  const { assignment } = rankLayouts([rankOption(layout, style)], photos)[0]!;
  return { layout, style, order: assignment.order, crops: assignment.crops };
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

/** Restyles a scene, keeping each crop (including manual ones) but fitting it to the resized cells. */
export function withStyle(scene: Scene, style: Style, photos: CropSource[]): Scene {
  const shapes = cellShapes(scene.layout, style, STORY_CANVAS);
  return { ...scene, style, crops: scene.crops.map((c, i) => clampCrop(photos[scene.order[i]!]!, shapes[i]!.frame, c)) };
}

export function withCrop(scene: Scene, cell: number, crop: Crop): Scene {
  const crops = [...scene.crops];
  crops[cell] = crop;
  return { ...scene, crops };
}

export type Outline = { kind: "polygon"; points: Point[] } | { kind: "circle"; cx: number; cy: number; r: number };

/** A styled cell on a canvas of a given size: the area its photo fills and the cell's outline. */
export interface CellShape {
  frame: Frame;
  outline: Outline;
  /** Where the photo is clipped when it's smaller than the cell: the window of a Polaroid card. */
  photo?: Outline;
}

/** Gaps are split evenly between neighbours; the outer margin is the same on every side. */
export function styleScale(layout: Layout, style: Style, size: Size) {
  const k = size.width / STORY_CANVAS.width;
  return {
    gap: layout.bleed ? 0 : style.gap * k,
    margin: layout.bleed ? 0 : style.margin * k,
    radius: layout.bleed ? 0 : style.radius * k,
    border: layout.bleed ? 0 : borderOf(layout, style) * k,
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
    if (cell.shape === "rect") {
      const points = insetPolygon(cellPolygon(cell, area), gap / 2).map(shift);
      const f = cellFrame(cell, area);
      const frame = { ...f, cx: f.cx + offset, cy: f.cy + offset, width: f.width - gap, height: f.height - gap };
      const outline = { kind: "polygon", points } as const;
      return layout.family === "polaroid" ? polaroid(frame, outline) : { frame, outline };
    }
    // Inset the shape upright, then turn it: the photo's frame is the upright box, which turns with the shape.
    const angle = cellAngle(cell);
    const upright = insetPolygon(cellPolygon({ ...cell, turn: 0 } as typeof cell, area), gap / 2).map(shift);
    const xs = upright.map((p) => p.x);
    const ys = upright.map((p) => p.y);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const center = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    return {
      frame: { cx: center.x, cy: center.y, width: x1 - x0, height: y1 - y0, rotate: angle },
      outline: { kind: "polygon", points: rotatePoints(upright, center, angle) },
    };
  });
}

/** A Polaroid card filling `card`: the photo sits in a window with a deeper margin below. */
function polaroid(card: Frame, outline: Outline): CellShape {
  const side = POLAROID.side * card.width;
  const bottom = POLAROID.bottom * card.width;
  // Shift the window up (in the card's own rotated frame) by half the difference between the margins.
  const up = (bottom - side) / 2;
  const a = (card.rotate * Math.PI) / 180;
  const frame = {
    cx: card.cx + up * Math.sin(a),
    cy: card.cy - up * Math.cos(a),
    width: card.width - 2 * side,
    height: card.height - side - bottom,
    rotate: card.rotate,
  };
  return { frame, outline, photo: { kind: "polygon", points: frameCorners(frame) } };
}
