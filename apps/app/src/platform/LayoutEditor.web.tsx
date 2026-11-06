// The layout editor: a full-screen view for changing a layout, to use in the collage or save to an account.
// Loaded only when the layout editor is switched on. useLayoutEditor does the work; this draws it and feeds it pointers.
import { STORY_CANVAS, drawOrder, type Layout, type Point, type SavedLayout } from "@storystitch/shared";
import { useCallback, useEffect, useLayoutEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Photo } from "./photos";
import { navigate } from "./route";
import { drawBlurredBackground, drawCell, fillBackground, hasBlurredBackground, outlinePath, previewOf } from "./render";
import { cellShapes, styleScale, type Scene, type Start, type Style } from "@storystitch/client";
import { useLayoutEditor, type Handle } from "../useLayoutEditor";
import "./photo-sources.css";
import "./builder.css";

const { width: W, height: H } = STORY_CANVAS;
/** Arrow keys move a focused line or corner this far (canvas px). */
const KEY_STEP_PX = 10;
const ARROW_STEPS: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
/** The highlight on the selected cell and on cells with a problem. */
const SELECTED_COLOR = "#ffc24b";
const PROBLEM_COLOR = "#ff8f8f";

interface Props {
  photos: Photo[];
  style: Style;
  start: Start;
  signedIn: boolean;
  onCancel: () => void;
  onUse: (layout: Layout, order: number[]) => void;
  onSaved: (saved: SavedLayout, order: number[]) => void;
}

export default function LayoutEditor({ photos, style, start, signedIn, onCancel, onUse, onSaved }: Props) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const pointers = useRef(new Map<number, Point>());
  const frameOrigin = () => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: rect.left, y: rect.top };
  };
  const editor = useLayoutEditor({ photos, style, start, onUse, onSaved, frameOrigin });
  const { layout, order, crops, selected, problems, view, fit, handles, tools, finishDrag, countText, saving, setSaving } = editor;
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);

  useEffect(() => heading.current?.focus(), []);

  // Fill the space between the top bar and the tools with the 9:16 frame.
  const fitRef = useRef(fit);
  useLayoutEffect(() => {
    fitRef.current = fit;
  });
  useEffect(() => {
    const stage = stageRef.current!;
    const measure = () => {
      const { width, height } = stage.getBoundingClientRect();
      fitRef.current(width, height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

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

  // --- Pointers on the preview.

  function onCanvasDown(e: PointerEvent) {
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    editor.pressPreview([...pointers.current.values()]);
  }
  function onCanvasMove(e: PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    editor.movePreview([...pointers.current.values()]);
  }
  function onCanvasUp(e: PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) finishDrag();
  }

  // --- Lines and handles.

  /** What every line and handle listens to. */
  const handleEvents = (h: Handle) => ({
    "data-testid": "builder-handle",
    style: h.box,
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      e.currentTarget.setPointerCapture(e.pointerId);
      editor.grabHandle(h, e.clientX, e.clientY);
    },
    onPointerMove: (e: PointerEvent) => editor.moveHandle(e.clientX, e.clientY),
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
    onKeyDown: (e: KeyboardEvent) => {
      const step = ARROW_STEPS[e.key];
      if (!step || !h.nudge) return;
      e.preventDefault();
      h.nudge(step[0] * KEY_STEP_PX, step[1] * KEY_STEP_PX);
    },
  });

  return (
    <div className="builder" role="dialog" aria-modal="true" aria-labelledby="builder-title">
      <header className="builder-bar">
        <button type="button" className="button ghost" onClick={onCancel}>
          Cancel
        </button>
        <h2 id="builder-title" ref={heading} tabIndex={-1} className="builder-count">
          {countText}
        </h2>
        <button type="button" className="button ghost" onClick={editor.undo} disabled={!editor.canUndo} aria-label="Undo">
          Undo
        </button>
        <button type="button" className="button primary" onClick={editor.done}>
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

          {handles.map((h) =>
            h.range ? (
              <div
                key={h.key}
                className={`builder-divider ${h.kind}`}
                role="separator"
                tabIndex={0}
                aria-orientation={h.kind === "across" ? "horizontal" : "vertical"}
                aria-label={h.label}
                aria-valuemin={h.range.min}
                aria-valuemax={h.range.max}
                aria-valuenow={h.range.now}
                {...handleEvents(h)}
              >
                <span className="builder-grip" />
              </div>
            ) : (
              <button key={h.key} type="button" className={`builder-handle ${h.kind}`} aria-label={h.label} {...handleEvents(h)}>
                <span className={h.kind === "line" ? "builder-grip" : h.kind === "rotate" ? "builder-dot turn" : "builder-dot"} />
              </button>
            ),
          )}
        </div>
      </div>

      <section className="builder-tools" aria-label="Layout tools">
        <p className="builder-status" role="status">
          {editor.status}
        </p>
        {tools.length > 0 && (
          <div className="builder-actions">
            {tools.map((t) => (
              <button key={t.label} type="button" className="button" onClick={t.onPress} aria-label={t.name}>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </section>

      {saving && (
        <div className="builder-sheet-backdrop">
          {signedIn ? (
            <form
              className="builder-sheet"
              onSubmit={(e) => {
                e.preventDefault();
                void editor.save();
              }}
              aria-label="Save layout"
            >
              <label className="field">
                <span>Name</span>
                <input value={saving.name} maxLength={40} autoFocus onChange={(e) => setSaving({ ...saving, name: e.target.value, error: "" })} />
              </label>
              {saving.error && (
                <p className="notice" role="alert">
                  {saving.error}
                </p>
              )}
              <div className="builder-actions">
                <button type="submit" className="button primary" disabled={saving.busy}>
                  {saving.busy ? "Saving…" : editor.saveLabel}
                </button>
                <button type="button" className="button" onClick={editor.use}>
                  Use without saving
                </button>
                <button type="button" className="button" onClick={() => setSaving(null)}>
                  Keep editing
                </button>
              </div>
            </form>
          ) : (
            <section className="builder-sheet" aria-label="Use your layout">
              <h2>Your layout is ready</h2>
              <p>Use it in your collage now, no account needed. To keep it for your next collage, you can save it with a free account.</p>
              <div className="builder-actions">
                <button type="button" className="button primary" onClick={editor.use}>
                  Use this layout
                </button>
                <button type="button" className="button" onClick={() => navigate("/sign-up")}>
                  Create account to save
                </button>
                <button type="button" className="button" onClick={() => navigate("/account")}>
                  Sign in
                </button>
                <button type="button" className="button" onClick={() => setSaving(null)}>
                  Keep editing
                </button>
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
