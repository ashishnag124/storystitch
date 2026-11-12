import { describe, expect, it } from "vitest";
import { z } from "zod";
import { LayoutSchema, layouts } from "./layout";
import { SaveLayoutSchema } from "./api";

// A frozen copy of the layout schema as the released app and API have it (v1.2.0), before `turn` existed. What
// they do with a layout saved by newer code is what these tests pin down: it must still read, minus the turn.
const unit = z.number().min(0).max(1);
const zOrder = z.number().int().default(0);
const PreviousCell = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("rect"), x: unit, y: unit, w: unit, h: unit, rotate: z.number().min(-45).max(45).default(0), z: zOrder }),
  z.object({ shape: z.literal("polygon"), points: z.array(z.tuple([unit, unit])).min(3).max(16), z: zOrder }),
  z.object({ shape: z.literal("circle"), cx: unit, cy: unit, r: unit, z: zOrder }),
  z.object({ shape: z.literal("arch"), x: unit, y: unit, w: unit, h: unit, z: zOrder }),
  z.object({ shape: z.literal("pill"), x: unit, y: unit, w: unit, h: unit, z: zOrder }),
  z.object({ shape: z.literal("heart"), cx: unit, cy: unit, r: unit, z: zOrder }),
  z.object({ shape: z.literal("star"), cx: unit, cy: unit, r: unit, z: zOrder }),
  z.object({ shape: z.literal("wave"), x: unit, y: unit, w: unit, h: unit, waves: z.array(z.enum(["top", "bottom"])).min(1), z: zOrder }),
]);
const PreviousLayout = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.enum(["single", "grid", "feature", "mosaic", "diagonal", "scattered", "filmstrip", "circles", "negative-space", "shapes", "polaroid"]),
  cells: z.array(PreviousCell).min(1).max(8),
  allowOverlap: z.boolean().default(false),
  bleed: z.boolean().default(false),
  blurBackground: z.boolean().default(false),
});

const turned = {
  id: "blank",
  name: "Turned",
  family: "shapes",
  allowOverlap: true,
  cells: [
    { shape: "rect", x: 0.1, y: 0.1, w: 0.3, h: 0.2, rotate: 0, turn: 120, z: 0 },
    { shape: "heart", cx: 0.7, cy: 0.2, r: 0.15, turn: -90, z: 1 },
    { shape: "star", cx: 0.3, cy: 0.6, r: 0.15, turn: 15, z: 2 },
    { shape: "arch", x: 0.55, y: 0.5, w: 0.28, h: 0.2, turn: 180, z: 3 },
    { shape: "pill", x: 0.2, y: 0.8, w: 0.4, h: 0.1, turn: -45.5, z: 4 },
    { shape: "circle", cx: 0.8, cy: 0.85, r: 0.1, z: 5 },
  ],
};

describe("AC-CUSTOM-22 turned shapes and the previous layout schema", () => {
  it("is read by the previous schema, which drops the turn, so an older app or API shows the layout upright", () => {
    const old = PreviousLayout.safeParse(turned);
    expect(old.success).toBe(true);
    for (const cell of old.data!.cells) expect("turn" in cell).toBe(false);
    expect(old.data!.cells[0]).toMatchObject({ shape: "rect", rotate: 0 });
    // This is what the previous schema can't take, so `rotate` is never widened: it would reject the whole layout.
    expect(PreviousLayout.safeParse({ ...turned, cells: [{ ...turned.cells[0]!, rotate: 120, turn: undefined }] }).success).toBe(false);
  });

  it("is kept in full by this schema, on the way to the API and back", () => {
    const now = LayoutSchema.parse(turned);
    expect(now.cells.map((c) => ("turn" in c ? c.turn : undefined))).toEqual([120, -90, 15, 180, -45.5, undefined]);
    const body = { family: turned.family, allowOverlap: true, cells: turned.cells };
    expect(SaveLayoutSchema.parse({ name: "Turned", layout: body }).layout.cells[1]).toMatchObject({ shape: "heart", turn: -90 });
  });

  it("only takes a turn within a full turn, leaves the built-in layouts without one, and doesn't write one that isn't set", () => {
    expect(LayoutSchema.safeParse({ ...turned, cells: [{ ...turned.cells[1]!, turn: 181 }] }).success).toBe(false);
    expect(LayoutSchema.safeParse({ ...turned, cells: [{ ...turned.cells[1]!, turn: -181 }] }).success).toBe(false);
    expect(layouts.some((l) => l.cells.some((c) => "turn" in c))).toBe(false);
    const plainHeart = { shape: "heart", cx: 0.7, cy: 0.2, r: 0.15, z: 1 };
    expect("turn" in LayoutSchema.parse({ ...turned, cells: [plainHeart] }).cells[0]!).toBe(false);
  });
});
