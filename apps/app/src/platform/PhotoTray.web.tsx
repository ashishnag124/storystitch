// The photo tray of a blank canvas: thumbnails that drag onto a shape, or tap to be picked up and then a shape taps to take them.
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { Tray } from "../useLayoutEditor";
import type { Photo } from "./photos";
import { previewOf } from "./render";

/** Edge of a thumbnail, in CSS px. */
const THUMB = 56;

/** A photo drawn to fill a square, cropped to the middle. */
function Thumb({ photo }: { photo: Photo }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const { image, width, height } = previewOf(photo);
    const side = Math.min(width, height);
    ctx.drawImage(image, (width - side) / 2, (height - side) / 2, side, side, 0, 0, THUMB * 2, THUMB * 2);
  }, [photo]);
  return <canvas ref={ref} width={THUMB * 2} height={THUMB * 2} className="builder-thumb-image" />;
}

export function PhotoTray({ photos, tray }: { photos: Photo[]; tray: Tray }) {
  return (
    <div className="builder-tray" role="group" aria-label="Your photos">
      {tray.photos.map((t) => (
        <button
          key={t.index}
          type="button"
          data-testid="tray-photo"
          className={`builder-thumb${t.placed ? " placed" : ""}${t.picked ? " picked" : ""}`}
          aria-label={t.label}
          aria-pressed={t.picked}
          onPointerDown={(e: PointerEvent) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            tray.grab(t.index, e.clientX, e.clientY);
          }}
          onPointerMove={(e: PointerEvent) => tray.move(e.clientX, e.clientY)}
          onPointerUp={tray.drop}
          onPointerCancel={tray.cancel}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            tray.tap(t.index);
          }}
        >
          <Thumb photo={photos[t.index]!} />
          {t.placed && (
            <span className="builder-check" aria-hidden="true">
              ✓
            </span>
          )}
        </button>
      ))}
      {tray.ghost && (
        <div className="builder-ghost" style={{ left: tray.ghost.x - THUMB / 2, top: tray.ghost.y - THUMB / 2 }}>
          <Thumb photo={photos[tray.ghost.photo]!} />
        </div>
      )}
    </div>
  );
}
