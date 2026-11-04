// The layout editor: a full-screen view for making a layout or changing one, saved to the user's account.
// Loaded only when the layout editor is switched on. How cells can change depends on the layout (editModeOf):
// lines in grids, shared corners and lines in slanted layouts, and whole cells (move, resize, turn) otherwise.
import {
  GRID_SHAPES,
  bringToFront,
  canRotate,
  cornerLines,
  cornersLayout,
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
import {
  STORY_CANVAS,
  cellBounds,
  drawOrder,
  hitTest,
  layoutProblems,
  type Point,
  type SavedLayout,
} from "@storystitch/shared";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent, type PointerEvent } from "react";
import type { Photo } from "./photos";
import { drawBlurredBackground, drawCell, fillBackground, hasBlurredBackground, outlinePath, previewOf } from "./render";
import { SaveError, autoCrop, cellShapes, explain, styleScale, withOrigin, type Draft, type Scene, type Start, type Style } from "@storystitch/client";
import { saveLayout } from "../api";
import "./photo-sources.css";
import "./builder.css";

const { width: W, height: H } = STORY_CANVAS;
/** Touch targets for lines and handles (CSS px): at least the 44px a thumb needs, a bit more for comfort. */
const HANDLE_PX = 48;
/** Lines snap to halves, thirds and quarters, and to each other, within this many CSS px. */
const SNAP_PX = 12;
const SNAP_FRACTIONS = [0.25, 1 / 3, 0.5, 2 / 3, 0.75];
/** Button steps: how much Bigger/Smaller resize and Turn rotates. */
const SCALE_STEP = 1.08;
const TURN_STEP = 4;
/** Arrow keys move a focused line or corner this far (canvas px). */
const KEY_STEP_PX = 10;
/** How long after the last change the overlay check runs (it samples the whole canvas). */
const CHECK_DELAY_MS = 150;
/** The highlight on the selected cell and on cells with a problem. */
const SELECTED_COLOR = "#ffc24b";
const PROBLEM_COLOR = "#ff8f8f";

interface Props {
  photos: Photo[];
  style: Style;
  start: Start;
  onCancel: () => void;
  onSaved: (saved: SavedLayout, order: number[]) => void;
}

/** A drag in progress. Positions are client px; `base` is the draft when it started. */
type Drag =
  | { kind: "divider"; path: string; grid: Grid; startAt: number; dir: "across" | "down"; x: number; y: number; base: Draft }
  | { kind: "corner"; index: number; corners: Corners; last: Corners; x: number; y: number; base: Draft }
  | { kind: "line"; line: number; corners: Corners; x: number; y: number; base: Draft }
  | { kind: "move"; cell: number; x: number; y: number; base: Draft }
  | { kind: "resize"; cell: number; center: Point; distance: number; base: Draft }
  | { kind: "rotate"; cell: number; center: Point; angle: number; rotate: number; base: Draft }
  | { kind: "pinch"; cell: number; distance: number; angle: number; rotate: number; base: Draft };

export default function LayoutEditor({ photos, style, start, onCancel, onSaved }: Props) {
  const mode = useMemo(() => editModeOf(start.layout), [start.layout]);
  const [draft, setDraft] = useState<Draft>({ layout: start.layout, order: start.order });
  const [history, setHistory] = useState<Draft[]>([]);
  const [selected, setSelected] = useState<number | null>(mode === "grid" && start.layout.cells.length === 1 ? 0 : null);
  const [dragging, setDragging] = useState(false);
  const [problems, setProblems] = useState<{ text: string; cells: number[] }[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState<{ name: string; busy: boolean; error: string } | null>(null);
  const [view, setView] = useState({ width: 0, height: 0 });
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const drag = useRef<Drag | null>(null);
  const pointers = useRef(new Map<number, Point>());

  const { layout, order } = draft;
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);
  const k = view.width / W; // CSS px per canvas px

  // Cells are drawn inset by the style's margin and gaps; handles sit on the drawn cells.
  const { gap, margin } = styleScale(layout, style, STORY_CANVAS);
  const offset = margin - gap / 2;
  const [areaW, areaH] = [W - 2 * offset, H - 2 * offset];
  const toCanvas = (p: Point) => ({ x: offset + (p.x * areaW) / W, y: offset + (p.y * areaH) / H });
  const toLayout = (p: Point) => ({ x: ((p.x - offset) * W) / areaW, y: ((p.y - offset) * H) / areaH });
  /** A client-px movement as layout px. */
  const layoutDelta = (dx: number, dy: number) => ({ x: (dx / k) * (W / areaW), y: (dy / k) * (H / areaH) });

  const grid = mode === "grid" ? gridOf(layout) : null;
  const dividers = grid ? gridDividers(grid) : [];
  const corners = useMemo(() => (mode === "corners" ? cornersOf(layout) : null), [mode, layout]);
  const lines = useMemo(() => (corners ? cornerLines(corners) : []), [corners]);

  const crops = useMemo(
    () => layout.cells.map((_, i) => (order[i]! >= 0 ? autoCrop(layout, style, photos[order[i]!]!, i) : null)),
    [layout, order, style, photos],
  );

  useEffect(() => heading.current?.focus(), []);

  // Fill the space between the top bar and the tools with the 9:16 frame, as large as it fits.
  useEffect(() => {
    const stage = stageRef.current!;
    const fit = () => {
      const { width, height } = stage.getBoundingClientRect();
      const w = Math.min(width, (height * 9) / 16);
      setView({ width: Math.floor(w), height: Math.floor((w * 16) / 9) });
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // Check for cells under Instagram's buttons, overlaps and the like once the layout stops changing.
  useEffect(() => {
    if (dragging) return;
    const timer = setTimeout(() => setProblems(explain(layoutProblems(layout, 20))), CHECK_DELAY_MS);
    return () => clearTimeout(timer);
  }, [layout, dragging]);

  // Draw the preview.
  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const first = order.find((o) => o >= 0) ?? 0;
    const scene: Scene = { layout, style, order: order.map((o) => (o >= 0 ? o : first)), crops: [] };
    const shapes = cellShapes(layout, style, STORY_CANVAS);
    const { radius, border } = styleScale(layout, style, STORY_CANVAS);
    fillBackground(ctx, STORY_CANVAS, scene);
    if (hasBlurredBackground(scene)) drawBlurredBackground(ctx, STORY_CANVAS, imageFor(first));
    for (const i of drawOrder(layout.cells)) {
      const crop = crops[i];
      if (crop) drawCell(ctx, shapes[i]!, imageFor(order[i]!), crop, radius, border, style.borderColor);
      else {
        ctx.fillStyle = "rgb(43 19 64 / 0.5)";
        ctx.fill(outlinePath(shapes[i]!.photo ?? shapes[i]!.outline, radius));
      }
    }
    const outline = (i: number, color: string, dash: number[]) => {
      if (!shapes[i]) return;
      ctx.save();
      ctx.lineWidth = 10;
      ctx.setLineDash(dash);
      ctx.strokeStyle = color;
      ctx.stroke(outlinePath(shapes[i].outline, radius));
      ctx.restore();
    };
    for (const p of problems) for (const c of p.cells) outline(c, PROBLEM_COLOR, [28, 18]);
    if (selected !== null) outline(selected, SELECTED_COLOR, []);
  }, [layout, order, style, crops, imageFor, selected, problems]);

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
  const apply = (edited: Edited | null, refusal: string) => {
    if (!edited) return setMessage(refusal);
    commit(withOrigin(draft, edited, photos.length));
  };

  function clientToCanvas(x: number, y: number): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (x - rect.left) / k, y: (y - rect.top) / k };
  }

  // --- Pointer handling on the preview: select cells; in free mode, move them and pinch to resize and turn.

  function onCanvasDown(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const at = toLayout(clientToCanvas(e.clientX, e.clientY));
    if (pointers.current.size === 2 && mode === "free" && selected !== null) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const cell = layout.cells[selected]!;
      drag.current = {
        kind: "pinch",
        cell: selected,
        distance: Math.hypot(b.x - a.x, b.y - a.y),
        angle: Math.atan2(b.y - a.y, b.x - a.x),
        rotate: cell.shape === "rect" ? cell.rotate : 0,
        base: draft,
      };
      setDragging(true);
      return;
    }
    const hit = hitTest(layout.cells, at);
    setSelected(hit >= 0 ? hit : null);
    if (hit < 0 || mode !== "free") return;
    const base = layout.allowOverlap ? { ...draft, layout: bringToFront(layout, hit) } : draft;
    if (base !== draft) setDraft(base);
    drag.current = { kind: "move", cell: hit, x: e.clientX, y: e.clientY, base };
    setDragging(true);
  }

  function onCanvasMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const d = drag.current;
    if (!d) return;
    if (d.kind === "move") {
      const delta = layoutDelta(e.clientX - d.x, e.clientY - d.y);
      const moved = moveCell(d.base.layout, d.cell, delta.x / W, delta.y / H);
      if (moved) setDraft({ ...d.base, layout: moved });
    } else if (d.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const scaled = scaleCell(d.base.layout, d.cell, Math.hypot(b.x - a.x, b.y - a.y) / d.distance);
      if (!scaled) return;
      const turn = ((Math.atan2(b.y - a.y, b.x - a.x) - d.angle) * 180) / Math.PI;
      const turned = canRotate(scaled.cells[d.cell]!) ? rotateCell(scaled, d.cell, d.rotate + turn) : null;
      setDraft({ ...d.base, layout: turned ?? scaled });
    }
  }

  function onCanvasUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) finishDrag();
  }

  // --- Handles: lines (grid), corners and lines (corners), resize and turn (free).

  function startHandle(e: PointerEvent, d: Drag) {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = d;
    setDragging(true);
  }

  function onHandleMove(e: PointerEvent) {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "divider") {
      const delta = layoutDelta(e.clientX - d.x, e.clientY - d.y);
      const along = d.dir === "across" ? delta.y / H : delta.x / W;
      const others = gridDividers(d.grid).filter((x) => x.dir === d.dir && x.path !== d.path).map((x) => x.at);
      const threshold = (SNAP_PX / k) * (d.dir === "across" ? 1 / areaH : 1 / areaW);
      const at = snapTo(d.startAt + along, [...SNAP_FRACTIONS, ...others], threshold);
      setDraft(withOrigin(d.base, gridLayout(d.base.layout, moveDivider(d.grid, d.path, at)), photos.length));
    } else if (d.kind === "corner") {
      const delta = layoutDelta(e.clientX - d.x, e.clientY - d.y);
      const from = d.corners.points[d.index]!;
      const next = moveCorner(d.base.layout, d.last, d.index, { x: from.x + delta.x, y: from.y + delta.y });
      if (!next) return;
      d.last = next;
      setDraft({ ...d.base, layout: cornersLayout(d.base.layout, next) });
    } else if (d.kind === "line") {
      const next = moveLine(d.base.layout, d.corners, lines[d.line]!, layoutDelta(e.clientX - d.x, e.clientY - d.y));
      if (next) setDraft({ ...d.base, layout: cornersLayout(d.base.layout, next) });
    } else if (d.kind === "resize") {
      const p = toLayout(clientToCanvas(e.clientX, e.clientY));
      const scaled = scaleCell(d.base.layout, d.cell, Math.hypot(p.x - d.center.x, p.y - d.center.y) / d.distance);
      if (scaled) setDraft({ ...d.base, layout: scaled });
    } else if (d.kind === "rotate") {
      const p = toLayout(clientToCanvas(e.clientX, e.clientY));
      const angle = (Math.atan2(p.y - d.center.y, p.x - d.center.x) * 180) / Math.PI;
      const turned = rotateCell(d.base.layout, d.cell, d.rotate + angle - d.angle);
      if (turned) setDraft({ ...d.base, layout: turned });
    }
  }

  /** Arrow keys on a focused line or corner move it a step; `move` gets the step in canvas px. */
  function arrowKeys(e: KeyboardEvent, move: (dx: number, dy: number) => Draft | null) {
    const steps: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[e.key];
    if (!step) return;
    e.preventDefault();
    const next = move(step[0] * KEY_STEP_PX, step[1] * KEY_STEP_PX);
    if (next) commit(next);
  }

  // --- Toolbar actions.

  const sel = selected !== null && selected < layout.cells.length ? selected : null;
  const selCell = sel !== null ? layout.cells[sel]! : null;

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
    if (next) commit({ ...draft, layout: next });
    else setMessage(f > 1 ? "There's no room to make it bigger." : "That's as small as it goes.");
  };
  const turnBy = (deg: number) => {
    if (sel === null || selCell?.shape !== "rect") return;
    const next = rotateCell(layout, sel, selCell.rotate + deg);
    if (next) commit({ ...draft, layout: next });
    else setMessage("There's no room to turn it further.");
  };

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
    const found = explain(layoutProblems(layout));
    setProblems(found);
    if (found.length) return setMessage(found[0]!.text);
    setSaving({ name: start.saved?.name ?? `My ${start.layout.name.toLowerCase()}`.slice(0, 40), busy: false, error: "" });
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!saving) return;
    const name = saving.name.trim();
    if (!name) return setSaving({ ...saving, error: "Give your layout a name." });
    setSaving({ ...saving, busy: true, error: "" });
    try {
      onSaved(await saveLayout(name, layout, start.saved?.id), order);
    } catch (err) {
      setSaving({ ...saving, busy: false, error: err instanceof SaveError ? err.message : "Couldn't save. Please try again." });
    }
  }

  // --- Overlay geometry (CSS px).

  const css = (p: Point) => ({ x: toCanvas(p).x * k, y: toCanvas(p).y * k });
  const selBox = sel !== null && mode === "free" ? cellBounds(layout.cells[sel]!) : null;

  return (
    <div className="builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
      <header className="builder-bar">
        <button type="button" className="button ghost" onClick={onCancel}>
          Cancel
        </button>
        <h2 id="builder-title" ref={heading} tabIndex={-1} className="builder-count">
          {countText}
        </h2>
        <button type="button" className="button ghost" onClick={undo} disabled={!history.length} aria-label="Undo">
          Undo
        </button>
        <button type="button" className="button primary" onClick={done}>
          Done
        </button>
      </header>

      <div className="builder-stage" ref={stageRef}>
        <div className="builder-frame" style={{ width: view.width, height: view.height }}>
          <canvas
            ref={canvasRef}
            width={W}
            height={H}
            className="builder-canvas"
            role="img"
            aria-label={`Layout being edited: ${countText}`}
            onPointerDown={onCanvasDown}
            onPointerMove={onCanvasMove}
            onPointerUp={onCanvasUp}
            onPointerCancel={onCanvasUp}
            onContextMenu={(e) => e.preventDefault()}
          />
          <div className="builder-band top" style={{ height: `14%` }} aria-hidden="true">
            <span>Instagram's buttons</span>
          </div>
          <div className="builder-band bottom" style={{ height: `18%` }} aria-hidden="true" />

          {dividers.map((d) => {
            const across = d.dir === "across";
            const a = css(across ? { x: d.from * W, y: d.at * H } : { x: d.at * W, y: d.from * H });
            const b = css(across ? { x: d.to * W, y: d.at * H } : { x: d.at * W, y: d.to * H });
            // Stop short of the ends, so where lines meet, one line's touch area doesn't cover the other's.
            const trim = (length: number) => Math.min(HANDLE_PX / 2, Math.max(0, (length - HANDLE_PX) / 2));
            const [ta, tb] = [trim(b.x - a.x), trim(b.y - a.y)];
            const style = across
              ? { left: a.x + ta, top: a.y - HANDLE_PX / 2, width: b.x - a.x - 2 * ta, height: HANDLE_PX }
              : { left: a.x - HANDLE_PX / 2, top: a.y + tb, width: HANDLE_PX, height: b.y - a.y - 2 * tb };
            return (
              <div
                key={d.path}
                className={`builder-divider ${d.dir}`}
                data-testid="builder-handle"
                style={style}
                role="separator"
                tabIndex={0}
                aria-orientation={across ? "horizontal" : "vertical"}
                aria-label={across ? "Line between rows" : "Line between columns"}
                aria-valuemin={Math.round(d.min * 100)}
                aria-valuemax={Math.round(d.max * 100)}
                aria-valuenow={Math.round(d.at * 100)}
                onPointerDown={(e) => startHandle(e, { kind: "divider", path: d.path, grid: grid!, startAt: d.at, dir: d.dir, x: e.clientX, y: e.clientY, base: draft })}
                onPointerMove={onHandleMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
                onKeyDown={(e) =>
                  arrowKeys(e, (dx, dy) => {
                    const step = across ? dy / areaH : dx / areaW;
                    return step ? withOrigin(draft, gridLayout(layout, moveDivider(grid!, d.path, d.at + step)), photos.length) : null;
                  })
                }
              >
                <span className="builder-grip" />
              </div>
            );
          })}

          {corners &&
            lines.map((line, li) => {
              const [a, b] = [corners.points[line.members[0]!]!, corners.points[line.members.at(-1)!]!];
              const mid = css({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
              return (
                <button
                  key={`line-${li}`}
                  type="button"
                  className="builder-handle line"
                  data-testid="builder-handle"
                  style={{ left: mid.x - HANDLE_PX / 2, top: mid.y - HANDLE_PX / 2, width: HANDLE_PX, height: HANDLE_PX }}
                  aria-label={`Slanted line ${li + 1}`}
                  onPointerDown={(e) => startHandle(e, { kind: "line", line: li, corners, x: e.clientX, y: e.clientY, base: draft })}
                  onPointerMove={onHandleMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                  onKeyDown={(e) =>
                    arrowKeys(e, (dx, dy) => {
                      const next = moveLine(layout, corners, line, { x: dx, y: dy });
                      return next && { ...draft, layout: cornersLayout(layout, next) };
                    })
                  }
                >
                  <span className="builder-grip" />
                </button>
              );
            })}
          {corners &&
            corners.points.map((p, i) => {
              if (corners.locks[i]!.kind === "fixed") return null;
              const at = css(p);
              return (
                <button
                  key={`corner-${i}`}
                  type="button"
                  className="builder-handle corner"
                  data-testid="builder-handle"
                  style={{ left: at.x - HANDLE_PX / 2, top: at.y - HANDLE_PX / 2, width: HANDLE_PX, height: HANDLE_PX }}
                  aria-label={`Corner ${i + 1}`}
                  onPointerDown={(e) => startHandle(e, { kind: "corner", index: i, corners, last: corners, x: e.clientX, y: e.clientY, base: draft })}
                  onPointerMove={onHandleMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                  onKeyDown={(e) =>
                    arrowKeys(e, (dx, dy) => {
                      const next = moveCorner(layout, corners, i, { x: p.x + dx, y: p.y + dy });
                      return next && { ...draft, layout: cornersLayout(layout, next) };
                    })
                  }
                >
                  <span className="builder-dot" />
                </button>
              );
            })}

          {selBox && sel !== null && (
            <>
              <button
                type="button"
                className="builder-handle resize"
                data-testid="builder-handle"
                style={{
                  left: css({ x: selBox.x + selBox.w, y: 0 }).x - HANDLE_PX / 2,
                  top: css({ x: 0, y: selBox.y + selBox.h }).y - HANDLE_PX / 2,
                  width: HANDLE_PX,
                  height: HANDLE_PX,
                }}
                aria-label={`Resize photo ${sel + 1}`}
                onPointerDown={(e) => {
                  const center = { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 };
                  const p = toLayout(clientToCanvas(e.clientX, e.clientY));
                  startHandle(e, { kind: "resize", cell: sel, center, distance: Math.max(1, Math.hypot(p.x - center.x, p.y - center.y)), base: draft });
                }}
                onPointerMove={onHandleMove}
                onPointerUp={finishDrag}
                onPointerCancel={finishDrag}
              >
                <span className="builder-dot" />
              </button>
              {selCell?.shape === "rect" && (
                <button
                  type="button"
                  className="builder-handle rotate"
                  data-testid="builder-handle"
                  style={{
                    left: css({ x: selBox.x + selBox.w / 2, y: 0 }).x - HANDLE_PX / 2,
                    top: Math.max(0, css({ x: 0, y: selBox.y }).y - HANDLE_PX * 1.25),
                    width: HANDLE_PX,
                    height: HANDLE_PX,
                  }}
                  aria-label={`Turn photo ${sel + 1}`}
                  onPointerDown={(e) => {
                    const center = { x: selBox.x + selBox.w / 2, y: selBox.y + selBox.h / 2 };
                    const p = toLayout(clientToCanvas(e.clientX, e.clientY));
                    startHandle(e, {
                      kind: "rotate",
                      cell: sel,
                      center,
                      angle: (Math.atan2(p.y - center.y, p.x - center.x) * 180) / Math.PI,
                      rotate: selCell.rotate,
                      base: draft,
                    });
                  }}
                  onPointerMove={onHandleMove}
                  onPointerUp={finishDrag}
                  onPointerCancel={finishDrag}
                >
                  <span className="builder-dot turn" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <section className="builder-tools" aria-label="Layout tools">
        <p className="builder-status" role="status">
          {message || countHint || problems[0]?.text || HINTS[mode](sel !== null)}
        </p>
        {mode === "grid" && sel !== null && (
          <div className="builder-actions">
            <button type="button" className="button" onClick={() => apply(splitCell(layout, sel, "across"), "Too small to split across.")}>
              Split across
            </button>
            <button type="button" className="button" onClick={() => apply(splitCell(layout, sel, "down"), "Too small to split down.")}>
              Split down
            </button>
            <button type="button" className="button" onClick={nextShape}>
              Shape
            </button>
            <button type="button" className="button" onClick={() => (setSelected(null), apply(removeGridCell(layout, sel), "A layout needs at least one cell."))}>
              Remove
            </button>
          </div>
        )}
        {mode === "free" && sel !== null && (
          <div className="builder-actions">
            <button type="button" className="button" onClick={() => scaleBy(1 / SCALE_STEP)}>
              Smaller
            </button>
            <button type="button" className="button" onClick={() => scaleBy(SCALE_STEP)}>
              Bigger
            </button>
            {selCell?.shape === "rect" && (
              <>
                <button type="button" className="button" onClick={() => turnBy(-TURN_STEP)} aria-label="Turn left">
                  ⟲
                </button>
                <button type="button" className="button" onClick={() => turnBy(TURN_STEP)} aria-label="Turn right">
                  ⟳
                </button>
              </>
            )}
            <button type="button" className="button" onClick={() => apply(duplicateCell(layout, sel), "There's no room for another photo.")}>
              Add copy
            </button>
            <button type="button" className="button" onClick={() => (setSelected(null), apply(removeCell(layout, sel), "A layout needs at least one cell."))}>
              Remove
            </button>
          </div>
        )}
      </section>

      {saving && (
        <div className="builder-sheet-backdrop">
          <form className="builder-sheet" onSubmit={save} aria-label="Save layout">
            <label className="field">
              <span>Name</span>
              <input
                value={saving.name}
                maxLength={40}
                autoFocus
                onChange={(e) => setSaving({ ...saving, name: e.target.value, error: "" })}
              />
            </label>
            {saving.error && (
              <p className="notice" role="alert">
                {saving.error}
              </p>
            )}
            <div className="builder-actions">
              <button type="button" className="button" onClick={() => setSaving(null)}>
                Keep editing
              </button>
              <button type="submit" className="button primary" disabled={saving.busy}>
                {saving.busy ? "Saving…" : start.saved ? "Save changes" : "Save layout"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const HINTS: Record<ReturnType<typeof editModeOf>, (selected: boolean) => string> = {
  grid: (selected) => (selected ? "Split this cell, change its shape, or drag a line to resize." : "Tap a photo to split it, or drag a line to resize."),
  corners: () => "Drag a corner or a line. Every photo that shares it follows.",
  free: (selected) => (selected ? "Drag to move. Pinch, or use Bigger and Smaller, to resize." : "Tap a photo to move or resize it."),
};
