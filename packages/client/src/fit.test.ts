// How well the top-ranked layout fits what's in the photos, on a fixed set of sample photo sets.
// `FIT_REPORT=1 pnpm --filter @storystitch/client exec vitest run src/fit.test.ts` prints the numbers per set.
import { importance, sourceRect, subjectBox, withPaddedFaces, type Detection, type Rect } from "@storystitch/layout-engine";
import { STORY_CANVAS, layoutProblems, layoutsFor } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import { DEFAULT_STYLE, assignedScene, cellShapes, fittedLayout, rankOption, rankedScenes, type CropSource, type Scene } from "./scene";

const face = (x: number, y: number, w = 0.08, h = 0.1): Detection => ({ kind: "face", score: 0.95, box: { x, y, w, h } });
const person = (x: number, y: number, w: number, h: number): Detection => ({ kind: "person", score: 0.9, box: { x, y, w, h } });

/** Sample photos: what each looks like to cropping. */
const PHOTOS = {
  /** One person, head to knees, in a portrait photo. */
  portraitPerson: { width: 3024, height: 4032, detections: [person(0.3, 0.15, 0.4, 0.75), face(0.44, 0.2)] },
  /** A plate of food filling the middle of a portrait photo. */
  portraitObject: { width: 3024, height: 4032, detections: [{ kind: "object", score: 0.8, box: { x: 0.15, y: 0.3, w: 0.7, h: 0.4 } }] },
  /** One standing person in a landscape photo: a tall subject in a wide frame. */
  landscapePerson: { width: 4032, height: 3024, detections: [person(0.4, 0.12, 0.22, 0.82), face(0.47, 0.16)] },
  /** Three people side by side: a wide subject. */
  landscapeGroup: { width: 4032, height: 3024, detections: [face(0.18, 0.3), face(0.46, 0.28), face(0.74, 0.31)] },
  /** Scenery: the saliency guess, a wide band. */
  landscapeScene: { width: 4032, height: 3024, detections: [{ kind: "salient", score: 0.6, box: { x: 0.1, y: 0.35, w: 0.8, h: 0.35 } }] },
  /** A panorama of a group. */
  panorama: { width: 6000, height: 2000, detections: [face(0.2, 0.35, 0.04, 0.12), face(0.45, 0.33, 0.04, 0.12), face(0.7, 0.36, 0.04, 0.12)] },
  // Tightly framed: the subject fills most of the photo, so far fewer cell shapes keep all of it.
  /** A close portrait: one person filling the frame. */
  closePortrait: { width: 3024, height: 4032, detections: [person(0.08, 0.05, 0.84, 0.93), face(0.4, 0.12, 0.2, 0.15)] },
  /** One person, head to toe, in a landscape photo. */
  tallPerson: { width: 4032, height: 3024, detections: [person(0.38, 0.03, 0.24, 0.95), face(0.45, 0.06, 0.1, 0.1)] },
  /** Three people filling a landscape photo. */
  closeGroup: {
    width: 4032,
    height: 3024,
    detections: [
      person(0.05, 0.15, 0.3, 0.8),
      person(0.36, 0.12, 0.3, 0.85),
      person(0.66, 0.15, 0.3, 0.8),
      face(0.15, 0.2, 0.08, 0.12),
      face(0.46, 0.18, 0.08, 0.12),
      face(0.76, 0.2, 0.08, 0.12),
    ],
  },
  /** A pet filling a landscape photo. */
  pet: { width: 4032, height: 3024, detections: [{ kind: "object", score: 0.9, box: { x: 0.1, y: 0.1, w: 0.8, h: 0.85 } }] },
} satisfies Record<string, CropSource>;

const cycle = (n: number, names: (keyof typeof PHOTOS)[]) => Array.from({ length: n }, (_, i) => PHOTOS[names[i % names.length]!]);

/**
 * 2–8 photos, each all portrait, all landscape and mixed (as in PR 106's 21 sets), once loosely and once tightly
 * framed, plus portraits with one panorama.
 */
export const SAMPLE_SETS: { name: string; mixed: boolean; tight: boolean; photos: CropSource[] }[] = [
  ...[2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
    { name: `${n} portrait`, mixed: false, tight: false, photos: cycle(n, ["portraitPerson", "portraitObject"]) },
    { name: `${n} landscape`, mixed: false, tight: false, photos: cycle(n, ["landscapePerson", "landscapeGroup", "landscapeScene"]) },
    {
      name: `${n} mixed`,
      mixed: true,
      tight: false,
      photos: cycle(n, ["portraitPerson", "landscapeGroup", "landscapePerson", "portraitObject", "landscapeScene"]),
    },
  ]),
  ...[3, 4, 5].map((n) => ({
    name: `${n - 1} portrait + panorama`,
    mixed: true,
    tight: false,
    photos: [...cycle(n - 1, ["portraitPerson"]), PHOTOS.panorama],
  })),
  ...[2, 3, 4, 5, 6, 7, 8].flatMap((n) => [
    { name: `${n} tight portrait`, mixed: false, tight: true, photos: cycle(n, ["closePortrait"]) },
    { name: `${n} tight landscape`, mixed: false, tight: true, photos: cycle(n, ["tallPerson", "closeGroup", "pet"]) },
    { name: `${n} tight mixed`, mixed: true, tight: true, photos: cycle(n, ["closePortrait", "closeGroup", "tallPerson", "pet"]) },
  ]),
];

const area = (r: Rect) => r.width * r.height;
function overlap(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * How far a cell's shape (width / height) is from the shapes that show the photo's whole subject at zoom 1:
 * from as narrow as the subject is wide (full photo height) to as wide as the photo over the subject's height.
 * 0 inside that range, else the log of the ratio to the nearer end.
 */
export function shapeMismatch(photo: CropSource, aspect: number): number {
  const s = subjectBox(photo.detections);
  if (!s) return 0;
  const lo = (s.w * photo.width) / photo.height;
  const hi = photo.width / (s.h * photo.height);
  return aspect < lo ? Math.log(lo / aspect) : aspect > hi ? Math.log(aspect / hi) : 0;
}

/** Importance-weighted share of the photo's subjects outside what the cell shows. */
function subjectLost(photo: CropSource, shown: Rect): number {
  const ds = withPaddedFaces(photo.detections);
  const total = ds.reduce((s, d) => s + importance(d), 0);
  if (!total) return 0;
  const kept = ds.reduce((s, d) => {
    const box = { x: d.box.x * photo.width, y: d.box.y * photo.height, width: d.box.w * photo.width, height: d.box.h * photo.height };
    return s + (importance(d) * overlap(box, shown)) / area(box);
  }, 0);
  return 1 - kept / total;
}

export interface Fit {
  layout: string;
  /** Cells whose shape shows the whole subject at zoom 1 (mismatch 0), of all cells. */
  fitting: number;
  cells: number;
  /** Mean shapeMismatch over cells. */
  mismatch: number;
  /** Mean subject share lost per cell. */
  lost: number;
  /** Cells zoomed out below 1. */
  zoomedOut: number;
  /** Share of the canvas that's plain fill. */
  background: number;
  ms: number;
}

export function measure(photos: CropSource[], fit = false): Fit {
  const t0 = performance.now();
  const scene = rankedScenes(photos, DEFAULT_STYLE, {}, fit)[0]!;
  return measureScene(scene, photos, performance.now() - t0);
}

export function measureScene(scene: Scene, photos: CropSource[], ms = 0): Fit {
  const shapes = cellShapes(scene.layout, scene.style, STORY_CANVAS);
  const perCell = shapes.map(({ frame }, i) => {
    const photo = photos[scene.order[i]!]!;
    const crop = scene.crops[i]!;
    return {
      mismatch: shapeMismatch(photo, frame.width / frame.height),
      lost: subjectLost(photo, sourceRect(photo, frame, crop)),
      zoomedOut: crop.zoom < 1 - 1e-9,
    };
  });
  const mean = (f: (c: (typeof perCell)[number]) => number) => perCell.reduce((s, c) => s + f(c), 0) / perCell.length;
  return {
    layout: scene.layout.id,
    fitting: perCell.filter((c) => c.mismatch === 0).length,
    cells: perCell.length,
    mismatch: mean((c) => c.mismatch),
    lost: mean((c) => c.lost),
    zoomedOut: perCell.filter((c) => c.zoomedOut).length,
    background: rankOption(scene.layout, DEFAULT_STYLE).background,
    ms,
  };
}

/** Before and after fitting grid layouts to the photos, per set and summed over groups of sets. */
function report() {
  rankedScenes(SAMPLE_SETS[0]!.photos, DEFAULT_STYLE, {}, true); // warm up before timing
  const rows = SAMPLE_SETS.map((s) => ({ ...s, before: measure(s.photos), after: measure(s.photos, true) }));
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const both = (a: string, b: string) => (a === b ? a : `${a} → ${b}`);
  const lines = [
    "| Set | Top layout | Cells that fit | Mismatch | Subject lost | Zoomed out | Background | ms |",
    "|---|---|---|---|---|---|---|---|",
    ...rows.map(
      ({ name, before: b, after: a }) =>
        `| ${name} | ${both(b.layout, a.layout)} | ${both(`${b.fitting}/${b.cells}`, `${a.fitting}/${a.cells}`)} | ${both(b.mismatch.toFixed(3), a.mismatch.toFixed(3))} | ${both(pct(b.lost), pct(a.lost))} | ${both(`${b.zoomedOut}`, `${a.zoomedOut}`)} | ${both(pct(b.background), pct(a.background))} | ${both(b.ms.toFixed(0), a.ms.toFixed(0))} |`,
    ),
  ];
  for (const [label, group] of [
    ["loose", rows.filter((r) => !r.tight)],
    ["tight", rows.filter((r) => r.tight)],
    ["mixed sets", rows.filter((r) => r.mixed)],
    ["all sets", rows],
  ] as const) {
    const sum = (key: "before" | "after", f: (fit: Fit) => number) => group.reduce((s, r) => s + f(r[key]), 0);
    const col = (f: (key: "before" | "after") => string) => both(f("before"), f("after"));
    lines.push(
      `| **${label}** | | ${col((k) => `${sum(k, (f) => f.fitting)}/${sum(k, (f) => f.cells)}`)} | ${col((k) => (sum(k, (f) => f.mismatch) / group.length).toFixed(3))} | ${col((k) => pct(sum(k, (f) => f.lost) / group.length))} | ${col((k) => `${sum(k, (f) => f.zoomedOut)}`)} | ${col((k) => pct(sum(k, (f) => f.background) / group.length))} | max ${col((k) => Math.max(...group.map((r) => r[k].ms)).toFixed(0))} |`,
    );
  }
  console.log(lines.join("\n"));
}

/** Set to print the report. The package has no Node types, so read the variable through globalThis. */
const REPORT = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.FIT_REPORT;

describe("fit to the photos' subjects", () => {
  it.runIf(REPORT)("prints the report", report, 120_000);

  describe("AC-RANK-08 fitting grid layouts to the photos", () => {
    it("crops less of the subjects on the sample sets, and never more overall", () => {
      const total = (sets: typeof SAMPLE_SETS, fit: boolean) => sets.reduce((s, set) => s + measure(set.photos, fit).lost, 0);
      const tight = SAMPLE_SETS.filter((s) => s.tight);
      expect(total(tight, true)).toBeLessThan(total(tight, false) * 0.5);
      expect(total(SAMPLE_SETS, true)).toBeLessThan(total(SAMPLE_SETS, false));
    }, 60_000);

    it("keeps every fitted layout a valid built-in layout", () => {
      for (const set of SAMPLE_SETS.filter((s) => s.mixed)) {
        for (const layout of layoutsFor(set.photos.length)) {
          const fitted = fittedLayout(layout, DEFAULT_STYLE, set.photos);
          expect(layoutProblems(fitted, 20), `${set.name}: ${layout.id}`).toEqual([]);
          expect(fitted.id).toBe(layout.id);
        }
      }
    }, 60_000);

    it("leaves layouts as drawn with the flag off, and never moves a saved layout", () => {
      const photos = SAMPLE_SETS.find((s) => s.name === "5 tight portrait")!.photos;
      const drawn = new Set(layoutsFor(5));
      expect(rankedScenes(photos).every((s) => drawn.has(s.layout))).toBe(true);
      expect(rankedScenes(photos, DEFAULT_STYLE, {}, true).some((s) => !drawn.has(s.layout))).toBe(true);
      const mosaic = layoutsFor(5).find((l) => l.id === "five-mosaic")!;
      expect(assignedScene(mosaic, photos).layout).toBe(mosaic);
    });
  });

  it("measures shape mismatch against the subject's range", () => {
    const p = PHOTOS.landscapePerson; // subject ≈ 0.29 to ≈ 1.63 wide per unit of height
    expect(shapeMismatch(p, 1)).toBe(0);
    expect(shapeMismatch(p, 16 / 9)).toBeGreaterThan(0);
    expect(shapeMismatch(p, 0.2)).toBeGreaterThan(0);
  });
});
