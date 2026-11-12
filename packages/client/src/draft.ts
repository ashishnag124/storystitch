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

/** A blank 9:16 frame for the layout editor: one grid cell filling the canvas (the style's margin sits inside it). */
export function blankDraft(): Draft {
  const layout: Layout = {
    id: "blank",
    name: "Blank",
    family: "grid",
    allowOverlap: false,
    bleed: false,
    blurBackground: false,
    cells: [{ shape: "rect", x: 0, y: 0, w: 1, h: 1, rotate: 0, z: 0 }],
  };
  return { layout, order: [0] };
}

/**
 * A blank 9:16 frame for shapes: one centered rectangle in a free layout (overlap allowed, like the built-in
 * "shapes" layouts that mix hearts, stars and rectangles), so cells move, resize and can be added.
 */
export function blankShapesDraft(): Draft {
  const layout: Layout = {
    id: "blank",
    name: "Blank",
    family: "shapes",
    allowOverlap: true,
    bleed: false,
    blurBackground: false,
    cells: [{ shape: "rect", x: 0.25, y: 0.36, w: 0.5, h: 0.28, rotate: 0, z: 0 }],
  };
  return { layout, order: [0] };
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
