import { MAX_ZOOM, MIN_ZOOM, clampCrop, panCrop, type Crop } from "@storystitch/layout-engine";
import { STORY_CANVAS, hitTest, type Frame, type Point } from "@storystitch/shared";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import {
  canShareFiles,
  renderExport,
  shareOrDownload,
  upscaleWarnings,
  type ExportFormat,
} from "./exportImage";
import { LayoutStrip } from "./LayoutStrip";
import type { Photo } from "./photos";
import { drawScene, previewOf } from "./render";
import { cellShapes, newScene, rankedScenes, swapCells, withCrop, withStyle, type Scene } from "./scene";
import { StylePanel } from "./StylePanel";

/** How long the preview must be still before the export is rendered in the background. */
const EXPORT_DEBOUNCE_MS = 400;
/** Pointer movement (CSS px) below which a press counts as a tap rather than a drag. */
const TAP_SLOP_PX = 6;
/** Holding a photo still this long lifts it, to be dropped on another cell. */
const LONG_PRESS_MS = 400;
/** Zoom change per pixel of Ctrl+scroll / trackpad pinch. */
const WHEEL_ZOOM_RATE = 0.01;
/** Zoom change per + or − key press. */
const KEY_ZOOM_STEP = 1.1;
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as const;

/** What the pointers on the preview are doing. Positions are client pixels. */
type Gesture =
  | { kind: "press"; cell: number; x: number; y: number; timer: ReturnType<typeof setTimeout> } // could still be a tap
  | { kind: "pan"; cell: number; x: number; y: number }
  | { kind: "lift"; from: number; over: number }
  | { kind: "pinch"; cell: number; distance: number; zoom: number; mid: Point }
  | { kind: "ended" };

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
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [exported, setExported] = useState<{ scene: Scene; format: ExportFormat; blob: Blob } | null>(null);
  const [exportError, setExportError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<Gesture | null>(null);
  const shareable = useMemo(() => canShareFiles(), []);
  const warnings = useMemo(() => upscaleWarnings(scene, photos), [scene, photos]);
  const styledOptions = useMemo(() => options.map((o) => ({ ...o, style: scene.style })), [options, scene.style]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const marks = lifted ? { selected: lifted.from, target: lifted.over } : { selected: selected ?? undefined, numbers: showNumbers };
    drawScene(ctx, STORY_CANVAS, scene, (i) => previewOf(photos[i]!), marks);
  }, [scene, photos, selected, lifted, showNumbers]);

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

  function swap(a: number, b: number) {
    setScene((s) => swapCells(s, a, b, photos));
    setStatus(`Swapped photos ${a + 1} and ${b + 1}.`);
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.currentTarget.setPointerCapture(e.pointerId);
    const g = gesture.current;
    if (pointers.current.size === 1) {
      const cell = hitTest(scene.layout.cells, canvasPoint({ x: e.clientX, y: e.clientY }));
      if (cell < 0) return;
      const timer = setTimeout(() => {
        // Held still: lift the photo so it can be dropped on another cell.
        gesture.current = { kind: "lift", from: cell, over: cell };
        setLifted({ from: cell, over: cell });
        setSelected(null);
        navigator.vibrate?.(10);
      }, LONG_PRESS_MS);
      gesture.current = { kind: "press", cell, x: e.clientX, y: e.clientY, timer };
    } else if (pointers.current.size === 2) {
      if (g?.kind === "press") clearTimeout(g.timer);
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
    const { k } = canvasPoint({ x: e.clientX, y: e.clientY });
    if (g.kind === "press") {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < TAP_SLOP_PX) return;
      clearTimeout(g.timer);
      gesture.current = { kind: "pan", cell: g.cell, x: g.x, y: g.y };
    }
    const cur = gesture.current!;
    if (cur.kind === "pan") {
      pan(cur.cell, (e.clientX - cur.x) * k, (e.clientY - cur.y) * k);
      cur.x = e.clientX;
      cur.y = e.clientY;
    } else if (cur.kind === "lift") {
      cur.over = hitTest(scene.layout.cells, canvasPoint({ x: e.clientX, y: e.clientY }));
      setLifted({ from: cur.from, over: cur.over });
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
      if (!cancelled) pick(g.cell);
    } else if (g?.kind === "lift") {
      setLifted(null);
      if (!cancelled && g.over >= 0 && g.over !== g.from) swap(g.from, g.over);
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

  function setZoom(zoom: number) {
    if (selected !== null) editCrop(selected, (crop) => ({ ...crop, zoom }));
  }

  const extension = format === "image/png" ? "png" : "jpg";

  return (
    <main className="editor">
      <header className="editor-header">
        <h1>StoryStitch</h1>
        <button type="button" className="button" onClick={onStartOver}>
          Start over
        </button>
      </header>

      {notices.map((n) => (
        <p key={n} className="notice" role="alert">
          {n}
        </p>
      ))}

      <div className="preview">
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
      </div>
      <p id="keyboard-help" className={showNumbers ? "hint" : "visually-hidden"}>
        Press 1 to {scene.layout.cells.length} to pick a photo, then another number to swap them. Arrow keys move the
        picked photo, + and − zoom, Esc finishes.
      </p>
      <p className="visually-hidden" role="status">
        {status}
      </p>

      {selected === null ? (
        <p className="hint">
          {summary && `${summary} `}Drag to reposition, pinch to zoom. Press and hold a photo to move it to another spot.
        </p>
      ) : (
        <div className="cell-controls">
          <p className="hint">Tap another photo to swap them, or adjust the zoom.</p>
          <label>
            Zoom
            <input
              type="range"
              min={MIN_ZOOM}
              max={MAX_ZOOM}
              step={0.01}
              value={scene.crops[selected]!.zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
            />
          </label>
          <button
            type="button"
            className="button"
            onClick={() => {
              setSelected(null);
              setStatus("Done.");
            }}
          >
            Done
          </button>
        </div>
      )}

      <LayoutStrip
        options={styledOptions}
        current={scene}
        photos={photos}
        onSelect={(option) => {
          setScene(newScene(option.layout, photos, scene.style, option.order));
          setSelected(null);
        }}
      />

      <StylePanel layout={scene.layout} style={scene.style} onChange={(style) => setScene((s) => withStyle(s, style, photos))} />

      {warnings.length > 0 && (
        <ul className="warnings">
          {warnings.map((w) => (
            <li key={w.photo}>
              {w.name} is enlarged {w.factor.toFixed(1)}× and may look soft.
            </li>
          ))}
        </ul>
      )}
      {exportError && (
        <p className="notice" role="alert">
          Couldn't prepare the image. Try another layout or start over.
        </p>
      )}

      <div className="actions">
        <label className="format">
          Format
          <select value={format} onChange={(e) => setFormat(e.target.value as ExportFormat)}>
            <option value="image/jpeg">JPEG</option>
            <option value="image/png">PNG</option>
          </select>
        </label>
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
      <p className="privacy">{privacy}</p>
    </main>
  );
}
