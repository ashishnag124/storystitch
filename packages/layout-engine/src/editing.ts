// Editing a layout's cells, for the layout editor. Three ways, picked by what the layout is made of:
// - grid: rectangles (and arches, capsules, waves) that split their area into rows and columns. Lines between
//   cells move, cells split and merge.
// - corners: polygons that share corners (slanted bands, pinwheel, hexagons). Corners and whole lines move, and
//   every cell that shares them follows.
// - free: everything else (circles, hearts, stars, tilted or overlapping prints). Cells move, resize and rotate.
// Positions are normalized to the canvas (0–1), as in layouts.json, unless a name says px (export pixels).
import {
  STORY_CANVAS,
  cellBounds,
  cellContains,
  cellPolygon,
  type Box,
  type Cell,
  type Layout,
  type Point,
} from "@storystitch/shared";

const { width: W, height: H } = STORY_CANVAS;

/** Smallest a cell can get while editing, as a fraction of the canvas width (and of its height, for heights). */
export const MIN_CELL = 0.1;
/** Positions closer than this (normalized) count as the same line or edge. */
const EPS = 0.002;
/** Corners closer than this (px) are one shared corner. */
const EPS_PX = 3;
/** Sampling step (px) when checking whether two cells overlap. */
const OVERLAP_STEP_PX = 12;

export type EditMode = "grid" | "corners" | "free";

/** How a layout is edited: see the top of this file. */
export function editModeOf(layout: Layout): EditMode {
  if (gridOf(layout)) return "grid";
  if (cornersOf(layout)) return "corners";
  return "free";
}

/**
 * An edit's result: the new layout and, for each of its cells, the index of the cell it came from in the old one
 * (null for a new cell). The editor uses it to keep each photo with its cell.
 */
export interface Edited {
  layout: Layout;
  origin: (number | null)[];
}

const same = (layout: Layout): (number | null)[] => layout.cells.map((_, i) => i);

/** `value` moved to the nearest target within `threshold`, if any. */
export function snapTo(value: number, targets: number[], threshold: number): number {
  let best = value;
  let distance = threshold;
  for (const t of targets) {
    if (Math.abs(t - value) <= distance) {
      best = t;
      distance = Math.abs(t - value);
    }
  }
  return best;
}

// ---------------------------------------------------------------------------------------------------------------
// Checks shared by every mode

function bboxOverlap(a: Box, b: Box): Box | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const w = Math.min(a.x + a.w, b.x + b.w) - x;
  const h = Math.min(a.y + a.h, b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Whether cells `a` and `b` share any area (sampled). */
function overlaps(a: Cell, b: Cell): boolean {
  const box = bboxOverlap(cellBounds(a), cellBounds(b));
  if (!box) return false;
  for (let y = box.y + OVERLAP_STEP_PX / 2; y < box.y + box.h; y += OVERLAP_STEP_PX) {
    for (let x = box.x + OVERLAP_STEP_PX / 2; x < box.x + box.w; x += OVERLAP_STEP_PX) {
      if (cellContains(a, { x, y }) && cellContains(b, { x, y })) return true;
    }
  }
  return false;
}

/** Twice the signed area of a polygon. */
function area2(points: Point[]): number {
  return points.reduce((s, a, i) => {
    const b = points[(i + 1) % points.length]!;
    return s + a.x * b.y - b.x * a.y;
  }, 0);
}

/** Convex with every turn the same way as `sign` (straight runs allowed). */
function convexWith(points: Point[], sign: number): boolean {
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    const c = points[(i + 2) % points.length]!;
    const e1 = { x: b.x - a.x, y: b.y - a.y };
    const e2 = { x: c.x - b.x, y: c.y - b.y };
    const cross = e1.x * e2.y - e1.y * e2.x;
    if (Math.abs(cross) <= 1e-6 * Math.hypot(e1.x, e1.y) * Math.hypot(e2.x, e2.y)) continue;
    if (Math.sign(cross) !== sign) return false;
  }
  return true;
}

/**
 * Whether the cells at `changed` are fine where they now are: inside the canvas, at least MIN_CELL in size,
 * convex if they're polygons, and clear of other cells unless the layout allows overlap.
 */
export function cellsFit(layout: Layout, changed: number[]): boolean {
  for (const i of changed) {
    const cell = layout.cells[i]!;
    const b = cellBounds(cell);
    if (b.x < -0.5 || b.y < -0.5 || b.x + b.w > W + 0.5 || b.y + b.h > H + 0.5) return false;
    if (Math.min(b.w, b.h) < MIN_CELL * W - 0.5) return false;
    if (cell.shape === "polygon") {
      const pts = cellPolygon(cell);
      const a = area2(pts);
      if (Math.abs(a) / 2 < (MIN_CELL * W) ** 2 / 2 || !convexWith(pts, Math.sign(a))) return false;
    }
    if (cell.shape === "arch" && cell.h * H < (cell.w * W) / 2) return false;
    if (!layout.allowOverlap && layout.cells.some((other, j) => j !== i && overlaps(cell, other))) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------------------------------------------
// Grid

type GridShape = Extract<Cell, { shape: "rect" | "arch" | "pill" | "wave" }>;

export type GridNode =
  /** `id`: the cell's index in the layout the grid came from, or a new id (≥ NEW_ID) for a cell made by splitting. */
  | { kind: "cell"; id: number; cell: GridShape }
  /** `at`: where the line between the two parts sits (normalized x for "down", y for "across"). */
  | { kind: "split"; dir: "across" | "down"; at: number; first: GridNode; second: GridNode };

/** The cells' area and how it's cut up. */
export interface Grid {
  region: Box;
  root: GridNode;
}

const NEW_ID = 1000;

const isGridCell = (c: Cell): c is GridShape => (c.shape === "rect" && !c.rotate) || c.shape === "arch" || c.shape === "pill" || c.shape === "wave";

/** The layout as a grid of rows and columns, or null when it isn't one (overlap, rotation, other shapes). */
export function gridOf(layout: Layout): Grid | null {
  if (layout.allowOverlap || !layout.cells.every(isGridCell)) return null;
  const cells = layout.cells as GridShape[];
  const xs = cells.flatMap((c) => [c.x, c.x + c.w]);
  const ys = cells.flatMap((c) => [c.y, c.y + c.h]);
  const region = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };

  function build(ids: number[], r: Box): GridNode | null {
    if (ids.length === 1) return { kind: "cell", id: ids[0]!, cell: cells[ids[0]!]! };
    for (const dir of ["across", "down"] as const) {
      const start = (c: GridShape) => (dir === "across" ? c.y : c.x);
      const end = (c: GridShape) => (dir === "across" ? c.y + c.h : c.x + c.w);
      const [lo, hi] = dir === "across" ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
      const cuts = [...new Set(ids.map((i) => end(cells[i]!)))].filter((v) => v > lo + EPS && v < hi - EPS).sort((a, b) => a - b);
      for (const at of cuts) {
        const first = ids.filter((i) => end(cells[i]!) <= at + EPS);
        const second = ids.filter((i) => start(cells[i]!) >= at - EPS);
        if (!first.length || !second.length || first.length + second.length !== ids.length) continue;
        const [r1, r2] = splitBox(r, dir, at);
        const a = build(first, r1);
        const b = build(second, r2);
        if (a && b) return { kind: "split", dir, at, first: a, second: b };
      }
    }
    return null;
  }

  const root = build(
    cells.map((_, i) => i),
    region,
  );
  return root && { region, root };
}

function splitBox(r: Box, dir: "across" | "down", at: number): [Box, Box] {
  return dir === "across"
    ? [
        { ...r, h: at - r.y },
        { ...r, y: at, h: r.y + r.h - at },
      ]
    : [
        { ...r, w: at - r.x },
        { ...r, x: at, w: r.x + r.w - at },
      ];
}

/** Every cell of the grid with the area it fills. */
function leaves(node: GridNode, r: Box, out: { id: number; cell: GridShape; box: Box }[] = []) {
  if (node.kind === "cell") out.push({ id: node.id, cell: node.cell, box: r });
  else {
    const [r1, r2] = splitBox(r, node.dir, node.at);
    leaves(node.first, r1, out);
    leaves(node.second, r2, out);
  }
  return out;
}

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/**
 * Keeps a wavy edge only where the cell across it has a wavy edge too (the two follow the same curve). After a
 * split or a removal, an edge that lost its partner turns straight, so it can't overlap a straight neighbour.
 */
function matchWaves(cells: GridShape[]): GridShape[] {
  const xOverlap = (a: GridShape, b: GridShape) => Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > EPS;
  return cells.map((c, i) => {
    if (c.shape !== "wave") return c;
    const waves = c.waves.filter((edge) =>
      cells.some(
        (o, j) =>
          j !== i &&
          o.shape === "wave" &&
          xOverlap(c, o) &&
          (edge === "bottom"
            ? Math.abs(o.y - (c.y + c.h)) < EPS && o.waves.includes("top")
            : Math.abs(o.y + o.h - c.y) < EPS && o.waves.includes("bottom")),
      ),
    );
    if (waves.length) return { ...c, waves };
    return { shape: "rect", x: c.x, y: c.y, w: c.w, h: c.h, z: c.z, rotate: 0 };
  });
}

/** The grid as a layout: cells from the original layout keep their order, new ones go last. */
export function gridLayout(base: Layout, grid: Grid): Edited {
  const all = leaves(grid.root, grid.region).sort((a, b) => a.id - b.id);
  const cells = matchWaves(all.map(({ cell, box }) => ({ ...cell, x: round4(box.x), y: round4(box.y), w: round4(box.w), h: round4(box.h) })));
  return { layout: { ...base, cells }, origin: all.map((l) => (l.id < NEW_ID ? l.id : null)) };
}

/** A line between cells: drag it to resize the cells on both sides. */
export interface Divider {
  /** Where the split is in the tree: "" is the root, then "1"/"2" for first/second child. */
  path: string;
  dir: "across" | "down";
  /** Its position (normalized y for "across", x for "down") and the stretch it spans along the other axis. */
  at: number;
  from: number;
  to: number;
  /** How far it can move before a cell next to it gets smaller than MIN_CELL. */
  min: number;
  max: number;
}

/** The far edge of `node`'s first cell along the split's axis can't come closer to `start` than this. */
function minFar(node: GridNode, dir: "across" | "down", start: number, min: number): number {
  if (node.kind === "cell") return start + min;
  if (node.dir === dir) return minFar(node.second, dir, node.at, min);
  return Math.max(minFar(node.first, dir, start, min), minFar(node.second, dir, start, min));
}
function maxNear(node: GridNode, dir: "across" | "down", end: number, min: number): number {
  if (node.kind === "cell") return end - min;
  if (node.dir === dir) return maxNear(node.first, dir, node.at, min);
  return Math.min(maxNear(node.first, dir, end, min), maxNear(node.second, dir, end, min));
}

/** Normalized MIN_CELL along an axis: heights are a fraction of the canvas height, so scale by its shape. */
const minAlong = (dir: "across" | "down") => (dir === "across" ? (MIN_CELL * W) / H : MIN_CELL);

export function gridDividers(grid: Grid): Divider[] {
  const out: Divider[] = [];
  function walk(node: GridNode, r: Box, path: string) {
    if (node.kind === "cell") return;
    const [r1, r2] = splitBox(r, node.dir, node.at);
    const min = minAlong(node.dir);
    const [lo, hi] = node.dir === "across" ? [r.y, r.y + r.h] : [r.x, r.x + r.w];
    out.push({
      path,
      dir: node.dir,
      at: node.at,
      from: node.dir === "across" ? r.x : r.y,
      to: node.dir === "across" ? r.x + r.w : r.y + r.h,
      min: minFar(node.first, node.dir, lo, min),
      max: maxNear(node.second, node.dir, hi, min),
    });
    walk(node.first, r1, `${path}1`);
    walk(node.second, r2, `${path}2`);
  }
  walk(grid.root, grid.region, "");
  return out;
}

function mapNode(node: GridNode, path: string, f: (n: GridNode) => GridNode): GridNode {
  if (!path) return f(node);
  if (node.kind === "cell") return node;
  return path[0] === "1"
    ? { ...node, first: mapNode(node.first, path.slice(1), f) }
    : { ...node, second: mapNode(node.second, path.slice(1), f) };
}

/** Moves a divider to `at`, kept within its range. Only the cells touching it change size. */
export function moveDivider(grid: Grid, path: string, at: number): Grid {
  const d = gridDividers(grid).find((x) => x.path === path);
  if (!d) return grid;
  const clamped = Math.min(Math.max(at, d.min), d.max);
  return { ...grid, root: mapNode(grid.root, path, (n) => (n.kind === "split" ? { ...n, at: clamped } : n)) };
}

/** The path to the cell with this id, or null. */
function pathOf(node: GridNode, id: number, path = ""): string | null {
  if (node.kind === "cell") return node.id === id ? path : null;
  return pathOf(node.first, id, `${path}1`) ?? pathOf(node.second, id, `${path}2`);
}

function nextId(node: GridNode): number {
  return node.kind === "cell" ? Math.max(node.id + 1, NEW_ID) : Math.max(nextId(node.first), nextId(node.second));
}

/**
 * Splits a cell in two: "across" puts a line across it (one above the other), "down" puts one down it (side by
 * side). Null when the halves would be smaller than MIN_CELL. The new half keeps the cell's shape.
 */
export function splitCell(base: Layout, cell: number, dir: "across" | "down"): Edited | null {
  const grid = gridOf(base);
  if (!grid) return null;
  const path = pathOf(grid.root, cell);
  const leaf = leaves(grid.root, grid.region).find((l) => l.id === cell);
  if (path === null || !leaf) return null;
  const size = dir === "across" ? leaf.box.h : leaf.box.w;
  if (size < 2 * minAlong(dir) - EPS) return null;
  const at = round4((dir === "across" ? leaf.box.y : leaf.box.x) + size / 2);
  const id = nextId(grid.root);
  const root = mapNode(grid.root, path, (n) =>
    n.kind === "cell" ? { kind: "split", dir, at, first: n, second: { kind: "cell", id, cell: n.cell } } : n,
  );
  return gridLayout(base, { ...grid, root });
}

/** Removes a cell; the cells beside it grow into its space. Null for the last cell. */
export function removeGridCell(base: Layout, cell: number): Edited | null {
  const grid = gridOf(base);
  if (!grid || grid.root.kind === "cell") return null;
  const path = pathOf(grid.root, cell);
  if (!path) return null;
  const parent = path.slice(0, -1);
  const root = mapNode(grid.root, parent, (n) => (n.kind === "split" ? (path.endsWith("1") ? n.second : n.first) : n));
  return gridLayout(base, { ...grid, root });
}

/** The shapes a grid cell can take. */
export const GRID_SHAPES = ["rect", "arch", "pill"] as const;

/** Gives a grid cell another shape (in the same space). Null when it wouldn't fit (an arch needs height). */
export function reshapeCell(base: Layout, cell: number, shape: (typeof GRID_SHAPES)[number]): Edited | null {
  const old = base.cells[cell];
  if (!old || !isGridCell(old)) return null;
  const { x, y, w, h, z } = old;
  const next: Cell = shape === "rect" ? { shape, x, y, w, h, z, rotate: 0 } : { shape, x, y, w, h, z };
  const layout = { ...base, cells: base.cells.map((c, i) => (i === cell ? next : c)) };
  return cellsFit(layout, [cell]) ? { layout, origin: same(base) } : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Corners

/** How a corner may move: freely, along a line (a canvas edge, or the straight edge of a cell it sits on), or not. */
export type CornerLock = { kind: "free" } | { kind: "fixed" } | { kind: "line"; dir: Point };

/** Polygon cells as shared corners (px): cells list the corners they're made of, in order. */
export interface Corners {
  points: Point[];
  cells: number[][];
  locks: CornerLock[];
  /** Each cell's winding when it was read, so a drag can't fold a cell inside out. */
  winding: number[];
}

/** The layout's cells as shared corners, or null unless every cell is a polygon and none overlap. */
export function cornersOf(layout: Layout): Corners | null {
  if (layout.allowOverlap || !layout.cells.every((c) => c.shape === "polygon")) return null;
  const points: Point[] = [];
  const indexOf = (p: Point) => {
    const i = points.findIndex((q) => Math.hypot(q.x - p.x, q.y - p.y) < EPS_PX);
    if (i >= 0) return i;
    points.push(p);
    return points.length - 1;
  };
  const cells = layout.cells.map((c) => {
    const ids = cellPolygon(c as Exclude<Cell, { shape: "circle" }>).map(indexOf);
    return ids.filter((id, k) => id !== ids[(k + ids.length - 1) % ids.length]);
  });

  // A corner of one cell that sits on another cell's edge (where a line ends on another line) joins that edge too,
  // so moving the corner keeps both cells meeting.
  let changed = true;
  while (changed) {
    changed = false;
    for (const ids of cells) {
      for (let k = 0; k < ids.length && !changed; k++) {
        const a = points[ids[k]!]!;
        const b = points[ids[(k + 1) % ids.length]!]!;
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        const on = points.findIndex((p, pi) => {
          if (ids.includes(pi)) return false;
          const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len ** 2;
          if (t <= 0.001 || t >= 0.999) return false;
          return Math.abs((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)) / len < EPS_PX;
        });
        if (on >= 0) {
          ids.splice(k + 1, 0, on);
          changed = true;
        }
      }
    }
  }

  const locks = points.map((p, pi): CornerLock => {
    const edges = [p.x < EPS_PX || p.x > W - EPS_PX ? { x: 0, y: 1 } : null, p.y < EPS_PX || p.y > H - EPS_PX ? { x: 1, y: 0 } : null].filter(
      (d) => d !== null,
    );
    if (edges.length === 2) return { kind: "fixed" };
    // Directions of the straight cell edges this corner sits in the middle of.
    const straight: Point[] = [];
    for (const ids of cells) {
      const k = ids.indexOf(pi);
      if (k < 0) continue;
      const prev = points[ids[(k + ids.length - 1) % ids.length]!]!;
      const next = points[ids[(k + 1) % ids.length]!]!;
      const dx = next.x - prev.x;
      const dy = next.y - prev.y;
      const cross = (p.x - prev.x) * dy - (p.y - prev.y) * dx;
      if (Math.abs(cross) / Math.hypot(dx, dy) < 0.5) straight.push({ x: dx / Math.hypot(dx, dy), y: dy / Math.hypot(dx, dy) });
    }
    const dirs = [...edges, ...straight];
    if (!dirs.length) return { kind: "free" };
    const d = dirs[0]!;
    return dirs.every((e) => Math.abs(e.x * d.y - e.y * d.x) < 0.01) ? { kind: "line", dir: d } : { kind: "fixed" };
  });

  const winding = cells.map((ids) => Math.sign(area2(ids.map((i) => points[i]!))));
  return { points, cells, locks, winding };
}

/** The corners as a layout (normalized polygons). */
export function cornersLayout(base: Layout, corners: Corners): Layout {
  return {
    ...base,
    cells: corners.cells.map((ids, i) => ({
      shape: "polygon" as const,
      points: ids.map((id) => [round4(corners.points[id]!.x / W), round4(corners.points[id]!.y / H)] as [number, number]),
      z: base.cells[i]!.z,
    })),
  };
}

function cornersFit(base: Layout, corners: Corners, moved: number[]): boolean {
  const changed = corners.cells.flatMap((ids, i) => (ids.some((id) => moved.includes(id)) ? [i] : []));
  if (changed.some((i) => Math.sign(area2(corners.cells[i]!.map((id) => corners.points[id]!))) !== corners.winding[i])) return false;
  return cellsFit(cornersLayout(base, corners), changed);
}

const clampPx = (p: Point): Point => ({ x: Math.min(Math.max(p.x, 0), W), y: Math.min(Math.max(p.y, 0), H) });

/**
 * Moves corner `i` toward `to` (px), within what its lock allows. Null when the cells it belongs to wouldn't stay
 * valid there (the caller keeps the last good position).
 */
export function moveCorner(base: Layout, corners: Corners, i: number, to: Point): Corners | null {
  const lock = corners.locks[i]!;
  const from = corners.points[i]!;
  if (lock.kind === "fixed") return null;
  let p = to;
  if (lock.kind === "line") {
    const t = (to.x - from.x) * lock.dir.x + (to.y - from.y) * lock.dir.y;
    p = { x: from.x + lock.dir.x * t, y: from.y + lock.dir.y * t };
  }
  p = clampPx(p);
  const next = { ...corners, points: corners.points.map((q, k) => (k === i ? p : q)) };
  return cornersFit(base, next, [i]) ? next : null;
}

/** A straight line of shared corners running from one canvas edge to another: drag it to shift it. */
export interface CornerLine {
  /** Corners along it, end to end. */
  members: number[];
}

/** Lines whose ends sit on canvas edges (not canvas corners), like the boundaries between slanted bands. */
export function cornerLines(corners: Corners): CornerLine[] {
  const { points, cells, locks } = corners;
  const neighbours = points.map(() => new Set<number>());
  for (const ids of cells) ids.forEach((a, k) => {
    const b = ids[(k + 1) % ids.length]!;
    neighbours[a]!.add(b);
    neighbours[b]!.add(a);
  });
  const onEdge = (i: number) => locks[i]!.kind === "line" && (points[i]!.x < EPS_PX || points[i]!.x > W - EPS_PX || points[i]!.y < EPS_PX || points[i]!.y > H - EPS_PX);
  const lines: CornerLine[] = [];
  for (let start = 0; start < points.length; start++) {
    if (!onEdge(start)) continue;
    for (const first of neighbours[start]!) {
      const members = [start, first];
      let ok = true;
      while (!onEdge(members.at(-1)!)) {
        const [prev, cur] = [points[members.at(-2)!]!, points[members.at(-1)!]!];
        const dir = { x: cur.x - prev.x, y: cur.y - prev.y };
        const next = [...neighbours[members.at(-1)!]!].find((n) => {
          const q = points[n]!;
          const d = { x: q.x - cur.x, y: q.y - cur.y };
          return n !== members.at(-2) && d.x * dir.x + d.y * dir.y > 0 && Math.abs(d.x * dir.y - d.y * dir.x) / Math.hypot(d.x, d.y) < 0.5;
        });
        if (next === undefined || members.includes(next)) {
          ok = false;
          break;
        }
        members.push(next);
      }
      // Skip the canvas border itself, and keep each line once.
      const end = members.at(-1)!;
      const a = points[start]!;
      const b = points[end]!;
      const alongBorder = (Math.abs(a.x - b.x) < EPS_PX && (a.x < EPS_PX || a.x > W - EPS_PX)) || (Math.abs(a.y - b.y) < EPS_PX && (a.y < EPS_PX || a.y > H - EPS_PX));
      if (ok && start < end && !alongBorder) lines.push({ members });
    }
  }
  return lines;
}

/**
 * Shifts a line by `delta` (px) across its direction: its ends slide along their canvas edges and the corners in
 * between keep their places along it. Null when a cell wouldn't stay valid.
 */
export function moveLine(base: Layout, corners: Corners, line: CornerLine, delta: Point): Corners | null {
  const ends = [line.members[0]!, line.members.at(-1)!];
  const [a, b] = ends.map((i) => corners.points[i]!) as [Point, Point];
  const len = Math.hypot(b.x - a.x, b.y - a.y);
  const normal = { x: -(b.y - a.y) / len, y: (b.x - a.x) / len };
  const d = delta.x * normal.x + delta.y * normal.y;
  const moved = ends.map((i) => {
    const lock = corners.locks[i]!;
    if (lock.kind !== "line") return null;
    const along = lock.dir.x * normal.x + lock.dir.y * normal.y;
    if (Math.abs(along) < 0.2) return null; // the line runs nearly along this edge; it can't slide this way
    const p = corners.points[i]!;
    return clampPx({ x: p.x + (lock.dir.x * d) / along, y: p.y + (lock.dir.y * d) / along });
  });
  if (!moved[0] || !moved[1]) return null;
  const [na, nb] = moved as [Point, Point];
  const points = [...corners.points];
  line.members.forEach((m, k) => {
    if (k === 0) points[m] = na;
    else if (k === line.members.length - 1) points[m] = nb;
    else {
      const p = corners.points[m]!;
      const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / len ** 2;
      points[m] = { x: na.x + (nb.x - na.x) * t, y: na.y + (nb.y - na.y) * t };
    }
  });
  const next = { ...corners, points };
  return cornersFit(base, next, line.members) ? next : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Free

/** A cell moved by (dx, dy) (normalized). */
function translated(cell: Cell, dx: number, dy: number): Cell {
  switch (cell.shape) {
    case "circle":
    case "heart":
    case "star":
      return { ...cell, cx: round4(cell.cx + dx), cy: round4(cell.cy + dy) };
    case "polygon":
      return { ...cell, points: cell.points.map(([x, y]) => [round4(x + dx), round4(y + dy)] as [number, number]) };
    default:
      return { ...cell, x: round4(cell.x + dx), y: round4(cell.y + dy) };
  }
}

/** A cell scaled by `k` about its center. */
function scaled(cell: Cell, k: number): Cell {
  switch (cell.shape) {
    case "circle":
    case "heart":
    case "star":
      return { ...cell, r: round4(cell.r * k) };
    case "polygon": {
      const n = cell.points.length;
      const cx = cell.points.reduce((s, p) => s + p[0], 0) / n;
      const cy = cell.points.reduce((s, p) => s + p[1], 0) / n;
      return { ...cell, points: cell.points.map(([x, y]) => [round4(cx + (x - cx) * k), round4(cy + (y - cy) * k)] as [number, number]) };
    }
    default: {
      const [cx, cy] = [cell.x + cell.w / 2, cell.y + cell.h / 2];
      const [w, h] = [cell.w * k, cell.h * k];
      return { ...cell, x: round4(cx - w / 2), y: round4(cy - h / 2), w: round4(w), h: round4(h) };
    }
  }
}

function replaced(base: Layout, i: number, cell: Cell): Layout {
  return { ...base, cells: base.cells.map((c, k) => (k === i ? cell : c)) };
}

/**
 * Moves cell `i` by (dx, dy) (normalized). When the full move doesn't fit, slides along whatever is in the way
 * (moves only across or only down); null when neither fits.
 */
export function moveCell(base: Layout, i: number, dx: number, dy: number): Layout | null {
  for (const [x, y] of [
    [dx, dy],
    [dx, 0],
    [0, dy],
  ] as const) {
    if (!x && !y) continue;
    const layout = replaced(base, i, translated(base.cells[i]!, x, y));
    if (cellsFit(layout, [i])) return layout;
  }
  return null;
}

/** Scales cell `i` by `k` about its center; null when it wouldn't fit. */
export function scaleCell(base: Layout, i: number, k: number): Layout | null {
  const layout = replaced(base, i, scaled(base.cells[i]!, k));
  return cellsFit(layout, [i]) ? layout : null;
}

/** Whether a cell can be turned: rectangles (prints, Polaroids) can. */
export const canRotate = (cell: Cell) => cell.shape === "rect";

/** Sets a rectangle's rotation (degrees, kept within the schema's ±45); null when it wouldn't fit. */
export function rotateCell(base: Layout, i: number, degrees: number): Layout | null {
  const cell = base.cells[i]!;
  if (cell.shape !== "rect") return null;
  const layout = replaced(base, i, { ...cell, rotate: Math.round(Math.min(Math.max(degrees, -45), 45) * 10) / 10 });
  return cellsFit(layout, [i]) ? layout : null;
}

/** Puts cell `i` on top of the others (for layouts whose cells overlap). */
export function bringToFront(base: Layout, i: number): Layout {
  const top = Math.max(...base.cells.map((c) => c.z));
  if (base.cells[i]!.z === top && base.cells.filter((c) => c.z === top).length === 1) return base;
  return replaced(base, i, { ...base.cells[i]!, z: top + 1 });
}

/** Adds a copy of cell `i` wherever it fits first (near it, then anywhere). Null when there's no room. */
export function duplicateCell(base: Layout, i: number): Edited | null {
  const cell = { ...base.cells[i]!, z: Math.max(...base.cells.map((c) => c.z)) + 1 };
  const steps = [0.08, 0.16, 0.24, 0.32, 0.4, 0.5, 0.6, 0.7];
  const tries = steps.flatMap((d) => [
    [d, 0],
    [0, d],
    [-d, 0],
    [0, -d],
    [d, d],
    [-d, d],
    [d, -d],
    [-d, -d],
  ]);
  for (const k of [1, 0.8, 0.6]) {
    for (const [dx, dy] of tries) {
      const layout = { ...base, cells: [...base.cells, translated(scaled(cell, k), dx!, dy!)] };
      if (cellsFit(layout, [base.cells.length])) return { layout, origin: [...same(base), null] };
    }
  }
  return null;
}

/** Removes cell `i`. Null for the last cell. */
export function removeCell(base: Layout, i: number): Edited | null {
  if (base.cells.length < 2) return null;
  const keep = base.cells.map((_, k) => k).filter((k) => k !== i);
  return { layout: { ...base, cells: keep.map((k) => base.cells[k]!) }, origin: keep };
}
