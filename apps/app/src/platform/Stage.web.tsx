import {
  DOUBLE_TAP_MS,
  DOUBLE_TAP_ZOOM,
  LONG_PRESS_MS,
  MOTION,
  TAP_SLOP_PX,
  autoCrop,
  cellShapes,
  lerp,
  lerpBox,
  swapCells,
  type Box,
  type Scene,
} from "@storystitch/client";
import { MAX_ZOOM, MIN_ZOOM, clampCrop, panCrop, sourceRect, type Crop } from "@storystitch/layout-engine";
import { STORY_CANVAS, hitTest, type Frame, type Point } from "@storystitch/shared";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent, type PointerEvent, type Ref } from "react";
import { haptic, prefersReducedMotion, tween } from "./motion.web";
import type { Photo } from "./photos";
import { drawMark, drawScene, markFont, outlineBounds, previewOf, snapshotCell, type Marks } from "./render";
import "./stage.css";

/** Zoom change per pixel of Ctrl+scroll / trackpad pinch. */
const WHEEL_ZOOM_RATE = 0.01;
/** Zoom change per + or − key press. */
const KEY_ZOOM_STEP = 1.1;
/** How long the gesture hint shows if nobody touches the preview first. */
const COACH_MS = 8000;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const;

/** What the pointers on the preview are doing. Positions are client pixels. */
type Gesture =
  | { kind: "press"; cell: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } // could still be a tap
  | { kind: "pan"; cell: number; x: number; y: number; t: number; vx: number; vy: number }
  | { kind: "lift"; from: number; over: number }
  | { kind: "pinch"; cell: number; distance: number; zoom: number; mid: Point }
  | { kind: "ended" };

/** Photos animating over the scene (canvas pixels): one under the finger, or several gliding to new cells. */
interface Ghost {
  snap: HTMLCanvasElement;
  box: Box;
  /** Where the finger is, and where on the photo it grabbed (offset from the box's center). */
  at: Point;
  grab: Point;
  start: number;
}
interface Flight {
  snap: HTMLCanvasElement;
  from: Box;
  to: Box;
  t: number;
}

export interface StageHandle {
  /** Crossfades from what's on screen now. Call just before changing the scene to another layout. */
  crossfade(): void;
}

interface Props {
  ref?: Ref<StageHandle>;
  scene: Scene;
  photos: Photo[];
  selected: number | null;
  onSelect: (cell: number | null) => void;
  onScene: (next: (scene: Scene) => Scene) => void;
  onStatus: (text: string) => void;
  /** Shows the "Made with StoryStitch" mark, as the export will have it. */
  mark: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

/** The preview: everything drawn on the canvas, and every gesture and key on it. */
export function Stage({ ref, scene, photos, selected, onSelect, onScene, onStatus, mark }: Props) {
  const [lifted, setLifted] = useState<{ from: number; over: number } | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [coach, setCoach] = useState(true);
  const [view, setView] = useState({ width: 0, height: 0 }); // the preview's size on screen (CSS px)
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ cell: number; time: number } | null>(null);
  const stopMotion = useRef<() => void>(() => {});
  const stopCrossfade = useRef<() => void>(() => {});
  const overlay = useRef<{ ghost?: Ghost; flights?: Flight[]; hidden?: number[]; fade?: { snap: HTMLCanvasElement; t: number } }>({});
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);

  // The latest state, for drawing from animation frames.
  const latest = useRef({ scene, selected, lifted, showNumbers, mark });
  useEffect(() => {
    latest.current = { scene, selected, lifted, showNumbers, mark };
  });

  /** Draws the scene plus whatever is animating over it. */
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { scene, selected, lifted, showNumbers, mark } = latest.current;
    const o = overlay.current;
    const marks: Marks = lifted
      ? { dim: lifted.from, target: lifted.over === lifted.from ? undefined : lifted.over, hidden: o.hidden }
      : { selected: selected ?? undefined, numbers: showNumbers, hidden: o.hidden };
    drawScene(ctx, STORY_CANVAS, scene, imageFor, marks);
    if (mark) drawMark(ctx, STORY_CANVAS);
    if (o.fade) {
      ctx.save();
      ctx.globalAlpha = 1 - o.fade.t;
      const s = lerp(1, 1.03, o.fade.t);
      ctx.translate((STORY_CANVAS.width * (1 - s)) / 2, (STORY_CANVAS.height * (1 - s)) / 2);
      ctx.drawImage(o.fade.snap, 0, 0, STORY_CANVAS.width * s, STORY_CANVAS.height * s);
      ctx.restore();
    }
    for (const f of o.flights ?? []) {
      const b = lerpBox(f.from, f.to, f.t);
      ctx.save();
      ctx.shadowColor = "rgb(0 0 0 / 0.35)";
      ctx.shadowBlur = 40 * (1 - f.t);
      ctx.drawImage(f.snap, b.x, b.y, b.w, b.h);
      ctx.restore();
    }
    if (o.ghost) {
      const g = o.ghost;
      const t = prefersReducedMotion() ? 1 : Math.min(1, (performance.now() - g.start) / MOTION.lift);
      const scale = lerp(1, MOTION.liftScale, t);
      ctx.save();
      ctx.translate(g.at.x - g.grab.x, g.at.y - g.grab.y);
      ctx.rotate(((2 * Math.PI) / 360) * 2 * t); // a slight tilt, like picking up a print
      ctx.scale(scale, scale);
      ctx.shadowColor = "rgb(0 0 0 / 0.45)";
      ctx.shadowBlur = 48 * t;
      ctx.shadowOffsetY = 18 * t;
      ctx.drawImage(g.snap, -g.box.w / 2, -g.box.h / 2, g.box.w, g.box.h);
      ctx.restore();
      if (t < 1) requestAnimationFrame(() => draw());
    }
  }, [imageFor]);

  useEffect(draw, [scene, selected, lifted, showNumbers, mark, draw]);
  // Draws the mark again once its font has loaded.
  useEffect(() => void document.fonts.load(markFont(STORY_CANVAS)).then(draw), [draw]);

  // Fit the 9:16 preview into whatever space the screen leaves between the top bar and the tools.
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

  useEffect(() => {
    const timer = setTimeout(() => setCoach(false), COACH_MS);
    return () => clearTimeout(timer);
  }, []);

  useImperativeHandle(ref, () => ({ crossfade }));

  /** Applies `edit` to the crop of `cell`, then fits it to the cell's frame. */
  const editCrop = useCallback(
    (cell: number, edit: (crop: Crop, frame: Frame, photo: Photo) => Crop) =>
      onScene((s) => {
        const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
        const photo = photos[s.order[cell]!]!;
        return { ...s, crops: s.crops.map((c, i) => (i === cell ? clampCrop(photo, frame, edit(c, frame, photo)) : c)) };
      }),
    [photos, onScene],
  );
  /** Moves the photo in `cell` by (dx, dy) canvas pixels. */
  const pan = (cell: number, dx: number, dy: number) =>
    editCrop(cell, (crop, frame, photo) => panCrop(photo, frame, crop, dx, dy));
  const zoomBy = useCallback(
    (cell: number, factor: number) => editCrop(cell, (crop) => ({ ...crop, zoom: clamp(crop.zoom * factor, MIN_ZOOM, MAX_ZOOM) })),
    [editCrop],
  );
  /** Glides the crop of `cell` to `to`. */
  function animateCrop(cell: number, to: Crop) {
    stopMotion.current();
    const from = latest.current.scene.crops[cell]!;
    stopMotion.current = tween(MOTION.crop, (t) =>
      editCrop(cell, () => ({ cx: lerp(from.cx, to.cx, t), cy: lerp(from.cy, to.cy, t), zoom: lerp(from.zoom, to.zoom, t) })),
    );
  }
  /** Back to the automatic, subject-aware crop. */
  function fit(cell: number) {
    const s = latest.current.scene;
    animateCrop(cell, autoCrop(s.layout, s.style, photos[s.order[cell]!]!, cell));
  }

  // Trackpad pinch (and Ctrl+scroll) zooms the photo under the pointer. React's wheel listener is
  // passive, so it couldn't stop the page from zooming instead.
  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      const rect = canvas.getBoundingClientRect();
      const k = STORY_CANVAS.width / rect.width;
      const cell = hitTest(scene.layout.cells, { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k });
      if (cell < 0) return;
      e.preventDefault();
      zoomBy(cell, Math.exp(-e.deltaY * WHEEL_ZOOM_RATE));
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [scene.layout, zoomBy]);

  function canvasPoint(p: { x: number; y: number }) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const k = STORY_CANVAS.width / rect.width;
    return { x: (p.x - rect.left) * k, y: (p.y - rect.top) * k, k };
  }

  /** A tap, or a number key: select a photo, tap it again to deselect, or tap another to swap the two. */
  function pick(cell: number) {
    if (selected === null) {
      onSelect(cell);
      onStatus(`Photo ${cell + 1} selected.`);
    } else if (selected === cell) {
      onSelect(null);
      onStatus("Done.");
    } else {
      swap(selected, cell);
      onSelect(null);
    }
  }

  /** Swaps two photos; they glide to each other's cells (from `fromBox` for a photo dropped off the finger). */
  function swap(a: number, b: number, fromBox?: Box) {
    const before = latest.current.scene;
    const after = swapCells(before, a, b, photos);
    const shapes = cellShapes(after.layout, after.style, STORY_CANVAS);
    const snapA = snapshotCell(before, STORY_CANVAS, a, imageFor);
    const snapB = snapshotCell(before, STORY_CANVAS, b, imageFor);
    overlay.current.ghost = undefined;
    overlay.current.hidden = [a, b];
    const flights: Flight[] = [
      { snap: snapA.canvas, from: fromBox ?? snapA.box, to: outlineBounds(shapes[b]!.outline), t: 0 },
      { snap: snapB.canvas, from: snapB.box, to: outlineBounds(shapes[a]!.outline), t: 0 },
    ];
    overlay.current.flights = flights;
    onScene(() => after);
    onStatus(`Swapped photos ${a + 1} and ${b + 1}.`);
    haptic(12);
    tween(
      MOTION.flight,
      (t) => {
        flights.forEach((f) => (f.t = t));
        draw();
      },
      () => {
        overlay.current = {};
        draw();
      },
    );
  }

  /** Crossfades from what's on the canvas now to whatever is drawn next. */
  function crossfade() {
    const canvas = canvasRef.current;
    if (!canvas || prefersReducedMotion()) return;
    const snap = document.createElement("canvas");
    snap.width = canvas.width;
    snap.height = canvas.height;
    snap.getContext("2d")!.drawImage(canvas, 0, 0);
    const fade = { snap, t: 0 };
    overlay.current.fade = fade;
    // A tap during a crossfade replaces it: left running, the old one redraws every frame and ends the new one early.
    stopCrossfade.current();
    stopCrossfade.current = tween(
      MOTION.crossfade,
      (t) => {
        fade.t = t;
        draw();
      },
      () => {
        overlay.current.fade = undefined;
        draw();
      },
    );
  }

  /** Double-tap: zoom in around the tapped point, or back to fit if already zoomed in. */
  function doubleTap(cell: number, at: Point) {
    const s = latest.current.scene;
    const crop = s.crops[cell]!;
    if (crop.zoom >= DOUBLE_TAP_ZOOM * 0.9) return fit(cell);
    const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
    const photo = photos[s.order[cell]!]!;
    const src = sourceRect(photo, frame, crop);
    const left = frame.cx - frame.width / 2;
    const top = frame.cy - frame.height / 2;
    animateCrop(
      cell,
      clampCrop(photo, frame, {
        cx: (src.x + ((at.x - left) / frame.width) * src.width) / photo.width,
        cy: (src.y + ((at.y - top) / frame.height) * src.height) / photo.height,
        zoom: DOUBLE_TAP_ZOOM,
      }),
    );
  }

  /** Keeps a flicked photo gliding, slowing down until it stops (or reaches its edge). */
  function momentum(cell: number, vx: number, vy: number) {
    if (prefersReducedMotion() || Math.hypot(vx, vy) < MOTION.minSpeed * 4) return;
    let [x, y] = [vx, vy];
    let last = performance.now();
    let id = requestAnimationFrame(function step(now) {
      const dt = Math.min(48, now - last);
      last = now;
      pan(cell, x * dt, y * dt);
      const decay = MOTION.friction ** (dt / 16);
      [x, y] = [x * decay, y * decay];
      if (Math.hypot(x, y) > MOTION.minSpeed) id = requestAnimationFrame(step);
    });
    stopMotion.current = () => cancelAnimationFrame(id);
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    stopMotion.current();
    setCoach(false);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      const at = canvasPoint({ x: e.clientX, y: e.clientY });
      const cell = hitTest(scene.layout.cells, at);
      if (cell < 0) return;
      const timer = setTimeout(() => {
        // Held still: lift the photo so it can be dropped on another cell.
        const snap = snapshotCell(latest.current.scene, STORY_CANVAS, cell, imageFor);
        const center = { x: snap.box.x + snap.box.w / 2, y: snap.box.y + snap.box.h / 2 };
        overlay.current.ghost = {
          snap: snap.canvas,
          box: snap.box,
          at,
          grab: { x: at.x - center.x, y: at.y - center.y },
          start: performance.now(),
        };
        gesture.current = { kind: "lift", from: cell, over: cell };
        setLifted({ from: cell, over: cell });
        onSelect(null);
        haptic(10);
      }, LONG_PRESS_MS);
      gesture.current = { kind: "press", cell, x: e.clientX, y: e.clientY, timer };
    } else if (pointers.current.size === 2) {
      if (g?.kind === "press") clearTimeout(g.timer);
      overlay.current.ghost = undefined;
      setLifted(null);
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const cell = g && "cell" in g ? g.cell : hitTest(scene.layout.cells, canvasPoint(mid));
      gesture.current =
        cell < 0
          ? { kind: "ended" }
          : { kind: "pinch", cell, distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: scene.crops[cell]!.zoom, mid };
    }
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    const { k, ...at } = canvasPoint({ x: e.clientX, y: e.clientY });
    if (g.kind === "press") {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < TAP_SLOP_PX) return;
      clearTimeout(g.timer);
      gesture.current = { kind: "pan", cell: g.cell, x: g.x, y: g.y, t: performance.now(), vx: 0, vy: 0 };
    }
    const cur = gesture.current!;
    if (cur.kind === "pan") {
      const [dx, dy] = [(e.clientX - cur.x) * k, (e.clientY - cur.y) * k];
      pan(cur.cell, dx, dy);
      const now = performance.now();
      const dt = Math.max(1, now - cur.t);
      // Smoothed velocity (canvas px/ms) for momentum when the finger lets go.
      cur.vx = lerp(cur.vx, dx / dt, 0.5);
      cur.vy = lerp(cur.vy, dy / dt, 0.5);
      [cur.x, cur.y, cur.t] = [e.clientX, e.clientY, now];
    } else if (cur.kind === "lift") {
      if (overlay.current.ghost) overlay.current.ghost.at = at;
      const over = hitTest(scene.layout.cells, at);
      if (over !== cur.over && over >= 0 && over !== cur.from) haptic(6);
      cur.over = over;
      setLifted({ from: cur.from, over: cur.over });
      draw();
    } else if (cur.kind === "pinch" && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()] as [Point, Point];
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const zoom = clamp((cur.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / cur.distance, MIN_ZOOM, MAX_ZOOM);
      const [dx, dy] = [(mid.x - cur.mid.x) * k, (mid.y - cur.mid.y) * k];
      editCrop(cur.cell, (crop, frame, photo) => panCrop(photo, frame, { ...crop, zoom }, dx, dy));
      cur.mid = mid;
    }
  }

  function onPointerEnd(e: PointerEvent<HTMLCanvasElement>, cancelled: boolean) {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (g?.kind === "press") {
      clearTimeout(g.timer);
      const now = performance.now();
      const prev = lastTap.current;
      if (!cancelled && prev && prev.cell === g.cell && now - prev.time < DOUBLE_TAP_MS) {
        lastTap.current = null;
        if (selected !== g.cell) onSelect(g.cell);
        doubleTap(g.cell, canvasPoint({ x: e.clientX, y: e.clientY }));
      } else if (!cancelled) {
        lastTap.current = { cell: g.cell, time: now };
        pick(g.cell);
      }
    } else if (g?.kind === "pan") {
      if (!cancelled && performance.now() - g.t < 60) momentum(g.cell, g.vx, g.vy);
    } else if (g?.kind === "lift") {
      setLifted(null);
      const ghost = overlay.current.ghost;
      const dropBox = ghost && {
        x: ghost.at.x - ghost.grab.x - (ghost.box.w * MOTION.liftScale) / 2,
        y: ghost.at.y - ghost.grab.y - (ghost.box.h * MOTION.liftScale) / 2,
        w: ghost.box.w * MOTION.liftScale,
        h: ghost.box.h * MOTION.liftScale,
      };
      if (!cancelled && g.over >= 0 && g.over !== g.from) swap(g.from, g.over, dropBox);
      else if (ghost && dropBox) {
        // Not dropped on another photo: it settles back into its own cell.
        overlay.current = { hidden: [g.from], flights: [{ snap: ghost.snap, from: dropBox, to: ghost.box, t: 0 }] };
        const flight = overlay.current.flights![0]!;
        tween(
          MOTION.settle,
          (t) => {
            flight.t = t;
            draw();
          },
          () => {
            overlay.current = {};
            draw();
          },
        );
      }
    }
    // After a pinch, the finger still down shouldn't start panning.
    gesture.current = pointers.current.size ? { kind: "ended" } : null;
  }

  function onKeyDown(e: KeyboardEvent<HTMLCanvasElement>) {
    const n = Number(e.key);
    if (Number.isInteger(n) && n >= 1 && n <= scene.layout.cells.length) pick(n - 1);
    else if (e.key === "Escape" && selected !== null) {
      onSelect(null);
      onStatus("Done.");
    } else if (selected !== null && e.key in ARROWS) {
      const [x, y] = ARROWS[e.key as keyof typeof ARROWS];
      const { frame } = cellShapes(scene.layout, scene.style, STORY_CANVAS)[selected]!;
      const step = frame.width * (e.shiftKey ? 0.2 : 0.05);
      pan(selected, x * step, y * step);
    } else if (selected !== null && (e.key === "+" || e.key === "=")) zoomBy(selected, KEY_ZOOM_STEP);
    else if (selected !== null && (e.key === "-" || e.key === "_")) zoomBy(selected, 1 / KEY_ZOOM_STEP);
    else return;
    e.preventDefault();
  }

  function done() {
    onSelect(null);
    onStatus("Done.");
  }

  // The floating tooltip sits just above the selected photo (below it when the photo is near the top).
  const tipStyle = (() => {
    if (selected === null || !view.width) return undefined;
    const shape = cellShapes(scene.layout, scene.style, STORY_CANVAS)[selected];
    if (!shape) return undefined;
    const b = outlineBounds(shape.outline);
    const k = view.width / STORY_CANVAS.width;
    const above = b.y * k > 56;
    return {
      left: `${clamp((b.x + b.w / 2) * k, 70, view.width - 70)}px`,
      top: `${above ? b.y * k - 8 : (b.y + b.h) * k + 8}px`,
      transform: `translate(-50%, ${above ? "-100%" : "0"})`,
    };
  })();

  return (
    <div className="stage" ref={stageRef}>
      <div className="preview-frame" style={{ width: view.width, height: view.height }}>
        <canvas
          ref={canvasRef}
          width={STORY_CANVAS.width}
          height={STORY_CANVAS.height}
          tabIndex={0}
          role="application"
          aria-label={`Story preview: ${scene.layout.name}, ${scene.layout.cells.length} photos`}
          aria-describedby="keyboard-help"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => onPointerEnd(e, false)}
          onPointerCancel={(e) => onPointerEnd(e, true)}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={onKeyDown}
          onFocus={(e) => setShowNumbers(e.currentTarget.matches(":focus-visible"))}
          onBlur={() => setShowNumbers(false)}
        />
        {tipStyle && (
          <div className="photo-tip" style={tipStyle} role="toolbar" aria-label={`Photo ${selected! + 1}`}>
            <button type="button" onClick={() => fit(selected!)}>
              Fit
            </button>
            <span aria-hidden="true" className="tip-sep" />
            <button type="button" onClick={done}>
              Done
            </button>
          </div>
        )}
        {coach && !showNumbers && (
          <p className="coach" aria-hidden="true">
            Drag to move · Pinch to zoom · Hold to swap
          </p>
        )}
      </div>
      <p id="keyboard-help" className={showNumbers ? "keyboard-help" : "visually-hidden"}>
        Press 1 to {scene.layout.cells.length} to pick a photo, then another number to swap them. Arrow keys move the
        picked photo, + and − zoom, Esc finishes.
      </p>
    </div>
  );
}
