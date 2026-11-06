// @vitest-environment jsdom
import { DEFAULT_STYLE, type Start } from "@storystitch/client";
import { layouts } from "@storystitch/shared";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useLayoutEditor, type Handle } from "./useLayoutEditor";

vi.mock("./api", () => ({ saveLayout: vi.fn() }));
vi.mock("./usage", () => ({ track: vi.fn() }));

function open(id: string) {
  const layout = layouts.find((l) => l.id === id)!;
  const start: Start = { layout, order: layout.cells.map((_, i) => i) };
  const photos = layout.cells.map((_, i) => ({ name: `${i}.jpg`, width: 1200, height: 1600, detections: [] }));
  const { result } = renderHook(() => useLayoutEditor({ photos, style: DEFAULT_STYLE, start, onSaved: vi.fn(), frameOrigin: () => ({ x: 0, y: 0 }) }));
  act(() => result.current.fit(360, 640));
  return result;
}

const run = (moves: Handle["moves"], name: string) => {
  const said: (string | undefined)[] = [];
  act(() => {
    said.push(moves.find((m) => m.name === name)!.run());
  });
  return said[0];
};

describe("AC-CUSTOM-10 moving lines and handles with VoiceOver", () => {
  it("moves a grid line a step at a time, keeps it undoable and says when it can't go further", () => {
    const editor = open("two-stack");
    const line = () => editor.current.handles[0]!;
    const before = line().value;
    expect(run(line().moves, "increment")).toBeUndefined();
    expect(line().value).not.toBe(before);
    expect(editor.current.canUndo).toBe(true);
    run(line().moves, "decrement");
    expect(line().value).toBe(before);
    act(() => editor.current.undo());
    act(() => editor.current.undo());
    expect(editor.current.canUndo).toBe(false);

    let refusal: string | undefined;
    for (let i = 0; i < 40 && !refusal; i++) refusal = run(line().moves, "increment");
    expect(refusal).toMatch(/no room/);
  });

  it("moves a slanted line with swipes and a corner by named moves", () => {
    const editor = open("six-diagonal");
    const of = (kind: Handle["kind"]) => editor.current.handles.find((h) => h.kind === kind)!;
    const line = of("line").value;
    run(of("line").moves, "increment");
    expect(of("line").value).not.toBe(line);

    const corner = of("corner");
    expect(corner.moves.every((m) => m.name.startsWith("Move "))).toBe(true);
    run(corner.moves, corner.moves[0]!.name);
    expect(of("corner").value).not.toBe(corner.value);
  });

  it("steps to a photo, then resizes and turns it", () => {
    const editor = open("four-polaroids");
    const of = (key: string) => editor.current.handles.find((h) => h.key === key);
    expect(editor.current.pickValue).toBe("No photo chosen");
    expect(of("resize")).toBeUndefined();
    run(editor.current.pickMoves, "increment");
    expect(editor.current.pickValue).toBe("Photo 1 chosen");
    run(editor.current.pickMoves, "decrement");
    expect(editor.current.pickValue).toBe("Photo 4 chosen");

    const size = of("resize")!.value;
    run(of("resize")!.moves, "decrement");
    expect(of("resize")!.value).not.toBe(size);
    const angle = of("rotate")!.value;
    run(of("rotate")!.moves, "increment");
    expect(of("rotate")!.value).not.toBe(angle);
  });

  it("moves the chosen photo by named moves, keeps it undoable and says when it can't go further", () => {
    const editor = open("four-polaroids");
    const mover = () => editor.current.cellMover!;
    expect(editor.current.cellMover).toBeNull();
    run(editor.current.pickMoves, "increment");
    expect(mover().label).toBe("Move photo 1");
    expect(mover().moves.map((m) => m.name)).toEqual(["Move up", "Move down", "Move left", "Move right"]);

    const place = () => mover().value.match(/(\d+)% from the left, (\d+)% from the top/)!.slice(1).map(Number) as [number, number];
    const step = (name: string) => {
      const [left, top] = place();
      expect(run(mover().moves, name)).toBeUndefined();
      return [Math.sign(place()[0] - left), Math.sign(place()[1] - top)];
    };
    expect(step("Move down")).toEqual([0, 1]);
    expect(step("Move up")).toEqual([0, -1]);
    expect(step("Move right")).toEqual([1, 0]);
    expect(step("Move left")).toEqual([-1, 0]);

    const moved = mover().value;
    run(mover().moves, "Move right");
    act(() => editor.current.undo());
    expect(mover().value).toBe(moved);

    let refusal: string | undefined;
    for (let i = 0; i < 40 && !refusal; i++) refusal = run(mover().moves, "Move left");
    expect(refusal).toMatch(/no room/);
    expect(editor.current.status).toBe(refusal);
  });

  it("leaves the preview's swipes choosing a photo after moving one", () => {
    const editor = open("four-polaroids");
    run(editor.current.pickMoves, "increment");
    run(editor.current.cellMover!.moves, "Move down");
    run(editor.current.pickMoves, "increment");
    expect(editor.current.pickValue).toBe("Photo 2 chosen");
    expect(editor.current.cellMover!.label).toBe("Move photo 2");
  });

  it("brings a photo to the top when it moves, as a drag does, where photos can overlap", () => {
    const editor = open(layouts.find((l) => l.allowOverlap)!.id);
    run(editor.current.pickMoves, "increment");
    const top = () => Math.max(...editor.current.layout.cells.slice(1).map((c) => c.z));
    expect(run(editor.current.cellMover!.moves, "Move down")).toBeUndefined();
    expect(editor.current.layout.cells[0]!.z).toBeGreaterThan(top());
  });

  it("has nothing to move in a grid or slanted layout, where photos don't move", () => {
    for (const id of ["two-stack", "six-diagonal"]) {
      const editor = open(id);
      run(editor.current.pickMoves, "increment");
      expect(editor.current.cellMover).toBeNull();
    }
  });
});
