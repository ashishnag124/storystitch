import { STAR_INNER, STORY_CANVAS, WAVE, type Cell } from "./layout";

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

/** How far a cell is turned, in degrees clockwise: a rect's `rotate` plus every turnable shape's `turn`. */
export function cellAngle(cell: Cell): number {
  switch (cell.shape) {
    case "rect":
      return cell.rotate + (cell.turn ?? 0);
    case "arch":
    case "pill":
    case "heart":
    case "star":
      return cell.turn ?? 0;
    default:
      return 0;
  }
}

/** `points` turned `deg` degrees clockwise around `c`. */
export function rotatePoints(points: Point[], c: Point, deg: number): Point[] {
  return deg ? points.map((p) => rotateAround(p, c, deg)) : points;
}

/** Corners of a frame (a rotated rectangle). */
export function frameCorners(f: Frame): Point[] {
  const c = { x: f.cx, y: f.cy };
  const [x0, y0, x1, y1] = [f.cx - f.width / 2, f.cy - f.height / 2, f.cx + f.width / 2, f.cy + f.height / 2];
  const corners = [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
  return f.rotate ? corners.map((p) => rotateAround(p, c, f.rotate)) : corners;
}

/** Points per curve when arches, capsules, hearts and waves are drawn as polygons. */
const CURVE_STEPS = 24;

/** Points along a circular arc from angle `from` to `to` (radians; y points down, so positive turns clockwise). */
function arc(c: Point, r: number, from: number, to: number, steps = CURVE_STEPS): Point[] {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const a = from + ((to - from) * i) / steps;
    return { x: c.x + r * Math.cos(a), y: c.y + r * Math.sin(a) };
  });
}

/** Drops points that repeat the one before (where two arcs meet), so every edge has a length. */
function distinct(points: Point[]): Point[] {
  return points.filter((p, i) => {
    const prev = points[(i + points.length - 1) % points.length]!;
    return Math.hypot(p.x - prev.x, p.y - prev.y) > 1e-6;
  });
}

/**
 * A heart two units wide with its bounding box centered on the origin: a square standing on a corner with
 * a half circle on each upper side.
 */
const UNIT_HEART: Point[] = (() => {
  const h = 1;
  const r = h / Math.SQRT2;
  const raw = distinct([
    { x: 0, y: h },
    ...arc({ x: h / 2, y: -h / 2 }, r, Math.PI / 4, -(3 * Math.PI) / 4),
    ...arc({ x: -h / 2, y: -h / 2 }, r, -Math.PI / 4, -(5 * Math.PI) / 4),
  ]);
  const ys = raw.map((p) => p.y);
  const [halfW, midY] = [h / 2 + r, (Math.min(...ys) + Math.max(...ys)) / 2];
  return raw.map((p) => ({ x: p.x / halfW, y: (p.y - midY) / halfW }));
})();

/**
 * Outline of a non-circle cell in pixels of a canvas of `size`: corners (rects), vertices (polygons), or
 * points along the curves of arches, capsules, hearts, stars and waves.
 */
export function cellPolygon(cell: Exclude<Cell, { shape: "circle" }>, size: Size = STORY_CANVAS): Point[] {
  const upright = uprightPolygon(cell, size);
  const angle = cellAngle(cell);
  if (!angle) return upright;
  const b = pointsBox(upright);
  return rotatePoints(upright, { x: b.x + b.w / 2, y: b.y + b.h / 2 }, angle);
}

/** A cell's outline before any turn. */
function uprightPolygon(cell: Exclude<Cell, { shape: "circle" }>, size: Size): Point[] {
  const { width: W, height: H } = size;
  switch (cell.shape) {
    case "polygon":
      return cell.points.map(([x, y]) => ({ x: x * W, y: y * H }));
    case "rect":
      return frameCorners({ cx: (cell.x + cell.w / 2) * W, cy: (cell.y + cell.h / 2) * H, width: cell.w * W, height: cell.h * H, rotate: 0 });
    case "arch": {
      const [x0, y0, x1, y1] = [cell.x * W, cell.y * H, (cell.x + cell.w) * W, (cell.y + cell.h) * H];
      const r = (x1 - x0) / 2;
      return distinct([{ x: x0, y: y1 }, { x: x1, y: y1 }, ...arc({ x: x0 + r, y: y0 + r }, r, 0, -Math.PI)]);
    }
    case "pill": {
      const [x0, y0, x1, y1] = [cell.x * W, cell.y * H, (cell.x + cell.w) * W, (cell.y + cell.h) * H];
      const r = Math.min(x1 - x0, y1 - y0) / 2;
      const half = Math.PI / 2;
      return x1 - x0 >= y1 - y0
        ? distinct([...arc({ x: x1 - r, y: y0 + r }, r, -half, half), ...arc({ x: x0 + r, y: y0 + r }, r, half, 3 * half)])
        : distinct([...arc({ x: x0 + r, y: y1 - r }, r, 0, Math.PI), ...arc({ x: x0 + r, y: y0 + r }, r, Math.PI, 2 * Math.PI)]);
    }
    case "heart": {
      const k = cell.r * W;
      return UNIT_HEART.map((p) => ({ x: cell.cx * W + p.x * k, y: cell.cy * H + p.y * k }));
    }
    case "star": {
      const R = cell.r * W;
      const raw = Array.from({ length: 10 }, (_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? R * STAR_INNER : R;
        return { x: r * Math.cos(a), y: r * Math.sin(a) };
      });
      const ys = raw.map((p) => p.y);
      const midY = (Math.min(...ys) + Math.max(...ys)) / 2;
      return raw.map((p) => ({ x: cell.cx * W + p.x, y: cell.cy * H + p.y - midY }));
    }
    case "wave": {
      const [x0, x1] = [cell.x * W, (cell.x + cell.w) * W];
      const curve = (edge: number, wavy: boolean, from: number, to: number) =>
        wavy
          ? Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
              const x = from + ((to - from) * i) / CURVE_STEPS;
              return { x, y: edge * H + WAVE.amplitude * H * Math.sin((2 * Math.PI * WAVE.cycles * x) / W) };
            })
          : [
              { x: from, y: edge * H },
              { x: to, y: edge * H },
            ];
      return [...curve(cell.y, cell.waves.includes("top"), x0, x1), ...curve(cell.y + cell.h, cell.waves.includes("bottom"), x1, x0)];
    }
  }
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
      rotate: cellAngle(cell),
    };
  }
  // Turned or not, the photo fills the shape's own bounding box, which turns with it.
  const b = cell.shape === "circle" ? cellBounds(cell, size) : pointsBox(uprightPolygon(cell, size));
  return { cx: b.x + b.w / 2, cy: b.y + b.h / 2, width: b.w, height: b.h, rotate: cellAngle(cell) };
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

/** Twice the signed area of a polygon (shoelace); the sign gives its winding. */
function signedArea2(points: Point[]): number {
  return points.reduce((s, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return s + a.x * b.y - b.x * a.y;
  }, 0);
}

/** Moves every edge of a polygon (convex or not, without holes) inward by `d` pixels. */
export function insetPolygon(points: Point[], d: number): Point[] {
  if (d === 0) return points;
  const n = points.length;
  // The interior is to the left of each edge for one winding and to the right for the other.
  const side = Math.sign(signedArea2(points));
  // Each edge shifted inward, as a point and a direction.
  const lines = points.map((a, i) => {
    const b = points[(i + 1) % n]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const nx = (-(b.y - a.y) / len) * side;
    const ny = ((b.x - a.x) / len) * side;
    return { p: { x: a.x + nx * d, y: a.y + ny * d }, dir: { x: b.x - a.x, y: b.y - a.y } };
  });
  // New vertex i is where shifted edges i-1 and i meet (or the shifted vertex, where they run straight on).
  return lines.map((l2, i) => {
    const l1 = lines[(i + n - 1) % n]!;
    const cross = l1.dir.x * l2.dir.y - l1.dir.y * l2.dir.x;
    if (Math.abs(cross) < 1e-9 * Math.hypot(l1.dir.x, l1.dir.y) * Math.hypot(l2.dir.x, l2.dir.y)) return l2.p;
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
