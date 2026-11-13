import { SAFE_ZONE, STORY_CANVAS, layouts } from "@storystitch/shared";
import { describe, expect, it } from "vitest";
import {
  CAPTION_SIZE,
  MAX_CAPTIONS,
  MAX_CAPTION_CHARS,
  addCaption,
  captionAt,
  captionLayout,
  captionShadow,
  captionText,
  moveCaption,
  newCaption,
  removeCaption,
  updateCaption,
  type Caption,
} from "./captions";
import { newScene, swapCells, withStyle, DEFAULT_STYLE } from "./scene";

/** Every character half a font size wide. */
const measure = (line: string, fontSize: number) => line.length * fontSize * 0.5;
const { width: W, height: H } = STORY_CANVAS;
const onCanvas = (b: { x: number; y: number; w: number; h: number }) => b.x >= -1e-9 && b.y >= -1e-9 && b.x + b.w <= W + 1e-9 && b.y + b.h <= H + 1e-9;

describe("AC-TEXT-01 caption data rules", () => {
  it("adds up to three captions, each centered across and inside Instagram's safe zone", () => {
    let captions: Caption[] = [];
    for (let i = 0; i < 5; i++) captions = addCaption(captions);
    expect(captions).toHaveLength(MAX_CAPTIONS);
    for (const c of captions) {
      expect(c.x).toBe(0.5);
      const { box } = captionLayout(c, STORY_CANVAS, measure);
      expect(box.y).toBeGreaterThanOrEqual(SAFE_ZONE.top * H);
      expect(box.y + box.h).toBeLessThanOrEqual((1 - SAFE_ZONE.bottom) * H);
      expect(box.x).toBeGreaterThanOrEqual(SAFE_ZONE.sides * W);
    }
    // Each in its own place.
    expect(new Set(captions.map((c) => c.y)).size).toBe(3);
  });

  it("starts as white Clean text at the default size", () => {
    expect(newCaption([])).toMatchObject({ font: "clean", color: "#ffffff", size: CAPTION_SIZE.default });
  });

  it("keeps text to 80 characters and 3 lines", () => {
    expect(captionText("a".repeat(100))).toHaveLength(MAX_CAPTION_CHARS);
    expect(captionText("one\ntwo\nthree\nfour")).toBe("one\ntwo\nthree");
    expect(captionText("one\r\ntwo")).toBe("one\ntwo");
    const [c] = updateCaption([newCaption([])], 0, { text: "x".repeat(90) });
    expect(c!.text).toHaveLength(MAX_CAPTION_CHARS);
  });

  it("keeps the size within its range", () => {
    expect(updateCaption([newCaption([])], 0, { size: 1 })[0]!.size).toBe(CAPTION_SIZE.max);
    expect(updateCaption([newCaption([])], 0, { size: 0 })[0]!.size).toBe(CAPTION_SIZE.min);
  });

  it("changes and removes only the caption asked for", () => {
    const captions = addCaption(addCaption([]));
    const changed = updateCaption(captions, 1, { font: "hand", color: "#ff7a59" });
    expect(changed[0]).toEqual(captions[0]);
    expect(changed[1]).toMatchObject({ font: "hand", color: "#ff7a59" });
    expect(removeCaption(changed, 0)).toEqual([changed[1]]);
  });

  it("gives white and black text a shadow, and palette colors none", () => {
    expect(captionShadow("#ffffff")).not.toBeNull();
    expect(captionShadow("#111111")).not.toBeNull();
    expect(captionShadow("#ff7a59")).toBeNull();
  });

  it("keeps the box fully on the canvas, wherever the caption is and however long its text", () => {
    const corners = [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
      [0.5, 0.5],
    ] as const;
    for (const [x, y] of corners) {
      for (const text of ["Hi", "A much longer caption that runs right across", "three\nshort\nlines"]) {
        const c = { ...newCaption([]), text, x, y, size: CAPTION_SIZE.max };
        const { box, lines, fontSize } = captionLayout(c, STORY_CANVAS, measure);
        expect(onCanvas(box)).toBe(true);
        for (const line of lines) {
          expect(line.x).toBeGreaterThanOrEqual(box.x);
          expect(line.x + measure(line.text, fontSize)).toBeLessThanOrEqual(box.x + box.w + 1e-9);
        }
      }
    }
  });

  it("scales with the canvas", () => {
    const c = { ...newCaption([]), x: 0.3, y: 0.4 };
    const big = captionLayout(c, STORY_CANVAS, measure);
    const small = captionLayout(c, { width: W / 4, height: H / 4 }, measure);
    expect(small.box.x).toBeCloseTo(big.box.x / 4);
    expect(small.box.w).toBeCloseTo(big.box.w / 4);
    expect(small.fontSize).toBeCloseTo(big.fontSize / 4);
  });

  it("finds the topmost caption under a point", () => {
    const boxes = [
      { x: 0, y: 0, w: 100, h: 100 },
      { x: 50, y: 50, w: 100, h: 100 },
    ];
    expect(captionAt(boxes, { x: 75, y: 75 })).toBe(1);
    expect(captionAt(boxes, { x: 10, y: 10 })).toBe(0);
    expect(captionAt(boxes, { x: 500, y: 500 })).toBe(-1);
  });

  it("moves a caption, kept on the canvas and snapped to the middle when close", () => {
    const captions = [newCaption([])];
    const box = { w: 400, h: 100 };
    const moved = moveCaption(captions, 0, { x: 300, y: 900 }, box, STORY_CANVAS)[0]!;
    expect(moved.x).toBeCloseTo(300 / W);
    expect(moved.y).toBeCloseTo(900 / H);
    expect(moveCaption(captions, 0, { x: W / 2 + 15, y: 900 }, box, STORY_CANVAS)[0]!.x).toBe(0.5);
    // Small steps from the keyboard aren't pulled back to the middle.
    expect(moveCaption(captions, 0, { x: W / 2 + 15, y: 900 }, box, STORY_CANVAS, false)[0]!.x).toBeCloseTo((W / 2 + 15) / W);
    const off = moveCaption(captions, 0, { x: -500, y: H + 500 }, box, STORY_CANVAS)[0]!;
    expect(off.x * W).toBe(200);
    expect(off.y * H).toBe(H - 50);
  });

  it("keep their captions through photo swaps and style changes", () => {
    const layout = layouts.find((l) => l.cells.length === 2)!;
    const photos = [0, 1].map(() => ({ width: 4000, height: 3000, detections: [] }));
    const scene = { ...newScene(layout, photos), captions: addCaption([]) };
    expect(swapCells(scene, 0, 1, photos).captions).toBe(scene.captions);
    expect(withStyle(scene, { ...DEFAULT_STYLE, gap: 30 }, photos).captions).toBe(scene.captions);
  });
});
