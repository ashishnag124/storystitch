import { BACKGROUND_COST, placement } from "@storystitch/layout-engine";
import { newScene, rankOption, type CropSource, type Scene } from "./scene";

/** How much worse than the best-ranked layout (placement cost per photo) a layout may fit and still be shuffled to. */
export const SHUFFLE_TOLERANCE = 0.2;
/** Shuffle always offers at least this many of the best-ranked layouts (or all, when there are fewer). */
export const SHUFFLE_MIN_POOL = 6;
/** Shuffle doesn't repeat any of this many layouts it showed last, even when it starts a new cycle. */
export const SHUFFLE_MEMORY = 4;

/** What a layout costs with its photos in `order`, as ranking scores it (without popularity). */
function fitCost(scene: Scene, photos: CropSource[], order = scene.order): number {
  const { cells, background } = rankOption(scene.layout, scene.style);
  return cells.reduce((sum, cell, i) => sum + placement(photos[order[i]!]!, cell).cost, 0) + cells.length * BACKGROUND_COST * background;
}

/**
 * The layouts Shuffle may land on, in the strip's order: the user's own (`yours`), and built-in layouts that fit
 * within SHUFFLE_TOLERANCE of the best-ranked one, at least the first SHUFFLE_MIN_POOL. Never negative-space ones:
 * leaving an empty band is the user's choice (as AC-RANK-07).
 */
export function shufflePool(options: Scene[], photos: CropSource[], yours: Set<string> = new Set()): Scene[] {
  const usable = options.filter((o) => o.layout.family !== "negative-space");
  const builtIn = usable.filter((o) => !yours.has(o.layout.id));
  const best = builtIn[0] ? fitCost(builtIn[0], photos) : 0;
  const limit = best + SHUFFLE_TOLERANCE * photos.length;
  return usable.filter((o) => {
    const rank = builtIn.indexOf(o);
    return rank < 0 || rank < SHUFFLE_MIN_POOL || fitCost(o, photos) <= limit;
  });
}

/**
 * Another way to arrange the photos in the current layout: a swap of two cells or a rotation of every photo along
 * by some cells, where each moved photo's cell costs at most SHUFFLE_TOLERANCE more than it does now (so no face
 * gets cut). Null when there's none.
 */
function rearranged(scene: Scene, photos: CropSource[], random: () => number): number[] | null {
  const { cells } = rankOption(scene.layout, scene.style);
  const cost = (cell: number, photo: number) => placement(photos[photo]!, cells[cell]!).cost;
  const now = scene.order.map((photo, cell) => cost(cell, photo));
  const n = scene.order.length;
  const orders: number[][] = [];
  for (let k = 1; k < n; k++) orders.push(scene.order.map((_, i) => scene.order[(i + k) % n]!));
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const order = [...scene.order];
      [order[a], order[b]] = [order[b]!, order[a]!];
      orders.push(order);
    }
  }
  const fine = orders.filter((order) => order.every((photo, cell) => photo === scene.order[cell] || cost(cell, photo) <= now[cell]! + SHUFFLE_TOLERANCE));
  return fine.length ? fine[Math.floor(random() * fine.length)]! : null;
}

/**
 * The next collage for the Shuffle button. `options` are the strip's scenes (in its order, with the user's style),
 * `history` the layout ids Shuffle has shown in this cycle, oldest first (start with []). It picks at random
 * (`random` returns [0, 1), so tests can fix it) among `shufflePool`, never the layout showing, and not one shown
 * this cycle until the pool runs out, then starts a new cycle that still avoids the last SHUFFLE_MEMORY. When there's
 * no other layout to go to, it rearranges the photos instead. The new scene keeps the style and every other field of
 * `scene`, with fresh automatic crops. Null when nothing can change.
 */
export function shuffle(
  options: Scene[],
  scene: Scene,
  history: string[],
  photos: CropSource[],
  random: () => number,
  yours?: Set<string>,
): { scene: Scene; history: string[] } | null {
  const current = scene.layout.id;
  const cycle = history.at(-1) === current ? history : [...history, current];
  const others = shufflePool(options, photos, yours).filter((o) => o.layout.id !== current);
  if (!others.length) {
    const order = rearranged(scene, photos, random);
    return order && { scene: { ...scene, ...newScene(scene.layout, photos, scene.style, order) }, history: cycle };
  }
  let next = cycle;
  let candidates = others.filter((o) => !cycle.includes(o.layout.id));
  if (!candidates.length) {
    next = cycle.slice(-SHUFFLE_MEMORY);
    candidates = others.filter((o) => !next.includes(o.layout.id));
    if (!candidates.length) candidates = others;
  }
  const pick = candidates[Math.floor(random() * candidates.length)]!;
  return {
    scene: { ...scene, ...newScene(pick.layout, photos, scene.style, pick.order) },
    history: [...next, pick.layout.id],
  };
}
