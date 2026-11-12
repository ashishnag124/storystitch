import type { Edited } from "@storystitch/layout-engine";
import type { Layout, SavedLayout } from "@storystitch/shared";

/** What the layout editor opens with: a layout and which photo is in each cell (-1 for a cell without one yet). */
export interface Draft {
  layout: Layout;
  order: number[];
}

export interface Start extends Draft {
  /** Set when editing a layout already saved in the account: saving replaces it. */
  saved?: SavedLayout;
  /** Said under the editor when it opens. */
  notice?: string;
}

/**
 * What "Start from blank" opens on: a 9:16 canvas with no shapes yet, in a free layout (overlap allowed, like the
 * built-in "shapes" layouts that mix hearts, stars and rectangles) so shapes can be added, moved and resized. The
 * editor holds the zero cells; Done only goes ahead once there's one shape per photo (see blankProblem).
 */
export function blankDraft(): Draft {
  const layout: Layout = { id: "blank", name: "Blank", family: "shapes", allowOverlap: true, bleed: false, blurBackground: false, cells: [] };
  return { layout, order: [] };
}

/** Puts `photo` in `cell` of a blank canvas. A photo placed elsewhere leaves its old shape empty; the photo that was in `cell` is unplaced. */
export function placePhoto(order: number[], cell: number, photo: number): number[] {
  return order.map((o, i) => (i === cell ? photo : o === photo ? -1 : o));
}

/** Takes the photo out of `cell`, which stays as an empty shape. */
export function takePhotoOut(order: number[], cell: number): number[] {
  return order.map((o, i) => (i === cell ? -1 : o));
}

/** The photos (by index) that aren't in any shape. */
export function unplacedPhotos(order: number[], photoCount: number): number[] {
  return Array.from({ length: photoCount }, (_, p) => p).filter((p) => !order.includes(p));
}

/** What a blank canvas still needs before Done, said plainly; "" when every photo is in a shape and no shape is empty. */
export function blankProblem(order: number[], photoCount: number): string {
  if (!order.length) return "Add a shape or drag on the canvas to draw one.";
  const empty = order.filter((o) => o < 0).length;
  const unplaced = unplacedPhotos(order, photoCount).length;
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  if (unplaced > empty) {
    const more = unplaced - empty;
    return `Add ${more} more ${plural(more, "shape", "shapes")}, then drag ${plural(unplaced, "the photo", "photos")} into ${plural(unplaced, "it", "them")}.`;
  }
  if (unplaced > 0) return `Drag ${unplaced} more ${plural(unplaced, "photo", "photos")} into shapes.`;
  if (empty > 0) return `${empty} ${plural(empty, "shape is", "shapes are")} empty. Add a photo or remove ${plural(empty, "it", "them")}.`;
  return "";
}

/** The order for the collage once a blank canvas is complete: photo index per shape. Null while blankProblem has something to say. */
export function blankOrder(order: number[], photoCount: number): number[] | null {
  return blankProblem(order, photoCount) ? null : order;
}

/** Problems from layoutProblems, said plainly, with the cells they're about. */
export function explain(problems: string[]): { text: string; cells: number[] }[] {
  return problems.map((p) => {
    const nums = [...p.matchAll(/\d+/g)].map((m) => Number(m[0]));
    if (/overlap/.test(p)) return { text: `Photos ${nums.map((n) => n + 1).join(" and ")} overlap. Move them apart.`, cells: nums };
    const cell = Number(/cell (\d+)/.exec(p)?.[1] ?? -1);
    const n = cell + 1;
    if (/safe-zone/.test(p)) return { text: `Photo ${n} sits mostly under Instagram's buttons. Move it toward the middle.`, cells: [cell] };
    if (/leaves the canvas/.test(p)) return { text: `Photo ${n} goes past the edge.`, cells: [cell] };
    if (/curved top/.test(p)) return { text: `Photo ${n} is too short for an arch.`, cells: [cell] };
    return { text: `Photo ${n} has an odd shape. Undo the last change.`, cells: [cell] };
  });
}

/** Keeps each photo with its cell after an edit; a new cell gets a photo that isn't in the layout yet. */
export function withOrigin(draft: Draft, edited: Edited, photoCount: number): Draft {
  const order = edited.origin.map((o) => (o === null ? -1 : draft.order[o]!));
  for (let i = 0; i < order.length; i++) {
    if (order[i] !== -1) continue;
    const free = Array.from({ length: photoCount }, (_, p) => p).find((p) => !order.includes(p));
    order[i] = free ?? -1;
  }
  return { layout: edited.layout, order };
}
