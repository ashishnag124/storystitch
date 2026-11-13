import { sourceRect, type Detection } from "@storystitch/layout-engine";
import { STORY_CANVAS, layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, cellShapes, newScene, rankedScenes, type CropSource, type Scene } from "./scene";
import { SHUFFLE_MEMORY, SHUFFLE_MIN_POOL, shuffle, shufflePool } from "./shuffle";

const person: Detection = { kind: "person", score: 0.9, box: { x: 0.35, y: 0.25, w: 0.3, h: 0.4 } };
const photos: CropSource[] = [
  { width: 3024, height: 4032, detections: [person] },
  { width: 4032, height: 3024, detections: [person] },
  { width: 3024, height: 4032, detections: [] },
  { width: 4032, height: 3024, detections: [] },
];
const style = { ...DEFAULT_STYLE, gap: 20, margin: 30, radius: 4, background: { kind: "color", color: "#123456" } as const };
const options = rankedScenes(photos).map((o) => ({ ...o, style }));

/** A fixed random source: a simple LCG from a seed. */
function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32;
}

/** Taps Shuffle `taps` times from the first option; returns every scene shown, the first included. */
function run(taps: number, seed = 1, start: Scene = options[0]!, opts: Scene[] = options, those: CropSource[] = photos) {
  const random = seeded(seed);
  const shown = [start];
  let history: string[] = [];
  for (let i = 0; i < taps; i++) {
    const next = shuffle(opts, shown.at(-1)!, history, those, random)!;
    shown.push(next.scene);
    history = next.history;
  }
  return shown;
}

describe("AC-SHUFFLE-01 Shuffle picks a layout that fits well", () => {
  it("chooses among at least the top layouts, and never a negative-space one", () => {
    const pool = shufflePool(options, photos);
    expect(pool.length).toBeGreaterThanOrEqual(SHUFFLE_MIN_POOL);
    expect(pool.every((o) => o.layout.family !== "negative-space")).toBe(true);
    const top = options.filter((o) => o.layout.family !== "negative-space").slice(0, SHUFFLE_MIN_POOL);
    for (const o of top) expect(pool).toContain(o);
    for (const s of run(40)) expect(s.layout.family).not.toBe("negative-space");
  });

  it("can land on the user's own layouts", () => {
    const own = layouts.find((l) => l.cells.length === 4 && l.family === "negative-space")!;
    const mine = { ...newScene({ ...own, id: "saved-1", family: "grid" }, photos, style), style };
    const pool = shufflePool([mine, ...options], photos, new Set(["saved-1"]));
    expect(pool[0]).toBe(mine);
    expect(run(pool.length, 3, options[0], [mine, ...options]).map((s) => s.layout.id)).toContain("saved-1");
  });
});

describe("AC-SHUFFLE-02 Shuffle never repeats too soon", () => {
  it("never returns the layout showing, nor any of the last 4 shown", () => {
    const ids = run(60, 7).map((s) => s.layout.id);
    for (let i = 1; i < ids.length; i++) {
      const recent = ids.slice(Math.max(0, i - SHUFFLE_MEMORY), i);
      expect(recent, `tap ${i}`).not.toContain(ids[i]);
    }
  });

  it("shows every layout in the pool before repeating one", () => {
    const pool = shufflePool(options, photos).map((o) => o.layout.id);
    const ids = run(pool.length - 1, 11).map((s) => s.layout.id);
    expect(new Set(ids).size).toBe(pool.length);
  });

  it("goes through every layout for one photo, then never repeats the one showing", () => {
    const one = [photos[0]!];
    const single = rankedScenes(one);
    const ids = run(12, 1, single[0], single, one).map((s) => s.layout.id);
    expect(new Set(ids.slice(0, single.length))).toEqual(new Set(single.map((s) => s.layout.id)));
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it("alternates when only two layouts are left", () => {
    const one = [photos[0]!];
    const two = rankedScenes(one).slice(0, 2);
    const ids = run(5, 1, two[0], two, one).map((s) => s.layout.id);
    expect(ids).toEqual([0, 1, 0, 1, 0, 1].map((i) => two[i]!.layout.id));
  });
});

describe("AC-SHUFFLE-03 Shuffle is repeatable and keeps the rest of the collage", () => {
  it("gives the same results for the same seed and history", () => {
    expect(run(10, 42).map((s) => s.layout.id)).toEqual(run(10, 42).map((s) => s.layout.id));
    expect(run(10, 42).map((s) => s.layout.id)).not.toEqual(run(10, 43).map((s) => s.layout.id));
  });

  it("keeps the style and any other scene fields, with fresh crops for the new cells", () => {
    const scene = { ...options[0]!, caption: { text: "Hello" } };
    const next = shuffle(options, scene, [], photos, seeded(5))!.scene;
    expect(next.layout.id).not.toBe(scene.layout.id);
    expect(next.style).toBe(style);
    expect((next as typeof scene).caption).toBe(scene.caption);
    const option = options.find((o) => o.layout.id === next.layout.id)!;
    expect(next).toMatchObject(newScene(option.layout, photos, style, option.order));
  });

  it("rearranges the photos when only one layout fits, without cutting a face", () => {
    const face: Detection = { kind: "face", score: 0.9, box: { x: 0.05, y: 0.4, w: 0.1, h: 0.15 } };
    const wideFace = { width: 4032, height: 3024, detections: [face] };
    const these = [wideFace, ...photos.slice(1)];
    const only = rankedScenes(these, style).filter((o) => o.layout.family === "grid").slice(0, 1);
    const before = only[0]!;
    const result = shuffle(only, before, [], these, seeded(9))!;
    expect(result.scene.layout).toBe(before.layout);
    expect(result.scene.order).not.toEqual(before.order);
    expect([...result.scene.order].sort()).toEqual([0, 1, 2, 3]);
    // The face at the photo's edge stays in its crop, wherever the photo went.
    const cell = result.scene.order.indexOf(0);
    const { frame } = cellShapes(before.layout, style, STORY_CANVAS)[cell]!;
    const shown = sourceRect(wideFace, frame, result.scene.crops[cell]!);
    expect(shown.x).toBeLessThanOrEqual(face.box.x * wideFace.width);
    expect(shown.x + shown.width).toBeGreaterThanOrEqual((face.box.x + face.box.w) * wideFace.width);
  });

  it("does nothing when there's nothing to change", () => {
    const one = [photos[0]!];
    expect(shuffle(rankedScenes(one).slice(0, 1), rankedScenes(one)[0]!, [], one, seeded(1))).toBeNull();
  });
});
