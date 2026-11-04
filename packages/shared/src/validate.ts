import { cellBounds, cellContains, cellPolygon, isConvex } from "./geometry";
import { MIN_CELL_SAFE_FRACTION, SAFE_ZONE, STORY_CANVAS, type Layout } from "./layout";

const { width: W, height: H } = STORY_CANVAS;
const EDGE_TOLERANCE_PX = 0.5;

function inSafeArea(x: number, y: number): boolean {
  return (
    x >= SAFE_ZONE.sides * W && x <= (1 - SAFE_ZONE.sides) * W && y >= SAFE_ZONE.top * H && y <= (1 - SAFE_ZONE.bottom) * H
  );
}

/**
 * Everything wrong with a layout, as readable messages; empty when it's valid.
 * Overlap and safe-zone checks sample the canvas every `step` pixels.
 */
export function layoutProblems(layout: Layout, step = 10): string[] {
  const problems: string[] = [];
  const name = (i: number) => `${layout.id} cell ${i}`;

  layout.cells.forEach((cell, i) => {
    const b = cellBounds(cell);
    const t = EDGE_TOLERANCE_PX;
    if (b.x < -t || b.y < -t || b.x + b.w > W + t || b.y + b.h > H + t) problems.push(`${name(i)} leaves the canvas`);
    if (cell.shape === "polygon" && !isConvex(cellPolygon(cell))) problems.push(`${name(i)} is not convex`);
    if (cell.shape === "arch" && cell.h * H < (cell.w * W) / 2) problems.push(`${name(i)} is shorter than its curved top`);
  });

  const total = layout.cells.map(() => 0);
  const safe = layout.cells.map(() => 0);
  let overlapReported = false;
  for (let y = step / 2; y < H; y += step) {
    for (let x = step / 2; x < W; x += step) {
      const p = { x, y };
      const hits = layout.cells.flatMap((cell, i) => (cellContains(cell, p) ? [i] : []));
      for (const i of hits) {
        total[i]!++;
        if (inSafeArea(x, y)) safe[i]!++;
      }
      if (hits.length > 1 && !layout.allowOverlap && !overlapReported) {
        problems.push(`${layout.id} cells ${hits.join(", ")} overlap but allowOverlap is not set`);
        overlapReported = true;
      }
    }
  }

  layout.cells.forEach((_, i) => {
    const fraction = total[i] ? safe[i]! / total[i]! : 0;
    if (fraction < MIN_CELL_SAFE_FRACTION) {
      problems.push(`${name(i)} has only ${Math.round(fraction * 100)}% of its area outside the safe-zone bands`);
    }
  });
  return problems;
}
