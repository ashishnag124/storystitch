// What the layout editor does, the same on every platform: the draft, drags, handles, tools and saving.
// LayoutEditor.web.tsx and LayoutEditor.native.tsx draw it and feed it touches. How cells can change depends on the
// layout (editModeOf): lines in grids, shared corners and lines in slanted layouts, and whole cells otherwise.
import {
  GRID_SHAPES,
  MOVE_STEPS,
  bringToFront,
  canRotate,
  cornerLines,
  cornersLayout,
  cornerSteps,
  cornersOf,
  duplicateCell,
  editModeOf,
  gridDividers,
  gridLayout,
  gridOf,
  moveCell,
  moveCorner,
  moveDivider,
  moveLine,
  removeCell,
  removeGridCell,
  reshapeCell,
  rotateCell,
  scaleCell,
  snapTo,
  splitCell,
  type Corners,
  type Edited,
  type Grid,
} from "@storystitch/layout-engine";
import { STORY_CANVAS, cellBounds, editedLayoutProblems, hitTest, type Point, type SavedLayout } from "@storystitch/shared";
import { SaveError, autoCrop, explain, styleScale, withOrigin, type CropSource, type Draft, type Start, type Style } from "@storystitch/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { saveLayout } from "./api";
import { track } from "./usage";

const { width: W, height: H } = STORY_CANVAS;
/** Touch targets for lines and handles: at least the 44px a thumb needs, a bit more for comfort. */
const HANDLE_PX = 48;
/** Lines snap to halves, thirds and quarters, and to each other, within this many screen px. */
const SNAP_PX = 12;
const SNAP_FRACTIONS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
/** Button steps: how much Bigger/Smaller resize and Turn rotates. */
const SCALE_STEP = 1.08;
const TURN_STEP = 4;
/** How far one VoiceOver step moves a line or corner (canvas px): enough to change the percent it says. */
const VOICEOVER_STEP_PX = 40;
const NO_ROOM = "There's no room to move it that way.";
/** How long after the last change the overlay check runs (it samples the whole canvas). */
const CHECK_DELAY_MS = 150;

const HINTS: Record<ReturnType<typeof editModeOf>, (selected: boolean) => string> = {
  grid: (selected) => (selected ? "Split this cell, change its shape, or drag a line to resize." : "Tap a photo to split it, or drag a line to resize."),
  corners: () => "Drag a corner or a line. Every photo that shares it follows.",
  free: (selected) => (selected ? "Drag to move. Pinch, or use Bigger and Smaller, to resize." : "Tap a photo to move or resize it."),
};

/** What a line or corner moves. */
type LineTarget =
  | { kind: "divider"; path: string; grid: Grid; startAt: number; dir: "across" | "down" }
  | { kind: "corner"; index: number; corners: Corners; last: Corners }
  | { kind: "line"; line: number; corners: Corners };

/** A drag in progress. Positions are screen px; `base` is the draft when it started. */
type Drag =
  | (LineTarget & { x: number; y: number; base: Draft })
  | { kind: "move"; cell: number; x: number; y: number; base: Draft }
  | { kind: "resize"; cell: number; center: Point; distance: number; base: Draft }
  | { kind: "rotate"; cell: number; center: Point; angle: number; rotate: number; base: Draft }
  | { kind: "pinch"; cell: number; distance: number; angle: number; rotate: number; base: Draft };

/** What VoiceOver does in place of a drag. `run` returns what to say when the move can't be made. */
export interface Move {
  /** "increment" and "decrement" are the up and down swipes; anything else is a named action. */
  name: string;
  run: () => string | undefined;
}

const swipes = (step: (direction: 1 | -1) => string | undefined): Move[] => [
  { name: "increment", run: () => step(1) },
  { name: "decrement", run: () => step(-1) },
];

/** A line or handle over the preview. Its box is in screen px from the frame's top left. */
export interface Handle {
  key: string;
  kind: "across" | "down" | "line" | "corner" | "resize" | "rotate";
  label: string;
  box: { left: number; top: number; width: number; height: number };
  /** What dragging it changes. */
  target: LineTarget | { kind: "resize"; cell: number; center: Point } | { kind: "rotate"; cell: number; center: Point; rotate: number };
  /** Moves it by a step in canvas px and keeps the change, where that's possible without a pointer. */
  nudge?: (dx: number, dy: number) => void;
  /** A line's range and place, in percent. */
  range?: { min: number; max: number; now: number };
  moves: Move[];
  /** Where it is now, for VoiceOver. */
  value: string;
}

/** How VoiceOver moves the chosen photo, which a finger drags on the preview. */
export type CellMover = Pick<Handle, "label" | "box" | "moves" | "value">;

/** A button under the preview. */
export interface Tool {
  label: string;
  /** Said instead of the label, when the label is only a symbol. */
  name?: string;
  onPress: () => void;
}

interface Options {
  photos: CropSource[];
  style: Style;
  start: Start;
  onSaved: (saved: SavedLayout, order: number[]) => void;
  /** Where the preview's top left corner is on screen. */
  frameOrigin: () => Point;
}

export function useLayoutEditor({ photos, style, start, onSaved, frameOrigin }: Options) {
  const mode = useMemo(() => editModeOf(start.layout), [start.layout]);
  const [draft, setDraft] = useState<Draft>({ layout: start.layout, order: start.order });
  const [history, setHistory] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(mode === "grid" && start.layout.cells.length === 1 ? 0 : null);
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<{ text: string; cells: number[] }[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<{ name: string; busy: boolean; error: string } | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const drag = useRef<Drag | null>(null);

  const { layout, order } = draft;
  const k = view.width / W; // screen px per canvas px

  // Cells are drawn inset by the style's margin and gaps; handles sit on the drawn cells.
  const { gap, margin } = styleScale(layout, style, STORY_CANVAS);
  const offset = margin - gap / 2;
  const [areaW, areaH] = [W - 2 * offset, H - 2 * offset];
  const toCanvas = (p: Point) => ({ x: offset + (p.x * areaW) / W, y: offset + (p.y * areaH) / H });
  const toLayout = (p: Point) => ({ x: ((p.x - offset) * W) / areaW, y: ((p.y - offset) * H) / areaH });
  /** A screen-px movement as layout px. */
  const layoutDelta = (dx: number, dy: number) => ({ x: (dx / k) * (W / areaW), y: (dy / k) * (H / areaH) });

  const grid = mode === "grid" ? gridOf(layout) : null;
  const dividers = grid ? gridDividers(grid) : [];
  const corners = useMemo(() => (mode === "corners" ? cornersOf(layout) : null), [mode, layout]);
  const lines = useMemo(() => (corners ? cornerLines(corners) : []), [corners]);

  const crops = useMemo(
    () => layout.cells.map((_, i) => (order[i]! >= 0 ? autoCrop(layout, style, photos[order[i]!]!, i) : null)),
    [layout, order, style, photos],
  );

  // Check for overlaps and the like once the layout stops changing.
  useEffect(() => {
    if (dragging) return;
    const timer = setTimeout(() => setProblems(explain(editedLayoutProblems(layout, 20))), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [layout, dragging]);

  /** Fills an area with the 9:16 frame, as large as it fits. */
  function fit(width: number, height: number) {
    const w = Math.min(width, (height * 9) / 16);
    setView({ width: Math.floor(w), height: Math.floor((w * 16) / 9) });
  }

  function commit(next: Draft) {
    setHistory((h) => [...h, draft]);
    setDraft(next);
    setMessage("");
  }
  function undo() {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDraft(prev);
    setSelected((s) => (s !== null && s < prev.layout.cells.length ? s : null));
    setMessage("Undone.");
  }
  /** Ends a drag: keeps the change (undoable) if anything moved. */
  function finishDrag() {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    if (d && d.base.layout !== draft.layout) setHistory((h) => [...h, d.base]);
  }
  const refuse = (text: string) => {
    setMessage(text);
    return text;
  };
  const apply = (edited: Edited | null, refusal: string) => {
    if (!edited) return setMessage(refusal);
    commit(withOrigin(draft, edited, photos.length));
  };
  function startDrag(d: Drag) {
    drag.current = d;
    setDragging(true);
  }

  function screenToLayout(x: number, y: number): Point {
    const origin = frameOrigin();
    return toLayout({ x: (x - origin.x) / k, y: (y - origin.y) / k });
  }

  // --- Fingers on the preview: select cells; in free mode, move them and pinch to resize and turn.

  /** A finger went down on the preview; `fingers` are all those on it now, the new one last. */
  function pressPreview(fingers: Point[]) {
    if (fingers.length === 2 && mode === "free" && selected !== null) {
      const [a, b] = fingers as [Point, Point];
      const cell = layout.cells[selected]!;
      startDrag({
        kind: "pinch",
        cell: selected,
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        rotate: cell.shape === "rect" ? cell.rotate : 0,
        base: draft,
      });
      return;
    }
    const finger = fingers.at(-1)!;
    const hit = hitTest(layout.cells, screenToLayout(finger.x, finger.y));
    setSelected(hit >= 0 ? hit : null);
    if (hit < 0 || mode !== "free") return;
    const base = layout.allowOverlap ? { ...draft, layout: bringToFront(layout, hit) } : draft;
    if (base !== draft) setDraft(base);
    startDrag({ kind: "move", cell: hit, x: finger.x, y: finger.y, base });
  }

  function movePreview(fingers: Point[]) {
    const d = drag.current;
    if (d?.kind === "move") {
      const delta = layoutDelta(fingers[0]!.x - d.x, fingers[0]!.y - d.y);
      const moved = moveCell(d.base.layout, d.cell, delta.x / W, delta.y / H);
      if (moved) setDraft({ ...d.base, layout: moved });
    } else if (d?.kind === "pinch" && fingers.length === 2) {
      const [a, b] = fingers as [Point, Point];
      const scaled = scaleCell(d.base.layout, d.cell, Math.hypot(b.x - a.x, b.y - a.y) / d.distance);
      if (!scaled) return;
      const turn = ((Math.atan2(b.y - a.y, b.x - a.x) - d.angle) * 180) / Math.PI;
      const turned = canRotate(scaled.cells[d.cell]!) ? rotateCell(scaled, d.cell, d.rotate + turn) : null;
      setDraft({ ...d.base, layout: turned ?? scaled });
    }
  }

  /** A finger went down on a line or handle, at (x, y) in screen px. */
  function grabHandle({ target }: Handle, x: number, y: number) {
    const p = screenToLayout(x, y);
    if (target.kind === "resize") {
      const { center } = target;
      startDrag({ ...target, distance: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)), base: draft });
    } else if (target.kind === "rotate") {
      const { center } = target;
      startDrag({ ...target, angle: (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI, base: draft });
    } else startDrag({ ...target, x, y, base: draft });
  }

  /** A finger moved on a line or handle. */
  function moveHandle(x: number, y: number) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "divider") {
      const delta = layoutDelta(x - d.x, y - d.y);
      const along = d.dir === "across" ? delta.y / H : delta.x / W;
      const others = gridDividers(d.grid).filter((o) => o.dir === d.dir && o.path !== d.path).map((o) => o.at);
      const threshold = (SNAP_PX / k) * (d.dir === "across" ? 1 / areaH : 1 / areaW);
      const at = snapTo(d.startAt + along, [...SNAP_FRACTIONS, ...others], threshold);
      setDraft(withOrigin(d.base, gridLayout(d.base.layout, moveDivider(d.grid, d.path, at)), photos.length));
    } else if (d.kind === "corner") {
      const delta = layoutDelta(x - d.x, y - d.y);
      const from = d.corners.points[d.index]!;
      const next = moveCorner(d.base.layout, d.last, d.index, { x: from.x + delta.x, y: from.y + delta.y });
      if (!next) return;
      d.last = next;
      setDraft({ ...d.base, layout: cornersLayout(d.base.layout, next) });
    } else if (d.kind === "line") {
      const next = moveLine(d.base.layout, d.corners, lines[d.line]!, layoutDelta(x - d.x, y - d.y));
      if (next) setDraft({ ...d.base, layout: cornersLayout(d.base.layout, next) });
    } else if (d.kind === "resize") {
      const p = screenToLayout(x, y);
      const scaled = scaleCell(d.base.layout, d.cell, Math.hypot(p.x - d.center.x, p.y - d.center.y) / d.distance);
      if (scaled) setDraft({ ...d.base, layout: scaled });
    } else if (d.kind === "rotate") {
      const p = screenToLayout(x, y);
      const angle = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI;
      const turned = rotateCell(d.base.layout, d.cell, d.rotate + angle - d.angle);
      if (turned) setDraft({ ...d.base, layout: turned });
    }
  }

  // --- Handles: lines (grid), corners and lines (corners), resize and turn (free).

  const sel = selected !== null && selected < layout.cells.length ? selected : null;
  const selCell = sel !== null ? layout.cells[sel]! : null;

  const screen = (p: Point) => ({ x: toCanvas(p).x * k, y: toCanvas(p).y * k });
  const square = (x: number, y: number) => ({ left: x - HANDLE_PX / 2, top: y - HANDLE_PX / 2, width: HANDLE_PX, height: HANDLE_PX });
  const percent = (p: Point) => ({ left: Math.round((p.x / W) * 100), top: Math.round((p.y / H) * 100) });
  const handles: Handle[] = [];

  for (const d of dividers) {
    const across = d.dir === "across";
    const a = screen(across ? { x: d.from * W, y: d.at * H } : { x: d.at * W, y: d.from * H });
    const b = screen(across ? { x: d.to * W, y: d.at * H } : { x: d.at * W, y: d.to * H });
    // Stop short of the ends, so where lines meet, one line's touch area doesn't cover the other's.
    const trim = (length: number) => Math.min(HANDLE_PX / 2, Math.max(0, (length - HANDLE_PX) / 2));
    const [ta, tb] = [trim(b.x - a.x), trim(b.y - a.y)];
    const nudge = (dx: number, dy: number) => {
      const step = across ? dy / areaH : dx / areaW;
      if (step) commit(withOrigin(draft, gridLayout(layout, moveDivider(grid!, d.path, d.at + step)), photos.length));
    };
    handles.push({
      key: d.path,
      kind: d.dir,
      label: across ? "Line between rows" : "Line between columns",
      box: across
        ? { left: a.x + ta, top: a.y - HANDLE_PX / 2, width: b.x - a.x - 2 * ta, height: HANDLE_PX }
        : { left: a.x - HANDLE_PX / 2, top: a.y + tb, width: HANDLE_PX, height: b.y - a.y - 2 * tb },
      range: { min: Math.round(d.min * 100), max: Math.round(d.max * 100), now: Math.round(d.at * 100) },
      target: { kind: "divider", path: d.path, grid: grid!, startAt: d.at, dir: d.dir },
      nudge,
      moves: swipes((direction) => {
        if (Math.abs(d.at - (direction > 0 ? d.max : d.min)) < 0.001) return refuse(NO_ROOM);
        nudge(direction * VOICEOVER_STEP_PX, direction * VOICEOVER_STEP_PX);
      }),
      value: `${Math.round(d.at * 100)}% from the ${across ? "top" : "left"}`,
    });
  }

  if (corners) {
    const keep = (next: Corners | null) => next && commit({ ...draft, layout: cornersLayout(layout, next) });
    const keepOrRefuse = (next: Corners | null) => (next ? void keep(next) : refuse(NO_ROOM));
    lines.forEach((line, li) => {
      const [a, b] = [corners.points[line.members[0]!]!, corners.points[line.members.at(-1)!]!];
      const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const mid = screen(middle);
      // A line that runs more up and down than across moves sideways, and the other way about.
      const sideways = Math.abs(b.y - a.y) > Math.abs(b.x - a.x);
      handles.push({
        key: `line-${li}`,
        kind: "line",
        label: `Slanted line ${li + 1}`,
        box: square(mid.x, mid.y),
        target: { kind: "line", line: li, corners },
        nudge: (dx, dy) => keep(moveLine(layout, corners, line, { x: dx, y: dy })),
        moves: swipes((direction) => {
          const by = direction * VOICEOVER_STEP_PX;
          return keepOrRefuse(moveLine(layout, corners, line, sideways ? { x: by, y: 0 } : { x: 0, y: by }));
        }),
        value: sideways ? `${percent(middle).left}% from the left` : `${percent(middle).top}% from the top`,
      });
    });
    corners.points.forEach((p, i) => {
      if (corners.locks[i]!.kind === "fixed") return;
      const at = screen(p);
      handles.push({
        key: `corner-${i}`,
        kind: "corner",
        label: `Corner ${i + 1}`,
        box: square(at.x, at.y),
        target: { kind: "corner", index: i, corners, last: corners },
        nudge: (dx, dy) => keep(moveCorner(layout, corners, i, { x: p.x + dx, y: p.y + dy })),
        moves: cornerSteps(corners.locks[i]!).map(({ name, by }) => ({
          name,
          run: () => keepOrRefuse(moveCorner(layout, corners, i, { x: p.x + by.x * VOICEOVER_STEP_PX, y: p.y + by.y * VOICEOVER_STEP_PX })),
        })),
        value: `${percent(p).left}% from the left, ${percent(p).top}% from the top`,
      });
    });
  }

  const selBox = sel !== null && mode === "free" ? cellBounds(layout.cells[sel]!) : null;
  let cellMover: CellMover | null = null;
  if (selBox && sel !== null) {
    const center = { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 };
    const corner = screen({ x: selBox.x + selBox.w, y: selBox.y + selBox.h });
    const start = screen(selBox);
    const { left, top } = percent(selBox);
    cellMover = {
      label: `Move photo ${sel + 1}`,
      box: { left: start.x, top: start.y, width: corner.x - start.x, height: corner.y - start.y },
      moves: MOVE_STEPS.map(({ name, by }) => ({ name, run: () => stepCell(by) })),
      value: `${left}% from the left, ${top}% from the top`,
    };
    handles.push({
      key: "resize",
      kind: "resize",
      label: `Resize photo ${sel + 1}`,
      box: square(corner.x, corner.y),
      target: { kind: "resize", cell: sel, center },
      moves: swipes((direction) => scaleBy(direction > 0 ? SCALE_STEP : 1 / SCALE_STEP)),
      value: `${Math.round((selBox.w / W) * 100)}% of the width`,
    });
    if (selCell?.shape === "rect") {
      const top = screen({ x: center.x, y: selBox.y });
      handles.push({
        key: "rotate",
        kind: "rotate",
        label: `Turn photo ${sel + 1}`,
        box: { ...square(top.x, 0), top: Math.max(0, top.y - HANDLE_PX * 1.25) },
        target: { kind: "rotate", cell: sel, center, rotate: selCell.rotate },
        moves: swipes((direction) => turnBy(direction * TURN_STEP)),
        value: `${Math.round(selCell.rotate)} degrees`,
      });
    }
  }

  // --- Tools.

  function nextShape() {
    if (sel === null || !selCell) return;
    const now = GRID_SHAPES.indexOf(selCell.shape as (typeof GRID_SHAPES)[number]);
    for (let n = 1; n <= GRID_SHAPES.length; n++) {
      const shape = GRID_SHAPES[(now + n) % GRID_SHAPES.length]!;
      const edited = reshapeCell(layout, sel, shape);
      if (edited) return commit(withOrigin(draft, edited, photos.length));
    }
    setMessage("This cell is too short for another shape.");
  }
  const scaleBy = (f: number) => {
    if (sel === null) return;
    const next = scaleCell(layout, sel, f);
    if (!next) return refuse(f > 1 ? "There's no room to make it bigger." : "That's as small as it goes.");
    commit({ ...draft, layout: next });
  };
  const turnBy = (deg: number) => {
    if (sel === null || selCell?.shape !== "rect") return;
    const next = rotateCell(layout, sel, selCell.rotate + deg);
    if (!next) return refuse("There's no room to turn it further.");
    commit({ ...draft, layout: next });
  };

  /** Moves the chosen photo as a drag would, which brings it to the top where photos can overlap. */
  const stepCell = (by: Point) => {
    if (sel === null) return;
    const base = layout.allowOverlap ? bringToFront(layout, sel) : layout;
    const moved = moveCell(base, sel, (by.x * VOICEOVER_STEP_PX) / W, (by.y * VOICEOVER_STEP_PX) / H);
    if (!moved) return refuse(NO_ROOM);
    commit({ ...draft, layout: moved });
  };

  /** VoiceOver can't tap a photo, so it steps through them. */
  const pickMoves = swipes((direction) => {
    const count = layout.cells.length;
    const from = sel ?? (direction > 0 ? -1 : 0);
    setSelected((from + direction + count) % count);
  });

  const tools: Tool[] = [];
  if (sel !== null && mode === "grid") {
    tools.push(
      { label: "Split across", onPress: () => apply(splitCell(layout, sel, "across"), "Too small to split across.") },
      { label: "Split down", onPress: () => apply(splitCell(layout, sel, "down"), "Too small to split down.") },
      { label: "Shape", onPress: nextShape },
      { label: "Remove", onPress: () => (setSelected(null), apply(removeGridCell(layout, sel), "A layout needs at least one cell.")) },
    );
  }
  if (sel !== null && mode === "free") {
    tools.push({ label: "Smaller", onPress: () => scaleBy(1 / SCALE_STEP) }, { label: "Bigger", onPress: () => scaleBy(SCALE_STEP) });
    if (selCell?.shape === "rect") {
      tools.push({ label: "⟲", name: "Turn left", onPress: () => turnBy(-TURN_STEP) }, { label: "⟳", name: "Turn right", onPress: () => turnBy(TURN_STEP) });
    }
    tools.push(
      { label: "Add copy", onPress: () => apply(duplicateCell(layout, sel), "There's no room for another photo.") },
      { label: "Remove", onPress: () => (setSelected(null), apply(removeCell(layout, sel), "A layout needs at least one cell.")) },
    );
  }

  // --- Done: check the layout, then name it and save it.

  const cells = layout.cells.length;
  const missing = photos.length - cells;
  const countText = `${cells} of ${photos.length} photos`;
  const countHint =
    missing > 0
      ? mode === "grid"
        ? `Split ${missing === 1 ? "one more cell" : `${missing} more cells`} to fit ${photos.length} photos.`
        : `Add ${missing === 1 ? "one more cell" : `${missing} more cells`} to fit ${photos.length} photos.`
      : missing < 0
        ? `Remove ${-missing === 1 ? "one cell" : `${-missing} cells`}: you have ${photos.length} photos.`
        : "";

  function done() {
    if (missing) return setMessage(countHint);
    const found = explain(editedLayoutProblems(layout));
    setProblems(found);
    if (found.length) return setMessage(found[0]!.text);
    setSaving({ name: start.saved?.name ?? `My ${start.layout.name.toLowerCase()}`.slice(0, 40), busy: false, error: "" });
  }

  async function save() {
    if (!saving) return;
    const name = saving.name.trim();
    if (!name) return setSaving({ ...saving, error: "Give your layout a name." });
    setSaving({ ...saving, busy: true, error: "" });
    try {
      onSaved(await saveLayout(name, layout, start.saved?.id), order);
    } catch (err) {
      setSaving({ ...saving, busy: false, error: err instanceof SaveError ? err.message : "Couldn't save. Please try again." });
      track("error_shown", { code: "layout_save_failed" });
    }
  }

  return {
    layout,
    order,
    crops,
    selected: sel,
    pickMoves,
    pickValue: sel === null ? "No photo chosen" : `Photo ${sel + 1} chosen`,
    problems,
    view,
    fit,
    handles,
    cellMover,
    tools,
    pressPreview,
    movePreview,
    grabHandle,
    moveHandle,
    finishDrag,
    canUndo: history.length > 0,
    undo,
    done,
    countText,
    status: message || countHint || problems[0]?.text || HINTS[mode](sel !== null),
    saving,
    setSaving,
    save,
    saveLabel: start.saved ? "Save changes" : "Save layout",
  };
}
