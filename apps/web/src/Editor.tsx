import { MAX_ZOOM, MIN_ZOOM, clampCrop, panCrop } from "@storystitch/layout-engine";
import { STORY_CANVAS, hitTest } from "@storystitch/shared";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
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
import { cellShapes, rankedScenes, swapCells, withCrop, type Scene } from "./scene";

/** How long the preview must be still before the export is rendered in the background. */
const EXPORT_DEBOUNCE_MS = 400;
/** Pointer movement (CSS px) below which a press counts as a tap rather than a drag. */
const TAP_SLOP_PX = 6;

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
  const [format, setFormat] = useState<ExportFormat>("image/jpeg");
  const [exported, setExported] = useState<{ scene: Scene; format: ExportFormat; blob: Blob } | null>(null);
  const [exportError, setExportError] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ cell: number; x: number; y: number; moved: boolean } | null>(null);
  const shareable = useMemo(() => canShareFiles(), []);
  const shapes = useMemo(() => cellShapes(scene.layout, scene.style, STORY_CANVAS), [scene.layout, scene.style]);
  const warnings = useMemo(() => upscaleWarnings(scene, photos), [scene, photos]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) drawScene(ctx, STORY_CANVAS, scene, (i) => previewOf(photos[i]!), selected ?? undefined);
  }, [scene, photos, selected]);

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

  function canvasPoint(e: PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    const k = STORY_CANVAS.width / rect.width;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k, k };
  }

  function onPointerDown(e: PointerEvent<HTMLCanvasElement>) {
    const cell = hitTest(scene.layout.cells, canvasPoint(e));
    if (cell < 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { cell, x: e.clientX, y: e.clientY, moved: false };
  }

  function onPointerMove(e: PointerEvent<HTMLCanvasElement>) {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) < TAP_SLOP_PX) return;
    d.moved = true;
    d.x = e.clientX;
    d.y = e.clientY;
    const { k } = canvasPoint(e);
    setScene((s) => withCrop(s, d.cell, panCrop(photos[s.order[d.cell]!]!, shapes[d.cell]!.frame, s.crops[d.cell]!, dx * k, dy * k)));
  }

  function onPointerUp() {
    const d = drag.current;
    drag.current = null;
    if (!d || d.moved) return;
    if (selected === null) setSelected(d.cell);
    else if (selected === d.cell) setSelected(null);
    else {
      setScene((s) => swapCells(s, selected, d.cell, photos));
      setSelected(null);
    }
  }

  function setZoom(zoom: number) {
    if (selected === null) return;
    setScene((s) => withCrop(s, selected, clampCrop(photos[s.order[selected]!]!, shapes[selected]!.frame, { ...s.crops[selected]!, zoom })));
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
          aria-label={`Story preview: ${scene.layout.name}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => (drag.current = null)}
        />
      </div>

      {selected === null ? (
        <p className="hint">
          {summary && `${summary} `}Drag a photo to reposition it. Tap a photo to zoom or swap it.
        </p>
      ) : (
        <div className="cell-controls">
          <p className="hint">Tap another photo to swap, or adjust the zoom.</p>
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
          <button type="button" className="button" onClick={() => setSelected(null)}>
            Done
          </button>
        </div>
      )}

      <LayoutStrip
        options={options}
        current={scene}
        photos={photos}
        onSelect={(option) => {
          setScene(option);
          setSelected(null);
        }}
      />

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
