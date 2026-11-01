import { MAX_ZOOM, MIN_ZOOM, clampCrop, panCrop, sourceRect, type Crop } from "@storystitch/layout-engine";
import { STORY_CANVAS, hitTest, type Frame, type Point } from "@storystitch/shared";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { AccountLink } from "./account/AccountLink";
import {
  canShareFiles,
  renderExport,
  shareOrDownload,
  upscaleWarnings,
  type ExportFormat,
} from "./exportImage";
import { LayoutStrip } from "./LayoutStrip";
import { haptic, lerp, lerpBox, prefersReducedMotion, tween } from "./motion";
import type { Photo } from "./photos";
import { drawScene, outlineBounds, previewOf, snapshotCell, type Box, type Marks } from "./render";
import { autoCrop, cellShapes, newScene, rankedScenes, swapCells, withCrop, withStyle, type Scene } from "./scene";
import { StylePanel } from "./StylePanel";

/** How long the preview must be still before the export is rendered in the background. */
const EXPORT_DEBOUNCE_MS = 400;
/** Pointer movement (CSS px) below which a press counts as a tap rather than a drag. */
const TAP_SLOP_PX = 6;
/** Holding a photo still this long lifts it, to be dropped on another cell. */
const LONG_PRESS_MS = 400;
/** A second tap on the same photo within this time is a double-tap (zoom in, or back to fit). */
const DOUBLE_TAP_MS = 300;
/** Zoom a double-tap goes to, and the zoom above which a double-tap goes back to fit. */
const DOUBLE_TAP_ZOOM = 2;
/** Zoom change per pixel of Ctrl+scroll / trackpad pinch. */
const WHEEL_ZOOM_RATE = 0.01;
/** Zoom change per + or − key press. */
const KEY_ZOOM_STEP = 1.1;
/** Motion timings (ms) and feel. */
const MOTION = {
  lift: 140, // photo rises to LIFT_SCALE under the finger
  liftScale: 1.06,
  flight: 260, // swapped photos glide to their new cells
  settle: 180, // a dropped photo returns to its own cell
  crossfade: 220, // switching layouts
  crop: 220, // Fit and double-tap zoom
  /** Momentum after a flicked drag: velocity kept per 16 ms frame, and the speed (canvas px/ms) where it stops. */
  friction: 0.92,
  minSpeed: 0.02,
};
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

type Tool = "layouts" | "style" | "export";
const TOOLS: { id: Tool; label: string }[] = [
  { id: "layouts", label: "Layouts" },
  { id: "style", label: "Style" },
  { id: "export", label: "Export" },
];

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

interface Props {
  photos: Photo[];
  /** What subject detection found, e.g. "Found 2 faces and a dog." */
  summary: string | null;
  notices: string[];
  privacy: string;
  onStartOver: () => void;
}

export function Editor({ photos, summary, notices, privacy, onStartOver }: Props) {
  // Every layout with its own best photo assignment, best fit first. Picking one starts from that.
  const options = useMemo(() => rankedScenes(photos), [photos]);
  const [scene, setScene] = useState<Scene>(() => options[0]!);
  const [selected, setSelected] = useState<number | null>(null);
  const [lifted, setLifted] = useState<{ from: number; over: number } | null>(null);
  const [showNumbers, setShowNumbers] = useState(false);
  const [status, setStatus] = useState("");
  const [tool, setTool] = useState<Tool>("layouts");
  const [coach, setCoach] = useState(true);
  // Notices (alerts) stay until closed; the detection summary fades on its own.
  const [toasts, setToasts] = useState(() => [
    ...notices.map((text) => ({ text, alert: true })),
    ...(summary ? [{ text: summary, alert: false }] : []),
  ]);
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [exported, setExported] = useState<{ scene: Scene; format: ExportFormat; blob: Blob } | null>(null);
  const [exportError, setExportError] = useState(false);
  const [view, setView] = useState({ width: 0, height: 0 }); // the preview's size on screen (CSS px)
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef<{ cell: number; time: number } | null>(null);
  const stopMotion = useRef<() => void>(() => {});
  const overlay = useRef<{ ghost?: Ghost; flights?: Flight[]; hidden?: number[]; fade?: { snap: HTMLCanvasElement; t: number } }>({});
  const shareable = useMemo(() => canShareFiles(), []);
  const warnings = useMemo(() => upscaleWarnings(scene, photos), [scene, photos]);
  const styledOptions = useMemo(() => options.map((o) => ({ ...o, style: scene.style })), [options, scene.style]);
  const imageFor = useCallback((i: number) => previewOf(photos[i]!), [photos]);

  // The latest state, for drawing from animation frames.
  const latest = useRef({ scene, selected, lifted, showNumbers });
  useEffect(() => {
    latest.current = { scene, selected, lifted, showNumbers };
  });

  /** Draws the scene plus whatever is animating over it. */
  const draw = useCallback(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { scene, selected, lifted, showNumbers } = latest.current;
    const o = overlay.current;
    const marks: Marks = lifted
      ? { dim: lifted.from, target: lifted.over === lifted.from ? undefined : lifted.over, hidden: o.hidden }
      : { selected: selected ?? undefined, numbers: showNumbers, hidden: o.hidden };
    drawScene(ctx, STORY_CANVAS, scene, imageFor, marks);
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

  useEffect(draw, [scene, selected, lifted, showNumbers, draw]);

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

  // Render the export ahead of time so Share can open the share sheet within the tap.
  useEffect(() => {
    let current = true;
    const timer = setTimeout(() => {
      renderExport(scene, photos, format)
        .then((blob) => current && (setExported({ scene, format, blob }), setExportError(false)))
        .catch((err) => {
          console.error(err);
          if (current) setExportError(true);
        });
    }, EXPORT_DEBOUNCE_MS);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [scene, photos, format]);
  const ready = exported && exported.scene === scene && exported.format === format ? exported.blob : null;

  /** Applies `edit` to the crop of `cell`, then fits it to the cell's frame. */
  const editCrop = useCallback(
    (cell: number, edit: (crop: Crop, frame: Frame, photo: Photo) => Crop) =>
      setScene((s) => {
        const { frame } = cellShapes(s.layout, s.style, STORY_CANVAS)[cell]!;
        const photo = photos[s.order[cell]!]!;
        return withCrop(s, cell, clampCrop(photo, frame, edit(s.crops[cell]!, frame, photo)));
      }),
    [photos],
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
      setSelected(cell);
      setStatus(`Photo ${cell + 1} selected.`);
    } else if (selected === cell) {
      setSelected(null);
      setStatus("Done.");
    } else {
      swap(selected, cell);
      setSelected(null);
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
    setScene(after);
    setStatus(`Swapped photos ${a + 1} and ${b + 1}.`);
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

  /** Switches layout, crossfading from the current one. */
  function chooseLayout(option: Scene) {
    const canvas = canvasRef.current;
    if (canvas && !prefersReducedMotion()) {
      const snap = document.createElement("canvas");
      snap.width = canvas.width;
      snap.height = canvas.height;
      snap.getContext("2d")!.drawImage(canvas, 0, 0);
      const fade = { snap, t: 0 };
      overlay.current.fade = fade;
      tween(
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
    setScene(newScene(option.layout, photos, scene.style, option.order));
    setSelected(null);
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
        setSelected(null);
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
        if (selected !== g.cell) setSelected(g.cell);
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
      setSelected(null);
      setStatus("Done.");
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
    setSelected(null);
    setStatus("Done.");
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

  const extension = format === "image/png" ? "png" : "jpg";
  const panelTitle = selected !== null ? `Photo ${selected + 1}` : TOOLS.find((t) => t.id === tool)!.label;

  return (
    <main className="editor">
      <header className="editor-bar">
        <h1 className="visually-hidden">StoryStitch editor</h1>
        <button type="button" className="button ghost" onClick={onStartOver}>
          Start over
        </button>
        <div className="header-actions">
          <AccountLink />
          <button
            type="button"
            className="button primary"
            disabled={!ready}
            aria-busy={!ready}
            onClick={() => ready && void shareOrDownload(ready, `storystitch.${extension}`)}
          >
            {ready ? (shareable ? "Share" : "Download") : "Preparing…"}
          </button>
        </div>
      </header>

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

        <div className="toasts" aria-live="polite">
          {toasts.map((t) => (
            <Toast key={t.text} {...t} onClose={() => setToasts((all) => all.filter((x) => x.text !== t.text))} />
          ))}
          {exportError && (
            <p className="toast notice" role="alert">
              Couldn't prepare the image. Try another layout or start over.
            </p>
          )}
        </div>
        <p id="keyboard-help" className={showNumbers ? "keyboard-help" : "visually-hidden"}>
          Press 1 to {scene.layout.cells.length} to pick a photo, then another number to swap them. Arrow keys move the
          picked photo, + and − zoom, Esc finishes.
        </p>
        <p className="visually-hidden" role="status">
          {status}
        </p>
      </div>

      <section className="tool-panel" aria-label={panelTitle}>
        <div className="tool-content" key={selected !== null ? "photo" : tool}>
          {selected !== null ? (
            <div className="photo-tool">
              <p className="hint">Tap another photo to swap them. Double-tap to zoom.</p>
              <label className="tool-slider">
                <span>Zoom</span>
                <input
                  type="range"
                  min={MIN_ZOOM}
                  max={MAX_ZOOM}
                  step={0.01}
                  value={scene.crops[selected]!.zoom}
                  onChange={(e) => editCrop(selected, (crop) => ({ ...crop, zoom: Number(e.target.value) }))}
                />
                <span className="tool-value" aria-hidden="true">
                  {scene.crops[selected]!.zoom.toFixed(1)}×
                </span>
              </label>
            </div>
          ) : tool === "layouts" ? (
            <LayoutStrip options={styledOptions} current={scene} photos={photos} onSelect={chooseLayout} />
          ) : tool === "style" ? (
            <StylePanel layout={scene.layout} style={scene.style} onChange={(style) => setScene((s) => withStyle(s, style, photos))} />
          ) : (
            <div className="export-tool">
              <label className="format">
                Format
                <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
                  <option value="image/jpeg">JPEG</option>
                  <option value="image/png">PNG</option>
                </select>
              </label>
              {warnings.length > 0 && (
                <ul className="warnings">
                  {warnings.map((w) => (
                    <li key={w.photo}>
                      {w.name} is enlarged {w.factor.toFixed(1)}× and may look soft.
                    </li>
                  ))}
                </ul>
              )}
              <p className="privacy">{privacy}</p>
            </div>
          )}
        </div>
      </section>

      <nav className="tabbar" role="tablist" aria-label="Tools">
        {TOOLS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={selected === null && tool === t.id}
            className="tab"
            onClick={() => {
              setTool(t.id);
              setSelected(null);
            }}
          >
            {t.label}
            {t.id === "export" && warnings.length > 0 && <span className="badge" aria-label="(has warnings)" />}
          </button>
        ))}
      </nav>
    </main>
  );
}

/** How long an informational toast stays up. */
const TOAST_MS = 6000;

/** A message over the preview. Informational ones fade on their own; alerts stay until closed. */
function Toast({ text, alert, onClose }: { text: string; alert: boolean; onClose: () => void }) {
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (alert) return;
    const timer = setTimeout(() => close.current(), TOAST_MS);
    return () => clearTimeout(timer);
  }, [alert]);
  return (
    <p className={`toast${alert ? " notice" : ""}`} role={alert ? "alert" : undefined}>
      <span>{text}</span>
      <button type="button" className="toast-close" aria-label="Dismiss" onClick={onClose}>
        ×
      </button>
    </p>
  );
}
