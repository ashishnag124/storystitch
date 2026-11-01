import { STORY_CANVAS, type Cell } from "./layout";

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Axis-aligned box. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The rectangle a cell's photo fills, in pixels of a canvas of `size`: center, size and rotation (degrees).
 * Rects use their own (unrotated) size, polygons their bounding box, circles their bounding square.
 */
export interface Frame {
  cx: number;
  cy: number;
  width: number;
  height: number;
  rotate: number;
}

const toRad = (deg: number) => (deg * Math.PI) / 180;

function rotateAround(p: Point, c: Point, deg: number): Point {
  const a = toRad(deg);
  const dx = p.x - c.x;
  const dy = p.y - c.y;
  return { x: c.x + dx * Math.cos(a) - dy * Math.sin(a), y: c.y + dx * Math.sin(a) + dy * Math.cos(a) };
}

/** Corners (rects) or vertices (polygons) in pixels of a canvas of `size`. Not defined for circles. */
export function cellPolygon(cell: Exclude<Cell, { shape: "circle" }>, size: Size = STORY_CANVAS): Point[] {
  const { width: W, height: H } = size;
  if (cell.shape === "polygon") return cell.points.map(([x, y]) => ({ x: x * W, y: y * H }));
  const c = { x: (cell.x + cell.w / 2) * W, y: (cell.y + cell.h / 2) * H };
  const corners = [
    { x: cell.x * W, y: cell.y * H },
    { x: (cell.x + cell.w) * W, y: cell.y * H },
    { x: (cell.x + cell.w) * W, y: (cell.y + cell.h) * H },
    { x: cell.x * W, y: (cell.y + cell.h) * H },
  ];
  return cell.rotate ? corners.map((p) => rotateAround(p, c, cell.rotate)) : corners;
}

function pointsBox(points: Point[]): Box {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** Axis-aligned bounds of a cell in pixels of a canvas of `size`, including rotation. */
export function cellBounds(cell: Cell, size: Size = STORY_CANVAS): Box {
  if (cell.shape !== "circle") return pointsBox(cellPolygon(cell, size));
  const r = cell.r * size.width;
  return { x: cell.cx * size.width - r, y: cell.cy * size.height - r, w: 2 * r, h: 2 * r };
}

export function cellFrame(cell: Cell, size: Size = STORY_CANVAS): Frame {
  if (cell.shape === "rect") {
    return {
      cx: (cell.x + cell.w / 2) * size.width,
      cy: (cell.y + cell.h / 2) * size.height,
      width: cell.w * size.width,
      height: cell.h * size.height,
      rotate: cell.rotate,
    };
  }
  const b = cellBounds(cell, size);
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, width: b.w, height: b.h, rotate: 0 };
}

function polygonContains(points: Point[], p: Point): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i]!;
    const b = points[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Whether pixel point `p` on a canvas of `size` lies inside the cell. */
export function cellContains(cell: Cell, p: Point, size: Size = STORY_CANVAS): boolean {
  if (cell.shape !== "circle") return polygonContains(cellPolygon(cell, size), p);
  const r = cell.r * size.width;
  return Math.hypot(p.x - cell.cx * size.width, p.y - cell.cy * size.height) <= r;
}

/** Topmost cell index (highest z, then latest) containing pixel point `p`, or -1. */
export function hitTest(cells: Cell[], p: Point, size: Size = STORY_CANVAS): number {
  let hit = -1;
  cells.forEach((cell, i) => {
    if (cellContains(cell, p, size) && (hit === -1 || cell.z >= cells[hit]!.z)) hit = i;
  });
  return hit;
}

/** Cell indexes in drawing order: lowest z first, ties in declaration order. */
export function drawOrder(cells: Cell[]): number[] {
  return cells.map((_, i) => i).sort((a, b) => cells[a]!.z - cells[b]!.z || a - b);
}

/** Moves every edge of a convex polygon inward by `d` pixels. */
export function insetPolygon(points: Point[], d: number): Point[] {
  if (d === 0) return points;
  const n = points.length;
  const centroid = { x: points.reduce((s, p) => s + p.x, 0) / n, y: points.reduce((s, p) => s + p.y, 0) / n };
  // Each edge shifted inward, as a point and a direction.
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let nx = -(b.y - a.y) / len;
    let ny = (b.x - a.x) / len;
    if (nx * (centroid.x - a.x) + ny * (centroid.y - a.y) < 0) {
      nx = -nx;
      ny = -ny;
    }
    return { p: { x: a.x + nx * d, y: a.y + ny * d }, dir: { x: b.x - a.x, y: b.y - a.y } };
  });
  // New vertex i is where shifted edges i-1 and i meet.
  return lines.map((l2, i) => {
    const l1 = lines[(i + n - 1) % n]!;
    const cross = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    const t = ((l2.p.x - l1.p.x) * l2.dir.y - (l2.p.y - l1.p.y) * l2.dir.x) / cross;
    return { x: l1.p.x + l1.dir.x * t, y: l1.p.y + l1.dir.y * t };
  });
}

/** Whether a polygon is convex (all turns in the same direction). */
export function isConvex(points: Point[]): boolean {
  let sign = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const c = points[(i + 2) % points.length]!;
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross === 0) continue;
    if (sign === 0) sign = Math.sign(cross);
    else if (Math.sign(cross) !== sign) return false;
  }
  return true;
}
