import type { Size } from "@storystitch/shared";
import { sourceRect, upscaleFactor, type Crop, type Rect } from "./crop";
import { smartCrop, type SafeInsets } from "./smartCrop";
import { importance, withPaddedFaces, type Detection } from "./subject";

/** What placing a photo needs to know about it: its original size and what's in it. */
export interface PhotoSubjects extends Size {
  detections: Detection[];
}

/** A cell as placement sees it: the frame its photo fills (export pixels) and how much is under the bands. */
export interface CellTarget {
  frame: Size;
  insets: SafeInsets;
  /** Share of the frame that shows: 1 for a rectangle, π/4 for a circle, less where other cells cover it. */
  fill: number;
}

/**
 * How much each part of a placement's cost counts. Every part is a share from 0 to 1:
 *
 * - `subjectLoss`: share of the subject's importance cropped out. Losing subjects (especially faces)
 *   is the worst outcome, so it weighs most.
 * - `underOverlay`: share of the subject's importance that's in the crop but under Instagram's
 *   overlays (the safe-zone bands). Still visible in the saved image, so it weighs less.
 * - `empty`: share of the cell left showing background because the photo had to zoom out.
 * - `upscale`: how far the photo is enlarged past its own resolution (0 at 1×, 1 at 2× or more).
 * - `cropped`: share of the photo cut away to fit the cell's proportions (aspect mismatch).
 * - `hidden`: share of the photo inside the crop but hidden by the cell's outline (a circle's or heart's edge,
 *   a slanted edge) or by an overlapping cell. It cuts into the picture rather than trimming its edges, so it
 *   weighs a little more: a plain frame beats a fancy shape that shows about as much.
 */
export const PLACEMENT_WEIGHTS = { subjectLoss: 4, underOverlay: 1, empty: 1.5, upscale: 1, cropped: 1, hidden: 1.5 } as const;

export interface Placement {
  crop: Crop;
  cost: number;
}

/** Which photo goes in each cell (`order[cell]`), their crops and the total cost. */
export interface Assignment {
  order: number[];
  crops: Crop[];
  cost: number;
}

const area = (r: Rect) => r.width * r.height;

function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/** The smart crop for a photo in a cell and what that placement costs (see PLACEMENT_WEIGHTS). */
export function placement(photo: PhotoSubjects, cell: CellTarget): Placement {
  const crop = smartCrop(photo, cell.frame, photo.detections, cell.insets);
  const shown = sourceRect(photo, cell.frame, crop);
  const image: Rect = { x: 0, y: 0, width: photo.width, height: photo.height };
  const { top, bottom, left, right } = cell.insets;
  const safe: Rect = {
    x: shown.x + shown.width * left,
    y: shown.y + shown.height * top,
    width: shown.width * Math.max(0, 1 - left - right),
    height: shown.height * Math.max(0, 1 - top - bottom),
  };

  const detections = withPaddedFaces(photo.detections);
  const total = detections.reduce((s, d) => s + importance(d), 0);
  /** Importance-weighted share of the subjects inside `region`. */
  const share = (region: Rect) =>
    detections.reduce((s, d) => {
      const box = { x: d.box.x * photo.width, y: d.box.y * photo.height, width: d.box.w * photo.width, height: d.box.h * photo.height };
      return s + (area(box) ? (importance(d) * overlap(box, region)) / area(box) : 0);
    }, 0) / total;
  const [inCrop, inSafe] = total ? [share(shown), share(safe)] : [1, 1];
  const inView = overlap(shown, image);

  const w = PLACEMENT_WEIGHTS;
  const cost =
    w.subjectLoss * (1 - inCrop) +
    w.underOverlay * (inCrop - inSafe) +
    w.empty * (1 - inView / area(shown)) +
    w.upscale * Math.min(1, Math.max(0, upscaleFactor(photo, cell.frame, crop) - 1)) +
    w.cropped * (1 - inView / area(image)) +
    w.hidden * ((inView * (1 - cell.fill)) / area(image));
  return { crop, cost };
}

/**
 * The minimum-cost perfect matching of rows to columns in a square cost matrix (Hungarian algorithm,
 * O(n³)). Returns `col[row]`.
 */
export function hungarian(cost: number[][]): number[] {
  const n = cost.length;
  // 1-indexed potentials and matching, with row/column 0 as the sentinel.
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(n + 1).fill(0);
  const rowOf = new Array<number>(n + 1).fill(0); // rowOf[col]
  const way = new Array<number>(n + 1).fill(0);
  for (let row = 1; row <= n; row++) {
    rowOf[0] = row;
    let col0 = 0;
    const minv = new Array<number>(n + 1).fill(Infinity);
    const used = new Array<boolean>(n + 1).fill(false);
    do {
      used[col0] = true;
      const r = rowOf[col0]!;
      let delta = Infinity;
      let col1 = 0;
      for (let col = 1; col <= n; col++) {
        if (used[col]) continue;
        const reduced = cost[r - 1]![col - 1]! - u[r]! - v[col]!;
        if (reduced < minv[col]!) {
          minv[col] = reduced;
          way[col] = col0;
        }
        if (minv[col]! < delta) {
          delta = minv[col]!;
          col1 = col;
        }
      }
      for (let col = 0; col <= n; col++) {
        if (used[col]) {
          u[rowOf[col]!]! += delta;
          v[col]! -= delta;
        } else {
          minv[col]! -= delta;
        }
      }
      col0 = col1;
    } while (rowOf[col0] !== 0);
    do {
      const col1 = way[col0]!;
      rowOf[col0] = rowOf[col1]!;
      col0 = col1;
    } while (col0 !== 0);
  }
  const colOf = new Array<number>(n).fill(0);
  for (let col = 1; col <= n; col++) colOf[rowOf[col]! - 1] = col - 1;
  return colOf;
}

/** The cheapest way to put one photo in each cell. Needs as many photos as cells. */
export function assignPhotos(photos: PhotoSubjects[], cells: CellTarget[]): Assignment {
  const placements = cells.map((cell) => photos.map((photo) => placement(photo, cell)));
  const order = hungarian(placements.map((row) => row.map((p) => p.cost)));
  const chosen = order.map((photo, cell) => placements[cell]![photo]!);
  return { order, crops: chosen.map((p) => p.crop), cost: chosen.reduce((s, p) => s + p.cost, 0) };
}

/** Costs closer than this count as a tie. */
const TIE = 1e-9;

/**
 * How far popularity can lift a layout, in placement cost per cell. Fit comes first: a layout is lifted
 * only past layouts that fit at most this much better, and only when it's exported much more often.
 */
export const POPULARITY_BONUS = 0.1;

/**
 * Exports the most popular option needs before popularity counts in full. With fewer, every bonus shrinks
 * in proportion, so a handful of early exports barely moves the order.
 */
export const POPULARITY_FULL_AT = 20;

/**
 * Every layout with its best assignment for these photos, best fit first. `popularity` (exports per layout
 * id) breaks near-ties: see POPULARITY_BONUS. Exact ties go to the lower id, so the order never depends on
 * how the options were listed.
 */
export function rankLayouts<T extends { id: string }>(
  options: { layout: T; cells: CellTarget[] }[],
  photos: PhotoSubjects[],
  popularity: Record<string, number> = {},
): { layout: T; assignment: Assignment }[] {
  const exports = (id: string) => popularity[id] ?? 0;
  const top = Math.max(POPULARITY_FULL_AT, ...options.map((o) => exports(o.layout.id)));
  const score = (o: { layout: T; cells: CellTarget[] }, cost: number) =>
    cost - POPULARITY_BONUS * o.cells.length * (exports(o.layout.id) / top);
  return options
    .map((o) => {
      const assignment = assignPhotos(photos, o.cells);
      return { layout: o.layout, assignment, score: score(o, assignment.cost) };
    })
    .sort((a, b) => {
      const d = a.score - b.score;
      if (Math.abs(d) > TIE) return d;
      return a.layout.id < b.layout.id ? -1 : a.layout.id > b.layout.id ? 1 : 0;
    })
    .map(({ layout, assignment }) => ({ layout, assignment }));
}
