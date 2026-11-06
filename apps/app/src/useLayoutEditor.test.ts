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
});
